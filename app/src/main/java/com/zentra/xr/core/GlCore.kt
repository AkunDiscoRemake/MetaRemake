package com.zentra.xr.core

import android.graphics.Bitmap
import android.opengl.GLES20
import android.opengl.GLUtils
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.IntBuffer
import java.nio.ShortBuffer

private const val TAG = "ZentraGL"

object GlUtil {

    var glErrorLogged = false

    fun check(tag: String) {
        if (glErrorLogged) return
        var e = GLES20.glGetError()
        while (e != GLES20.GL_NO_ERROR) {
            Log.e(TAG, "GL error 0x${Integer.toHexString(e)} at $tag")
            glErrorLogged = true
            e = GLES20.glGetError()
        }
    }

    fun compile(type: Int, src: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, src)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            val log = GLES20.glGetShaderInfoLog(shader)
            GLES20.glDeleteShader(shader)
            throw RuntimeException("Shader compile error: $log")
        }
        return shader
    }

    /** Attribute slots are fixed for the whole app so state changes stay cheap. */
    val ATTRIBS = arrayOf("aPos", "aNormal", "aUv")

    fun link(vsSrc: String, fsSrc: String): Int {
        val vs = compile(GLES20.GL_VERTEX_SHADER, vsSrc)
        val fs = compile(GLES20.GL_FRAGMENT_SHADER, fsSrc)
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vs)
        GLES20.glAttachShader(program, fs)
        for (i in ATTRIBS.indices) GLES20.glBindAttribLocation(program, i, ATTRIBS[i])
        GLES20.glLinkProgram(program)
        GLES20.glDeleteShader(vs)
        GLES20.glDeleteShader(fs)
        val status = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0)
        if (status[0] == 0) {
            val log = GLES20.glGetProgramInfoLog(program)
            GLES20.glDeleteProgram(program)
            throw RuntimeException("Program link error: $log")
        }
        return program
    }
}

/**
 * Interleaved vertex buffer: position (3) + normal (3) + uv (2), 32 bytes per vertex.
 * Supports indexed or non indexed drawing.
 */
class Mesh(
    val vertices: FloatBuffer,
    val indices: ShortBuffer? = null,
    val indexCount: Int = indices?.limit() ?: 0,
    val vertexCount: Int = vertices.limit() / STRIDE_FLOATS
) {
    private val ids = IntArray(2)
    private var uploaded = false

    val mode: Int get() = if (indices != null) GLES20.GL_TRIANGLES else GLES20.GL_TRIANGLES

    fun upload() {
        if (uploaded) return
        GLES20.glGenBuffers(2, ids, 0)
        vertices.position(0)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, ids[0])
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, vertices.limit() * 4, vertices, GLES20.GL_STATIC_DRAW)
        indices?.let {
            it.position(0)
            GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, ids[1])
            GLES20.glBufferData(GLES20.GL_ELEMENT_ARRAY_BUFFER, it.limit() * 2, it, GLES20.GL_STATIC_DRAW)
        }
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, 0)
        uploaded = true
    }

    fun bind(aPos: Int, aNormal: Int, aUv: Int) {
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, ids[0])
        val stride = STRIDE_BYTES
        if (aPos >= 0) {
            GLES20.glEnableVertexAttribArray(aPos)
            GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, stride, 0)
        }
        if (aNormal >= 0) {
            GLES20.glEnableVertexAttribArray(aNormal)
            GLES20.glVertexAttribPointer(aNormal, 3, GLES20.GL_FLOAT, false, stride, 12)
        }
        if (aUv >= 0) {
            GLES20.glEnableVertexAttribArray(aUv)
            GLES20.glVertexAttribPointer(aUv, 2, GLES20.GL_FLOAT, false, stride, 24)
        }
        for (slot in 0..2) {
            if (slot != aPos && slot != aNormal && slot != aUv) {
                GLES20.glDisableVertexAttribArray(slot)
            }
        }
        if (indices != null) GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, ids[1])
    }

    fun draw() {
        if (indices != null) {
            GLES20.glDrawElements(GLES20.GL_TRIANGLES, indexCount, GLES20.GL_UNSIGNED_SHORT, 0)
        } else {
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, vertexCount)
        }
    }

    fun release() {
        if (!uploaded) return
        GLES20.glDeleteBuffers(2, ids, 0)
        uploaded = false
    }

    companion object {
        const val STRIDE_FLOATS = 8
        const val STRIDE_BYTES = STRIDE_FLOATS * 4
    }
}

