package com.zentra.xr.system

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager

/**
 * Thermal Optimization.
 *
 * Smartphones get hot in VR, so Zentra XR watches the device temperature and the frame
 * budget and lets the performance manager degrade gracefully:
 * stability > latency > temperature > battery > visual quality.
 */
class ThermalManager(private val context: Context) {

    enum class Level(val index: Int) { NORMAL(0), WARM(1), HOT(2), CRITICAL(3) }

    var level = Level.NORMAL
        private set

    var batteryTempC = 0f
        private set

    var systemStatus = 0
        private set

    var sustainedOverload = false

    private val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private var lastSampleMs = 0L

    fun update(nowMs: Long) {
        if (nowMs - lastSampleMs < 2000L) return
        lastSampleMs = nowMs

        batteryTempC = readBatteryTemp()
        systemStatus = readSystemStatus()

        var score = 0
        if (batteryTempC >= 38f) score++
        if (batteryTempC >= 41f) score++
        if (batteryTempC >= 44f) score++
        if (systemStatus >= 3) score += 1      // THERMAL_STATUS_SEVERE
        if (systemStatus >= 4) score += 2      // THERMAL_STATUS_CRITICAL
        if (sustainedOverload) score += 1

        level = when {
            score >= 5 -> Level.CRITICAL
            score >= 3 -> Level.HOT
            score >= 1 -> Level.WARM
            else -> Level.NORMAL
        }
    }

    private fun readBatteryTemp(): Float {
        return try {
            val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            context.registerReceiver(null, ifilter)?.let { intent ->
                val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)
                if (temp > 0) temp / 10f else 0f
            } ?: 0f
        } catch (t: Throwable) {
            0f
        }
    }

    @Suppress("DEPRECATION")
    private fun readSystemStatus(): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
        return try {
            val method = power.javaClass.getMethod("getCurrentThermalStatus")
            method.invoke(power) as? Int ?: 0
        } catch (t: Throwable) {
            0
        }
    }
}
