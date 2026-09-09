package com.zentra.xr.browser

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import com.zentra.xr.core.TextKit
import com.zentra.xr.core.Texture
import org.json.JSONArray
import org.json.JSONObject

/** A site saved from the Zentra XR browser. Web Apps run inside the internal browser. */
data class WebApp(
    val id: String,
    val name: String,
    val url: String,
    val createdAt: Long = System.currentTimeMillis()
)

object WebAppIcon {
    fun texture(kit: TextKit, webApp: WebApp): Texture =
        kit.art("webapp:${webApp.id}:${webApp.name}", 128) { canvas, size -> draw(canvas, size, webApp.name) }

    private fun draw(canvas: Canvas, size: Int, name: String) {
        val s = size.toFloat()
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = s * 0.06f
        }
        val m = s * 0.12f
        canvas.drawRoundRect(RectF(m, m, s - m, s - m), s * 0.22f, s * 0.22f, paint)
        paint.style = Paint.Style.FILL
        paint.textSize = s * 0.42f
        paint.textAlign = Paint.Align.CENTER
        val letter = (name.firstOrNull { it.isLetterOrDigit() } ?: 'Z').uppercaseChar().toString()
        val fm = paint.fontMetrics
        canvas.drawText(letter, s * 0.5f, s * 0.5f - (fm.ascent + fm.descent) * 0.5f, paint)
    }
}

/** Persists the Web Apps library in SharedPreferences. */
class WebAppStore(context: Context) {

    private val prefs = context.getSharedPreferences("zentra_webapps", Context.MODE_PRIVATE)
    private val items = ArrayList<WebApp>()

    val list: List<WebApp> get() = items

    init {
        load()
    }

    fun add(name: String, url: String): WebApp {
        val webApp = WebApp(
            id = "wa${System.currentTimeMillis()}",
            name = name.ifBlank { hostOf(url) },
            url = normalize(url)
        )
        items.add(0, webApp)
        save()
        return webApp
    }

    fun remove(id: String) {
        items.removeAll { it.id == id }
        save()
    }

    fun contains(url: String): Boolean = items.any { it.url == normalize(url) }

    private fun normalize(url: String): String {
        val trimmed = url.trim()
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else if (trimmed.contains(".") && !trimmed.contains(" ")) {
            "https://$trimmed"
        } else {
            "https://www.google.com/search?q=" + java.net.URLEncoder.encode(trimmed, "UTF-8")
        }
    }

    fun hostOf(url: String): String {
        return try {
            (java.net.URI(url).host ?: url).removePrefix("www.")
        } catch (t: Throwable) {
            url
        }
    }

    private fun load() {
        items.clear()
        val raw = prefs.getString("items", null) ?: return
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val o = array.getJSONObject(i)
                items.add(
                    WebApp(
                        id = o.optString("id"),
                        name = o.optString("name"),
                        url = o.optString("url"),
                        createdAt = o.optLong("createdAt", 0L)
                    )
                )
            }
        } catch (t: Throwable) {
            items.clear()
        }
    }

    private fun save() {
        val array = JSONArray()
        for (item in items) {
            val o = JSONObject()
            o.put("id", item.id)
            o.put("name", item.name)
            o.put("url", item.url)
            o.put("createdAt", item.createdAt)
            array.put(o)
        }
        prefs.edit().putString("items", array.toString()).apply()
    }
}
