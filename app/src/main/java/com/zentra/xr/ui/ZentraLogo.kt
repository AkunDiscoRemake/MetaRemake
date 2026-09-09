package com.zentra.xr.ui

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.cos
import kotlin.math.sin

/**
 * Zentra XR mark: an orbital ring with a bright node and a geometric "Z" core.
 * Drawn procedurally so it is razor sharp at any size, in VR and on the launcher.
 */
object ZentraLogo {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val rect = RectF()

    private const val GAP_START_DEG = -35.5f
    private const val GAP_END_DEG = -6.9f
    private const val RING_RADIUS = 0.355f

    /**
     * @param size    full size of the mark in pixels
     * @param color   ink colour
     * @param ring    0..1 ring draw-in progress
     * @param glyph   0..1 glyph draw-in progress
     */
    fun draw(c: Canvas, size: Float, color: Int, ring: Float = 1f, glyph: Float = 1f, alpha: Float = 1f) {
        paint.color = color
        paint.alpha = (255 * alpha.coerceIn(0f, 1f)).toInt()
        paint.shader = null

        val cx = size * 0.5f
        val cy = size * 0.5f
        val s = size

        // ---- orbital ring -------------------------------------------------
        val r = s * RING_RADIUS
        if (ring > 0.001f) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = s * 0.058f
            rect.set(cx - r, cy - r, cx + r, cy + r)
            val gap = GAP_END_DEG - GAP_START_DEG   // 28.6 degrees of empty orbit
            val sweep = (360f - gap) * ring
            c.drawArc(rect, GAP_END_DEG, sweep, false, paint)
        }

        // ---- orbital nodes ------------------------------------------------
        paint.style = Paint.Style.FILL
        val a0 = Math.toRadians(GAP_END_DEG.toDouble()).toFloat()
        val a1 = Math.toRadians(GAP_START_DEG.toDouble()).toFloat()
        if (ring > 0.9f) {
            c.drawCircle(cx + cos(a0.toDouble()).toFloat() * r, cy + sin(a0.toDouble()).toFloat() * r,
                s * 0.036f, paint)
            c.drawCircle(cx + cos(a1.toDouble()).toFloat() * r, cy + sin(a1.toDouble()).toFloat() * r,
                s * 0.026f, paint)
        }

        // ---- the Z --------------------------------------------------------
        if (glyph <= 0.001f) return
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = s * 0.088f
        val hw = s * 0.185f
        val top = cy - s * 0.185f
        val bottom = cy + s * 0.185f

        val appear = glyph.coerceIn(0f, 1f)
        val bars = (appear / 0.55f).coerceIn(0f, 1f)
        val diag = ((appear - 0.35f) / 0.65f).coerceIn(0f, 1f)

        if (bars > 0f) {
            val w = hw * bars
            c.drawLine(cx - w, top, cx + w, top, paint)
            c.drawLine(cx - w, bottom, cx + w, bottom, paint)
        }
        if (diag > 0f) {
            val x0 = cx + hw
            val y0 = top
            val x1 = cx - hw
            val y1 = bottom
            c.drawLine(x0, y0, x0 + (x1 - x0) * diag, y0 + (y1 - y0) * diag, paint)
        }
    }

    /** Text badge: the mark followed by the wordmark. */
    fun drawWordmark(c: Canvas, size: Float, color: Int, textAlpha: Float = 1f) {
        draw(c, size, color)
        paint.style = Paint.Style.FILL
        paint.color = color
        paint.alpha = (255 * textAlpha).toInt()
        paint.textSize = size * 0.30f
        paint.letterSpacing = 0.22f
        val fm = paint.fontMetrics
        val baseline = size * 0.5f - (fm.ascent + fm.descent) * 0.5f
        c.drawText("ZENTRA", size * 1.02f, baseline, paint)
        paint.letterSpacing = 0f
        paint.alpha = 255
    }

    fun tint(color: Int) {
        paint.color = color
    }

    fun defaultInk(): Int = Color.WHITE
}
