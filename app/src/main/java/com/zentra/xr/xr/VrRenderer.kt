package com.zentra.xr.xr

import android.opengl.GLES20
import android.opengl.Matrix
import com.zentra.xr.core.Framebuffer
import com.zentra.xr.core.Geometry
import com.zentra.xr.core.Mat
import com.zentra.xr.core.MatrixStack
import com.zentra.xr.core.Mesh
import com.zentra.xr.core.Programs
import com.zentra.xr.core.TextKit
import com.zentra.xr.core.Texture
import com.zentra.xr.ui.Palette
import kotlin.math.atan
import kotlin.math.max
import kotlin.math.tan

/** Reusable description of a flat SDF surface. */
class PanelStyle {

    val fillTop = FloatArray(4)
    val fillBottom = FloatArray(4)
    val border = FloatArray(4)
    val shadow = FloatArray(4)
    val glow = FloatArray(4)

    var radius = 0.018f
    var borderWidth = 0f
    var shadowSize = 0.05f
    var shadowStrength = 0f
    var glowStrength = 0f
    var texture: Texture? = null
    var texAlpha = 1f

    fun surface(topArgb: Int, bottomArgb: Int, radius: Float): PanelStyle {
        argb(topArgb, fillTop)
        argb(bottomArgb, fillBottom)
        this.radius = radius
        borderWidth = 0f
        shadowStrength = 0f
        glowStrength = 0f
        texture = null
        return this
    }

    fun stroke(colorArgb: Int, width: Float): PanelStyle {
        argb(colorArgb, border)
        borderWidth = width
        return this
    }

    fun dropShadow(colorArgb: Int, size: Float, strength: Float): PanelStyle {
        argb(colorArgb, shadow)
        shadowSize = size
        shadowStrength = strength
        return this
    }

    fun halo(colorArgb: Int, strength: Float): PanelStyle {
        argb(colorArgb, glow)
        glowStrength = strength
        return this
    }

    fun image(texture: Texture?, alpha: Float = 1f): PanelStyle {
        this.texture = texture
        texAlpha = alpha
        return this
    }

    companion object {
        fun argb(c: Int, out: FloatArray) {
            out[0] = ((c ushr 16) and 0xFF) / 255f
            out[1] = ((c ushr 8) and 0xFF) / 255f
            out[2] = (c and 0xFF) / 255f
            out[3] = ((c ushr 24) and 0xFF) / 255f
        }
    }
}

/** Reusable description of a lit 3D material. */
class Material {
    val color = FloatArray(4)
    val emissive = FloatArray(3)
    val rim = FloatArray(3)
    var rimStrength = 0.40f
    var spec = 0.35f
    var texture: Texture? = null

    fun base(argb: Int): Material {
        PanelStyle.argb(argb, color)
        return this
    }

    fun glow(argb: Int): Material {
        val c = FloatArray(4)
        PanelStyle.argb(argb, c)
        emissive[0] = c[0]
        emissive[1] = c[1]
        emissive[2] = c[2]
        return this
    }

    fun rimLight(argb: Int, strength: Float): Material {
        val c = FloatArray(4)
        PanelStyle.argb(argb, c)
        rim[0] = c[0]
        rim[1] = c[1]
        rim[2] = c[2]
        rimStrength = strength
        return this
    }
}

/**
 * The Zentra XR stereo renderer.
 *
 * Everything is drawn twice, once per eye, into the two halves of an off screen
 * framebuffer which is then composited to the display as a Side-by-Side image with
 * Cardboard barrel distortion. Dynamic resolution is free because of the FBO.
 */
class VrRenderer {

    val programs = Programs()
    val text = TextKit()
    val stack = MatrixStack(32)
    val fbo = Framebuffer()

    // --- per frame state -------------------------------------------------
    val view = FloatArray(16)
    val proj = FloatArray(16)
    val viewProj = FloatArray(16)
    val invViewProj = FloatArray(16)
    val headWorld = FloatArray(16)
    val camPos = com.zentra.xr.core.Vec3()

    /** World units covered by one screen pixel at 1 m from the eye. */
    var pixelWorld = 0.0016f
    var time = 0f
    var frameDt = 0f
    var width = 0
    var height = 0
    var eyeIndex = 0
    var quality = 1f
    var textScale = 1f

