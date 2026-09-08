package com.metaremake.vr.render

/**
 * VR cursor. The JS interaction layer computes the ray (from hand tracking /
 * controller / gaze) and publishes the head-space direction here; the native
 * renderer draws the reticle head-locked along that ray. Falls back to the
 * centre gaze when no input source is active.
 */
class CursorState {
    @Volatile var active = false

    /** Normalized mono-canvas position (0..1) for reference/HUD drawing. */
    @Volatile var x = 0.5f
    @Volatile var y = 0.5f

    /** Head-space unit ray direction. */
    @Volatile var dirX = 0f
    @Volatile var dirY = 0f
    @Volatile var dirZ = -1f

    /** Distance of the reticle from the head (meters). */
    @Volatile var depth = 2.0f

    @Volatile var scale = 1.0f

    fun setRay(dx: Float, dy: Float, dz: Float, nx: Float, ny: Float, depth: Float) {
        dirX = dx; dirY = dy; dirZ = dz
        x = nx; y = ny
        this.depth = depth
        active = true
    }
}
