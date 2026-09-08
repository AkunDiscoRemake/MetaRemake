package com.metaremake.vr.bridge

import android.webkit.JavascriptInterface
import com.metaremake.vr.runtime.VRRuntime
import com.metaremake.vr.util.MLog
import org.json.JSONArray
import org.json.JSONObject

/**
 * Kotlin <-> JavaScript bridge, injected into the WebView JS runtime as
 * `NativeBridge`. This is the *only* surface the JS side uses to reach Android
 * capabilities; every call returns a JSON string (or a primitive) and never
 * touches UI off the caller's expectations.
 */
class NativeBridge(private val runtime: VRRuntime, private val host: Host) {

    /** Activity-level operations the bridge cannot do by itself. */
    interface Host {
        fun requestCameraPermission(callback: (Boolean) -> Unit)
        fun requestScreenCapture()
        fun openAccessibilitySettings()
        fun vibrate(ms: Long)
    }

    // ------------------------------------------------------------------ meta
    @JavascriptInterface
    fun version(): String = "1.0.0"

    @JavascriptInterface
    fun log(msg: String) {
        MLog.d("JS", msg ?: "")
    }

    // ----------------------------------------------------------------- config
    @JavascriptInterface
    fun getConfig(): String {
        val c = runtime.config
        val o = JSONObject()
        o.put("ipdMeters", c.ipdMeters)
        o.put("fovYDeg", c.fovYDeg)
        o.put("renderScale", c.renderScale)
        o.put("distortionEnabled", c.distortionEnabled)
        o.put("distortionK1", c.distortionK1)
        o.put("distortionK2", c.distortionK2)
        o.put("targetFps", c.targetFps)
        o.put("worldScale", c.worldScale)
        o.put("cameraOpacity", c.cameraOpacity)
        o.put("captureOpacity", c.captureOpacity)
        o.put("showHud", c.showHud)
        o.put("showHandLandmarks", c.showHandLandmarks)
        o.put("cameraEnabled", c.cameraEnabled)
        o.put("near", c.near)
        o.put("far", c.far)
        return o.toString()
    }

    @JavascriptInterface
    fun setConfig(json: String): String {
        return try {
            val o = JSONObject(json)
            val c = runtime.config
            if (o.has("ipdMeters")) c.ipdMeters = o.getDouble("ipdMeters").toFloat()
            if (o.has("fovYDeg")) c.fovYDeg = o.getDouble("fovYDeg").toFloat()
            if (o.has("renderScale")) c.renderScale = o.getDouble("renderScale").toFloat()
            if (o.has("distortionEnabled")) c.distortionEnabled = o.getBoolean("distortionEnabled")
            if (o.has("distortionK1")) c.distortionK1 = o.getDouble("distortionK1").toFloat()
            if (o.has("distortionK2")) c.distortionK2 = o.getDouble("distortionK2").toFloat()
            if (o.has("targetFps")) c.targetFps = o.getInt("targetFps")
            if (o.has("worldScale")) c.worldScale = o.getDouble("worldScale").toFloat()
            if (o.has("cameraOpacity")) c.cameraOpacity = o.getDouble("cameraOpacity").toFloat()
            if (o.has("captureOpacity")) c.captureOpacity = o.getDouble("captureOpacity").toFloat()
            if (o.has("showHud")) c.showHud = o.getBoolean("showHud")
            if (o.has("showHandLandmarks")) c.showHandLandmarks = o.getBoolean("showHandLandmarks")
            if (o.has("near")) c.near = o.getDouble("near").toFloat()
            if (o.has("far")) c.far = o.getDouble("far").toFloat()
            ok()
        } catch (t: Throwable) {
            err(t.message)
        }
    }

    // ------------------------------------------------------------------ scene
    @JavascriptInterface
    fun setScene(json: String) {
        runtime.sceneGraph.removeAll()
        try {
            runtime.sceneGraph.upsertAll(JSONArray(json))
        } catch (t: Throwable) {
            MLog.w("Bridge", "setScene: ${t.message}")
        }
    }

    @JavascriptInterface
    fun upsertNode(json: String) {
        try {
            runtime.sceneGraph.upsert(JSONObject(json))
        } catch (t: Throwable) {
            MLog.w("Bridge", "upsertNode: ${t.message}")
        }
    }

