package com.zentra.xr.browser

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.zentra.xr.core.Texture
import com.zentra.xr.system.Settings

/**
 * Off screen WebView rendered into an OpenGL texture.
 *
 * The page is drawn into a bitmap on the UI thread (throttled) and uploaded to the GPU
 * from the render thread, so the web becomes just another floating surface inside VR.
 */
class VrBrowser(
    private val context: Context,
    private val host: FrameLayout,
    private val settings: Settings
) {

    companion object {
        const val WIDTH = 1024
        const val HEIGHT = 640
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    var url: String = ""
        private set

    @Volatile
    var title: String = ""
        private set

    @Volatile
    var progress = 0
        private set

    @Volatile
    var loading = false
        private set

    @Volatile
    var canGoBack = false
        private set

    @Volatile
    var canGoForward = false
        private set

    var zoomLevel = 1f
        private set

    var softwareFallback = false
        private set

    val texture = Texture()

    private var webView: WebView? = null
    private var back: Bitmap? = null
    private var front: Bitmap? = null
    private val lock = Any()

    @Volatile
    private var dirty = false

    @Volatile
    private var attached = false

    private var lastRedraw = 0L
    private var redrawIntervalMs = 90L

    var onPageChanged: ((String, String) -> Unit)? = null

    @SuppressLint("SetJavaScriptEnabled")
    fun attach() {
        if (attached) return
        attached = true
        mainHandler.post {
            val view = WebView(context)
            view.layoutParams = FrameLayout.LayoutParams(WIDTH, HEIGHT).apply {
                leftMargin = -(WIDTH + 40)
                topMargin = 0
            }
            view.setBackgroundColor(Color.WHITE)
            view.isFocusable = true
            view.isFocusableInTouchMode = true
            view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO

            val ws = view.settings
            ws.javaScriptEnabled = true
            ws.domStorageEnabled = true
            ws.databaseEnabled = true
            ws.mediaPlaybackRequiresUserGesture = false
            ws.loadWithOverviewMode = true
            ws.useWideViewPort = true
            ws.builtInZoomControls = false
            ws.displayZoomControls = false
            ws.cacheMode = WebSettings.LOAD_DEFAULT
            ws.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            ws.userAgentString = ws.userAgentString + " ZentraXR/1.0"

            view.webViewClient = object : WebViewClient() {
                override fun onPageStarted(v: WebView?, u: String?, favicon: Bitmap?) {
                    loading = true
                    u?.let { url = it }
                    progress = 0
                }

                override fun onPageFinished(v: WebView?, u: String?) {
                    loading = false
                    progress = 100
                    u?.let { url = it }
                    canGoBack = v?.canGoBack() ?: false
                    canGoForward = v?.canGoForward() ?: false
                    title = v?.title ?: ""
                    onPageChanged?.invoke(url, title)
                    requestRedraw()
                    checkBlankAndFallback()
                }

                override fun shouldOverrideUrlLoading(v: WebView?, u: String?): Boolean = false
            }

            view.webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(v: WebView?, newProgress: Int) {
                    progress = newProgress
                    requestRedraw()
                }

                override fun onReceivedTitle(v: WebView?, t: String?) {
                    title = t ?: ""
                    onPageChanged?.invoke(url, title)
                }
            }

            host.addView(view)
            webView = view
            back = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
            front = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
        }
    }

    fun detach() {
        mainHandler.post {
            webView?.let {
                it.stopLoading()
                it.webViewClient = WebViewClient()
                host.removeView(it)
                it.destroy()
            }
            webView = null
            attached = false
        }
    }

    fun loadUrl(target: String) {
        val finalUrl = if (target.startsWith("http://") || target.startsWith("https://")) {
            target
        } else if (target.contains(".") && !target.contains(" ")) {
            "https://$target"
        } else {
            "https://www.google.com/search?q=" + java.net.URLEncoder.encode(target, "UTF-8")
        }
        url = finalUrl
        mainHandler.post { webView?.loadUrl(finalUrl) }
    }

    fun goBack() = mainHandler.post { webView?.goBack() }
    fun goForward() = mainHandler.post { webView?.goForward() }
    fun reload() = mainHandler.post { webView?.reload() }
    fun stop() = mainHandler.post { webView?.stopLoading() }

    fun zoom(factor: Float) {
        zoomLevel = (zoomLevel * factor).coerceIn(0.5f, 3f)
        mainHandler.post {
            webView?.settings?.textZoom = (zoomLevel * 100).toInt()
            requestRedraw()
        }
    }

    fun scrollBy(dx: Float, dy: Float) {
        mainHandler.post {
            webView?.scrollBy(dx.toInt(), dy.toInt())
            requestRedraw()
        }
    }

    /** Injects a touch in page coordinates (0..1). */
    fun touch(nx: Float, ny: Float, action: Int) {
        mainHandler.post {
            val view = webView ?: return@post
            val x = (nx * WIDTH).coerceIn(0f, WIDTH - 1f)
            val y = (ny * HEIGHT).coerceIn(0f, HEIGHT - 1f)
            val now = android.os.SystemClock.uptimeMillis()
            val event = MotionEvent.obtain(now, now, action, x, y, 0)
            view.dispatchTouchEvent(event)
            event.recycle()
            requestRedraw()
        }
    }

    /** Types a single character into the focused element of the page. */
    fun type(ch: Char) {
        mainHandler.post {
            val view = webView ?: return@post
            val code = keyCodeFor(ch)
            val shift = ch.isUpperCase()
            val now = android.os.SystemClock.uptimeMillis()
            val meta = if (shift) KeyEvent.META_SHIFT_ON else 0
            view.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0, meta))
            view.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0, meta))
            requestRedraw()
        }
    }

    fun key(code: Int) {
        mainHandler.post {
            val view = webView ?: return@post
            val now = android.os.SystemClock.uptimeMillis()
            view.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0, 0))
            view.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0, 0))
            requestRedraw()
        }
    }

    private fun keyCodeFor(ch: Char): Int {
        val lower = ch.lowercaseChar()
        return when {
            lower in 'a'..'z' -> KeyEvent.KEYCODE_A + (lower - 'a')
            lower in '0'..'9' -> KeyEvent.KEYCODE_0 + (lower - '0')
            lower == ' ' -> KeyEvent.KEYCODE_SPACE
            lower == '.' -> KeyEvent.KEYCODE_PERIOD
            lower == ',' -> KeyEvent.KEYCODE_COMMA
            lower == '/' -> KeyEvent.KEYCODE_SLASH
            lower == '@' -> KeyEvent.KEYCODE_AT
            lower == '-' -> KeyEvent.KEYCODE_MINUS
            lower == '+' -> KeyEvent.KEYCODE_PLUS
            lower == ':' -> KeyEvent.KEYCODE_SEMICOLON
            lower == '_' -> KeyEvent.KEYCODE_MINUS
            else -> KeyEvent.KEYCODE_SPACE
        }
    }

    /** Called from the render thread: schedules a capture at a limited rate. */
    fun tick() {
        val now = android.os.SystemClock.uptimeMillis()
        if (now - lastRedraw < redrawIntervalMs) return
        lastRedraw = now
        requestRedraw()
    }

    private fun requestRedraw() {
        mainHandler.post {
            val view = webView
            val target = back
            if (view == null || target == null) return@post
            val canvas = Canvas(target)
            canvas.drawColor(if (settings.lightTheme) Color.WHITE else Color.BLACK)
            try {
                view.draw(canvas)
            } catch (t: Throwable) {
                // ignore transient drawing failures
            }
            synchronized(lock) {
                val tmp = front
                front = target
                back = tmp
                dirty = true
            }
        }
    }

    /** Uploads the newest captured frame. Must run on the GL thread. */
    fun upload() {
        val bitmap: Bitmap?
        synchronized(lock) {
            if (!dirty) return
            dirty = false
            bitmap = front
        }
        bitmap?.let {
            if (texture.id == 0) texture.createFrom(it) else texture.upload(it)
        }
    }

    private fun checkBlankAndFallback() {
        if (softwareFallback) return
        mainHandler.postDelayed({
            val bitmap = front ?: return@postDelayed
            var opaque = 0
            val step = 32
            for (y in 0 until HEIGHT step step) {
                for (x in 0 until WIDTH step step) {
                    if (Color.alpha(bitmap.getPixel(x, y)) > 8) opaque++
                }
            }
            if (opaque < 4) {
                // hardware capture produced nothing: switch this WebView to software drawing
                softwareFallback = true
                webView?.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
                requestRedraw()
            }
        }, 700L)
    }

    fun onResume() = mainHandler.post { webView?.resumeTimers(); webView?.onResume() }
    fun onPause() = mainHandler.post { webView?.onPause(); webView?.pauseTimers() }
}
