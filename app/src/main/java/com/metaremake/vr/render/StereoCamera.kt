package com.metaremake.vr.render

import android.opengl.Matrix
import kotlin.math.tan

/**
 * Computes the independent view + projection matrix pair for each eye, giving
 * true stereoscopic side-by-side rendering (parallel-axis off-axis frusta —
 * no toe-in, as required for Cardboard).
 *
 *   view  = (head rotation)^-1 then translate by ∓ipd/2 on the interocular axis
 *   proj  = asymmetric frustum shifted by the eye offset
 *
 * The head rotation is passed as a column-major matrix mapping head space into
 * world space (from [com.metaremake.vr.tracking.HeadTracker]).
 */
class StereoCamera {

    private val tmp = FloatArray(16)
    private val eyeTranslate = FloatArray(16)

    val leftView = FloatArray(16)
    val rightView = FloatArray(16)
    val leftProj = FloatArray(16)
    val rightProj = FloatArray(16)

    /**
     * @param headRotation head→world rotation (column-major). Neutral = identity
     *                     with -Z forward, +X right, +Y up.
     */
    fun update(
        headRotation: FloatArray,
        ipd: Float,
        fovYDeg: Float,
        aspect: Float,
        near: Float,
        far: Float
    ) {
        computeView(headRotation, -ipd / 2f, leftView)
        computeView(headRotation, +ipd / 2f, rightView)
        computeProjection(-ipd / 2f, fovYDeg, aspect, near, far, leftProj)
        computeProjection(+ipd / 2f, fovYDeg, aspect, near, far, rightProj)
    }

    /** view = transpose(head) * translate(-eyeOffset). */
    private fun computeView(headRotation: FloatArray, eyeOffsetX: Float, out: FloatArray) {
        // Inverse of a rotation matrix is its transpose.
        Matrix.transposeM(tmp, 0, headRotation, 0)
        Matrix.setIdentityM(eyeTranslate, 0)
        Matrix.translateM(eyeTranslate, 0, -eyeOffsetX, 0f, 0f)
        Matrix.multiplyMM(out, 0, tmp, 0, eyeTranslate, 0)
    }

    /** Asymmetric off-axis projection shifted by the eye offset. */
    private fun computeProjection(
        eyeOffsetX: Float,
        fovYDeg: Float,
        aspect: Float,
        near: Float,
        far: Float,
        out: FloatArray
    ) {
        val halfH = near * tan(Math.toRadians(fovYDeg.toDouble()) / 2.0).toFloat()
        val halfW = halfH * aspect
        Matrix.frustumM(out, 0, -halfW + eyeOffsetX, halfW + eyeOffsetX, -halfH, halfH, near, far)
    }
}
