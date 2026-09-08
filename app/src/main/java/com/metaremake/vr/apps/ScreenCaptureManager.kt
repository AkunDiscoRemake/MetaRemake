package com.metaremake.vr.apps

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.util.DisplayMetrics
import android.view.Surface
import com.metaremake.vr.util.MLog

/**
 * Captures the current Android app screen (the "Android apps inside VR"
 * feature) using the *only* authorised mechanism Android provides:
 * MediaProjection. The user grants permission explicitly via a system dialog.
 * The captured frame is delivered as a Surface (backed by an OES texture from
 * the renderer) and drawn as a VR surface. No app is modified, hooked or
 * decompiled.
 */
class ScreenCaptureManager(private val context: Context) {

    interface Listener {
        fun onCaptureStateChanged(active: Boolean, error: String?)
    }

    var listener: Listener? = null

    private val projectionManager =
        context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

    @Volatile
    var isCapturing = false
        private set

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null

    fun requestPermission(activity: Activity): Boolean {
        return try {
            val intent = projectionManager.createScreenCaptureIntent()
            activity.startActivityForResult(intent, REQUEST_CODE)
            true
        } catch (t: Throwable) {
            MLog.e("ScreenCapture", "cannot request projection", t)
            listener?.onCaptureStateChanged(false, t.message)
            false
        }
    }

    fun onPermissionResult(resultCode: Int, data: Intent, surface: Surface) {
        if (resultCode != Activity.RESULT_OK) {
            listener?.onCaptureStateChanged(false, "user denied screen capture")
            return
        }
        // Android 14+ requires the foreground service to be running first.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            context.startForegroundService(Intent(context, ScreenCaptureService::class.java))
        }
        try {
            val projection = projectionManager.getMediaProjection(resultCode, data)
            mediaProjection = projection
            val metrics: DisplayMetrics = context.resources.displayMetrics
            val width = metrics.widthPixels
            val height = metrics.heightPixels
            val dpi = metrics.densityDpi
            projection.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    teardown()
                    listener?.onCaptureStateChanged(false, null)
                }
            }, null)

            virtualDisplay = projection.createVirtualDisplay(
                "MetaRemakeVR",
                width, height, dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                surface, null, null
            )
            isCapturing = true
            MLog.d("ScreenCapture", "virtual display created ${width}x${height}")
            listener?.onCaptureStateChanged(true, null)
        } catch (t: Throwable) {
            MLog.e("ScreenCapture", "projection failed", t)
            teardown()
            listener?.onCaptureStateChanged(false, t.message)
        }
    }

    fun stop() {
        teardown()
        listener?.onCaptureStateChanged(false, null)
    }

    private fun teardown() {
        isCapturing = false
        try { virtualDisplay?.release() } catch (_: Throwable) {}
        virtualDisplay = null
        try { mediaProjection?.stop() } catch (_: Throwable) {}
        mediaProjection = null
        try { context.stopService(Intent(context, ScreenCaptureService::class.java)) } catch (_: Throwable) {}
    }

    companion object {
        const val REQUEST_CODE = 4102
    }
}
