package com.metaremake.vr.overlay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.View
import android.view.Window
import android.view.WindowManager
import com.metaremake.vr.util.MLog

/**
 * Window / overlay management for the Cardboard host.
 *
 * Handles the immersive window flags (fullscreen + sticky immersive), keeps the
 * screen on, hides the cutout, and exposes the official overlay-permission
 * check/request (SYSTEM_ALERT_WINDOW) for devices/features that want to host an
 * optional control overlay above other apps. Everything here uses only public
 * Android APIs.
 */
class OverlayManager(private val activity: Activity) {

    /** Apply fullscreen + immersive window flags (Cardboard wants no chrome). */
    fun applyImmersive(window: Window) {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
    }

    /** Whether the app may draw overlays over other apps. */
    fun canDrawOverlays(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(activity)

    /** Open the system overlay-permission screen (only if not yet granted). */
    fun requestOverlayPermission(): Boolean {
        if (canDrawOverlays()) return true
        return try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${activity.packageName}")
            )
            activity.startActivity(intent)
            false
        } catch (t: Throwable) {
            MLog.w("Overlay", "cannot open overlay settings: ${t.message}")
            false
        }
    }

    /** Keep the screen on (burn-in friendly for a headset). */
    fun keepScreenOn(on: Boolean) {
        if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
}
