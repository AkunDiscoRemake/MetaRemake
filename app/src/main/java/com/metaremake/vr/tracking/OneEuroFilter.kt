package com.metaremake.vr.tracking

import kotlin.math.abs

/**
 * One Euro filter (Casiez et al., 2012).
 *
 * A low-latency adaptive low-pass filter: a small cutoff during slow motion
 * (aggressive smoothing) that widens with speed, keeping latency roughly
 * constant instead of the fixed lag of a plain exponential filter.
 */
class OneEuroFilter(
    private val minCutoff: Float = 1.0f,
    private val beta: Float = 0.0f,
    private val dCutoff: Float = 1.0f
) {
    private var xPrev = Float.NaN
    private var dxPrev = 0f
    private var tPrevNs = 0L

    /** Returns the filtered value for sample [x] captured at monotonic [tNs]. */
    fun filter(x: Float, tNs: Long): Float {
        if (xPrev.isNaN()) {
            xPrev = x
            tPrevNs = tNs
            return x
        }

        val dt = (tNs - tPrevNs) / 1e9f
        if (dt <= 0f) return xPrev

        val dx = (x - xPrev) / dt
        val edx = lowPass(dx, dxPrev, alpha(dCutoff, dt))
        val cutoff = minCutoff + beta * abs(edx)
        val xHat = lowPass(x, xPrev, alpha(cutoff, dt))

        xPrev = xHat
        dxPrev = edx
        tPrevNs = tNs
        return xHat
    }

    fun reset() {
        xPrev = Float.NaN
        dxPrev = 0f
        tPrevNs = 0L
    }

    private fun alpha(cutoff: Float, dt: Float): Float {
        val tau = 1f / (2f * Math.PI.toFloat() * cutoff)
        return 1f / (1f + tau / dt)
    }

    private fun lowPass(x: Float, prev: Float, a: Float): Float = a * x + (1f - a) * prev

    companion object {
        /** Filter tuned for quaternion components of head orientation. */
        fun headQuat() = OneEuroFilter(minCutoff = 3.0f, beta = 0.4f, dCutoff = 1.0f)

        /** Filter tuned for hand landmark world coordinates. */
        fun handLandmark() = OneEuroFilter(minCutoff = 1.2f, beta = 0.15f, dCutoff = 1.0f)
    }
}
