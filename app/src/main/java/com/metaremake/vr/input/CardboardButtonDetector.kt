package com.metaremake.vr.input

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import com.metaremake.vr.util.MLog
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Cardboard trigger using the magnetometer (the classic Cardboard v1 button is
 * a magnet that deflects the field). The field magnitude is tracked against a
 * slow-moving baseline; a sustained deviation fires a press/release. Emits the
 * abstract TRIGGER + SELECT events so the rest of the app is device-agnostic.
 */
class CardboardButtonDetector(private val context: Context) : SensorEventListener {

    interface Listener {
        fun onTriggerPressed()
        fun onTriggerReleased()
    }

    var listener: Listener? = null

    @Volatile
    var threshold = 15.0f // µT deviation from baseline

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private var thread: HandlerThread? = null
    private var handler: Handler? = null

    private var baseline = Float.NaN
    private var pressed = false
    private var pressSince = 0L
    private var sampleCount = 0

    val isAvailable: Boolean get() = magnetometer != null

    fun start() {
        val mag = magnetometer ?: return
        thread = HandlerThread("CardboardButtonThread", android.os.Process.THREAD_PRIORITY_BACKGROUND).also { it.start() }
        handler = Handler(thread!!.looper)
        sensorManager.registerListener(this, mag, SensorManager.SENSOR_DELAY_GAME, handler)
        MLog.d("CardboardButton", "magnetometer trigger active, threshold=${threshold}µT")
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        thread?.quitSafely()
        thread = null
        handler = null
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_MAGNETIC_FIELD) return
        val x = event.values[0]; val y = event.values[1]; val z = event.values[2]
        val mag = sqrt(x * x + y * y + z * z)

        if (baseline.isNaN() || sampleCount < 20) {
            baseline = if (baseline.isNaN()) mag else baseline * 0.9f + mag * 0.1f
            sampleCount++
            return
        }
        baseline = baseline * 0.98f + mag * 0.02f

        val deviation = mag - baseline
        val now = System.nanoTime() / 1_000_000

        if (!pressed && abs(deviation) > threshold && now - pressSince > 300) {
            pressed = true
            pressSince = now
            listener?.onTriggerPressed()
        } else if (pressed && abs(deviation) < threshold * 0.4f) {
            pressed = false
            pressSince = now
            listener?.onTriggerReleased()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