    lateinit var theme: Palette

    private val mvp = FloatArray(16)
    private val tmp = FloatArray(16)
    private val tmp2 = FloatArray(16)
    private val lightDir = com.zentra.xr.core.Vec3(0.35f, 0.9f, 0.4f).apply { normalize() }
    private val light2Dir = com.zentra.xr.core.Vec3(-0.5f, -0.2f, 0.8f).apply { normalize() }
    private val worldPoint = com.zentra.xr.core.Vec3()
    private var eyeWidth = 0
    private var eyeHeight = 0
    private var renderScale = 1f

    private val scratchColor = FloatArray(4)

    // ---------------------------------------------------------------------
    // lifecycle
    // ---------------------------------------------------------------------
    fun create() {
        programs.create()
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthFunc(GLES20.GL_LEQUAL)
        GLES20.glEnable(GLES20.GL_CULL_FACE)
        GLES20.glCullFace(GLES20.GL_BACK)
        GLES20.glDisable(GLES20.GL_DITHER)
        Geometry.quad().upload()
        Geometry.box().upload()
        Geometry.sphere().upload()
        Geometry.torus().upload()
        Geometry.cylinder().upload()
        Geometry.ground().upload()
        Geometry.ndcQuad().upload()
    }

    fun resize(w: Int, h: Int) {
        width = w
        height = h
    }

    fun release() {
        text.release()
        programs.release()
        fbo.release()
        Geometry.releaseAll()
    }

    // ---------------------------------------------------------------------
    // frame orchestration
    // ---------------------------------------------------------------------
    fun beginFrame(head: FloatArray, dt: Float, scale: Float) {
        frameDt = dt
        time += dt
        renderScale = scale
        System.arraycopy(head, 0, headWorld, 0, 16)

        val fw = max(2, (width * scale).toInt())
        val fh = max(2, (height * scale).toInt())
        fbo.resize(fw, fh)

        fbo.bind()
        GLES20.glViewport(0, 0, fw, fh)
        GLES20.glScissor(0, 0, fw, fh)
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        GLES20.glEnable(GLES20.GL_SCISSOR_TEST)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthMask(true)
        GLES20.glDisable(GLES20.GL_BLEND)
    }

    /**
     * Prepares the view/projection of one eye.
     * @param ipd interpupillary distance in meters
     * @param fovDeg horizontal field of view of a single eye
     */
    fun beginEye(index: Int, ipd: Float, fovDeg: Float, mono: Boolean, swap: Boolean) {
        eyeIndex = if (swap) 1 - index else index
        val eyeOffset = if (mono) 0f else (if (index == 0) -ipd * 0.5f else ipd * 0.5f)

        val fw = fbo.width
        val fh = fbo.height
        eyeWidth = if (mono) fw else fw / 2
        eyeHeight = fh
        GLES20.glViewport(eyeIndex * eyeWidth, 0, eyeWidth, eyeHeight)
        GLES20.glScissor(eyeIndex * eyeWidth, 0, eyeWidth, eyeHeight)

        // view = R^T * T(-eyeOffset)
        Matrix.transposeM(view, 0, headWorld, 0)
        Matrix.translateM(view, 0, -eyeOffset, 0f, 0f)

        val aspect = eyeWidth.toFloat() / eyeHeight.toFloat()
        val fovX = fovDeg.coerceIn(50f, 120f)
        val tanHalfX = tan(Math.toRadians(fovX * 0.5)).toFloat()
        val tanHalfY = tanHalfX / aspect
        val fovY = Math.toDegrees(2.0 * atan(tanHalfY.toDouble())).toFloat()
        Matrix.perspectiveM(proj, 0, fovY, aspect, 0.05f, 240f)
        Matrix.multiplyMM(viewProj, 0, proj, 0, view, 0)
        Matrix.invertM(invViewProj, 0, viewProj, 0)

        // camera origin in world space = head * (offset, 0, 0)
        worldPoint.set(eyeOffset, 0f, 0f)
        Mat.transformPoint(headWorld, worldPoint, camPos)

        pixelWorld = (2f * tanHalfY) / eyeHeight.toFloat()

        stack.reset()
    }

