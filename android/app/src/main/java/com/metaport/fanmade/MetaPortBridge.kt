package com.metaport.fanmade

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.CombinedVibration
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.Gravity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import org.json.JSONObject

/**
 * Ponte `window.MetaPortAndroid`. Métodos curtos, todos defensivos: o JS chama com
 * `?.` e nunca depende deles para funcionar (o app roda igual no navegador).
 *
 * Anything expensive stays in the runtime — this only touches the platform.
 */
class MetaPortBridge(private val activity: Activity, private val web: WebView) {

    private var pendingLink: String? = null

    // ------------------------------------------------------------------ vibração / tela
    @JavascriptInterface
    fun vibrate(ms: Int) {
        if (ms <= 0) return
        try {
            val vm = if (Build.VERSION.SDK_INT >= 31) {
                (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            } ?: return
            if (!vm.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= 29) {
                if (Build.VERSION.SDK_INT >= 31) {
                    vm.vibrate(CombinedVibration.createParallel(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE)))
                } else {
                    vm.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
                }
            } else {
                @Suppress("DEPRECATION")
                vm.vibrate(ms.toLong())
            }
        } catch (e: Exception) {
            Log.d(TAG, "vibrate: ${e.message}")
        }
    }

    @JavascriptInterface
    fun keepAwake(on: Boolean) {
        (activity as? MainActivity)?.keepAwake(on)
    }

    @JavascriptInterface
    fun setImmersive(on: Int) {
        (activity as? MainActivity)?.setImmersive(on != 0)
    }

    /** 'handheld' | 'vrbox' | 'xr' — a casca só precisa saber se é óculos. */
    @JavascriptInterface
    fun setMode(mode: String?) {
        val act = activity as? MainActivity ?: return
        when (mode) {
            "vrbox", "xr" -> {
                act.setImmersive(true)
                act.lockOrientation(true)
            }
            else -> {
                act.setImmersive(true)
                act.lockOrientation(false)
            }
        }
    }

    // ------------------------------------------------------------------ links / compartilhar
    @JavascriptInterface
    fun openUrl(url: String?) {
        val target = url?.takeIf { it.startsWith("http") } ?: return
        try {
            activity.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(target)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: Exception) {
            showToast("nenhum navegador para abrir $target")
        }
    }

    @JavascriptInterface
    fun share(text: String?) {
        val body = text ?: web.url ?: return
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, body)
        }
        try {
            activity.startActivity(Intent.createChooser(send, "MetaPort").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            Log.w(TAG, "share: ${e.message}")
        }
    }

    @JavascriptInterface
    fun toast(msg: String?) {
        if (msg.isNullOrBlank()) return
        showToast(msg.take(180))
    }

    private fun showToast(text: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, text, Toast.LENGTH_SHORT).also { it.setGravity(Gravity.CENTER, 0, 0) }.show()
        }
    }

    /** Deep link `metaport://open?url=…` consumido pelo runtime. */
    fun setPendingLink(url: String) { pendingLink = url }

    @JavascriptInterface
    fun consumePending(): String? {
        val v = pendingLink
        pendingLink = null
        return v
    }

    fun pushPendingLink() {
        val v = pendingLink ?: return
        web.post {
            web.evaluateJavascript(
                "window.MetaPortNative&&window.MetaPortNative.openLink&&window.MetaPortNative.openLink(${JSONObject.quote(v)})",
                null
            )
        }
    }

    // ------------------------------------------------------------------ informações
    @JavascriptInterface
    fun deviceInfo(): String {
        val o = JSONObject()
        o.put("app", "MetaPort")
        o.put("platform", "android")
        o.put("sdk", Build.VERSION.SDK_INT)
        o.put("manufacturer", Build.MANUFACTURER)
        o.put("model", Build.MODEL)
        o.put("brand", Build.BRAND)
        try {
            val pkg = activity.packageManager.getPackageInfo(activity.packageName, 0)
            o.put("versionName", pkg.versionName ?: "?")
            @Suppress("DEPRECATION")
            o.put("versionCode", pkg.versionCode)
        } catch (_: Exception) {
        }
        try {
            o.put("webView", android.webkit.WebView.getVersion())
        } catch (_: Exception) {
        }
        return o.toString()
    }

    /** Pulso de headset: só existe feedback real em Android; no resto é haptic fraco. */
    @JavascriptInterface
    fun hapticPulse(strength: Double) {
        vibrate((8 + strength.coerceIn(0.0, 1.0) * 28).toInt())
    }

    @JavascriptInterface
    fun relaunch() {
        val ctx = activity.applicationContext
        val i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.finish()
        i?.let { ctx.startActivity(it) }
    }

    companion object {
        private const val TAG = "MetaPortBridge"
    }
}
