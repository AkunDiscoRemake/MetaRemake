package com.metaremake.vr.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.metaremake.vr.util.MLog

/**
 * Rasterises text into GL textures on the GL thread. Text is drawn white on a
 * transparent bitmap; the colour shader tints it with the node colour, so
 * colour changes never force a re-raster. Results are cached by a content key.
 */
class TextRenderer {

    companion object {
        const val PIXELS_PER_METER = 512f
        const val MAX_TEXTURE = 2048
    }

    private class Entry(val texture: Int, val key: String)

    private val cache = HashMap<String, Entry>()

    /**
     * Returns a GL texture id for the given content. Must be called on the GL
     * thread. [w] and [h] are the panel size in meters.
     */
    fun getTexture(id: String, text: String, fontSize: Float, w: Float, h: Float): Int {
        val key = "$id|$text|$fontSize|$w|$h"
        cache[key]?.let { return it.texture }

        val tex = GlTextures.create2D()
        val texW = (w * PIXELS_PER_METER).toInt().coerceIn(8, MAX_TEXTURE)
        val texH = (h * PIXELS_PER_METER).toInt().coerceIn(8, MAX_TEXTURE)

        try {
            val bmp = Bitmap.createBitmap(texW, texH, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = fontSize * PIXELS_PER_METER
                isFakeBoldText = false
            }
            val layout = StaticLayout.Builder
                .obtain(text, 0, text.length, paint, texW)
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .setIncludePad(true)
                .build()
            val startY = ((texH - layout.height) / 2f).coerceAtLeast(0f)
            canvas.save()
            canvas.translate(0f, startY)
            layout.draw(canvas)
            canvas.restore()
            GlTextures.upload(tex, bmp)
            bmp.recycle()
        } catch (t: Throwable) {
            MLog.w("TextRenderer", "failed to rasterise text: ${t.message}")
        }

        cache[key] = Entry(tex, key)
        if (cache.size > 256) {
            val it = cache.iterator()
            it.next(); it.remove()
        }
        return tex
    }

    fun dispose() {
        for (e in cache.values) GlTextures.delete(e.texture)
        cache.clear()
    }
}