class MeshBuilder {
    private val verts = ArrayList<Float>(1024)
    private val idx = ArrayList<Short>(1024)

    private var nx = 0f
    private var ny = 0f
    private var nz = 1f

    fun normal(x: Float, y: Float, z: Float): MeshBuilder {
        nx = x; ny = y; nz = z
        return this
    }

    fun vertex(x: Float, y: Float, z: Float, u: Float, v: Float): MeshBuilder {
        verts.add(x); verts.add(y); verts.add(z)
        verts.add(nx); verts.add(ny); verts.add(nz)
        verts.add(u); verts.add(v)
        return this
    }

    fun index(i: Int): MeshBuilder {
        idx.add(i.toShort())
        return this
    }

    fun triangle(a: Int, b: Int, c: Int): MeshBuilder {
        idx.add(a.toShort()); idx.add(b.toShort()); idx.add(c.toShort())
        return this
    }

    fun quad(a: Int, b: Int, c: Int, d: Int): MeshBuilder {
        triangle(a, b, c)
        triangle(a, c, d)
        return this
    }

    fun build(): Mesh {
        val vb = ByteBuffer.allocateDirect(verts.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        for (f in verts) vb.put(f)
        vb.position(0)
        val ib: ShortBuffer?
        if (idx.isNotEmpty()) {
            val b = ByteBuffer.allocateDirect(idx.size * 2).order(ByteOrder.nativeOrder()).asShortBuffer()
            for (s in idx) b.put(s)
            b.position(0)
            ib = b
        } else ib = null
        return Mesh(vb, ib, idx.size)
    }
}

/** Procedural geometry: everything the app draws is generated at runtime (no binary assets). */
object Geometry {

    private val cache = HashMap<String, Mesh>()

    fun cached(key: String, build: () -> Mesh): Mesh = cache.getOrPut(key) { build() }

    /** Unit quad in the XY plane, facing +Z. Non indexed so it can be drawn directly. */
    fun quad(): Mesh = cached("quad") {
        val b = MeshBuilder()
        b.normal(0f, 0f, 1f)
        b.vertex(-0.5f, -0.5f, 0f, 0f, 1f)
        b.vertex(0.5f, -0.5f, 0f, 1f, 1f)
        b.vertex(0.5f, 0.5f, 0f, 1f, 0f)
        b.vertex(-0.5f, -0.5f, 0f, 0f, 1f)
        b.vertex(0.5f, 0.5f, 0f, 1f, 0f)
        b.vertex(-0.5f, 0.5f, 0f, 0f, 0f)
        b.build()
    }

