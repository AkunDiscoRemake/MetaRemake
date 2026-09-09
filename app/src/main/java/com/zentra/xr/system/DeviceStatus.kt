package com.zentra.xr.system

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Battery level and clock for the VR status bar. Sampled twice per second. */
class DeviceStatus(private val context: Context) {

    var level = 0
        private set
    var charging = false
        private set
    var temperature = 0f
        private set
    var timeText = "--:--"
        private set
    var dateText = ""
        private set

    private var lastSample = 0L
    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    private val dateFormat = SimpleDateFormat("EEEE, d MMMM", Locale.getDefault())

    fun update(nowMs: Long) {
        if (nowMs - lastSample < 500L) return
        lastSample = nowMs
        val now = Date()
        timeText = timeFormat.format(now)
        dateText = dateFormat.format(now)
        if (nowMs - lastSample == 0L) return
        try {
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            if (intent != null) {
                val rawLevel = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                if (rawLevel >= 0 && scale > 0) level = (rawLevel * 100f / scale).toInt()
                val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == BatteryManager.BATTERY_STATUS_FULL
                val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)
                if (temp > 0) temperature = temp / 10f
            }
        } catch (t: Throwable) {
            // ignore: the status bar simply shows the last known values
        }
    }
}
