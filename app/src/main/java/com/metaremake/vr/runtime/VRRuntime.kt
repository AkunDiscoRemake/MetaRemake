package com.metaremake.vr.runtime

import android.content.Context
import com.metaremake.vr.apps.AppLaunchController
import com.metaremake.vr.apps.ScreenCaptureManager
import com.metaremake.vr.camera.CameraManager
import com.metaremake.vr.input.CardboardButtonDetector
import com.metaremake.vr.input.HandInputMapper
import com.metaremake.vr.input.InputEvent
import com.metaremake.vr.input.InputEventType
import com.metaremake.vr.input.InputHub
import com.metaremake.vr.render.CursorState
import com.metaremake.vr.render.ExternalSurface
import com.metaremake.vr.render.SceneGraph
import com.metaremake.vr.render.VRConfig
import com.metaremake.vr.render.VRRenderer
import com.metaremake.vr.tracking.HandTrackingEngine
import com.metaremake.vr.tracking.HeadTracker

/**
 * Owns and wires every runtime component. The separation of concerns is:
 *
 *   Camera Thread  -> CameraManager
 *   Tracking Thread-> HeadTracker / HandTrackingEngine
 *   JS Logic       -> assets/js (WebView) — interaction, UI, state, scene
 *   VR Render Thread-> VRRenderer (GLSurfaceView)
 *   Android Input  -> InputHub (touch / keys / button / accessibility)
 *
 * [MainActivity] stays thin: it only handles the Activity lifecycle, window
 * focus, permissions and the WebView bridge injection.
 */
class VRRuntime(private val context: Context) {

    val config = VRConfig()
    val sceneGraph = SceneGraph()
    val inputHub = InputHub()
    val cursor = CursorState()
    val headTracker = HeadTracker(context)
    val handMapper = HandInputMapper()
    val handEngine = HandTrackingEngine(context)
    val cameraManager = CameraManager(context)
    val captureSurface = ExternalSurface()
    val appController = AppLaunchController(context)
    val screenCapture = ScreenCaptureManager(context)
    val cardboardButton = CardboardButtonDetector(context)

    lateinit var renderer: VRRenderer
        private set

    @Volatile var latestHandFrame: HandTrackingEngine.HandFrame? = null
    @Volatile var latestFps = 0f
    @Volatile var latestFrameMs = 0f
    @Volatile var handModelError: String? = null
    @Volatile var handTrackingActive = false

    fun createRenderer(): VRRenderer {
        renderer = VRRenderer(headTracker, sceneGraph, inputHub, cursor, config, captureSurface)
        renderer.cameraFrameProvider = { cameraManager.latestBitmap() }
        renderer.handFrameProvider = { latestHandFrame }
        renderer.onStats = { fps, ms -> latestFps = fps; latestFrameMs = ms }
        return renderer
    }

    fun start() {
        headTracker.start()
        if (cardboardButton.isAvailable) cardboardButton.start()

        handEngine.listener = object : HandTrackingEngine.Listener {
            override fun onHandFrame(frame: HandTrackingEngine.HandFrame) {
                latestHandFrame = frame
                handMapper.onHandFrame(frame) { ev -> inputHub.dispatch(ev) }
            }
            override fun onModelMissing(reason: String) {
                handModelError = reason
            }
        }
        handEngine.frameProvider = { cameraManager.copyLatestFrame() }

        cardboardButton.listener = object : CardboardButtonDetector.Listener {
            override fun onTriggerPressed() {
                val p = inputHub.pointerSnapshot()
                inputHub.dispatch(InputEvent(InputEventType.POINTER_DOWN, "button", p.x, p.y, 0f))
                inputHub.dispatch(InputEvent(InputEventType.TRIGGER, "button", p.x, p.y, 0f))
            }
            override fun onTriggerReleased() {
                val p = inputHub.pointerSnapshot()
                inputHub.dispatch(InputEvent(InputEventType.POINTER_UP, "button", p.x, p.y, 0f))
                inputHub.dispatch(InputEvent(InputEventType.CLICK, "button", p.x, p.y, 0f))
                inputHub.dispatch(InputEvent(InputEventType.SELECT, "button", p.x, p.y, 0f))
            }
        }
    }

    fun stop() {
        headTracker.stop()
        cardboardButton.stop()
        stopHandTracking()
        cameraManager.stop()
        screenCapture.stop()
    }

    /** Enables hand tracking (starts the camera + the landmarker). */
    fun startHandTracking(): Boolean {
        handModelError = null
        cameraManager.start()
        handTrackingActive = handEngine.ensureLoaded() && handEngineStart()
        return handTrackingActive
    }

    private fun handEngineStart(): Boolean {
        handEngine.start()
        return handEngine.modelLoaded
    }

    fun stopHandTracking() {
        handTrackingActive = false
        handEngine.stop()
        if (!config.cameraEnabled) cameraManager.stop()
    }

    /** MR passthrough: camera frames rendered as the environment background. */
    fun setCameraEnabled(on: Boolean) {
        config.cameraEnabled = on
        if (on) cameraManager.start()
        else if (!handTrackingActive) cameraManager.stop()
    }

    fun isCameraAvailable(): Boolean =
        context.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_ANY)
}
