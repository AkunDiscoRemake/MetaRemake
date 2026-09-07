package com.metaport.fanmade

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

/**
 * MetaPort — casca Android.
 *
 * O app inteiro é o bundle web em `assets/www`, servido por [WebViewAssetLoader] no
 * origin `https://appassets.androidplatform.net/…`: secure context de verdade, então
 * getUserMedia / WebGL2 / localStorage / módulos ES funcionam sem servidor e sem rede.
 *
 * Nada aqui implementa UI: tela, óculos, janelas e loja vivem no runtime 3D.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var bridge: MetaPortBridge
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var pendingPermission: PermissionRequest? = null
    private var bootTime = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        super.onCreate(savedInstanceState)
        bootTime = System.currentTimeMillis()

        root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#05060D"))
        setContentView(root)

        web = WebView(this).apply {
            id = View.generateViewId()
            setBackgroundColor(Color.parseColor("#05060D"))
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            setOnLongClickListener { true }
        }
        root.addView(
            web,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )

        bridge = MetaPortBridge(this, web)
        configure(web)

        applyImmersive()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        ensureCameraPermission()
        handleDeepLink(intent)
    }

    // ------------------------------------------------------------------ WebView
    @SuppressLint("SetJavaScriptEnabled")
    private fun configure(web: WebView) {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/www/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.addJavascriptInterface(bridge, "MetaPortAndroid")

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false      // WebAudio acorda sozinho
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            loadsImagesAutomatically = true
            textZoom = 100
            layoutAlgorithm = WebSettings.LayoutAlgorithm.NORMAL
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            setGeolocationEnabled(false)
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(web.settings, false)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(web.settings, WebSettingsCompat.FORCE_DARK_OFF)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.BACK_FORWARD_CACHE)) {
            WebSettingsCompat.setAllowBackForwardCacheCaching(web.settings, true)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
                ?: super.shouldInterceptRequest(view, request)

            override fun onPageFinished(view: WebView?, url: String?) {
                Log.i(TAG, "page ready em ${(System.currentTimeMillis() - bootTime) / 1000.0}s → $url")
                view?.evaluateJavascript(
                    "window.MetaPortNative&&window.MetaPortNative.info&&window.MetaPortNative.info()",
                    null
                )
                bridge.pushPendingLink()
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
                // recursos externos (CDN) podem falhar offline — o app tem fallback local
                Log.w(TAG, "erro de rede ${request?.url}: ${error?.description}")
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsVideo = request.resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                if (wantsVideo && !hasCameraPermission()) {
                    pendingPermission = request
                    ensureCameraPermission()
                    toast("toque em “permitir” para ver o mundo ao redor")
                    return
                }
                runOnUiThread {
                    request.grant(request.resources)
                    pendingPermission?.let {
                        pendingPermission = null
                        it.grant(it.resources)
                    }
                }
            }

            override fun onPermissionDenied(request: PermissionRequest?) {
                runOnUiThread { web.evaluateJavascript(JS_CAMERA_DENIED, null) }
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (customView != null) { callback.onCustomViewHidden(); return }
                customView = view
                customCallback = callback
                view.layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
                )
                root.addView(view)
                web.visibility = View.GONE
                applyImmersive()
            }

            override fun onHideCustomView() = hideCustom()

            override fun onConsoleMessage(msg: ConsoleMessage?): Boolean {
                msg?.let { Log.d(TAG_WEBVIEW, "${it.message()}  (${it.sourceId()?.substringAfterLast('/')}:${it.lineNumber()})") }
                return true
            }
        }

        web.loadUrl(HOME_URL)
    }

    // ------------------------------------------------------------------ permissões
    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    private fun ensureCameraPermission() {
        if (hasCameraPermission()) return
        try {
            requestPermissions(arrayOf(android.Manifest.permission.CAMERA), REQ_CAMERA)
        } catch (e: Exception) {
            Log.w(TAG, "pedido de câmera falhou: ${e.message}")
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_CAMERA) return
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        if (granted) {
            pendingPermission?.let { runOnUiThread { it.grant(it.resources) }; pendingPermission = null }
            web.evaluateJavascript("window.MetaPortNative&&window.MetaPortNative.toast('câmera liberada ✓','ok')", null)
        } else {
            web.evaluateJavascript(JS_CAMERA_DENIED, null)
        }
    }

    // ------------------------------------------------------------------ visual
    private fun applyImmersive() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.let {
                it.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                it.hide(android.view.WindowInsets.Type.systemBars())
            }
        }
    }

    fun setImmersive(on: Boolean) {
        runOnUiThread {
            if (on) applyImmersive() else {
                window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                if (Build.VERSION.SDK_INT >= 30) {
                    window.insetsController?.show(android.view.WindowInsets.Type.systemBars())
                }
            }
        }
    }

    fun lockOrientation(landscape: Boolean) {
        runOnUiThread {
            requestedOrientation = if (landscape) {
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            } else {
                ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
            }
        }
    }

    fun keepAwake(on: Boolean) {
        runOnUiThread {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    private fun hideCustom() {
        customView?.let { root.removeView(it) }
        customView = null
        customCallback?.onCustomViewHidden()
        customCallback = null
        web.visibility = View.VISIBLE
    }

    fun toast(text: String) = runOnUiThread {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).also { it.setGravity(Gravity.CENTER, 0, 0) }.show()
    }

    // ------------------------------------------------------------------ ciclo de vida
    override fun onResume() {
        super.onResume()
        web.onResume()
        web.resumeTimers()
        applyImmersive()
        web.evaluateJavascript("window.MetaPortNative&&window.MetaPortNative.resume&&window.MetaPortNative.resume()", null)
    }

    override fun onPause() {
        web.evaluateJavascript("window.MetaPortNative&&window.MetaPortNative.pause&&window.MetaPortNative.pause()", null)
        web.pauseTimers()
        web.onPause()
        super.onPause()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    /** `metaport://open?url=https://…` → abre no Browser do próprio MetaPort. */
    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        val target = data.getQueryParameter("url") ?: ((data.host ?: "") + (data.path ?: ""))
        if (target.isBlank()) return
        bridge.setPendingLink(target)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // o shell 3D decide: janela na frente → volta; senão sai do óculos; senão sai do app
        web.evaluateJavascript(JS_BACK) { value ->
            val consumed = value?.trim('"', ' ', '\n')?.toBoolean() == true
            if (!consumed) {
                if (customView != null) {
                    hideCustom()
                } else {
                    super.onBackPressed()
                }
            }
        }
    }

    companion object {
        const val TAG = "MetaPort"
        const val TAG_WEBVIEW = "MetaPort(JS)"
        const val HOME_URL = "https://appassets.androidplatform.net/assets/www/index.html"
        const val REQ_CAMERA = 41
        const val JS_BACK =
            "(function(){try{var s=window.__metaport;return (s&&s.onBack)?!!s.onBack():false}catch(e){return false}})()"
        const val JS_CAMERA_DENIED =
            "window.MetaPortNative&&window.MetaPortNative.toast('sem câmera: modo MR reduzido','warn')"
    }
}