    fun box(): Mesh = cached("box") {
        val b = MeshBuilder()
        val faces = arrayOf(
            intArrayOf(1, 0, 0), intArrayOf(-1, 0, 0),
            intArrayOf(0, 1, 0), intArrayOf(0, -1, 0),
            intArrayOf(0, 0, 1), intArrayOf(0, 0, -1)
        )
        val n = Vec3()
        val up = Vec3()
        val right = Vec3()
        val realUp = Vec3()
        val c = Vec3()
        val p = Vec3()
        for ((faceIndex, f) in faces.withIndex()) {
            n.set(f[0].toFloat(), f[1].toFloat(), f[2].toFloat())
            up.set(if (kotlin.math.abs(n.y) > 0.5f) 0f else 0f, if (kotlin.math.abs(n.y) > 0.5f) 0f else 1f,
                if (kotlin.math.abs(n.y) > 0.5f) 1f else 0f)
            right.set(up).cross(n).normalize()
            realUp.set(n).cross(right).normalize()
            b.normal(n.x, n.y, n.z)
            val s = 0.5f
            c.set(n).scale(s)
            val uvs = floatArrayOf(0f, 1f, 1f, 1f, 1f, 0f, 0f, 0f)
            for (k in 0..3) {
                val sx = if (k == 1 || k == 2) s else -s
                val sy = if (k >= 2) s else -s
                p.set(c).addScaled(right, sx).addScaled(realUp, sy)
                b.vertex(p.x, p.y, p.z, uvs[k * 2], uvs[k * 2 + 1])
            }
            val i0 = faceIndex * 4
            b.quad(i0, i0 + 1, i0 + 2, i0 + 3)
        }
        b.build()
    }

    /** UV sphere, 1 unit diameter. */
    fun sphere(segments: Int = 24, rings: Int = 16): Mesh = cached("sphere$segments-$rings") {
        val b = MeshBuilder()
        for (y in 0..rings) {
            val v = y.toFloat() / rings
            val phi = v * Math.PI.toFloat()
            for (x in 0..segments) {
                val u = x.toFloat() / segments
                val theta = u * Math.PI.toFloat() * 2f
                val nx = kotlin.math.sin(phi) * kotlin.math.cos(theta)
                val ny = kotlin.math.cos(phi)
                val nz = kotlin.math.sin(phi) * kotlin.math.sin(theta)
                b.normal(nx, ny, nz)
                b.vertex(nx * 0.5f, ny * 0.5f, nz * 0.5f, u, v)
            }
        }
        val stride = segments + 1
        for (y in 0 until rings) {
            for (x in 0 until segments) {
                val i0 = y * stride + x
                val i1 = i0 + 1
                val i2 = i0 + stride
                val i3 = i2 + 1
                b.triangle(i0, i2, i1)
                b.triangle(i1, i2, i3)
            }
        }
        b.build()
    }

    /** Torus in the XY plane, major radius 0.5, minor radius [minor]. */
    fun torus(minor: Float = 0.12f, major: Int = 32, tube: Int = 16): Mesh = cached("torus$minor-$major-$tube") {
        val b = MeshBuilder()
        val R = 0.5f - minor
        for (i in 0..major) {
            val u = i.toFloat() / major * Math.PI.toFloat() * 2f
            val cu = kotlin.math.cos(u)
            val su = kotlin.math.sin(u)
            for (j in 0..tube) {
                val v = j.toFloat() / tube * Math.PI.toFloat() * 2f
                val cv = kotlin.math.cos(v)
                val sv = kotlin.math.sin(v)
                val nx = cu * cv
                val ny = su * cv
                val nz = sv
                b.normal(nx, ny, nz)
                b.vertex((R + minor * cv) * cu, (R + minor * cv) * su, minor * sv,
                    i.toFloat() / major, j.toFloat() / tube)
            }
        }
        val stride = tube + 1
        for (i in 0 until major) {
            for (j in 0 until tube) {
                val i0 = i * stride + j
                val i1 = i0 + 1
                val i2 = i0 + stride
                val i3 = i2 + 1
                b.triangle(i0, i2, i1)
                b.triangle(i1, i2, i3)
            }
        }
        b.build()
    }

