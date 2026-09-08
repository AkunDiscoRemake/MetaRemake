package com.metaremake.vr.render

import android.graphics.SurfaceTexture

/**
 * An OES external texture paired with its [SurfaceTexture]. Used to bring a
 * MediaProjection virtual display (the screen of another Android app) into the
 * VR scene as a texture.
 */
class ExternalSurface {
    @Volatile var textureId = 0
    @Volatile var surfaceTexture: SurfaceTexture? = null

    /** Call on the GL thread each frame; returns true if a new frame arrived. */
    fun updateTexImage(): Boolean {
        val st = surfaceTexture ?: return false
        return try {
            st.updateTexImage()
            true
        } catch (t: Throwable) {
            false
        }
    }

    fun release() {
        surfaceTexture?.release()
        surfaceTexture = null
    }
}
