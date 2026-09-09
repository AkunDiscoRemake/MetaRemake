package com.zentra.xr.ui

import kotlin.math.roundToInt

/**
 * Zentra XR visual language: monochrome, high contrast, deep space.
 * Every colour used by the renderer, the widgets and the 2D surfaces comes from here,
 * so switching Dark <-> Light mode re-skins the entire platform consistently.
 */
class Palette {

    // environment
    var skyTop: Int = 0
    var skyBottom: Int = 0
    var skyHorizon: Int = 0
    var gridColor: Int = 0

    // surfaces
    var panelTop: Int = 0
    var panelBottom: Int = 0
    var panelBorder: Int = 0
    var cardTop: Int = 0
    var cardBottom: Int = 0
    var cardBorder: Int = 0
    var raisedTop: Int = 0
    var raisedBottom: Int = 0

    // ink
    var text: Int = 0
    var textDim: Int = 0
    var textFaint: Int = 0
    var accent: Int = 0
    var accentSoft: Int = 0

    // depth
    var shadow: Int = 0
    var glow: Int = 0

    var isLight: Boolean = false

    fun copyFrom(o: Palette) {
        skyTop = o.skyTop
        skyBottom = o.skyBottom
        skyHorizon = o.skyHorizon
        gridColor = o.gridColor
        panelTop = o.panelTop
        panelBottom = o.panelBottom
        panelBorder = o.panelBorder
        cardTop = o.cardTop
        cardBottom = o.cardBottom
        cardBorder = o.cardBorder
        raisedTop = o.raisedTop
        raisedBottom = o.raisedBottom
        text = o.text
        textDim = o.textDim
        textFaint = o.textFaint
        accent = o.accent
        accentSoft = o.accentSoft
        shadow = o.shadow
        glow = o.glow
        isLight = o.isLight
    }

    fun lerp(a: Palette, b: Palette, t: Float) {
        skyTop = lerpArgb(a.skyTop, b.skyTop, t)
        skyBottom = lerpArgb(a.skyBottom, b.skyBottom, t)
        skyHorizon = lerpArgb(a.skyHorizon, b.skyHorizon, t)
        gridColor = lerpArgb(a.gridColor, b.gridColor, t)
        panelTop = lerpArgb(a.panelTop, b.panelTop, t)
        panelBottom = lerpArgb(a.panelBottom, b.panelBottom, t)
        panelBorder = lerpArgb(a.panelBorder, b.panelBorder, t)
        cardTop = lerpArgb(a.cardTop, b.cardTop, t)
        cardBottom = lerpArgb(a.cardBottom, b.cardBottom, t)
        cardBorder = lerpArgb(a.cardBorder, b.cardBorder, t)
        raisedTop = lerpArgb(a.raisedTop, b.raisedTop, t)
        raisedBottom = lerpArgb(a.raisedBottom, b.raisedBottom, t)
        text = lerpArgb(a.text, b.text, t)
        textDim = lerpArgb(a.textDim, b.textDim, t)
        textFaint = lerpArgb(a.textFaint, b.textFaint, t)
        accent = lerpArgb(a.accent, b.accent, t)
        accentSoft = lerpArgb(a.accentSoft, b.accentSoft, t)
        shadow = lerpArgb(a.shadow, b.shadow, t)
        glow = lerpArgb(a.glow, b.glow, t)
        isLight = if (t > 0.5f) b.isLight else a.isLight
    }

    companion object {
        fun lerpArgb(a: Int, b: Int, t: Float): Int {
            val ar = (a ushr 16) and 0xFF
            val ag = (a ushr 8) and 0xFF
            val ab = a and 0xFF
            val aa = (a ushr 24) and 0xFF
            val br = (b ushr 16) and 0xFF
            val bg = (b ushr 8) and 0xFF
            val bb = b and 0xFF
            val ba = (b ushr 24) and 0xFF
            val r = (ar + (br - ar) * t).roundToInt()
            val g = (ag + (bg - ag) * t).roundToInt()
            val bl = (ab + (bb - ab) * t).roundToInt()
            val al = (aa + (ba - aa) * t).roundToInt()
            return (al shl 24) or (r shl 16) or (g shl 8) or bl
        }
    }
}

object Themes {

    val dark = Palette().apply {
        skyTop = 0xFF05070C.toInt()
        skyBottom = 0xFF010204.toInt()
        skyHorizon = 0xFF0C131C.toInt()
        gridColor = 0x2BFFFFFF
        panelTop = 0xF214181F.toInt()
        panelBottom = 0xF20A0D13.toInt()
        panelBorder = 0x1FFFFFFF
        cardTop = 0xF61A2029.toInt()
        cardBottom = 0xF60E1219.toInt()
        cardBorder = 0x26FFFFFF
        raisedTop = 0xF8232A35.toInt()
        raisedBottom = 0xF8141A22.toInt()
        text = 0xFFFFFFFF.toInt()
        textDim = 0x9EFFFFFF.toInt()
        textFaint = 0x5CFFFFFF.toInt()
        accent = 0xFFFFFFFF.toInt()
        accentSoft = 0x33FFFFFF
        shadow = 0x99000000.toInt()
        glow = 0x66FFFFFF
        isLight = false
    }

    val light = Palette().apply {
        skyTop = 0xFFF4F6F9.toInt()
        skyBottom = 0xFFD9DFE8.toInt()
        skyHorizon = 0xFFFFFFFF.toInt()
        gridColor = 0x24000000
        panelTop = 0xF8FFFFFF.toInt()
        panelBottom = 0xF8F1F4F8.toInt()
        panelBorder = 0x1A000000
        cardTop = 0xFBFFFFFF.toInt()
        cardBottom = 0xFBEDF1F6.toInt()
        cardBorder = 0x1F000000
        raisedTop = 0xFFFFFFFF.toInt()
        raisedBottom = 0xFFF6F8FB.toInt()
        text = 0xFF0A0C11.toInt()
        textDim = 0x9E0A0C11.toInt()
        textFaint = 0x5C0A0C11.toInt()
        accent = 0xFF0A0C11.toInt()
        accentSoft = 0x330A0C11
        shadow = 0x47141A22
        glow = 0x26000000
        isLight = true
    }
}

/** Live theme with a smooth cross fade when the mode changes. */
class ThemeController {
    val current = Palette().apply { copyFrom(Themes.dark) }
    private val from = Palette()
    private val to = Palette()

    var blend = 1f
        private set

    fun setMode(light: Boolean, instant: Boolean = false) {
        val target = if (light) Themes.light else Themes.dark
        if (instant) {
            current.copyFrom(target)
            blend = 1f
            return
        }
        if (target.isLight == current.isLight && blend >= 1f) return
        from.copyFrom(current)
        to.copyFrom(target)
        blend = 0f
    }

    fun update(dt: Float) {
        if (blend < 1f) {
            blend = (blend + dt / 0.45f).coerceAtMost(1f)
            current.lerp(from, to, blend)
        }
    }
}