    @JavascriptInterface
    fun removeNodes(json: String) {
        try {
            runtime.sceneGraph.remove(JSONArray(json))
        } catch (t: Throwable) {
            MLog.w("Bridge", "removeNodes: ${t.message}")
        }
    }

    @JavascriptInterface
    fun clearScene() {
        runtime.sceneGraph.removeAll()
    }

    // ------------------------------------------------------------------ input
    @JavascriptInterface
    fun pollInput(max: Int): String {
        val events = runtime.inputHub.poll(max)
        val arr = JSONArray()
        for (e in events) {
            val o = JSONObject()
            o.put("type", e.type.name.lowercase())
            o.put("source", e.source)
            o.put("x", e.x); o.put("y", e.y); o.put("z", e.z)
            o.put("dx", e.deltaX); o.put("dy", e.deltaY)
            o.put("key", e.keyCode)
            if (e.text != null) o.put("text", e.text)
            o.put("ts", e.timestampNs)
            arr.put(o)
        }
        return arr.toString()
    }

    @JavascriptInterface
    fun getPointer(): String {
        val p = runtime.inputHub.pointerSnapshot()
        val o = JSONObject()
        o.put("x", p.x); o.put("y", p.y); o.put("z", p.z)
        o.put("active", p.active); o.put("down", p.down); o.put("source", p.source)
        return o.toString()
    }

    @JavascriptInterface
    fun setCursor(json: String) {
        try {
            val o = JSONObject(json)
            val dir = o.optJSONArray("dir")
            val dx = dir?.optDouble(0, 0.0)?.toFloat() ?: 0f
            val dy = dir?.optDouble(1, 0.0)?.toFloat() ?: 0f
            val dz = dir?.optDouble(2, -1.0)?.toFloat() ?: -1f
            val nx = o.optDouble("x", 0.5).toFloat()
            val ny = o.optDouble("y", 0.5).toFloat()
            val depth = o.optDouble("depth", 2.0).toFloat()
            runtime.cursor.setRay(dx, dy, dz, nx, ny, depth)
        } catch (_: Throwable) {
        }
    }

    // ---------------------------------------------------------------- tracking
    @JavascriptInterface
    fun getHeadPose(): String {
        val s = runtime.headTracker.state
        val o = JSONObject()
        o.put("yaw", s.yaw); o.put("pitch", s.pitch); o.put("roll", s.roll)
        o.put("ready", s.ready)
        o.put("sensor", s.sensorName)
        val q = JSONArray(); val m = JSONArray()
        val mat = FloatArray(16); s.copyMatrixInto(mat)
        for (v in mat) m.put(v.toDouble())
        o.put("matrix", m)
        o.put("quat", q) // quaternion is implicit in matrix; kept for API completeness
        o.put("ts", s.timestampNs)
        return o.toString()
    }

    @JavascriptInterface
    fun recenter() {
        runtime.headTracker.recenter()
    }

    @JavascriptInterface
    fun getHands(): String {
        val frame = runtime.latestHandFrame ?: return "{\"hands\":[],\"ts\":0}"
        val o = JSONObject()
        val hands = JSONArray()
        for (h in frame.hands) {
            val ho = JSONObject()
            ho.put("hand", h.handedness)
            ho.put("handednessScore", h.handednessScore.toDouble())
            ho.put("confidence", h.confidence.toDouble())
            ho.put("pinch", h.pinchDistance.toDouble())
            ho.put("velocity", h.velocity.toDouble())
            val lm = JSONArray()
            for (i in 0 until h.landmarks.size) lm.put(h.landmarks[i].toDouble())
            ho.put("landmarks", lm)
            val tip = JSONArray().put(h.pointerTip[0].toDouble()).put(h.pointerTip[1].toDouble()).put(h.pointerTip[2].toDouble())
            ho.put("pointer", tip)
            hands.put(ho)
        }
        o.put("hands", hands)
        o.put("ts", frame.timestampNs)
        return o.toString()
    }

    @JavascriptInterface
    fun startHandTracking(): Boolean = runtime.startHandTracking()

    @JavascriptInterface
    fun stopHandTracking() {
        runtime.stopHandTracking()
    }

    @JavascriptInterface
    fun setHandLandmarksVisible(on: Boolean) {
        runtime.config.showHandLandmarks = on
    }

    @JavascriptInterface
    fun startCamera() {
        host.requestCameraPermission { granted -> if (granted) runtime.setCameraEnabled(true) }
    }

