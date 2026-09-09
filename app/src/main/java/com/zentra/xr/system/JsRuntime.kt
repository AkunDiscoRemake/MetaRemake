package com.zentra.xr.system

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import org.json.JSONObject

/**
 * Tiny JavaScript runtime used by the mini apps for layout/logic that is nicer to express
 * as data (theme tokens, clock formatting, demo scene scripts, Web App metadata).
 *
 * It runs in an off screen WebView: zero extra dependencies, and the same engine that
 * powers the VR browser.
 */
class JsRuntime(private val context: Context) {

    private val handler = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    private var ready = false
    private var script = ""

    @SuppressLint("SetJavaScriptEnabled")
    fun prepare(assetsScript: String = "js/zentra.js") {
        handler.post {
            if (webView != null) return@post
            val view = WebView(context)
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = true
            view.settings.allowContentAccess = false
            view.settings.allowFileAccess = true
            view.loadUrl("file:///android_asset/$assetsScript")
            webView = view
            ready = true
        }
    }

    fun release() {
        handler.post {
            webView?.destroy()
            webView = null
            ready = false
        }
    }

    /** Evaluates JS and delivers the JSON encoded result on the main thread. */
    fun evaluate(js: String, callback: (String?) -> Unit) {
        handler.post {
            val view = webView
            if (view == null) {
                callback(null)
                return@post
            }
            view.evaluateJavascript("(function(){ return JSON.stringify($js); })()") { value ->
                callback(unquote(value))
            }
        }
    }

    private fun unquote(raw: String?): String? {
        if (raw == null) return null
        val trimmed = raw.trim()
        if (trimmed == "null") return null
        return try {
            if (trimmed.startsWith("\"")) {
                JSONObject(trimmed).optString("v", trimmed)
            } else {
                trimmed.trim('"')
            }
        } catch (t: Throwable) {
            trimmed
        }
    }
}
