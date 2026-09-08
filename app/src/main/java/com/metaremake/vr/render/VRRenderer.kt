package com.metaremake.vr.render

import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import com.metaremake.vr.input.InputHub
import com.metaremake.vr.tracking.HandTrackingEngine
import com.metaremake.vr.tracking.HeadTracker
import com.metaremake.vr.util.MLog
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.sqrt

/**
 * Cardboard stereo renderer.
 *
 * Every frame renders TWO independent camera views (left + right) with their
 * own off-axis projections, side-by-side on screen. Lens-distortion correction
 * is applied in an optional post pass using per-eye render targets. The scene
 * (from the JS runtime via [SceneGraph]) lives in world space; head-locked
 * nodes are re-anchored to the head each frame. Mixed-reality passthrough
 * ("camera") and Android app capture ("capture") are textures applied to scene
 * nodes, so both eyes see them stereoscopically.
 */
class VRRenderer(
    private val headTracker: HeadTracker,
    private val sceneGraph: SceneGraph,
    private val inputHub: InputHub,
    private val cursor: CursorState,
    private val config: VRConfig,
    private val captureSurface: ExternalSurface
) : GLSurfaceView.Renderer {

    /** Latest camera frame for MR passthrough / hand tracking. */
    @Volatile
    var cameraFrameProvider: (() -> Bitmap?)? = null

    /** Latest hand-tracking result for the landmark debug overlay. */
    @Volatile
    var handFrameProvider: (() -> HandTrackingEngine.HandFrame?)? = null

    /** Per-frame statistics callback (fps, latency). Runs on the GL thread. */
    @Volatile
    var onStats: ((fps: Float, frameMs: Float) -> Unit)? = null

    private val stereo = StereoCamera()
    private val textRenderer = TextRenderer()

    // Meshes.
    private val quadMesh = GlMesh()
    private val boxMesh = GlMesh()
    private val sphereMesh = GlMesh()

    // Programs.
    private lateinit var colorProgram: GlProgram
    private lateinit var texProgram: GlProgram
    private lateinit var externalProgram: GlProgram
    private lateinit var distortProgram: GlProgram

    // FBO (offscreen eye target) for distortion / supersampling.
    private var fbo = 0
    private var fboTexture = 0
    private var fboDepth = 0
    private var fboW = 0
    private var fboH = 0

    // Dynamic camera texture (MR passthrough, uploaded from Bitmap each frame).
    private var cameraTexture = 0

    // Screen dims.
    private var screenW = 1
    private var screenH = 1

    // Scratch matrices (allocated once; never allocated in the draw loop).
    private val headMatrix = FloatArray(16)
    private val modelM = FloatArray(16)
    private val mvp = FloatArray(16)
    private val headLockModel = FloatArray(16)
    private val headLocal = FloatArray(16)

    // FPS bookkeeping.
    private var frameCount = 0
    private var fpsWindowStart = 0L
    private var currentFps = 0f
    private var currentFrameMs = 0f

    override fun onSurfaceCreated(gl: GL10?, eglConfig: EGLConfig?) {
        GLES20.glClearColor(0.02f, 0.02f, 0.03f, 1f)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthFunc(GLES20.GL_LEQUAL)
        GLES20.glDisable(GLES20.GL_CULL_FACE)

        colorProgram = GlProgram(Shaders.COLOR_VERT, Shaders.COLOR_FRAG).apply { build() }
        texProgram = GlProgram(Shaders.TEX_VERT, Shaders.TEX_FRAG).apply { build() }
        externalProgram = GlProgram(Shaders.EXTERNAL_VERT, Shaders.EXTERNAL_FRAG).apply { build() }
        distortProgram = GlProgram(Shaders.DISTORT_VERT, Shaders.DISTORT_FRAG).apply { build() }

        quadMesh.upload(GlMesh.unitQuad())
        boxMesh.upload(GlMesh.box(1f, 1f, 1f))
        sphereMesh.upload(GlMesh.sphere(1f, 20, 20))
        uploadScreenQuad()

        cameraTexture = GlTextures.create2D()

        // Prepare the capture surface texture on the GL thread.
        if (captureSurface.textureId == 0) {
            captureSurface.textureId = GlTextures.createExternal()
            captureSurface.surfaceTexture = SurfaceTexture(captureSurface.textureId)
        }
        MLog.d("VRRenderer", "GL resources created")
    }

    private fun uploadScreenQuad() {
        val data = Shaders.fullscreenQuad()
        val bb = ByteBuffer.allocateDirect(data.size * 4).order(ByteOrder.nativeOrder())
        val fb = bb.asFloatBuffer()
        fb.put(data).position(0)
        val ids = IntArray(1)
        // Reuse GlMesh with a custom 4-float stride via a dedicated path below.
        screenQuadVbo = createVbo(fb, data.size * 4)
    }

    private var screenQuadVbo = 0

    private fun createVbo(fb: FloatBuffer, bytes: Int): Int {
        val ids = IntArray(1)
        GLES20.glGenBuffers(1, ids, 0)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, ids[0])
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, bytes, fb, GLES20.GL_STATIC_DRAW)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
        return ids[0]
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        screenW = width
        screenH = height
        GLES20.glViewport(0, 0, width, height)
        setupFboIfNeeded()
    }

    private fun setupFboIfNeeded() {
        val scale = if (config.distortionEnabled || config.renderScale != 1f) config.renderScale else 1f
        val needFbo = config.distortionEnabled || config.renderScale != 1f
        val w = (screenW / 2f * scale).toInt().coerceAtLeast(1)
        val h = (screenH * scale).toInt().coerceAtLeast(1)
        if (!needFbo) {
            teardownFbo()
            return
        }
        if (w == fboW && h == fboH && fbo != 0) return
        teardownFbo()

        val ids = IntArray(3)
        GLES20.glGenFramebuffers(1, ids, 0); fbo = ids[0]
        GLES20.glGenTextures(1, ids, 0); fboTexture = ids[1]
        GLES20.glGenRenderbuffers(1, ids, 0); fboDepth = ids[2]

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, fboTexture)
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

        GLES20.glBindRenderbuffer(GLES20.GL_RENDERBUFFER, fboDepth)
        GLES20.glRenderbufferStorage(GLES20.GL_RENDERBUFFER, GLES20.GL_DEPTH_COMPONENT16, w, h)

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo)
        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, fboTexture, 0)
        GLES20.glFramebufferRenderbuffer(GLES20.GL_FRAMEBUFFER, GLES20.GL_DEPTH_ATTACHMENT, GLES20.GL_RENDERBUFFER, fboDepth)
        val status = GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER)
        if (status != GLES20.GL_FRAMEBUFFER_COMPLETE) MLog.w("VRRenderer", "FBO incomplete: $status")
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        fboW = w; fboH = h
    }

    private fun teardownFbo() {
        if (fbo != 0) { GLES20.glDeleteFramebuffers(1, intArrayOf(fbo), 0); fbo = 0 }
        if (fboTexture != 0) { GLES20.glDeleteTextures(1, intArrayOf(fboTexture), 0); fboTexture = 0 }
        if (fboDepth != 0) { GLES20.glDeleteRenderbuffers(1, intArrayOf(fboDepth), 0); fboDepth = 0 }
        fboW = 0; fboH = 0
    }

    override fun onDrawFrame(gl: GL10?) {
        val frameStart = System.nanoTime()

        // ---- head pose ------------------------------------------------------
        headTracker.state.copyMatrixInto(headMatrix)

        val ipd = config.ipdMeters
        val eyeW = screenW / 2
        val aspect = if (screenH > 0) eyeW.toFloat() / screenH.toFloat() else 1f
        stereo.update(headMatrix, ipd, config.fovYDeg, aspect, config.near, config.far)

        val useFbo = (config.distortionEnabled || config.renderScale != 1f) && fbo != 0
        setupFboIfNeeded()

        val renderW = if (useFbo) fboW else eyeW
        val renderH = if (useFbo) fboH else screenH
        val renderAspect = if (renderH > 0) renderW.toFloat() / renderH.toFloat() else aspect
        // Recompute projections at the actual render resolution.
        if (useFbo) {
            stereo.update(headMatrix, ipd, config.fovYDeg, renderAspect, config.near, config.far)
        }

        // Pull the newest capture frame once per frame.
        if (config.captureEnabled) captureSurface.updateTexImage()

        val nodes = sceneGraph.snapshot()

        for (eye in 0..1) {
            val view = if (eye == 0) stereo.leftView else stereo.rightView
            val proj = if (eye == 0) stereo.leftProj else stereo.rightProj

            if (useFbo) {
                GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo)
                GLES20.glViewport(0, 0, renderW, renderH)
            } else {
                GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
                GLES20.glViewport(eye * eyeW, 0, eyeW, screenH)
            }
            GLES20.glClearColor(config.clearR, config.clearG, config.clearB, 1f)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)

            renderWorld(view, proj, nodes)

            if (useFbo) {
                GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
                GLES20.glViewport(eye * eyeW, 0, eyeW, screenH)
                GLES20.glDisable(GLES20.GL_DEPTH_TEST)
                drawDistortionPass()
                GLES20.glEnable(GLES20.GL_DEPTH_TEST)
            }
        }

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)

        // ---- stats ----------------------------------------------------------
        frameCount++
        val now = System.nanoTime()
        if (fpsWindowStart == 0L) fpsWindowStart = now
        val window = now - fpsWindowStart
        if (window >= 1_000_000_000L) {
            currentFps = frameCount * 1e9f / window
            frameCount = 0
            fpsWindowStart = now
        }
        currentFrameMs = (now - frameStart) / 1e6f
        onStats?.invoke(currentFps, currentFrameMs)
    }

    /** Draw all scene content for one eye. */
    private fun renderWorld(
        view: FloatArray,
        proj: FloatArray,
        nodes: List<SceneNode>
    ) {
        val visible = nodes.filter { it.visible }
        // Opaque first, transparent sorted far -> near.
        val opaque = visible.filter { it.opacity >= 0.999f }
        val transparent = visible.filter { it.opacity < 0.999f }.sortedByDescending { distToHead(it) }

        // Upload MR camera frame if any node requests it (once per eye render).
        if (visible.any { it.texture == "camera" }) uploadCameraFrame()

        for (node in opaque) drawNode(node, view, proj)
        for (node in transparent) drawNode(node, view, proj)

        if (config.showHandLandmarks) drawHandLandmarks(view, proj)
        if (config.cursorEnabled) drawCursor(view, proj)
        if (config.showHud && config.hudText.isNotBlank()) drawHud(view, proj)
    }

    private fun distToHead(node: SceneNode): Float {
        val dx = node.pos[0]; val dy = node.pos[1]; val dz = node.pos[2]
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    private fun uploadCameraFrame(): Boolean {
        val provider = cameraFrameProvider ?: return false
        val bmp = provider() ?: return false
        if (bmp.isRecycled) return false
        GlTextures.upload(cameraTexture, bmp)
        return true
    }

    private fun drawNode(node: SceneNode, view: FloatArray, proj: FloatArray) {
        Matrix.setIdentityM(modelM, 0)
        if (node.headLocked) {
            // Anchor to the head: model = head * translate(pos) * rotate * scale.
            Matrix.multiplyMM(headLockModel, 0, headMatrix, 0, modelM, 0)
            Matrix.translateM(headLockModel, 0, node.pos[0], node.pos[1], node.pos[2])
            applyRotationAndScale(headLockModel, node)
            Matrix.multiplyMM(mvp, 0, proj, 0, view, 0)
            Matrix.multiplyMM(mvp, 0, mvp, 0, headLockModel, 0)
        } else {
            val ws = config.worldScale
            Matrix.translateM(modelM, 0, node.pos[0] * ws, node.pos[1] * ws, node.pos[2] * ws)
            applyRotationAndScale(modelM, node)
            Matrix.multiplyMM(mvp, 0, proj, 0, view, 0)
            Matrix.multiplyMM(mvp, 0, mvp, 0, modelM, 0)
        }

        when (node.texture) {
            "capture" -> drawExternal(node, mvp)
            "camera" -> drawTextured(node, mvp, cameraTexture)
            else -> {
                if (node.type == NodeType.TEXT || node.text != null) {
                    val tex = textRenderer.getTexture(node.id, node.text ?: "", node.fontSize, node.size[0], node.size[1])
                    drawTextured(node, mvp, tex)
                } else if (node.texture != null) {
                    // Named asset textures are not bundled yet; fall back to colour.
                    drawColor(node, mvp)
                } else {
                    drawColor(node, mvp)
                }
            }
        }
    }

    private fun applyRotationAndScale(m: FloatArray, node: SceneNode) {
        Matrix.rotateM(m, 0, node.rot[2], 0f, 0f, 1f)
        Matrix.rotateM(m, 0, node.rot[1], 0f, 1f, 0f)
        Matrix.rotateM(m, 0, node.rot[0], 1f, 0f, 0f)
        val sx = node.size[0] * node.scale[0]
        val sy = node.size[1] * node.scale[1]
        val sz = node.size[2] * node.scale[2]
        when (node.type) {
            NodeType.SPHERE -> {
                val r = node.size[0] * node.scale[0]
                Matrix.scaleM(m, 0, r, r, r)
            }
            NodeType.BOX -> Matrix.scaleM(m, 0, sx, sy, sz)
            else -> Matrix.scaleM(m, 0, sx, sy, 1f)
        }
    }

    private fun drawColor(node: SceneNode, mvp: FloatArray) {
        colorProgram.use()
        GLES20.glUniformMatrix4fv(colorProgram.uniform("uMvp"), 1, false, mvp, 0)
        GLES20.glUniform4f(colorProgram.uniform("uColor"), node.color[0], node.color[1], node.color[2], node.color[3])
        GLES20.glUniform1f(colorProgram.uniform("uOpacity"), node.opacity)
        enableBlend(node.opacity < 1f)
        when (node.type) {
            NodeType.BOX -> boxMesh.draw()
            NodeType.SPHERE -> sphereMesh.draw()
            else -> quadMesh.draw()
        }
    }

    private fun drawTextured(node: SceneNode, mvp: FloatArray, tex: Int) {
        texProgram.use()
        GLES20.glUniformMatrix4fv(texProgram.uniform("uMvp"), 1, false, mvp, 0)
        GLES20.glUniform4f(texProgram.uniform("uColor"), node.color[0], node.color[1], node.color[2], node.color[3])
        GLES20.glUniform1f(texProgram.uniform("uOpacity"), node.opacity)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex)
        GLES20.glUniform1i(texProgram.uniform("uTex"), 0)
        enableBlend(true)
        quadMesh.draw()
    }

    private fun drawExternal(node: SceneNode, mvp: FloatArray) {
        if (captureSurface.textureId == 0) return
        externalProgram.use()
        GLES20.glUniformMatrix4fv(externalProgram.uniform("uMvp"), 1, false, mvp, 0)
        GLES20.glUniform4f(externalProgram.uniform("uColor"), node.color[0], node.color[1], node.color[2], 1f)
        GLES20.glUniform1f(externalProgram.uniform("uOpacity"), node.opacity * config.captureOpacity)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, captureSurface.textureId)
        GLES20.glUniform1i(externalProgram.uniform("uTex"), 0)
        enableBlend(false)
        quadMesh.draw()
    }

    private fun enableBlend(on: Boolean) {
        if (on) {
            GLES20.glEnable(GLES20.GL_BLEND)
            GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        } else {
            GLES20.glDisable(GLES20.GL_BLEND)
        }
    }

    /** Head-locked reticle along the cursor ray. */
    private fun drawCursor(view: FloatArray, proj: FloatArray) {
        val d = cursor.depth
        val px = cursor.dirX * d
        val py = cursor.dirY * d
        val pz = cursor.dirZ * d
        val size = 0.012f * config.cursorScale

        Matrix.setIdentityM(headLockModel, 0)
        Matrix.translateM(headLockModel, 0, px, py, pz)
        Matrix.scaleM(headLockModel, 0, size, size, 1f)
        Matrix.multiplyMM(headLocal, 0, headMatrix, 0, headLockModel, 0)

        Matrix.multiplyMM(mvp, 0, proj, 0, view, 0)
        Matrix.multiplyMM(mvp, 0, mvp, 0, headLocal, 0)

        colorProgram.use()
        GLES20.glUniformMatrix4fv(colorProgram.uniform("uMvp"), 1, false, mvp, 0)
        val down = inputHub.pointer.down
        GLES20.glUniform1f(colorProgram.uniform("uOpacity"), if (cursor.active) 1f else 0.5f)
        GLES20.glUniform4f(
            colorProgram.uniform("uColor"),
            if (down) 1f else 0.2f,
            if (down) 0.3f else 0.85f,
            if (down) 0.3f else 0.55f,
            1f
        )
        enableBlend(true)
        quadMesh.draw()
    }

    /** Hand landmark debug overlay (head-locked plane at 1.2 m). */
    private fun drawHandLandmarks(view: FloatArray, proj: FloatArray) {
        val frame = handFrameProvider?.invoke() ?: return
        val halfH = (1.2f * kotlin.math.tan(Math.toRadians(config.fovYDeg.toDouble() / 2.0))).toFloat()
        val halfW = halfH * (if (screenH > 0) (screenW / 2f) / screenH else 1f)

        colorProgram.use()
        GLES20.glUniform1f(colorProgram.uniform("uOpacity"), 0.9f)
        GLES20.glUniform4f(colorProgram.uniform("uColor"), 0f, 1f, 0.6f, 1f)
        enableBlend(true)

        for (hand in frame.hands) {
            val lm = hand.landmarks
            for (i in 0 until HandTrackingEngine.LANDMARK_COUNT) {
                val nx = lm[i * 3] - 0.5f
                val ny = 0.5f - lm[i * 3 + 1]
                val px = nx * 2f * halfW
                val py = ny * 2f * halfH
                Matrix.setIdentityM(headLockModel, 0)
                Matrix.translateM(headLockModel, 0, px, py, -1.2f)
                Matrix.scaleM(headLockModel, 0, 0.008f, 0.008f, 1f)
                Matrix.multiplyMM(headLocal, 0, headMatrix, 0, headLockModel, 0)
                Matrix.multiplyMM(mvp, 0, proj, 0, view, 0)
                Matrix.multiplyMM(mvp, 0, mvp, 0, headLocal, 0)
                GLES20.glUniformMatrix4fv(colorProgram.uniform("uMvp"), 1, false, mvp, 0)
                quadMesh.draw()
            }
        }
    }

    /** Head-locked diagnostic strip. */
    private fun drawHud(view: FloatArray, proj: FloatArray) {
        Matrix.setIdentityM(headLockModel, 0)
        Matrix.translateM(headLockModel, 0, 0f, -0.28f, -1.4f)
        Matrix.scaleM(headLockModel, 0, 1.4f, 0.08f, 1f)
        Matrix.multiplyMM(headLocal, 0, headMatrix, 0, headLockModel, 0)
        Matrix.multiplyMM(mvp, 0, proj, 0, view, 0)
        Matrix.multiplyMM(mvp, 0, mvp, 0, headLocal, 0)

        val tex = textRenderer.getTexture("__hud", config.hudText, 0.022f, 1.4f, 0.08f)
        texProgram.use()
        GLES20.glUniformMatrix4fv(texProgram.uniform("uMvp"), 1, false, mvp, 0)
        GLES20.glUniform4f(texProgram.uniform("uColor"), 0.85f, 0.85f, 0.85f, 1f)
        GLES20.glUniform1f(texProgram.uniform("uOpacity"), 0.9f)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex)
        GLES20.glUniform1i(texProgram.uniform("uTex"), 0)
        enableBlend(true)
        quadMesh.draw()
    }

    /** Barrel-distortion / blit pass for one eye. */
    private fun drawDistortionPass() {
        distortProgram.use()
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, fboTexture)
        GLES20.glUniform1i(distortProgram.uniform("uTex"), 0)
        GLES20.glUniform2f(distortProgram.uniform("uLensCenter"), 0.5f, 0.5f)
        GLES20.glUniform2f(distortProgram.uniform("uScaleIn"), 1f, 1f)
        val k1 = if (config.distortionEnabled) config.distortionK1 else 0f
        val k2 = if (config.distortionEnabled) config.distortionK2 else 0f
        val f = 1f + k1 * 0.5f + k2 * 0.25f
        val s = if (f > 0.001f) 1f / f else 1f
        GLES20.glUniform2f(distortProgram.uniform("uScale"), s, s)
        GLES20.glUniform2f(distortProgram.uniform("uK"), k1, k2)

        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, screenQuadVbo)
        val posLoc = distortProgram.attrib("aPosition")
        val uvLoc = distortProgram.attrib("aUv")
        GLES20.glEnableVertexAttribArray(posLoc)
        GLES20.glVertexAttribPointer(posLoc, 2, GLES20.GL_FLOAT, false, 16, 0)
        GLES20.glEnableVertexAttribArray(uvLoc)
        GLES20.glVertexAttribPointer(uvLoc, 2, GLES20.GL_FLOAT, false, 16, 8)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 6)
        GLES20.glDisableVertexAttribArray(posLoc)
        GLES20.glDisableVertexAttribArray(uvLoc)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
    }
}