    @JavascriptInterface
    fun stopCamera() {
        runtime.setCameraEnabled(false)
    }

    // -------------------------------------------------------------------- apps
    @JavascriptInterface
    fun launchApp(pkg: String): String {
        val err = runtime.appController.launchPackage(pkg)
        return if (err == null) ok() else err(err)
    }

    @JavascriptInterface
    fun launchUrl(url: String): String {
        val err = runtime.appController.launchUrl(url)
        return if (err == null) ok() else err(err)
    }

    @JavascriptInterface
    fun launchHome(): String {
        val err = runtime.appController.launchHome()
        return if (err == null) ok() else err(err)
    }

    @JavascriptInterface
    fun getInstalledApps(): String = runtime.appController.installedApps().toString()

    @JavascriptInterface
    fun startScreenCapture() {
        host.requestScreenCapture()
    }

    @JavascriptInterface
    fun stopScreenCapture() {
        runtime.screenCapture.stop()
    }

    @JavascriptInterface
    fun isAccessibilityEnabled(): Boolean = runtime.appController.isAccessibilityEnabled()

    @JavascriptInterface
    fun openAccessibilitySettings() {
        host.openAccessibilitySettings()
    }

    // Authorized interaction with the captured app (accessibility gestures).
    @JavascriptInterface
    fun injectTap(nx: Float, ny: Float) {
        val bridge = com.metaremake.vr.apps.AccessibilityBridge.instance ?: return
        val bounds = bridge.rootBounds()
        if (bounds != null && bounds[2] > bounds[0] && bounds[3] > bounds[1]) {
            val x = bounds[0] + (bounds[2] - bounds[0]) * nx
            val y = bounds[1] + (bounds[3] - bounds[1]) * ny
            bridge.tap(x, y)
        } else {
            bridge.tap(nx * 1080f, ny * 2340f)
        }
    }

    @JavascriptInterface
    fun injectSwipe(nx1: Float, ny1: Float, nx2: Float, ny2: Float) {
        val bridge = com.metaremake.vr.apps.AccessibilityBridge.instance ?: return
        val bounds = bridge.rootBounds()
        val (x1, y1, x2, y2) = if (bounds != null && bounds[2] > bounds[0]) {
            arrayOf(
                bounds[0] + (bounds[2] - bounds[0]) * nx1,
                bounds[1] + (bounds[3] - bounds[1]) * ny1,
                bounds[0] + (bounds[2] - bounds[0]) * nx2,
                bounds[1] + (bounds[3] - bounds[1]) * ny2
            )
        } else {
            arrayOf(nx1 * 1080f, ny1 * 2340f, nx2 * 1080f, ny2 * 2340f)
        }
        bridge.swipe(x1, y1, x2, y2)
    }

    @JavascriptInterface
    fun androidBack() {
        com.metaremake.vr.apps.AccessibilityBridge.instance?.back()
    }

    @JavascriptInterface
    fun androidHome() {
        com.metaremake.vr.apps.AccessibilityBridge.instance?.home()
    }

    // ------------------------------------------------------------------ status
    @JavascriptInterface
    fun getStatus(): String {
        val o = JSONObject()
        o.put("fps", runtime.latestFps.toDouble())
        o.put("frameMs", runtime.latestFrameMs.toDouble())
        o.put("headReady", runtime.headTracker.state.ready)
        o.put("headSensor", runtime.headTracker.state.sensorName)
        o.put("capture", runtime.screenCapture.isCapturing)
        o.put("cameraRunning", runtime.cameraManager.isRunning)
        o.put("handTracking", runtime.handTrackingActive)
        o.put("handModelError", runtime.handModelError ?: JSONObject.NULL)
        o.put("accessibility", runtime.appController.isAccessibilityEnabled())
        o.put("nodes", runtime.sceneGraph.count())
        o.put("button", runtime.cardboardButton.isAvailable)
        return o.toString()
    }

    @JavascriptInterface
    fun setHud(text: String) {
        runtime.config.hudText = text ?: ""
    }

    @JavascriptInterface
    fun vibrate(ms: Int) {
        host.vibrate(ms.toLong())
    }

    // ----------------------------------------------------------------- helpers
    private fun ok(): String = """{"ok":true}"""
    private fun err(msg: String?): String {
        val o = JSONObject()
        o.put("ok", false)
        o.put("error", msg ?: "unknown")
        return o.toString()
    }
}
