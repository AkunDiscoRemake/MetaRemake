package com.zentra.xr.xr

import android.content.Context
import android.opengl.GLSurfaceView
import android.widget.FrameLayout
import android.view.Choreographer
import androidx.lifecycle.LifecycleOwner
import com.zentra.xr.core.Vec3
import com.zentra.xr.browser.WebAppStore
import com.zentra.xr.system.JsRuntime
import com.zentra.xr.system.PerformanceManager
import com.zentra.xr.system.Settings
import com.zentra.xr.system.ThermalManager
import com.zentra.xr.tracking.HandTracker
import com.zentra.xr.tracking.ModelInstaller
import com.zentra.xr.ui.ThemeController
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import java.util.concurrent.CopyOnWriteArrayList
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.max
import kotlin.math.min

/** Everything the renderer needs from the Android side. */
interface EngineHost {
    val activityContext: Context
    fun hasCameraPermission(): Boolean
    fun requestCameraPermission()
    fun haptic(ms: Long)
    fun runOnUi(action: () -> Unit)
    fun finishActivity()
}

/**
 * Zentra XR engine: owns every subsystem and drives the frame loop.
 *
 * Pipeline per frame:
 *  sensors -> hand tracking -> filtering -> direct touch -> UI update -> stereo render
 */
class Engine(
    val host: EngineHost,
    private val lifecycleOwner: LifecycleOwner
) : GLSurfaceView.Renderer, Choreographer.FrameCallback {

    val context: Context get() = host.activityContext

    val settings = Settings(host.activityContext)
    val theme = ThemeController()
    val head = HeadTracker(host.activityContext)
    val model = ModelInstaller(host.activityContext)
    val hands = HandTracker(host.activityContext, lifecycleOwner) { status ->
        host.runOnUi { trackingStatus = status }
    }
    val thermal = ThermalManager(host.activityContext)
    val webApps = WebAppStore(host.activityContext)
    val js = JsRuntime(host.activityContext)
    val perf = PerformanceManager()
    val renderer = VrRenderer()
    val touch = DirectTouch(this)
    val ui = UiContext()

    lateinit var hub: com.zentra.xr.screens.HubScreen
        private set

    var overlay: Screen? = null
        private set
    var onboarding: Screen? = null
        private set

    var trackingStatus = ""
        private set

    /** Hidden container that hosts off screen WebViews (browser + JS runtime). */
    lateinit var hostContainer: FrameLayout

    var frameCount = 0L
        private set

    var time = 0f
        private set

    private val targets = ArrayList<Widget>(64)
    private var lastNs = 0L
    private var lastFrameMs = 0L
    private var choreographer: Choreographer? = null
    private var surfaceReady = false
    private var running = false
    private var pendingOverlay: Screen? = null
    private var hubDim = 0f

    private val motes = Array(28) { Mote() }
    private val motePos = Vec3()

    private class Mote {
        val p = Vec3()
        val speed = 0f
        var size = 0f
        var phase = 0f
    }

    // ------------------------------------------------------------ lifecycle
    fun attach(glView: GLSurfaceView) {
        glView.setEGLContextClientVersion(2)
        glView.setRenderer(this)
        glView.renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
        glView.preserveEGLContextOnPause = true
        glView.setOnTouchListener { _, _ -> true }
    }

    fun start() {
        running = true
        head.start()
        theme.setMode(settings.lightTheme, instant = true)
        ui.theme = theme.current
        ui.renderer = renderer
        ui.haptic = { ms -> if (settings.haptics) host.haptic(ms) }
        renderer.theme = theme.current
        js.prepare()
        initMotes()
        choreographer = Choreographer.getInstance()
        choreographer?.postFrameCallback(this)
    }

    fun resume() {
        running = true
        head.start()
        choreographer?.postFrameCallback(this)
        if (settings.handTracking && host.hasCameraPermission() && model.isReady()) {
            startHandTracking()
        }
    }

    fun pause() {
        running = false
        head.stop()
        hands.stop()
        choreographer?.removeFrameCallback(this)
    }

    fun destroy() {
        running = false
        pause()
        js.release()
        hands.release()
        choreographer?.removeFrameCallback(this)
        choreographer = null
    }

    fun startHandTracking() {
        if (!host.hasCameraPermission()) {
            host.requestCameraPermission()
            return
        }
        if (!model.isReady()) {
            trackingStatus = "modelo do hand tracking ausente"
            return
        }
        hands.start(model.modelPath)
    }

    fun installModelAsync(onDone: (Boolean) -> Unit) {
        val thread = Thread {
            val ok = if (!model.isReady()) model.installFromAssets() || model.download() else true
            model.refresh()
            host.runOnUi {
                onDone(ok)
                if (ok && settings.handTracking) startHandTracking()
            }
        }
        thread.isDaemon = true
        thread.start()
    }

    // ------------------------------------------------------------ screens
    fun setHub(screen: com.zentra.xr.screens.HubScreen) {
        hub = screen
        screen.onEnter()
    }

    fun openOverlay(screen: Screen) {
        overlay?.closing = true
        // a screen that was queued but never became visible still owns resources
        pendingOverlay?.closeAndRelease()
        pendingOverlay = screen
        screen.onEnter()
    }

    fun closeOverlay() {
        overlay?.closeAndRelease()
    }

    fun setOnboarding(screen: Screen?) {
        onboarding?.closeAndRelease()
        onboarding = screen
        screen?.onEnter()
    }

    /** Drops finished screens, releasing their resources exactly once. */
    private fun reap(screen: Screen?) {
        val s = screen ?: return
        if (!s.finished) return
        s.closeAndRelease()
    }

    fun back(): Boolean {
        val current = onboarding ?: overlay
        if (current != null) {
            if (current.onBack()) return true
            if (current === onboarding) return true
            closeOverlay()
            return true
        }
        return hub.onBack()
    }

    // ------------------------------------------------------------ rendering
    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        renderer.create()
        surfaceReady = true
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        renderer.resize(width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        frame()
    }

    override fun doFrame(frameTimeNanos: Long) {
        val targetNs = (perf.targetFrameMs(settings) * 1_000_000L).toLong()
        if (frameTimeNanos - lastFrameMs >= targetNs - 1_500_000L) {
            lastFrameMs = frameTimeNanos
            glViewRequest?.invoke()
        }
        choreographer?.postFrameCallback(this)
    }

    var glViewRequest: (() -> Unit)? = null

    private fun frame() {
        // The GL thread can start drawing before Engine.start() ran on the UI thread;
        // nothing is initialised yet, so skip the frame instead of crashing.
        if (!surfaceReady || !running || !::hub.isInitialized) return
        val now = System.nanoTime()
        val dt = if (lastNs == 0L) 0.016f else ((now - lastNs) / 1e9f).coerceIn(0.0005f, 0.1f)
        lastNs = now
        val nowMs = System.currentTimeMillis()


        perf.beginFrame(now)
        time += dt
        frameCount++
        // the display can rotate (landscape <-> reverse landscape) without recreating
        // the activity, so the sensor alignment is refreshed periodically
        if (frameCount % 60L == 0L) head.refreshDisplayRotation()

        theme.setMode(settings.lightTheme)
        theme.update(dt)
        ui.theme = theme.current
        ui.renderer = renderer
        ui.dt = dt
        ui.time = time
        ui.animations = settings.animations
        ui.uiScale = settings.uiScale * settings.uiSize

        // tracking configuration (live from settings)
        hands.cameraFov = settings.cameraFov
        hands.sensitivity = settings.trackingSensitivity
        hands.offsetX = settings.cameraOffsetX
        hands.offsetY = settings.cameraOffsetY
        hands.offsetZ = settings.cameraOffsetZ
        hands.resolutionIndex = settings.cameraResolution
        hands.targetHz = perf.handHz
        touch.configure()

        thermal.update(nowMs)
        perf.update(nowMs, settings, thermal)

        // ---- update -------------------------------------------------
        val active = onboarding ?: overlay
        hub.update(dt)
        active?.update(dt)

        if (pendingOverlay != null) {
            overlay = pendingOverlay
            pendingOverlay = null
        }
        reap(overlay)
        reap(onboarding)
        if (overlay?.finished == true) overlay = null
        if (onboarding?.finished == true) onboarding = null

        val dimTarget = if (active != null && active.dimsHub) 0.35f else 1f
        hubDim += (dimTarget - hubDim) * (1f - max(0f, 1f - dt / 0.2f))
        hub.externalDim = hubDim

        targets.clear()
        if (active != null) active.collectTargets(targets) else hub.collectTargets(targets)
        touch.update(dt, targets)
        touch.updateRipples(dt)

        // ---- render -------------------------------------------------
        renderer.theme = theme.current
        renderer.textScale = 0.85f + 0.15f * perf.qualityTier
        val s = settings
        renderer.beginFrame(head.headWorld, dt, perf.renderScale)
        val eyes = if (s.monoMode) 1 else 2
        for (i in 0 until eyes) {
            renderer.beginEye(i, s.ipd, s.fov, s.monoMode, s.sbsSwap)
            drawWorld(renderer)
        }
        renderer.endFrame(
            s.barrelDistortion * (if (s.monoMode) 0f else 1f),
            s.sbsSwap, s.monoMode, s.chromaticAberration, s.vignette
        )

        perf.endFrame()
    }

    private fun drawWorld(r: VrRenderer) {
        val p = theme.current
        val quality = perf.qualityTier

        r.sky(p.skyTop, p.skyBottom, p.skyHorizon, settings.starIntensity * quality)

        if (settings.showGrid && quality > 0.4f) {
            r.floor(FLOOR_Y, 0.5f, p.gridColor, 0.55f * quality, 14f)
        }

        drawMotes(r, quality)

        r.push()
        hub.draw(r)
        r.pop()

        val active = onboarding ?: overlay
        if (active != null) {
            r.push()
            active.draw(r)
            r.pop()
        }

        touch.draw(r)
    }

    private fun initMotes() {
        for ((i, m) in motes.withIndex()) {
            val a = (i * 2.399963f)
            val radius = 0.7f + (i % 5) * 0.55f
            m.p.set(
                kotlin.math.cos(a) * radius,
                -0.8f + (i % 7) * 0.22f,
                -kotlin.math.sin(a) * radius
            )
            m.size = 0.006f + (i % 4) * 0.0022f
            m.phase = i * 0.7f
        }
    }

    private fun drawMotes(r: VrRenderer, quality: Float) {
        if (quality < 0.45f) return
        val count = (motes.size * quality).toInt()
        for (i in 0 until count) {
            val m = motes[i]
            motePos.set(
                m.p.x,
                m.p.y + kotlin.math.sin(time * 0.25f + m.phase) * 0.05f,
                m.p.z + kotlin.math.cos(time * 0.18f + m.phase) * 0.04f
            )
            r.push()
            r.translate(motePos.x, motePos.y, motePos.z)
            val d = max(0.5f, motePos.distanceTo(r.camPos))
            r.circle(m.size * (1f + 0.6f / d), theme.current.textFaint, 0.22f * quality, 0.6f)
            r.pop()
        }
    }

    fun haptic(ms: Long) {
        if (settings.haptics) host.haptic(ms)
    }

    companion object {
        const val FLOOR_Y = -1.5f
    }
}
