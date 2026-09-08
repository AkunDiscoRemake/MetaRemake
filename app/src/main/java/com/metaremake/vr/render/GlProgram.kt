package com.metaremake.vr.render

import android.opengl.GLES20

/** Minimal GLSL program helper with uniform lookup. */
class GlProgram(private val vertexSrc: String, private val fragmentSrc: String) {

    var handle = 0
        private set

    private val uniformCache = HashMap<String, Int>()

    fun build() {
        val vs = compile(GLES20.GL_VERTEX_SHADER, vertexSrc)
        val fs = compile(GLES20.GL_FRAGMENT_SHADER, fragmentSrc)
        handle = GLES20.glCreateProgram()
        GLES20.glAttachShader(handle, vs)
        GLES20.glAttachShader(handle, fs)
        GLES20.glLinkProgram(handle)
        val status = IntArray(1)
        GLES20.glGetProgramiv(handle, GLES20.GL_LINK_STATUS, status, 0)
        if (status[0] == 0) {
            val log = GLES20.glGetProgramInfoLog(handle)
            GLES20.glDeleteProgram(handle)
            handle = 0
            throw RuntimeException("program link failed: $log")
        }
        GLES20.glDeleteShader(vs)
        GLES20.glDeleteShader(fs)
    }

    fun use() = GLES20.glUseProgram(handle)

    fun attrib(name: String): Int = GLES20.glGetAttribLocation(handle, name)

    fun uniform(name: String): Int =
        uniformCache.getOrPut(name) { GLES20.glGetUniformLocation(handle, name) }

    private fun compile(type: Int, src: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, src)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            val log = GLES20.glGetShaderInfoLog(shader)
            GLES20.glDeleteShader(shader)
            throw RuntimeException("shader compile failed: $log")
        }
        return shader
    }
}
