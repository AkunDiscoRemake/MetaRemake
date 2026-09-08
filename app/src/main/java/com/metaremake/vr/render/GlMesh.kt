package com.metaremake.vr.render

import android.opengl.GLES20
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.cos
import kotlin.math.sin

/**
 * Interleaved vertex buffer: position (3) + normal (3) + uv (2), 32 bytes each.
 * Attribute locations: 0 = position, 1 = normal, 2 = uv.
 */
class GlMesh {
    companion object {
        const val STRIDE_FLOATS = 8
        const val STRIDE_BYTES = STRIDE_FLOATS * 4
        const val ATTR_POSITION = 0
        const val ATTR_NORMAL = 1
        const val ATTR_UV = 2

        fun quad(width: Float, height: Float): FloatArray {
            val hw = width / 2f
            val hh = height / 2f
            return floatArrayOf(
                // positions          normals        uv
                -hw, -hh, 0f,  0f, 0f, 1f,  0f, 0f,
                 hw, -hh, 0f,  0f, 0f, 1f,  1f, 0f,
                 hw,  hh, 0f,  0f, 0f, 1f,  1f, 1f,
                -hw, -hh, 0f,  0f, 0f, 1f,  0f, 0f,
                 hw,  hh, 0f,  0f, 0f, 1f,  1f, 1f,
                -hw,  hh, 0f,  0f, 0f, 1f,  0f, 1f
            )
        }

        /** Unit quad centred on origin (scaled per-node). */
        fun unitQuad(): FloatArray = quad(1f, 1f)

        fun box(width: Float, height: Float, depth: Float): FloatArray {
            val hw = width / 2f; val hh = height / 2f; val hd = depth / 2f
            val out = ArrayList<Float>()
            // six faces, each two triangles. (pos3, nrm3, uv2)
            fun face(
                ax: Float, ay: Float, az: Float,
                bx: Float, by: Float, bz: Float,
                cx: Float, cy: Float, cz: Float,
                dx: Float, dy: Float, dz: Float,
                nx: Float, ny: Float, nz: Float
            ) {
                val quad = floatArrayOf(
                    ax, ay, az, nx, ny, nz, 0f, 0f,
                    bx, by, bz, nx, ny, nz, 1f, 0f,
                    cx, cy, cz, nx, ny, nz, 1f, 1f,
                    ax, ay, az, nx, ny, nz, 0f, 0f,
                    cx, cy, cz, nx, ny, nz, 1f, 1f,
                    dx, dy, dz, nx, ny, nz, 0f, 1f
                )
                out.addAll(quad.toList())
            }
            face(-hw, -hh,  hd,  hw, -hh,  hd,  hw,  hh,  hd, -hw,  hh,  hd,  0f, 0f, 1f)  // front
            face( hw, -hh, -hd, -hw, -hh, -hd, -hw,  hh, -hd,  hw,  hh, -hd,  0f, 0f, -1f) // back
            face(-hw,  hh,  hd,  hw,  hh,  hd,  hw,  hh, -hd, -hw,  hh, -hd,  0f, 1f, 0f)  // top
            face(-hw, -hh, -hd,  hw, -hh, -hd,  hw, -hh,  hd, -hw, -hh,  hd,  0f, -1f, 0f) // bottom
            face(-hw, -hh, -hd, -hw, -hh,  hd, -hw,  hh,  hd, -hw,  hh, -hd, -1f, 0f, 0f)  // left
            face( hw, -hh,  hd,  hw, -hh, -hd,  hw,  hh, -hd,  hw,  hh,  hd,  1f, 0f, 0f)  // right
            return out.toFloatArray()
        }

        fun sphere(radius: Float, latBands: Int, lonBands: Int): FloatArray {
            val out = ArrayList<Float>()
            fun vertex(lat: Int, lon: Int): FloatArray {
                val theta = lat * Math.PI / latBands
                val phi = lon * 2.0 * Math.PI / lonBands
                val x = radius * (sin(theta) * cos(phi)).toFloat()
                val y = radius * cos(theta).toFloat()
                val z = radius * (sin(theta) * sin(phi)).toFloat()
                val nx = (sin(theta) * cos(phi)).toFloat()
                val ny = cos(theta).toFloat()
                val nz = (sin(theta) * sin(phi)).toFloat()
                val u = 1f - lon.toFloat() / lonBands
                val v = 1f - lat.toFloat() / latBands
                return floatArrayOf(x, y, z, nx, ny, nz, u, v)
            }
            fun push(v: FloatArray) { out.addAll(v.toList()) }
            for (lat in 0 until latBands) {
                for (lon in 0 until lonBands) {
                    val v00 = vertex(lat, lon)
                    val v01 = vertex(lat + 1, lon)
                    val v11 = vertex(lat + 1, lon + 1)
                    val v10 = vertex(lat, lon + 1)
                    push(v00); push(v01); push(v11)
                    push(v00); push(v11); push(v10)
                }
            }
            return out.toFloatArray()
        }
    }

    var vertexCount = 0
        private set
    private var vbo = 0
    private var vboBuffer: FloatBuffer? = null

    fun upload(vertices: FloatArray) {
        vertexCount = vertices.size / STRIDE_FLOATS
        val bb = ByteBuffer.allocateDirect(vertices.size * 4).order(ByteOrder.nativeOrder())
        vboBuffer = bb.asFloatBuffer().apply {
            put(vertices)
            position(0)
        }
        if (vbo == 0) {
            val ids = IntArray(1)
            GLES20.glGenBuffers(1, ids, 0)
            vbo = ids[0]
        }
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo)
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, vertices.size * 4, vboBuffer, GLES20.GL_STATIC_DRAW)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
    }

    fun draw() {
        if (vertexCount == 0 || vbo == 0) return
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo)
        GLES20.glEnableVertexAttribArray(ATTR_POSITION)
        GLES20.glVertexAttribPointer(ATTR_POSITION, 3, GLES20.GL_FLOAT, false, STRIDE_BYTES, 0)
        GLES20.glEnableVertexAttribArray(ATTR_NORMAL)
        GLES20.glVertexAttribPointer(ATTR_NORMAL, 3, GLES20.GL_FLOAT, false, STRIDE_BYTES, 12)
        GLES20.glEnableVertexAttribArray(ATTR_UV)
        GLES20.glVertexAttribPointer(ATTR_UV, 2, GLES20.GL_FLOAT, false, STRIDE_BYTES, 24)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, vertexCount)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
        GLES20.glDisableVertexAttribArray(ATTR_POSITION)
        GLES20.glDisableVertexAttribArray(ATTR_NORMAL)
        GLES20.glDisableVertexAttribArray(ATTR_UV)
    }

    fun dispose() {
        if (vbo != 0) {
            GLES20.glDeleteBuffers(1, intArrayOf(vbo), 0)
            vbo = 0
        }
        vertexCount = 0
        vboBuffer = null
    }
}