    /** Cylinder along +Y, unit height, unit diameter. */
    fun cylinder(segments: Int = 24): Mesh = cached("cyl$segments") {
        val b = MeshBuilder()
        for (i in 0..segments) {
            val u = i.toFloat() / segments
            val a = u * Math.PI.toFloat() * 2f
            val cx = kotlin.math.cos(a)
            val cz = kotlin.math.sin(a)
            b.normal(cx, 0f, cz)
            b.vertex(cx * 0.5f, -0.5f, cz * 0.5f, u, 1f)
            b.vertex(cx * 0.5f, 0.5f, cz * 0.5f, u, 0f)
        }
        for (i in 0 until segments) {
            val i0 = i * 2
            b.triangle(i0, i0 + 1, i0 + 2)
            b.triangle(i0 + 1, i0 + 3, i0 + 2)
        }
        // caps
        val capBase = (segments + 1) * 2
        b.normal(0f, 1f, 0f)
        b.vertex(0f, 0.5f, 0f, 0.5f, 0.5f)
        for (i in 0..segments) {
            val a = i.toFloat() / segments * Math.PI.toFloat() * 2f
            b.vertex(kotlin.math.cos(a) * 0.5f, 0.5f, kotlin.math.sin(a) * 0.5f,
                0.5f + kotlin.math.cos(a) * 0.5f, 0.5f + kotlin.math.sin(a) * 0.5f)
        }
        for (i in 0 until segments) b.triangle(capBase, capBase + 1 + i, capBase + 2 + i)
        val capBase2 = capBase + segments + 2
        b.normal(0f, -1f, 0f)
        b.vertex(0f, -0.5f, 0f, 0.5f, 0.5f)
        for (i in 0..segments) {
            val a = i.toFloat() / segments * Math.PI.toFloat() * 2f
            b.vertex(kotlin.math.cos(a) * 0.5f, -0.5f, kotlin.math.sin(a) * 0.5f,
                0.5f + kotlin.math.cos(a) * 0.5f, 0.5f + kotlin.math.sin(a) * 0.5f)
        }
        for (i in 0 until segments) b.triangle(capBase2, capBase2 + 2 + i, capBase2 + 1 + i)
        b.build()
    }

    /**
     * Curved screen (a section of a cylinder) used by the VR Theater / Video player.
     * [arcDeg] is the horizontal sweep, the mesh is 1 unit wide and [aspect] tall.
     */
    fun curvedScreen(arcDeg: Float = 62f, cols: Int = 20, rows: Int = 8, aspect: Float = 0.5625f): Mesh =
        cached("screen$arcDeg-$cols-$rows-$aspect") {
            val b = MeshBuilder()
            val arc = Math.toRadians(arcDeg.toDouble()).toFloat()
            for (y in 0..rows) {
                val v = y.toFloat() / rows
                val py = (0.5f - v) * aspect
                for (x in 0..cols) {
                    val u = x.toFloat() / cols
                    val a = (u - 0.5f) * arc
                    b.normal(-kotlin.math.sin(a), 0f, -kotlin.math.cos(a))
                    b.vertex(kotlin.math.sin(a), py, kotlin.math.cos(a) - 1f, u, v)
                }
            }
            val stride = cols + 1
            for (y in 0 until rows) {
                for (x in 0 until cols) {
                    val i0 = y * stride + x
                    b.triangle(i0, i0 + 1, i0 + stride)
                    b.triangle(i0 + 1, i0 + stride + 1, i0 + stride)
                }
            }
            b.build()
        }

    /** Flat ground plane, 1x1 in the XZ plane. */
    fun ground(): Mesh = cached("ground") {
        val b = MeshBuilder()
        b.normal(0f, 1f, 0f)
        b.vertex(-0.5f, 0f, -0.5f, 0f, 0f)
        b.vertex(0.5f, 0f, -0.5f, 1f, 0f)
        b.vertex(0.5f, 0f, 0.5f, 1f, 1f)
        b.vertex(-0.5f, 0f, 0.5f, 0f, 1f)
        b.quad(0, 1, 2, 3)
        b.build()
    }

    /** Fullscreen quad in NDC space (no matrices needed). Non indexed. */
    fun ndcQuad(): Mesh = cached("ndc") {
        val b = MeshBuilder()
        b.normal(0f, 0f, 1f)
        b.vertex(-1f, -1f, 0f, 0f, 0f)
        b.vertex(1f, -1f, 0f, 1f, 0f)
        b.vertex(1f, 1f, 0f, 1f, 1f)
        b.vertex(-1f, -1f, 0f, 0f, 0f)
        b.vertex(1f, 1f, 0f, 1f, 1f)
        b.vertex(-1f, 1f, 0f, 0f, 1f)
        b.build()
    }

