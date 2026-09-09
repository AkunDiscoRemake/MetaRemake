package com.zentra.xr.ui

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import com.zentra.xr.core.TextKit
import com.zentra.xr.core.Texture
import kotlin.math.cos
import kotlin.math.sin

enum class Icon {
    HOME, GAMES, APPS, WEB_APPS, BROWSER, SETTINGS, GALLERY, VIDEO, THEATER, MUSIC,
    VIEWER, CLOCK, DEMO, TARGET, SPACE, BLOCKS, BACK, FORWARD, RELOAD, STAR, FAVORITE,
    CLOSE, PLUS, CHECK, PLAY, PAUSE, NEXT, PREV, SEARCH, KEYBOARD, HAND, INFO,
    CHEVRON_LEFT, CHEVRON_RIGHT, SHIFT, DELETE, ENTER, GRID, SPARKLE, CUBE,
    ARROW_UP, ARROW_DOWN, CAMERA, THERMAL, BATTERY, FOLDER, SPEED, EYE, LINK, DOWNLOAD
}

/**
 * Every icon is drawn with vector paths on a canvas and cached as a GPU texture:
 * razor sharp, themeable by tint, and zero binary assets in the APK.
 */
object Icons {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = Color.WHITE
    }
    private val rect = RectF()
    private val path = Path()

    fun texture(kit: TextKit, icon: Icon): Texture =
        kit.art("ic:${icon.name}", 128) { canvas, size -> draw(canvas, size, icon) }

    fun draw(c: Canvas, size: Int, icon: Icon) {
        val s = size.toFloat()
        paint.reset()
        paint.isAntiAlias = true
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = Color.WHITE
        paint.strokeWidth = s * 0.072f

        val m = s * 0.16f
        val w = s - m * 2f
        fun X(v: Float) = m + v * w
        fun Y(v: Float) = m + v * w
        val L = X(0f)
        val R = X(1f)
        val T = Y(0f)
        val B = Y(1f)
        val M = Y(0.5f)
        val CX = s * 0.5f
        val CY = s * 0.5f
        val RAD = w * 0.44f

        when (icon) {
            Icon.HOME -> {
                path.rewind()
                path.moveTo(CX, T)
                path.lineTo(R, M)
                path.lineTo(R - w * 0.06f, M)
                path.lineTo(R - w * 0.06f, B)
                path.lineTo(L + w * 0.06f, B)
                path.lineTo(L + w * 0.06f, M)
                path.lineTo(L, M)
                path.close()
                c.drawPath(path, paint)
            }
            Icon.GAMES -> {
                rect.set(L, Y(0.25f), R, Y(0.78f))
                c.drawRoundRect(rect, w * 0.22f, w * 0.22f, paint)
                c.drawLine(X(0.28f), Y(0.42f), X(0.42f), Y(0.42f), paint)
                c.drawLine(X(0.35f), Y(0.35f), X(0.35f), Y(0.49f), paint)
                c.drawCircle(X(0.64f), Y(0.42f), s * 0.026f, paint)
                c.drawCircle(X(0.74f), Y(0.55f), s * 0.026f, paint)
            }
            Icon.APPS, Icon.GRID -> {
                for (i in 0..1) for (j in 0..1) {
                    rect.set(
                        X(0.05f + i * 0.52f), Y(0.05f + j * 0.52f),
                        X(0.45f + i * 0.52f), Y(0.45f + j * 0.52f)
                    )
                    c.drawRoundRect(rect, w * 0.1f, w * 0.1f, paint)
                }
            }
            Icon.WEB_APPS -> {
                rect.set(L, T, R, B)
                c.drawRoundRect(rect, w * 0.2f, w * 0.2f, paint)
                c.drawLine(CX, Y(0.28f), CX, Y(0.72f), paint)
                c.drawLine(X(0.28f), CY, X(0.72f), CY, paint)
            }
            Icon.BROWSER -> {
                c.drawCircle(CX, CY, RAD, paint)
                c.drawLine(X(0.06f), CY, X(0.94f), CY, paint)
                path.rewind()
                path.moveTo(CX, T)
                path.cubicTo(X(0.24f), CY, X(0.76f), CY, CX, B)
                c.drawPath(path, paint)
                path.rewind()
                path.moveTo(CX, T)
                path.cubicTo(X(0.76f), CY, X(0.24f), CY, CX, B)
                c.drawPath(path, paint)
            }
            Icon.SETTINGS -> {
                c.drawCircle(CX, CY, RAD * 0.42f, paint)
                paint.strokeWidth = s * 0.06f
                for (i in 0 until 8) {
                    val a = i * Math.PI / 4.0
                    c.drawLine(
                        CX + cos(a).toFloat() * RAD * 0.62f,
                        CY + sin(a).toFloat() * RAD * 0.62f,
                        CX + cos(a).toFloat() * RAD,
                        CY + sin(a).toFloat() * RAD,
                        paint
                    )
                }
                paint.strokeWidth = s * 0.072f
            }
            Icon.GALLERY -> {
                rect.set(L, Y(0.18f), R, Y(0.86f))
                c.drawRoundRect(rect, w * 0.1f, w * 0.1f, paint)
                c.drawCircle(X(0.28f), Y(0.36f), w * 0.09f, paint)
                path.rewind()
                path.moveTo(L + w * 0.04f, Y(0.82f))
                path.lineTo(X(0.36f), Y(0.5f))
                path.lineTo(X(0.6f), Y(0.74f))
                path.lineTo(X(0.74f), Y(0.6f))
                path.lineTo(R - w * 0.04f, Y(0.82f))
                c.drawPath(path, paint)
            }
            Icon.VIDEO -> {
                rect.set(L, Y(0.2f), R, Y(0.84f))
                c.drawRoundRect(rect, w * 0.12f, w * 0.12f, paint)
                path.rewind()
                path.moveTo(X(0.38f), Y(0.38f))
                path.lineTo(X(0.68f), Y(0.52f))
                path.lineTo(X(0.38f), Y(0.66f))
                path.close()
                paint.style = Paint.Style.FILL
                c.drawPath(path, paint)
                paint.style = Paint.Style.STROKE
            }
            Icon.THEATER -> {
                path.rewind()
                path.moveTo(X(0.1f), Y(0.22f))
                path.quadTo(CX, Y(0.06f), X(0.9f), Y(0.22f))
                c.drawPath(path, paint)
                rect.set(X(0.1f), Y(0.28f), X(0.9f), Y(0.66f))
                c.drawRoundRect(rect, w * 0.06f, w * 0.06f, paint)
                for (i in 0..2) {
                    c.drawLine(X(0.24f + i * 0.26f), Y(0.78f), X(0.24f + i * 0.26f), Y(0.94f), paint)
                    c.drawCircle(X(0.24f + i * 0.26f), Y(0.76f), s * 0.028f, paint)
                }
            }
            Icon.MUSIC -> {
                c.drawCircle(X(0.32f), Y(0.72f), w * 0.16f, paint)
                c.drawLine(X(0.48f), Y(0.72f), X(0.48f), Y(0.16f), paint)
                path.rewind()
                path.moveTo(X(0.48f), Y(0.16f))
                path.quadTo(X(0.78f), Y(0.24f), X(0.76f), Y(0.44f))
                c.drawPath(path, paint)
            }
            Icon.CUBE, Icon.VIEWER -> {
                val hw = w * 0.34f
                val hh = w * 0.2f
                // top face
                path.rewind()
                path.moveTo(CX, CY - hh * 1.6f)
                path.lineTo(CX + hw, CY - hh * 0.4f)
                path.lineTo(CX, CY + hh * 0.8f)
                path.lineTo(CX - hw, CY - hh * 0.4f)
                path.close()
                c.drawPath(path, paint)
                c.drawLine(CX - hw, CY - hh * 0.4f, CX - hw, CY + hh * 1.0f, paint)
                c.drawLine(CX + hw, CY - hh * 0.4f, CX + hw, CY + hh * 1.0f, paint)
                c.drawLine(CX, CY + hh * 0.8f, CX, CY + hh * 2.2f, paint)
                c.drawLine(CX - hw, CY + hh * 1.0f, CX, CY + hh * 2.2f, paint)
                c.drawLine(CX + hw, CY + hh * 1.0f, CX, CY + hh * 2.2f, paint)
            }
            Icon.CLOCK -> {
                c.drawCircle(CX, CY, RAD, paint)
                c.drawLine(CX, CY, CX, CY - RAD * 0.6f, paint)
                c.drawLine(CX, CY, CX + RAD * 0.45f, CY + RAD * 0.2f, paint)
            }
            Icon.DEMO, Icon.SPARKLE -> {
                path.rewind()
                path.moveTo(CX, T)
                path.quadTo(CX + w * 0.08f, CY - w * 0.08f, R, CY)
                path.quadTo(CX + w * 0.08f, CY + w * 0.08f, CX, B)
                path.quadTo(CX - w * 0.08f, CY + w * 0.08f, L, CY)
                path.quadTo(CX - w * 0.08f, CY - w * 0.08f, CX, T)
                c.drawPath(path, paint)
                c.drawCircle(X(0.82f), Y(0.16f), s * 0.03f, paint)
                c.drawCircle(X(0.14f), Y(0.86f), s * 0.022f, paint)
            }
            Icon.TARGET -> {
                c.drawCircle(CX, CY, RAD, paint)
                c.drawCircle(CX, CY, RAD * 0.6f, paint)
                c.drawCircle(CX, CY, RAD * 0.22f, paint)
                paint.style = Paint.Style.FILL
                c.drawCircle(CX, CY, s * 0.026f, paint)
                paint.style = Paint.Style.STROKE
            }
            Icon.SPACE -> {
                c.drawCircle(CX, CY + w * 0.06f, RAD * 0.62f, paint)
                path.rewind()
                path.moveTo(X(0.02f), CY + w * 0.14f)
                path.quadTo(CX, CY + w * 0.46f, X(0.98f), CY + w * 0.14f)
                c.drawPath(path, paint)
                c.drawCircle(X(0.78f), Y(0.2f), s * 0.022f, paint)
                c.drawCircle(X(0.2f), Y(0.3f), s * 0.018f, paint)
            }
            Icon.BLOCKS -> {
                val u = w * 0.3f
                for (i in 0..2) {
                    val ox = CX - u * 1.5f + i * u
                    val oy = CY + u * 0.4f - i * u * 0.55f
                    rect.set(ox, oy, ox + u * 0.92f, oy + u * 0.92f)
                    c.drawRoundRect(rect, u * 0.16f, u * 0.16f, paint)
                }
            }
            Icon.BACK -> {
                c.drawLine(X(0.78f), Y(0.16f), X(0.22f), CY, paint)
                c.drawLine(X(0.22f), CY, X(0.78f), Y(0.84f), paint)
            }
            Icon.FORWARD -> {
                c.drawLine(X(0.22f), Y(0.16f), X(0.78f), CY, paint)
                c.drawLine(X(0.78f), CY, X(0.22f), Y(0.84f), paint)
            }
            Icon.RELOAD -> {
                rect.set(L, T, R, B)
                c.drawArc(rect, 40f, 300f, false, paint)
                path.rewind()
                path.moveTo(X(0.86f), Y(0.28f))
                path.lineTo(X(0.94f), Y(0.16f))
                path.lineTo(X(0.7f), Y(0.12f))
                c.drawPath(path, paint)
            }
            Icon.STAR, Icon.FAVORITE -> {
                starPath(c, CX, CY, RAD, 5, icon == Icon.FAVORITE)
            }
            Icon.CLOSE -> {
                c.drawLine(L, T, R, B, paint)
                c.drawLine(R, T, L, B, paint)
            }
            Icon.PLUS -> {
                c.drawLine(CX, T, CX, B, paint)
                c.drawLine(L, CY, R, CY, paint)
            }
            Icon.CHECK -> {
                path.rewind()
                path.moveTo(X(0.12f), Y(0.52f))
                path.lineTo(X(0.4f), Y(0.8f))
                path.lineTo(X(0.9f), Y(0.2f))
                c.drawPath(path, paint)
            }
            Icon.PLAY -> {
                path.rewind()
                path.moveTo(X(0.26f), Y(0.14f))
                path.lineTo(X(0.88f), CY)
                path.lineTo(X(0.26f), Y(0.86f))
                path.close()
                paint.style = Paint.Style.FILL
                c.drawPath(path, paint)
                paint.style = Paint.Style.STROKE
            }
            Icon.PAUSE -> {
                c.drawLine(X(0.34f), Y(0.16f), X(0.34f), Y(0.84f), paint)
                c.drawLine(X(0.66f), Y(0.16f), X(0.66f), Y(0.84f), paint)
            }
            Icon.NEXT -> {
                path.rewind()
                path.moveTo(X(0.2f), Y(0.16f))
                path.lineTo(X(0.66f), CY)
                path.lineTo(X(0.2f), Y(0.84f))
                path.close()
                paint.style = Paint.Style.FILL
                c.drawPath(path, paint)
                paint.style = Paint.Style.STROKE
                c.drawLine(X(0.82f), Y(0.16f), X(0.82f), Y(0.84f), paint)
            }
            Icon.PREV -> {
                path.rewind()
                path.moveTo(X(0.8f), Y(0.16f))
                path.lineTo(X(0.34f), CY)
                path.lineTo(X(0.8f), Y(0.84f))
                path.close()
                paint.style = Paint.Style.FILL
                c.drawPath(path, paint)
                paint.style = Paint.Style.STROKE
                c.drawLine(X(0.18f), Y(0.16f), X(0.18f), Y(0.84f), paint)
            }
            Icon.SEARCH -> {
                c.drawCircle(X(0.4f), Y(0.38f), RAD * 0.52f, paint)
                c.drawLine(X(0.72f), Y(0.7f), X(0.96f), Y(0.94f), paint)
            }
            Icon.KEYBOARD -> {
                rect.set(L, Y(0.26f), R, Y(0.82f))
                c.drawRoundRect(rect, w * 0.1f, w * 0.1f, paint)
                for (i in 0..2) c.drawLine(X(0.32f + i * 0.18f), Y(0.42f), X(0.32f + i * 0.18f), Y(0.66f), paint)
                c.drawLine(X(0.18f), Y(0.18f), X(0.82f), Y(0.18f), paint)
            }
            Icon.HAND -> {
                // pointing hand, simplified
                rect.set(X(0.3f), Y(0.42f), X(0.72f), B)
                c.drawRoundRect(rect, w * 0.14f, w * 0.14f, paint)
                rect.set(X(0.3f), Y(0.06f), X(0.46f), Y(0.5f))
                c.drawRoundRect(rect, w * 0.09f, w * 0.09f, paint)
                c.drawLine(X(0.46f), Y(0.3f), X(0.58f), Y(0.3f), paint)
                c.drawLine(X(0.56f), Y(0.3f), X(0.56f), Y(0.16f), paint)
                c.drawLine(X(0.58f), Y(0.16f), X(0.72f), Y(0.16f), paint)
                c.drawLine(X(0.72f), Y(0.16f), X(0.72f), Y(0.42f), paint)
            }
            Icon.INFO -> {
                c.drawCircle(CX, CY, RAD, paint)
                c.drawLine(CX, Y(0.3f), CX, Y(0.34f), paint)
                c.drawLine(CX, Y(0.46f), CX, Y(0.74f), paint)
            }
            Icon.CHEVRON_LEFT -> {
                c.drawLine(X(0.66f), Y(0.14f), X(0.3f), CY, paint)
                c.drawLine(X(0.3f), CY, X(0.66f), Y(0.86f), paint)
            }
            Icon.CHEVRON_RIGHT -> {
                c.drawLine(X(0.34f), Y(0.14f), X(0.7f), CY, paint)
                c.drawLine(X(0.7f), CY, X(0.34f), Y(0.86f), paint)
            }
            Icon.SHIFT -> {
                path.rewind()
                path.moveTo(CX, Y(0.14f))
                path.lineTo(X(0.86f), Y(0.5f))
                path.lineTo(X(0.62f), Y(0.5f))
                path.lineTo(X(0.62f), Y(0.86f))
                path.lineTo(X(0.38f), Y(0.86f))
                path.lineTo(X(0.38f), Y(0.5f))
                path.lineTo(X(0.14f), Y(0.5f))
                path.close()
                c.drawPath(path, paint)
            }
            Icon.DELETE -> {
                path.rewind()
                path.moveTo(X(0.24f), Y(0.2f))
                path.lineTo(X(0.94f), Y(0.2f))
                path.lineTo(X(0.84f), Y(0.84f))
                path.lineTo(X(0.34f), Y(0.84f))
                path.close()
                c.drawPath(path, paint)
                c.drawLine(X(0.24f), Y(0.2f), X(0.1f), CY, paint)
                c.drawLine(X(0.1f), CY, X(0.24f), Y(0.84f), paint)
            }
            Icon.ENTER -> {
                c.drawLine(X(0.82f), Y(0.16f), X(0.82f), Y(0.6f), paint)
                c.drawLine(X(0.82f), Y(0.6f), X(0.26f), Y(0.6f), paint)
                path.rewind()
                path.moveTo(X(0.42f), Y(0.38f))
                path.lineTo(X(0.2f), Y(0.6f))
                path.lineTo(X(0.42f), Y(0.82f))
                c.drawPath(path, paint)
            }
            Icon.ARROW_UP -> {
                c.drawLine(CX, Y(0.86f), CX, Y(0.16f), paint)
                path.rewind()
                path.moveTo(X(0.26f), Y(0.36f))
                path.lineTo(CX, Y(0.14f))
                path.lineTo(X(0.74f), Y(0.36f))
                c.drawPath(path, paint)
            }
            Icon.ARROW_DOWN -> {
                c.drawLine(CX, Y(0.14f), CX, Y(0.86f), paint)
                path.rewind()
                path.moveTo(X(0.26f), Y(0.64f))
                path.lineTo(CX, Y(0.86f))
                path.lineTo(X(0.74f), Y(0.64f))
                c.drawPath(path, paint)
            }
            Icon.CAMERA -> {
                rect.set(L, Y(0.26f), R, Y(0.82f))
                c.drawRoundRect(rect, w * 0.1f, w * 0.1f, paint)
                c.drawCircle(CX, CY, w * 0.16f, paint)
                path.rewind()
                path.moveTo(X(0.34f), Y(0.26f))
                path.lineTo(X(0.42f), Y(0.14f))
                path.lineTo(X(0.58f), Y(0.14f))
                path.lineTo(X(0.66f), Y(0.26f))
                c.drawPath(path, paint)
            }
            Icon.THERMAL -> {
                rect.set(X(0.4f), Y(0.1f), X(0.6f), Y(0.62f))
                c.drawRoundRect(rect, w * 0.08f, w * 0.08f, paint)
                c.drawCircle(CX, Y(0.76f), w * 0.14f, paint)
            }
            Icon.BATTERY -> {
                rect.set(L, Y(0.32f), X(0.86f), Y(0.68f))
                c.drawRoundRect(rect, w * 0.06f, w * 0.06f, paint)
                c.drawLine(X(0.9f), Y(0.42f), X(0.9f), Y(0.58f), paint)
                paint.style = Paint.Style.FILL
                c.drawRect(RectF(X(0.12f), Y(0.4f), X(0.6f), Y(0.6f)), paint)
                paint.style = Paint.Style.STROKE
            }
            Icon.FOLDER -> {
                path.rewind()
                path.moveTo(L, Y(0.74f))
                path.lineTo(L, Y(0.28f))
                path.lineTo(X(0.4f), Y(0.28f))
                path.lineTo(X(0.5f), Y(0.4f))
                path.lineTo(R, Y(0.4f))
                path.lineTo(R, Y(0.74f))
                path.close()
                c.drawPath(path, paint)
            }
            Icon.SPEED -> {
                rect.set(L, T, R, B)
                c.drawArc(rect, 150f, 240f, false, paint)
                c.drawLine(CX, CY, X(0.76f), Y(0.34f), paint)
                paint.style = Paint.Style.FILL
                c.drawCircle(CX, CY, s * 0.03f, paint)
                paint.style = Paint.Style.STROKE
            }
            Icon.EYE -> {
                path.rewind()
                path.moveTo(L, CY)
                path.quadTo(CX, Y(0.06f), R, CY)
                path.quadTo(CX, Y(0.94f), L, CY)
                c.drawPath(path, paint)
                c.drawCircle(CX, CY, w * 0.16f, paint)
            }
            Icon.LINK -> {
                rect.set(X(0.14f), Y(0.44f), X(0.5f), Y(0.8f))
                c.drawRoundRect(rect, w * 0.1f, w * 0.1f, paint)
                rect.set(X(0.5f), Y(0.2f), X(0.86f), Y(0.56f))
                c.drawRoundRect(rect, w * 0.1f, w * 0.1f, paint)
            }
            Icon.DOWNLOAD -> {
                c.drawLine(CX, Y(0.14f), CX, Y(0.62f), paint)
                path.rewind()
                path.moveTo(X(0.26f), Y(0.44f))
                path.lineTo(CX, Y(0.68f))
                path.lineTo(X(0.74f), Y(0.44f))
                c.drawPath(path, paint)
                c.drawLine(X(0.16f), Y(0.84f), X(0.84f), Y(0.84f), paint)
            }
        }
    }

    private fun starPath(c: Canvas, cx: Float, cy: Float, r: Float, points: Int, filled: Boolean) {
        path.rewind()
        val inner = r * 0.44f
        for (i in 0 until points * 2) {
            val radius = if (i % 2 == 0) r else inner
            val a = (i * Math.PI / points) - Math.PI / 2
            val x = cx + cos(a).toFloat() * radius
            val y = cy + sin(a).toFloat() * radius
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close()
        if (filled) {
            paint.style = Paint.Style.FILL
            c.drawPath(path, paint)
            paint.style = Paint.Style.STROKE
        } else {
            c.drawPath(path, paint)
        }
    }
}
