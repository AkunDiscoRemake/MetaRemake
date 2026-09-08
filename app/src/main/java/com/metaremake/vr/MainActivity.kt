package com.metaremake.vr

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.Vibrator
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Surface
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.metaremake.vr.apps.ScreenCaptureManager
import com.metaremake.vr.bridge.NativeBridge
import com.metaremake.vr.input.InputEvent
import com.metaremake.vr.input.InputEventType
import com.metaremake.vr.overlay.OverlayManager
import com.metaremake.vr.runtime.VRRuntime
import com.metaremake.vr.util.MLog

/**
 * Cardboard host Activity. A fullscreen, landscape GLSurfaceView is the stereo
 * canvas (left + right eye, side by side); a hidden WebView runs the JavaScript
 * VR runtime. A frame pacer drives both: the GL thread renders the scene the JS
 * runtime last published, then the JS logic ticks for the next frame.
 */
class MainActivity : AppCompatActivity(), NativeBridge.Host {

    private lateinit var runtime: VRRuntime
    private lateinit var glView: GLSurfaceView
    private lateinit var webView: WebView
    private lateinit var statusText: TextView

    private var pacerThread: HandlerThread? = null
    private var pacerHandler: Handler? = null
    private val pacerRunnable = object : Runnable {
        override fun run() {
            if (isFinishing || isDestroyed) return
            val start = System.currentTimeMillis()
            glView.requestRender()
            try {
                webView.evaluateJavascript("window.VR && VR.tick()", null)
            } catch (_: Throwable) {
            }
            val interval = (1000L / runtime.config.targetFps.coerceIn(30, 120))
            val elapsed = System.currentTimeMillis() - start
            pacerHandler?.postDelayed(this, (interval - elapsed).coerceAtLeast(1))
        }
    }

    private val statusRunnable = object : Runnable {
        override fun run() {
            if (isFinishing || isDestroyed) return
            val s = runtime.headTracker.state
            statusText.text = "SBS ${glView.width}x${glView.height} | ${runtime.latestFps.toInt()}fps | " +
                "sensor=${s.sensorName} | hands=${runtime.latestHandFrame?.hands?.size ?: 0} | " +
                "cap=${runtime.screenCapture.isCapturing}"
            statusText.postDelayed(this, 500)
        }
    }

    private var pendingCameraCallback: ((Boolean) -> Unit)? = null

    private lateinit var overlayManager: OverlayManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        runtime = VRRuntime(applicationContext)
        overlayManager = OverlayManager(this)

        glView = findViewById(R.id.gl_surface)
        glView.setEGLContextClientVersion(2)
        glView.setPreserveEGLContextOnPause(true)
        glView.setRenderer(runtime.createRenderer())
        glView.renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY

        statusText = findViewById(R.id.status_text)

        setupWebView()

        glView.setOnTouchListener { _, ev -> onTouchEvent(ev) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView = findViewById(R.id.js_runtime)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(cm: ConsoleMessage): Boolean {
                MLog.d("JS", "[${cm.messageLevel()}] ${cm.message()}")
                return true
            }
        }
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(NativeBridge(runtime, this), "NativeBridge")
        webView.loadUrl("file:///android_asset/js/index.html")
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        glView.onResume()
        runtime.start()

        pacerThread = HandlerThread("VRFramePacer", android.os.Process.THREAD_PRIORITY_DISPLAY)
        pacerThread!!.start()
        pacerHandler = Handler(pacerThread!!.looper)
        pacerHandler!!.post(pacerRunnable)

        statusText.post(statusRunnable)
    }

    override fun onPause() {
        super.onPause()
        pacerHandler?.removeCallbacksAndMessages(null)
        pacerHandler = null
        pacerThread?.quitSafely()
        pacerThread = null
        statusText.removeCallbacks(statusRunnable)
        runtime.stop()
        glView.onPause()
    }

    override fun onDestroy() {
        super.onDestroy()
        webView.removeJavascriptInterface("NativeBridge")
        webView.destroy()
        runtime.captureSurface.release()
    }

    private fun hideSystemUi() {
        overlayManager.applyImmersive(window)
    }

    // ------------------------------------------------------------- host ops
    override fun requestCameraPermission(callback: (Boolean) -> Unit) {
        pendingCameraCallback = callback
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            callback(true)
            pendingCameraCallback = null
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1001)
        }
    }

    override fun requestScreenCapture() {
        val st = runtime.captureSurface.surfaceTexture
        if (st == null) {
            MLog.w("MainActivity", "capture surface not ready yet")
            return
        }
        runtime.screenCapture.requestPermission(this)
    }

    override fun openAccessibilitySettings() {
        runtime.appController.openAccessibilitySettings()
    }

    override fun vibrate(ms: Long) {
        val v = getSystemService(VIBRATOR_SERVICE) as? Vibrator ?: return
        v.vibrate(ms)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1001) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingCameraCallback?.invoke(granted)
            pendingCameraCallback = null
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == ScreenCaptureManager.REQUEST_CODE && data != null) {
            val st = runtime.captureSurface.surfaceTexture
            if (st != null) {
                runtime.screenCapture.onPermissionResult(resultCode, data, Surface(st))
            } else {
                MLog.w("MainActivity", "capture surface null on projection result")
            }
        }
    }

    // ------------------------------------------------------------- raw input
    private var touchDown = false
    private var touchMoved = 0f
    private var lastTapTime = 0L

    private fun onTouchEvent(ev: MotionEvent): Boolean {
        val x = ev.x / glView.width.coerceAtLeast(1)
        val y = ev.y / glView.height.coerceAtLeast(1)
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                touchDown = true; touchMoved = 0f
                runtime.inputHub.dispatch(InputEvent(InputEventType.POINTER_MOVE, "touch", x, y))
                runtime.inputHub.dispatch(InputEvent(InputEventType.POINTER_DOWN, "touch", x, y))
            }
            MotionEvent.ACTION_MOVE -> {
                touchMoved += kotlin.math.abs(ev.x) + kotlin.math.abs(ev.y)
                runtime.inputHub.dispatch(InputEvent(InputEventType.POINTER_MOVE, "touch", x, y))
                if (touchDown) runtime.inputHub.dispatch(InputEvent(InputEventType.DRAG, "touch", x, y, deltaX = ev.x * 0.001f, deltaY = ev.y * 0.001f))
            }
            MotionEvent.ACTION_UP -> {
                touchDown = false
                runtime.inputHub.dispatch(InputEvent(InputEventType.POINTER_UP, "touch", x, y))
                runtime.inputHub.dispatch(InputEvent(InputEventType.CLICK, "touch", x, y))
                runtime.inputHub.dispatch(InputEvent(InputEventType.SELECT, "touch", x, y))
                val now = System.currentTimeMillis()
                if (now - lastTapTime < 300) runtime.inputHub.dispatch(InputEvent(InputEventType.RECENTER, "touch", x, y))
                lastTapTime = now
            }
        }
        return true
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                runtime.inputHub.dispatch(InputEvent(InputEventType.BACK, "key"))
                true
            }
            KeyEvent.KEYCODE_VOLUME_UP -> {
                runtime.inputHub.dispatch(InputEvent(InputEventType.SELECT, "key"))
                runtime.inputHub.dispatch(InputEvent(InputEventType.CLICK, "key"))
                true
            }
            KeyEvent.KEYCODE_VOLUME_DOWN -> {
                runtime.inputHub.dispatch(InputEvent(InputEventType.RECENTER, "key"))
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }
}
