package com.zentra.xr.xr

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.opengl.Matrix
import android.view.Surface
import android.view.WindowManager
import kotlin.math.atan2
import kotlin.math.sqrt

/**
 * 3DoF head tracking.
 *
 * Uses the fused rotation vector (gyroscope + accelerometer + magnetometer) when
 * available, the game rotation vector (gyroscope + accelerometer, no magnetometer) as a
 * second choice and pure gyroscope integration as a last resort.
 *
 * This is strictly orientation tracking: no positional tracking, no SLAM, no room mapping.
 */
class HeadTracker(private val context: Context) : SensorEventListener {

    enum class Source { NONE, ROTATION_VECTOR, GAME_ROTATION_VECTOR, GYROSCOPE }

    var source = Source.NONE
        private set

    val hasGyroscope: Boolean
    val hasAccelerometer: Boolean
    val hasMagnetometer: Boolean

    /** Ready to use world matrix of the head (pure rotation). */
    val headWorld = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }

    var displayRotation: Int = Surface.ROTATION_0
        private set

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private var sensor: Sensor? = null

    private val rotationMatrix = FloatArray(16)
    private val deviceMatrix = FloatArray(16)
    private val screenMatrix = FloatArray(16)
    private val worldMatrix = FloatArray(16)
    private val calibMatrix = FloatArray(16)
    private val tmp = FloatArray(16)

    // gyroscope integration fallback
    private val gyroRotation = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    private val deltaRotation = FloatArray(16)
    private var lastGyroTime = 0L

    private var hasSample = false

    /** Alignment from the Android world frame (X east, Y north, Z up) to the GL frame. */
    private val enuToGl = floatArrayOf(
        1f, 0f, 0f, 0f,
        0f, 0f, -1f, 0f,
        0f, 1f, 0f, 0f,
        0f, 0f, 0f, 1f
    )

    /** Device -> screen alignment matrices, indexed by display rotation. */
    private val screenAlign = arrayOf(
        floatArrayOf(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f),           // 0
        floatArrayOf(0f, -1f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f),          // 90
        floatArrayOf(-1f, 0f, 0f, 0f, 0f, -1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f),         // 180
        floatArrayOf(0f, 1f, 0f, 0f, -1f, 0f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)           // 270
    )

    init {
        Matrix.setIdentityM(calibMatrix, 0)
        val available = sensorManager.getSensorList(Sensor.TYPE_ALL)
        hasGyroscope = available.any { it.type == Sensor.TYPE_GYROSCOPE }
        hasAccelerometer = available.any { it.type == Sensor.TYPE_ACCELEROMETER }
        hasMagnetometer = available.any { it.type == Sensor.TYPE_MAGNETIC_FIELD }
    }

    fun start(): Boolean {
        refreshDisplayRotation()
        val candidates = listOf(
            Sensor.TYPE_ROTATION_VECTOR to Source.ROTATION_VECTOR,
            Sensor.TYPE_GAME_ROTATION_VECTOR to Source.GAME_ROTATION_VECTOR,
            Sensor.TYPE_GYROSCOPE to Source.GYROSCOPE
        )
        for ((type, src) in candidates) {
            val s = sensorManager.getDefaultSensor(type)
            if (s != null) {
                sensor = s
                source = src
                sensorManager.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME)
                return true
            }
        }
        source = Source.NONE
        return false
    }

    fun stop() {
        sensor?.let { sensorManager.unregisterListener(this, it) }
        sensor = null
    }

    fun refreshDisplayRotation() {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        displayRotation = wm.defaultDisplay.rotation
    }

    /** Re-aligns "forward" with the direction the user is currently looking at (yaw only). */
    fun recenter() {
        val forwardX = -headWorld[8]
        val forwardZ = -headWorld[10]
        val yaw = atan2(forwardX.toDouble(), -forwardZ.toDouble())
        val deg = Math.toDegrees(yaw).toFloat()
        Matrix.setIdentityM(calibMatrix, 0)
        Matrix.rotateM(calibMatrix, 0, -deg, 0f, 1f, 0f)
        applyCalibration()
    }

    fun resetCalibration() {
        Matrix.setIdentityM(calibMatrix, 0)
    }

    private fun applyCalibration() {
        Matrix.multiplyMM(headWorld, 0, calibMatrix, 0, worldMatrix, 0)
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GAME_ROTATION_VECTOR -> {
                SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                publish()
            }
            Sensor.TYPE_GYROSCOPE -> {
                if (lastGyroTime == 0L) {
                    lastGyroTime = event.timestamp
                    return
                }
                val dt = (event.timestamp - lastGyroTime) * 1e-9f
                lastGyroTime = event.timestamp
                val speed = sqrt(
                    event.values[0] * event.values[0] +
                        event.values[1] * event.values[1] +
                        event.values[2] * event.values[2]
                )
                if (dt > 0.0001f && speed > 1e-4f) {
                    Matrix.setRotateM(deltaRotation, 0,
                        Math.toDegrees((speed * dt).toDouble()).toFloat(),
                        event.values[0] / speed, event.values[1] / speed, event.values[2] / speed)
                    Matrix.multiplyMM(tmp, 0, gyroRotation, 0, deltaRotation, 0)
                    System.arraycopy(tmp, 0, gyroRotation, 0, 16)
                }
                System.arraycopy(gyroRotation, 0, rotationMatrix, 0, 16)
                publish()
            }
        }
    }

    private fun publish() {
        val align = screenAlign[displayRotation and 3]
        Matrix.multiplyMM(deviceMatrix, 0, rotationMatrix, 0, align, 0)
        Matrix.multiplyMM(screenMatrix, 0, enuToGl, 0, deviceMatrix, 0)
        System.arraycopy(screenMatrix, 0, worldMatrix, 0, 16)
        applyCalibration()
        hasSample = true
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
