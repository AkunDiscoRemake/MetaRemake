package com.zentra.xr.core

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import kotlin.math.ceil
import kotlin.math.max

/** A cached, GPU uploaded piece of text. */
class GlyphRun(
    val texture: Texture,
    val aspect: Float,
    val pxWidth: Int,
    val pxHeight: Int
)

/**
 * Renders text and vector artwork into GPU textures using the Android 2D canvas.
 * Everything is cached (LRU) and only touched from the GL thread.
 */
class TextKit(private val maxEntries: Int = 256) {

    private val normal = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
        color = Color.WHITE
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
    }
    private val bold = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
        color = Color.WHITE
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }
    private val light = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
        color = Color.WHITE
        typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
    }

    private val metrics = Paint.FontMetricsInt()
    private val canvas = Canvas()

    private val textCache = object : LinkedHashMap<String, GlyphRun>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, GlyphRun>?): Boolean {
            if (size > maxEntries) {
                eldest?.value?.texture?.release()
                return true
            }
            return false
        }
    }
    private val artCache = HashMap<String, Texture>()

    /** Weight: 0 = light, 1 = regular, 2 = bold */
    fun text(value: String, px: Int, weight: Int = 1): GlyphRun {
        val key = "$value\u0000$px\u0000$weight"
        val hit = textCache[key]
        if (hit != null) return hit

        val paint = when (weight) {
            0 -> light
            2 -> bold
            else -> normal
        }
        paint.textSize = px.toFloat()
        paint.getFontMetricsInt(metrics)
        val w = max(2, ceil(paint.measureText(value)).toInt() + 4)
        val h = max(2, metrics.descent - metrics.ascent + 4)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        canvas.setBitmap(bmp)
        canvas.drawText(value, 2f, -metrics.ascent + 2f, paint)
        canvas.setBitmap(null)

        val tex = Texture()
        tex.createFrom(bmp)
        bmp.recycle()

        val run = GlyphRun(tex, w.toFloat() / h.toFloat(), w, h)
        textCache[key] = run
        return run
    }

    /** Measures text without uploading anything (uses the same metrics). */
    fun measure(value: String, px: Int, weight: Int = 1): Float {
        val paint = when (weight) {
            0 -> light
            2 -> bold
            else -> normal
        }
        paint.textSize = px.toFloat()
        return paint.measureText(value)
    }

    fun lineHeight(px: Int, weight: Int = 1): Float {
        val paint = when (weight) {
            0 -> light
            2 -> bold
            else -> normal
        }
        paint.textSize = px.toFloat()
        paint.getFontMetricsInt(metrics)
        return (metrics.descent - metrics.ascent).toFloat()
    }

    /** Cached vector artwork (icons, logo, generated artwork). */
    fun art(key: String, size: Int, draw: (Canvas, Int) -> Unit): Texture {
        artCache[key]?.let { return it }
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        canvas.setBitmap(bmp)
        draw(canvas, size)
        canvas.setBitmap(null)
        val tex = Texture()
        tex.createFrom(bmp)
        bmp.recycle()
        artCache[key] = tex
        return tex
    }

    fun release() {
        textCache.values.forEach { it.texture.release() }
        textCache.clear()
        artCache.values.forEach { it.release() }
        artCache.clear()
    }
}
