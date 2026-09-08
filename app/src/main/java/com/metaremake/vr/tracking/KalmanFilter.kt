package com.metaremake.vr.tracking

/**
 * Minimal 1-D constant-velocity Kalman filter used to stabilise hand-landmark
 * coordinates on top of the One Euro filter. Model:
 *
 *     state = [position, velocity]
 *     F = [[1, dt],[0, 1]]   H = [1, 0]
 *
 * Tune [processNoise] (model uncertainty) and [measurementNoise] (sensor
 * uncertainty) to trade smoothness against lag.
 */
class KalmanFilter1D(
    processNoise: Double = 1.0,
    measurementNoise: Double = 4.0
) {
    private val q = processNoise
    private val r = measurementNoise
    private var x = 0.0   // position
    private var v = 0.0   // velocity
    private var p00 = 1.0
    private var p01 = 0.0
    private var p10 = 0.0
    private var p11 = 1.0
    private var lastT = -1L
    private var init = false

    fun filter(z: Double, tNs: Long): Double {
        if (!init) {
            x = z; v = 0.0; lastT = tNs; init = true
            return z
        }
        val dt = ((tNs - lastT) / 1e9).coerceIn(1e-4, 0.1)
        lastT = tNs

        // Predict.
        x = x + v * dt
        p00 = p00 + dt * (p10 + p01) + dt * dt * p11 + q
        p01 = p01 + dt * p11
        p10 = p10 + dt * p11
        p11 = p11 + q

        // Update.
        val s = p00 + r
        val k0 = p00 / s
        val k1 = p10 / s
        val y = z - x
        x = x + k0 * y
        v = v + k1 * y
        val p00n = (1 - k0) * p00
        val p01n = (1 - k0) * p01
        val p10n = p10 - k1 * p00
        val p11n = p11 - k1 * p01
        p00 = p00n; p01 = p01n; p10 = p10n; p11 = p11n

        return x
    }

    fun reset() {
        x = 0.0; v = 0.0; p00 = 1.0; p01 = 0.0; p10 = 0.0; p11 = 1.0
        lastT = -1L; init = false
    }
}