    fun endFrame(barrel: Float, swap: Boolean, mono: Boolean, aberration: Float, vignette: Float) {
        GLES20.glDisable(GLES20.GL_SCISSOR_TEST)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GLES20.glViewport(0, 0, width, height)
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glDisable(GLES20.GL_BLEND)
        GLES20.glDisable(GLES20.GL_CULL_FACE)

        val p = programs.blit
        p.use()
        Geometry.ndcQuad().bind(p.aPos, -1, p.aUv)
        p.tex("uTex", fbo.tex, 0)
        // Gentle pincushion: k1 is scaled by the user setting (0 = flat, 1 = Cardboard v2)
        p.f1("uK1", 0.22f * barrel)
        p.f1("uK2", 0.06f * barrel)
        p.f1("uSwap", if (swap) 1f else 0f)
        p.f1("uAberration", aberration)
        p.f1("uVignette", vignette)
        p.f1("uMono", if (mono) 1f else 0f)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 6)

        GLES20.glEnable(GLES20.GL_CULL_FACE)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
    }

    // ---------------------------------------------------------------------
    // environment
    // ---------------------------------------------------------------------
    fun sky(topColor: Int, bottomColor: Int, horizonColor: Int, stars: Float) {
        val p = programs.sky
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthMask(false)
        GLES20.glDisable(GLES20.GL_BLEND)
        p.use()
        Geometry.ndcQuad().bind(p.aPos, -1, p.aUv)
        p.m4("uInvVP", invViewProj)
        val c = scratchColor
        PanelStyle.argb(topColor, c)
        p.v3("uTop", c[0], c[1], c[2])
        PanelStyle.argb(bottomColor, c)
        p.v3("uBottom", c[0], c[1], c[2])
        PanelStyle.argb(horizonColor, c)
        p.v3("uHorizon", c[0], c[1], c[2])
        p.f1("uStars", stars)
        p.f1("uTime", time)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 6)
        GLES20.glDepthMask(true)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
    }

    fun floor(y: Float, spacing: Float, color: Int, alpha: Float, fade: Float) {
        if (alpha <= 0.002f) return
        val p = programs.grid
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        GLES20.glDepthMask(false)
        p.use()
        val mesh = Geometry.ground()
        mesh.upload()
        mesh.bind(p.aPos, -1, -1)
        stack.push()
        stack.translate(0f, y, 0f)
        stack.scale(fade * 2f, 1f, fade * 2f)
        stack.mvp(viewProj, mvp)
        p.m4("uMVP", mvp)
        p.m4("uModel", stack.top)
        p.f1("uSpacing", spacing)
        val pixel = pixelWorld * max(0.8f, stack.distanceTo(camPos))
        p.f1("uWidth", pixel * 1.6f)
        p.f1("uFade", fade)
        p.f1("uAlpha", alpha)
        val c = scratchColor
        PanelStyle.argb(color, c)
        p.v3("uColor", c[0], c[1], c[2])
        mesh.draw()
        stack.pop()
        GLES20.glDepthMask(true)
    }

    // ---------------------------------------------------------------------
    // primitives
    // ---------------------------------------------------------------------
    fun panel(w: Float, h: Float, style: PanelStyle, alpha: Float = 1f) {
        if (alpha <= 0.003f) return
        val p = programs.panel
        p.use()
        val mesh = Geometry.quad()
        mesh.bind(p.aPos, -1, p.aUv)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        GLES20.glDepthMask(true)
        GLES20.glDisable(GLES20.GL_CULL_FACE)

        stack.mvp(viewProj, mvp)
        val dist = max(0.25f, stack.distanceTo(camPos))
        val soft = pixelWorld * dist * 1.25f

        p.m4("uMVP", mvp)
        p.m4("uModel", stack.top)
        p.v2("uSize", w, h)
        p.v2("uHalfSize", w * 0.5f, h * 0.5f)
        p.f1("uRadius", style.radius.coerceAtMost(kotlin.math.min(w, h) * 0.5f))
        p.f1("uSoft", soft)
        p.f1("uBorder", style.borderWidth)
        p.v4a("uFillTop", style.fillTop)
        p.v4a("uFillBottom", style.fillBottom)
        p.v4a("uBorderColor", style.border)
        p.v4a("uShadowColor", style.shadow)
        p.f1("uShadowSize", style.shadowSize)
        p.f1("uShadowStrength", style.shadowStrength)
        p.f1("uGlow", style.glowStrength)
        p.v4a("uGlowColor", style.glow)
        p.f1("uOpacity", alpha)
        p.f1("uCornerOnly", 0f)
        val tex = style.texture
        if (tex != null && tex.id != 0) {
            p.tex("uTex", tex.id, 0)
            p.f1("uUseTex", 1f)
            p.f1("uTexAlpha", style.texAlpha)
        } else {
            p.f1("uUseTex", 0f)
            p.f1("uTexAlpha", 1f)
        }
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 6)
        GLES20.glEnable(GLES20.GL_CULL_FACE)
    }

    fun sprite(tex: Texture?, w: Float, h: Float, tint: Int, alpha: Float = 1f, useTex: Boolean = true) {
        if (tex == null || tex.id == 0 || alpha <= 0.003f) return
        val p = programs.sprite
        p.use()
        Geometry.quad().bind(p.aPos, -1, p.aUv)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        GLES20.glDepthMask(false)
        GLES20.glDisable(GLES20.GL_CULL_FACE)
        stack.mvp(viewProj, mvp)
        p.m4("uMVP", mvp)
        p.m4("uModel", stack.top)
        p.v2("uSize", w, h)
        p.tex("uTex", tex.id, 0)
        PanelStyle.argb(tint, scratchColor)
        p.v4("uTint", scratchColor[0], scratchColor[1], scratchColor[2], scratchColor[3] * alpha)
        p.f1("uUseTex", if (useTex) 1f else 0f)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 6)
        GLES20.glDepthMask(true)
        GLES20.glEnable(GLES20.GL_CULL_FACE)
    }

    fun oes(texId: Int, w: Float, h: Float, alpha: Float = 1f) {
        if (texId == 0) return
        val p = programs.oes
        p.use()
        Geometry.quad().bind(p.aPos, -1, p.aUv)
        GLES20.glDisable(GLES20.GL_BLEND)
        GLES20.glDepthMask(true)
        GLES20.glDisable(GLES20.GL_CULL_FACE)
        stack.mvp(viewProj, mvp)
        p.m4("uMVP", mvp)
        p.m4("uModel", stack.top)
        p.v2("uSize", w, h)
        p.bindOes("uTex", texId, 0)
        p.v4("uTint", 1f, 1f, 1f, alpha)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 6)
        GLES20.glEnable(GLES20.GL_CULL_FACE)
    }

    fun circle(radius: Float, argb: Int, alpha: Float = 1f, halo: Float = 0f, haloArgb: Int = argb) {
        val style = circleStyle
        val c = scratchColor
        PanelStyle.argb(argb, c)
        System.arraycopy(c, 0, style.fillTop, 0, 4)
        System.arraycopy(c, 0, style.fillBottom, 0, 4)
        style.radius = radius
        style.borderWidth = 0f
        style.shadowStrength = 0f
        style.glowStrength = halo
        PanelStyle.argb(haloArgb, style.glow)
        style.texture = null
        panel(radius * 2f, radius * 2f, style, alpha)
    }

    private val circleStyle = PanelStyle()

    /**
     * Draws a line of text. The label is vertically centred on the current origin and
     * horizontally aligned by [align]. Returns the width in world units.
     */
    fun label(
        value: String,
        height: Float,
        color: Int,
        weight: Int = 1,
        alpha: Float = 1f,
        align: Int = ALIGN_LEFT,
        maxWidth: Float = 0f
    ): Float {
        if (value.isEmpty() || alpha <= 0.01f) return 0f
        val px = (height * PX_PER_METER * textScale).toInt().coerceIn(10, 220)
        val out = if (maxWidth > 0f) fit(value, px, weight, height, maxWidth) else value
        val run = text.text(out, px, weight)
        val w = height * run.aspect
        val ox = when (align) {
            ALIGN_CENTER -> -w * 0.5f
            ALIGN_RIGHT -> -w
            else -> 0f
        }
        stack.push()
        stack.translate(ox, 0f, 0f)
        sprite(run.texture, w, height, color, alpha)
        stack.pop()
        return w
    }

    /** World width a string would occupy at the given world height. */
    fun textWidth(value: String, height: Float, weight: Int = 1): Float {
        val px = (height * PX_PER_METER * textScale).toInt().coerceIn(10, 220)
        return text.measure(value, px, weight) * height / text.lineHeight(px, weight)
    }

    private fun fit(value: String, px: Int, weight: Int, height: Float, maxWidth: Float): String {
        val lh = text.lineHeight(px, weight)
        if (text.measure(value, px, weight) * height / lh <= maxWidth) return value
        var cut = value.length
        while (cut > 1) {
            cut--
            val candidate = value.substring(0, cut) + "…"
            if (text.measure(candidate, px, weight) * height / lh <= maxWidth) return candidate
        }
        return "…"
    }

    fun mesh(mesh: Mesh, material: Material, alpha: Float = 1f) {
        if (alpha <= 0.003f) return
        val p = programs.lit
        p.use()
        mesh.upload()
        mesh.bind(p.aPos, p.aNormal, p.aUv)
        if (alpha < 0.999f) {
            GLES20.glEnable(GLES20.GL_BLEND)
            GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
            GLES20.glDepthMask(false)
        } else {
            GLES20.glDisable(GLES20.GL_BLEND)
            GLES20.glDepthMask(true)
        }
        stack.mvp(viewProj, mvp)
        p.m4("uMVP", mvp)
        p.m4("uModel", stack.top)
        Mat.invert(tmp, stack.top)
        Matrix.transposeM(tmp2, 0, tmp, 0)
        p.m4("uNormalMat", tmp2)
        p.v3("uColor", material.color[0], material.color[1], material.color[2])
        p.v3("uEmissive", material.emissive[0], material.emissive[1], material.emissive[2])
        p.v3("uRimColor", material.rim[0], material.rim[1], material.rim[2])
        p.f1("uRim", material.rimStrength)
        p.f1("uSpec", material.spec)
        p.f1("uAlpha", material.color[3] * alpha)
        p.v3("uCamPos", camPos.x, camPos.y, camPos.z)
        p.v3("uLightDir", lightDir.x, lightDir.y, lightDir.z)
        p.v3("uLight2Dir", light2Dir.x, light2Dir.y, light2Dir.z)
        val tex = material.texture
        if (tex != null && tex.id != 0) {
            p.tex("uTex", tex.id, 0)
            p.f1("uUseTex", 1f)
        } else {
            p.f1("uUseTex", 0f)
        }
        mesh.draw()
        GLES20.glDepthMask(true)
    }

    // ---- transform helpers ---------------------------------------------
    fun push() = stack.push()
    fun multiply(m: FloatArray) = stack.multiply(m)
    fun mvpInto(out: FloatArray) {
        stack.mvp(viewProj, out)
    }

    /** Draws a mesh textured with a video frame (OES external texture). */
    fun oesMesh(mesh: Mesh, texId: Int, alpha: Float = 1f) {
        if (texId == 0) return
        val p = programs.oes
        p.use()
        mesh.upload()
        mesh.bind(p.aPos, -1, p.aUv)
        GLES20.glDisable(GLES20.GL_BLEND)
        GLES20.glDepthMask(true)
        stack.mvp(viewProj, mvp)
        p.m4("uMVP", mvp)
        p.m4("uModel", stack.top)
        p.v2("uSize", 1f, 1f)
        p.bindOes("uTex", texId, 0)
        p.v4("uTint", 1f, 1f, 1f, alpha)
        mesh.draw()
    }

    fun push(model: FloatArray) = stack.push(model)
    fun pop() = stack.pop()
    fun translate(x: Float, y: Float, z: Float) = stack.translate(x, y, z)
    fun rotate(deg: Float, x: Float, y: Float, z: Float) = stack.rotate(deg, x, y, z)
    fun scale(s: Float) = stack.scale(s)
    fun scale(x: Float, y: Float, z: Float) = stack.scale(x, y, z)

    /** Distance from the eye to the current matrix origin. */
    fun distanceToCamera(): Float = stack.distanceTo(camPos)

    /** World units per screen pixel at the current transform. */
    fun pixelSize(): Float = pixelWorld * max(0.2f, stack.distanceTo(camPos))

    companion object {
        const val ALIGN_LEFT = 0
        const val ALIGN_CENTER = 1
        const val ALIGN_RIGHT = 2

        /** Texture resolution: pixels per meter of world height for text. */
        const val PX_PER_METER = 2400f
    }
}
