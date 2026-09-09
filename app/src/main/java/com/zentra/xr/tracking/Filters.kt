package com.zentra.xr.tracking

import com.zentra.xr.core.Vec3
import kotlin.math.PI
import kotlin.math.abs

/**
 * One Euro Filter (Casiez et al.).
 * Adaptive low pass: aggressive when the signal is slow, almost transparent when it moves
 * fast, so jitter disappears without adding perceptible latency to the fingertip.
 */
class OneEuroFilter(
    private var minCutoff: Float = 1.5f,
    private var beta: Float = 0.02f,
    private var dCutoff: Float = 1f
) {
    private var xPrev = 0f
    private var dxPrev = 0f
    private var initialized = false

    fun configure(minCutoff: Float, beta: Float, dCutoff: Float) {
        this.minCutoff = minCutoff
        this.beta = beta
        this.dCutoff = dCutoff
    }

    private fun alpha(cutoff: Float, dt: Float): Float {
        val tau = 1f / (2f * PI.toFloat() * cutoff)
        return 1f / (1f + tau / dt)
    }

    fun filter(x: Float, dt: Float): Float {
        if (!initialized) {
            initialized = true
            xPrev = x
            dxPrev = 0f
            return x
        }
        val step = if (dt > 1e-4f) dt else 1f / 60f
        val dx = (x - xPrev) / step
        val aD = alpha(dCutoff, step)
        val dxHat = dxPrev + aD * (dx - dxPrev)
        val cutoff = minCutoff + beta * abs(dxHat)
        val a = alpha(cutoff, step)
        val xHat = xPrev + a * (x - xPrev)
        xPrev = xHat
        dxPrev = dxHat
        return xHat
    }

    fun reset() {
        initialized = false
        dxPrev = 0f
    }
}

/**
 * Constant velocity Kalman filter (scalar).
 * Removes the residual noise left by the One Euro stage while keeping responsiveness.
 */
class KalmanFilter(private var q: Float = 0.02f, private var r: Float = 0.35f) {

    private var x = 0f
    private var velocity = 0f
    private var p = 1f
    private var k = 0f
    private var initialized = false

    fun configure(processNoise: Float, measurementNoise: Float) {
        q = processNoise
        r = measurementNoise
    }

    fun filter(z: Float): Float {
        if (!initialized) {
            initialized = true
            x = z
            p = 1f
            velocity = 0f
            return z
        }
        // predict
        x += velocity
        p += q
        // update
        k = p / (p + r)
        val innovation = z - x
        x += k * innovation
        velocity += 0.20f * innovation * k
        p *= (1f - k)
        return x
    }

    fun reset() {
        initialized = false
        p = 1f
        velocity = 0f
    }
}

/** One Euro -> Kalman chain for a single axis. Both stages can be disabled. */
class AxisFilter {
    private val oneEuro = OneEuroFilter()
    private val kalman = KalmanFilter()

    var oneEuroEnabled = true
    var kalmanEnabled = true

    fun configure(minCutoff: Float, beta: Float, dCutoff: Float, q: Float, r: Float) {
        oneEuro.configure(minCutoff, beta, dCutoff)
        kalman.configure(q, r)
    }

    fun filter(value: Float, dt: Float): Float {
        var v = value
        if (oneEuroEnabled) v = oneEuro.filter(v, dt)
        if (kalmanEnabled) v = kalman.filter(v)
        return v
    }

    fun reset() {
        oneEuro.reset()
        kalman.reset()
    }
}

/** Filtered 3D point (the fingertip). Applies both filters per axis. */
class Vec3Filter {
    private val fx = AxisFilter()
    private val fy = AxisFilter()
    private val fz = AxisFilter()
    private var initialized = false

    fun configure(minCutoff: Float, beta: Float, dCutoff: Float, q: Float, r: Float) {
        fx.configure(minCutoff, beta, dCutoff, q, r)
        fy.configure(minCutoff, beta, dCutoff, q, r)
        fz.configure(minCutoff, beta, dCutoff, q, r)
    }

    fun filter(p: Vec3, dt: Float) {
        if (!initialized) {
            initialized = true
            fx.reset(); fy.reset(); fz.reset()
        }
        p.set(fx.filter(p.x, dt), fy.filter(p.y, dt), fz.filter(p.z, dt))
    }

    fun reset() {
        initialized = false
        fx.reset(); fy.reset(); fz.reset()
    }
}
