package com.metaremake.vr.apps

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent
import com.metaremake.vr.util.MLog

/**
 * Accessibility service used to interact with the Android apps presented as VR
 * surfaces. It performs only standard, user-authorized accessibility actions
 * (tap / scroll via gestures, global BACK/HOME) and reads window metadata. It
 * never modifies, injects code into, or breaks the sandbox of third-party apps.
 */
class AccessibilityBridge : AccessibilityService() {

    companion object {
        @Volatile
        var instance: AccessibilityBridge? = null
            private set
    }

    override fun onServiceConnected() {
        instance = this
        MLog.d("AccessibilityBridge", "service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    /** Inject a tap at absolute screen pixel coordinates (authorized gesture). */
    fun tap(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, 60)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    /** Inject a swipe (used for scroll / drag inside the captured app). */
    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long = 200) {
        val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    fun back() = performGlobalAction(GLOBAL_ACTION_BACK)

    fun home() = performGlobalAction(GLOBAL_ACTION_HOME)

    fun recents() = performGlobalAction(GLOBAL_ACTION_RECENTS)

    /** Current root window bounds (the captured app's screen), or null. */
    fun rootBounds(): IntArray? {
        val root = rootInActiveWindow ?: return null
        val r = android.graphics.Rect()
        root.getBoundsInScreen(r)
        return intArrayOf(r.left, r.top, r.right, r.bottom)
    }
}
