package com.metaremake.vr.apps

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.metaremake.vr.R

/**
 * Foreground service required to hold a MediaProjection (mandatory on Android
 * 14+). The projection itself is created by [ScreenCaptureManager]; this
 * service exists to satisfy the platform requirement and show the user a
 * clear, honest notification that the screen is being captured.
 */
class ScreenCaptureService : Service() {

    companion object {
        const val CHANNEL_ID = "metaremake_capture"
        const val NOTIFICATION_ID = 1
    }

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            val channel = NotificationChannel(CHANNEL_ID, getString(R.string.screen_capture_channel_name), NotificationManager.IMPORTANCE_LOW)
            manager.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.screen_capture_notification_title))
            .setContentText(getString(R.string.screen_capture_notification_text))
            .setSmallIcon(R.drawable.ic_vr)
            .setOngoing(true)
            .build()
        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null
}