    fun releaseAll() {
        cache.values.forEach { it.release() }
        cache.clear()
    }
}

/** RGBA texture wrapper. */
class Texture(var width: Int = 0, var height: Int = 0, var id: Int = 0) {

    fun create(w: Int, h: Int, filter: Int = GLES20.GL_LINEAR) {
        width = w
        height = h
        val ids = IntArray(1)
        GLES20.glGenTextures(1, ids, 0)
        id = ids[0]
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, filter)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, filter)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    }

    /** Allocates the texture and uploads [bitmap] in one step. */
    fun createFrom(bitmap: Bitmap, filter: Int = GLES20.GL_LINEAR) {
        if (id != 0) release()
        val ids = IntArray(1)
        GLES20.glGenTextures(1, ids, 0)
        id = ids[0]
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, filter)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, filter)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
        width = bitmap.width
        height = bitmap.height
    }

    fun upload(bitmap: Bitmap) {
        if (id == 0) create(bitmap.width, bitmap.height)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
        GLUtils.texSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, bitmap)
        width = bitmap.width
        height = bitmap.height
    }

    fun uploadBuffer(w: Int, h: Int, buffer: IntBuffer) {
        if (id == 0 || width != w || height != h) {
            if (id != 0) release()
            create(w, h)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
            GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0,
                GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buffer)
        } else {
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
            GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, w, h, GLES20.GL_RGBA,
                GLES20.GL_UNSIGNED_BYTE, buffer)
        }
        width = w
        height = h
    }

    fun bind(unit: Int = 0) {
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
    }

    fun release() {
        if (id != 0) {
            GLES20.glDeleteTextures(1, intArrayOf(id), 0)
            id = 0
        }
    }
}

/** Off screen render target used for dynamic resolution scaling. */
class Framebuffer {
    var width = 0
    var height = 0
    var tex = 0
    private var fbo = 0
    private var depth = 0

    fun resize(w: Int, h: Int) {
        if (w == width && h == height && fbo != 0) return
        release()
        width = w
        height = h
        val ids = IntArray(3)
        GLES20.glGenTextures(1, ids, 0)
        GLES20.glGenFramebuffers(1, ids, 1)
        GLES20.glGenRenderbuffers(1, ids, 2)
        tex = ids[0]
        fbo = ids[1]
        depth = ids[2]

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0,
            GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)

        GLES20.glBindRenderbuffer(GLES20.GL_RENDERBUFFER, depth)
        GLES20.glRenderbufferStorage(GLES20.GL_RENDERBUFFER, GLES20.GL_DEPTH_COMPONENT16, w, h)

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo)
        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0,
            GLES20.GL_TEXTURE_2D, tex, 0)
        GLES20.glFramebufferRenderbuffer(GLES20.GL_FRAMEBUFFER, GLES20.GL_DEPTH_ATTACHMENT,
            GLES20.GL_RENDERBUFFER, depth)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    }

    fun bind() {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo)
    }

    fun release() {
        if (fbo != 0) {
            GLES20.glDeleteFramebuffers(1, intArrayOf(fbo), 0)
            fbo = 0
        }
        if (depth != 0) {
            GLES20.glDeleteRenderbuffers(1, intArrayOf(depth), 0)
            depth = 0
        }
        if (tex != 0) {
            GLES20.glDeleteTextures(1, intArrayOf(tex), 0)
            tex = 0
        }
    }
}

fun floatBufferOf(size: Int): FloatBuffer =
    ByteBuffer.allocateDirect(size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

fun intBufferOf(size: Int): IntBuffer =
    ByteBuffer.allocateDirect(size * 4).order(ByteOrder.nativeOrder()).asIntBuffer()
