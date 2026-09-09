package com.zentra.xr.ui

import android.opengl.Matrix
import com.zentra.xr.core.Mat
import com.zentra.xr.core.Texture
import com.zentra.xr.core.Vec2
import com.zentra.xr.core.Vec3
import com.zentra.xr.xr.PanelStyle
import com.zentra.xr.xr.VrRenderer
import kotlin.math.abs
import kotlin.math.max

/** Shared drawing/animation state handed to every widget. */
class UiContext {
    lateinit var theme: Palette
    lateinit var renderer: VrRenderer
    var dt = 0f
    var time = 0f
    var animations = true
    var uiScale = 1f
    var haptic: (Long) -> Unit = {}

    fun tap(strength: Long = 12L) {
        if (strength > 0) haptic(strength)
    }
}

/** Result of a hit test against the widget tree. */
class Hit {
    var widget: Widget? = null
    var signedDepth = 0f
    var best = Float.MAX_VALUE
    val local = Vec3()

    fun consider(candidate: Widget, depth: Float): Boolean {
        val score = abs(depth)
        if (score < best) {
            best = score
            widget = candidate
            signedDepth = depth
            return true
        }
        return false
    }

    fun reset() {
        widget = null
        best = Float.MAX_VALUE
        signedDepth = 0f
    }
}

/**
 * Base class of every floating 3D element.
 * Widgets live in the local space of their parent; their world matrix is refreshed once
 * per frame (not once per eye) so both eye passes are always identical.
 */
abstract class Widget(protected val ctx: UiContext) {

    val pos = Vec3()
    val size = Vec2()
    val local = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    val world = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    val children = ArrayList<Widget>(4)

    var visible = true
    var alpha = 1f
    var hover = 0f
    var press = 0f
    var enabled = true
    var interactive = true
    var scale = 1f
    var zLift = 0f
    var rotX = 0f
    var rotY = 0f
    var id: String = ""
    var tag: Any? = null

    /** Extra reach margin for direct touch (meters). */
    var touchPad = 0.004f

    /** How far in front of the surface the finger is still considered as touching. */
    var contact = 0.016f
    var release = 0.040f

    /** Z offset applied to the children (keeps text above the panel surface). */
    var childZ = 0f

    private var wasPressed = false
    private val localProbe = Vec3()

    open fun add(child: Widget): Widget {
        children.add(child)
        return this
    }

    open fun updateWorld(parent: FloatArray) {
        Matrix.setIdentityM(local, 0)
        Matrix.translateM(local, 0, pos.x, pos.y, pos.z + zLift)
        if (rotY != 0f) Matrix.rotateM(local, 0, rotY, 0f, 1f, 0f)
        if (rotX != 0f) Matrix.rotateM(local, 0, rotX, 1f, 0f, 0f)
        if (scale != 1f) Matrix.scaleM(local, 0, scale, scale, scale)
        Matrix.multiplyMM(world, 0, parent, 0, local, 0)
        for (i in children.indices) children[i].updateWorld(world)
    }

    open fun update(dt: Float) {
        for (i in children.indices) children[i].update(dt)
    }

    open fun draw(r: VrRenderer) {
        if (!visible || alpha <= 0.003f) return
        r.push()
        r.multiply(local)
        drawSelf(r)
        if (children.isNotEmpty()) {
            if (childZ != 0f) r.translate(0f, 0f, childZ)
            for (i in children.indices) children[i].draw(r)
        }
        r.pop()
    }

    /** Draws only this widget. The transform of the widget is already applied. */
    open fun drawSelf(r: VrRenderer) = Unit

    /** Local space hit test. [p] is the fingertip in widget local coordinates. */
    open fun hitLocal(p: Vec3, hit: Hit) {
        val halfW = size.x * 0.5f + touchPad
        val halfH = size.y * 0.5f + touchPad
        if (abs(p.x) <= halfW && abs(p.y) <= halfH) {
            hit.consider(this, p.z)
        }
    }

    /** World space entry point. */
    fun hitTest(point: Vec3, hit: Hit) {
        if (!visible || !interactive || !enabled) return
        if (!Mat.inverseTransformPoint(world, point, localProbe)) return
        hitLocal(localProbe, hit)
    }

    fun setHover(hovered: Boolean) {
        val target = if (hovered) 1f else 0f
        hover = if (ctx.animations) {
            hover + (target - hover) * approach(ctx.dt, 0.07f)
        } else target
    }

    private fun approach(dt: Float, tau: Float): Float = (dt / tau).coerceIn(0f, 1f)

    /** @return true when this frame produced a click. */
    fun setTouch(depth: Float, hovered: Boolean): Boolean {
        setHover(hovered)
        val pressed = hovered && depth < contact && depth > -0.06f
        val target = if (pressed) 1f else 0f
        press = if (ctx.animations) {
            press + (target - press) * approach(ctx.dt, 0.04f)
        } else target
        var clicked = false
        if (pressed && !wasPressed) {
            clicked = true
            ctx.tap(14L)
            onClick()
        }
        wasPressed = pressed
        return clicked
    }

    open fun onClick() {}

    /** Fades the hover/press state out (called when the finger is somewhere else). */
    open fun release() {
        if (hover > 0.001f || press > 0.001f || wasPressed) {
            setHover(false)
            press += (0f - press) * approach(ctx.dt, 0.05f)
            wasPressed = false
        }
    }

    /** Distance from the widget plane to the point (positive = in front). */
    fun depthOf(point: Vec3): Float {
        if (!Mat.inverseTransformPoint(world, point, localProbe)) return Float.MAX_VALUE
        return localProbe.z
    }

    fun localPoint(point: Vec3, out: Vec3): Boolean = Mat.inverseTransformPoint(world, point, out)
}

/** Rounded floating surface: the base of buttons, cards, windows and menus. */
open class Panel3D(ctx: UiContext, width: Float = 0.2f, height: Float = 0.12f) : Widget(ctx) {

    val style = PanelStyle()
    var fillTop = 0
    var fillBottom = 0
    var borderColor = 0
    var borderWidth = 0f
    var radius = 0.018f
    var shadowStrength = 0f
    var shadowSize = 0.06f
    var glowStrength = 0f
    var glowColor = 0
    var contentOffset = 0.0016f

    init {
        size.set(width, height)
    }

    override fun drawSelf(r: VrRenderer) {
        style.surface(fillTop, fillBottom, radius)
        if (borderWidth > 0f) style.stroke(borderColor, borderWidth)
        if (shadowStrength > 0f) style.dropShadow(ctx.theme.shadow, shadowSize, shadowStrength)
        if (glowStrength > 0f) style.halo(glowColor, glowStrength)
        r.panel(size.x, size.y, style, alpha)
        childZ = contentOffset
    }
}

/** A panel that reacts to the fingertip: lifts on hover, sinks when touched. */
open class Button3D(
    ctx: UiContext,
    var label: String = "",
    width: Float = 0.16f,
    height: Float = 0.05f
) : Panel3D(ctx, width, height) {

    var textHeight = 0.024f
    var textWeight = 1
    var textAlpha = 1f
    var icon: Texture? = null
    var iconSize = 0.03f
    var image: Texture? = null
    var imageAlpha = 1f
    var onTap: (() -> Unit)? = null
    var baseZ = 0f

    init {
        touchPad = 0.006f
        contact = 0.018f
    }

    override fun update(dt: Float) {
        pos.z = baseZ + hover * 0.008f - press * 0.014f
        scale = 1f + hover * 0.015f - press * 0.02f
        super.update(dt)
    }

    override fun drawSelf(r: VrRenderer) {
        image?.let { style.image(it, imageAlpha) }
        super.drawSelf(r)
        val color = ctx.theme.text
        val a = alpha * textAlpha
        val iconTex = icon
        r.push()
        r.translate(0f, 0f, 0.0012f)
        if (iconTex != null && label.isNotEmpty()) {
            val tw = r.textWidth(label, textHeight, textWeight)
            val total = tw + iconSize * 1.6f
            r.push()
            r.translate(-total * 0.5f, 0f, 0f)
            r.sprite(iconTex, iconSize, iconSize, color, a * (0.75f + hover * 0.25f))
            r.pop()
            r.push()
            r.translate(total * 0.5f - tw, 0f, 0f)
            r.label(label, textHeight, color, textWeight, a, VrRenderer.ALIGN_LEFT,
                size.x * 0.9f)
            r.pop()
        } else if (iconTex != null) {
            r.sprite(iconTex, iconSize, iconSize, color, a * (0.75f + hover * 0.25f))
        } else if (label.isNotEmpty()) {
            r.label(label, textHeight, color, textWeight, a, VrRenderer.ALIGN_CENTER,
                size.x * 0.9f)
        }
        r.pop()
    }

    override fun onClick() {
        onTap?.invoke()
    }
}

/** Big app card used by the hub grids. */
class Card3D(
    ctx: UiContext,
    var title: String,
    var subtitle: String = "",
    width: Float = 0.24f,
    height: Float = 0.16f
) : Panel3D(ctx, width, height) {

    var icon: Texture? = null
    var iconSize = 0.052f
    var titleHeight = 0.026f
    var subtitleHeight = 0.018f
    var onTap: (() -> Unit)? = null
    var baseZ = 0f
    var accentBar = true
    var cornerTag: String = ""

    init {
        radius = 0.022f
        touchPad = 0.008f
        contact = 0.020f
    }

    override fun update(dt: Float) {
        pos.z = baseZ + hover * 0.012f - press * 0.016f
        scale = 1f + hover * 0.022f - press * 0.03f
        super.update(dt)
    }

    override fun drawSelf(r: VrRenderer) {
        super.drawSelf(r)
        val theme = ctx.theme

        icon?.let {
            r.push()
            r.translate(-size.x * 0.5f + iconSize * 0.85f, size.y * 0.5f - iconSize * 0.95f, 0.0015f)
            r.sprite(it, iconSize, iconSize, theme.text, alpha * (0.78f + hover * 0.22f))
            r.pop()
        }

        if (cornerTag.isNotEmpty()) {
            r.push()
            r.translate(size.x * 0.5f - 0.028f, size.y * 0.5f - 0.022f, 0.0015f)
            r.label(cornerTag.uppercase(), 0.014f, theme.textFaint, 2, alpha * 0.9f,
                VrRenderer.ALIGN_CENTER)
            r.pop()
        }

        r.push()
        r.translate(-size.x * 0.5f + 0.022f, -size.y * 0.5f + 0.038f, 0.0015f)
        r.label(title, titleHeight, theme.text, 2, alpha, VrRenderer.ALIGN_LEFT, size.x - 0.044f)
        if (subtitle.isNotEmpty()) {
            r.translate(0f, -0.026f, 0f)
            r.label(subtitle, subtitleHeight, theme.textDim, 1, alpha, VrRenderer.ALIGN_LEFT,
                size.x - 0.044f)
        }
        r.pop()

        if (accentBar) {
            r.push()
            r.translate(0f, -size.y * 0.5f + 0.006f, 0.0015f)
            val bar = PanelStyle()
            bar.surface(theme.accent, theme.accent, 0.002f)
            r.panel(size.x * (0.25f + hover * 0.7f), 0.0035f, bar, alpha * (0.25f + hover * 0.6f))
            r.pop()
        }
    }

    override fun onClick() {
        onTap?.invoke()
    }
}

/** Single line of text floating in space. */
class Label3D(
    ctx: UiContext,
    var value: String = "",
    var height: Float = 0.024f,
    var weight: Int = 1,
    var align: Int = VrRenderer.ALIGN_LEFT,
    var colorOf: (Palette) -> Int = { it.text }
) : Widget(ctx) {

    override fun drawSelf(r: VrRenderer) {
        if (value.isEmpty()) return
        r.label(value, height, colorOf(ctx.theme), weight, alpha, align, size.x)
    }
}

/** Icon-only widget (status bar, toolbars). */
class Icon3D(
    ctx: UiContext,
    var icon: Texture? = null,
    var iconSize: Float = 0.026f
) : Widget(ctx) {

    var colorOf: (Palette) -> Int = { it.text }
    var onTap: (() -> Unit)? = null
    var baseZ = 0f

    init {
        size.set(iconSize * 1.6f, iconSize * 1.6f)
        touchPad = 0.008f
        contact = 0.020f
    }

    override fun update(dt: Float) {
        pos.z = baseZ + hover * 0.008f - press * 0.012f
        scale = 1f + hover * 0.08f
        super.update(dt)
    }

    override fun drawSelf(r: VrRenderer) {
        r.sprite(icon, size.x, size.y, colorOf(ctx.theme), alpha * (0.7f + hover * 0.3f))
    }

    override fun onClick() {
        onTap?.invoke()
    }
}

/** Horizontal slider with direct touch dragging. */
class Slider3D(
    ctx: UiContext,
    var title: String,
    var min: Float = 0f,
    var max: Float = 1f,
    var value: Float = 0.5f,
    width: Float = 0.34f
) : Widget(ctx) {

    var onChanged: ((Float) -> Unit)? = null
    var format: (Float) -> String = { String.format("%.2f", it) }
    var trackHeight = 0.008f
    var knobSize = 0.024f
    private var dragging = false
    private val style = PanelStyle()

    val normalized: Float get() = ((value - min) / (max - min)).coerceIn(0f, 1f)

    init {
        size.set(width, 0.062f)
        touchPad = 0.012f
        contact = 0.020f
    }

    override fun update(dt: Float) {
        super.update(dt)
        if (press > 0.5f && !dragging) dragging = true
        if (press < 0.1f) dragging = false
    }

    /** Called by DirectTouch with the fingertip in local space. */
    fun dragTo(localX: Float) {
        val t = ((localX / size.x) + 0.5f).coerceIn(0f, 1f)
        value = min + (max - min) * t
        onChanged?.invoke(value)
    }

    override fun drawSelf(r: VrRenderer) {
        val theme = ctx.theme

        r.push()
        r.translate(-size.x * 0.5f, size.y * 0.5f - 0.012f, 0f)
        r.label(title, 0.019f, theme.textDim, 1, alpha, VrRenderer.ALIGN_LEFT, size.x * 0.7f)
        r.pop()

        r.push()
        r.translate(size.x * 0.5f, size.y * 0.5f - 0.012f, 0f)
        r.label(format(value), 0.019f, theme.text, 2, alpha, VrRenderer.ALIGN_RIGHT, size.x * 0.4f)
        r.pop()

        r.push()
        r.translate(0f, -0.006f, 0f)
        style.surface(theme.raisedBottom, theme.raisedBottom, trackHeight * 0.5f)
        style.stroke(theme.panelBorder, 0.0012f)
        r.panel(size.x, trackHeight, style, alpha * 0.95f)
        r.pop()

        val w = size.x * normalized
        r.push()
        r.translate(-size.x * 0.5f + w * 0.5f, -0.006f, 0.0012f)
        style.surface(theme.text, theme.text, trackHeight * 0.5f)
        r.panel(w, trackHeight, style, alpha * 0.92f)
        r.pop()

        r.push()
        r.translate(-size.x * 0.5f + w, -0.006f, 0.0024f)
        val knob = PanelStyle()
        knob.surface(theme.raisedTop, theme.raisedBottom, knobSize * 0.5f)
        knob.stroke(theme.cardBorder, 0.0014f)
        knob.halo(theme.glow, 0.25f + hover * 0.6f)
        val ks = knobSize * (1f + hover * 0.12f + press * 0.1f)
        r.panel(ks, ks, knob, alpha)
        r.pop()
    }
}

/** Switch with a sliding knob. */
class Toggle3D(ctx: UiContext, var title: String, var value: Boolean = false, width: Float = 0.34f) :
    Widget(ctx) {

    var onChanged: ((Boolean) -> Unit)? = null
    var description: String = ""
    private val style = PanelStyle()

    init {
        size.set(width, 0.05f)
        touchPad = 0.010f
        contact = 0.020f
    }

    override fun hitLocal(p: Vec3, hit: Hit) {
        if (abs(p.x) <= size.x * 0.5f + touchPad && abs(p.y) <= size.y * 0.5f + touchPad) {
            hit.consider(this, p.z)
        }
    }

    override fun drawSelf(r: VrRenderer) {
        val theme = ctx.theme

        r.push()
        r.translate(-size.x * 0.5f, 0.004f, 0f)
        r.label(title, 0.019f, theme.text, 1, alpha, VrRenderer.ALIGN_LEFT, size.x * 0.62f)
        if (description.isNotEmpty()) {
            r.translate(0f, -0.018f, 0f)
            r.label(description, 0.014f, theme.textFaint, 1, alpha, VrRenderer.ALIGN_LEFT,
                size.x * 0.62f)
        }
        r.pop()

        val trackW = 0.058f
        val trackH = 0.026f
        r.push()
        r.translate(size.x * 0.5f - trackW * 0.5f, 0f, 0.001f)
        style.surface(
            if (value) theme.text else theme.raisedBottom,
            if (value) theme.text else theme.raisedBottom,
            trackH * 0.5f
        )
        style.stroke(theme.cardBorder, 0.0012f)
        r.panel(trackW, trackH, style, alpha * 0.95f)

        val knob = PanelStyle()
        knob.surface(theme.panelTop, theme.panelBottom, trackH * 0.36f)
        knob.dropShadow(theme.shadow, 0.012f, 0.5f)
        val t = if (value) 1f else 0f
        r.translate((t - 0.5f) * (trackW - trackH * 0.78f), 0f, 0.002f)
        r.panel(trackH * 0.72f, trackH * 0.72f, knob, alpha)
        r.pop()
    }

    override fun onClick() {
        value = !value
        onChanged?.invoke(value)
    }
}

/** Row of mutually exclusive options. */
class Segmented3D(ctx: UiContext, var options: List<String>, var selected: Int = 0, width: Float = 0.34f) :
    Widget(ctx) {

    var onChanged: ((Int) -> Unit)? = null
    private val items = ArrayList<SegmentedItem>()

    init {
        size.set(width, 0.05f)
        touchPad = 0.008f
        childZ = 0.002f
    }

    private fun rebuild() {
        items.clear()
        children.clear()
        val w = size.x / options.size
        for ((index, option) in options.withIndex()) {
            val item = SegmentedItem(ctx, option, index, w * 0.96f, size.y)
            item.pos.set(-size.x * 0.5f + w * (index + 0.5f), 0f, 0f)
            items.add(item)
            add(item)
        }
    }

    override fun update(dt: Float) {
        if (items.size != options.size) rebuild()
        super.update(dt)
    }

    override fun drawSelf(r: VrRenderer) {
        val style = PanelStyle()
        style.surface(ctx.theme.raisedBottom, ctx.theme.raisedBottom, size.y * 0.5f)
        style.stroke(ctx.theme.cardBorder, 0.0012f)
        r.panel(size.x, size.y, style, alpha * 0.8f)
    }

    inner class SegmentedItem(
        ctx: UiContext,
        val text: String,
        val index: Int,
        w: Float,
        h: Float
    ) : Widget(ctx) {

        private val style = PanelStyle()

        init {
            size.set(w, h * 0.82f)
            touchPad = 0.004f
            contact = 0.016f
        }

        override fun update(dt: Float) {
            pos.z = hover * 0.004f - press * 0.006f
            super.update(dt)
        }

        override fun drawSelf(r: VrRenderer) {
            val active = index == selected
            style.surface(
                if (active) ctx.theme.raisedTop else 0,
                if (active) ctx.theme.raisedBottom else 0,
                size.y * 0.5f
            )
            if (active) {
                style.stroke(ctx.theme.cardBorder, 0.0012f)
                style.halo(ctx.theme.glow, 0.25f)
            }
            r.panel(size.x, size.y, style, alpha * if (active) 1f else 0.25f + hover * 0.2f)
            r.translate(0f, 0f, 0.0015f)
            r.label(text, 0.017f, ctx.theme.text, if (active) 2 else 1,
                alpha * (if (active) 1f else 0.7f + hover * 0.3f), VrRenderer.ALIGN_CENTER,
                size.x * 0.92f)
        }

        override fun onClick() {
            selected = index
            onChanged?.invoke(index)
        }
    }
}

/** Lays children out in a vertical column. */
class Column3D(ctx: UiContext, var spacing: Float = 0.014f) : Widget(ctx) {

    var centerContent = false

    fun layout() {
        var y = size.y * 0.5f
        for (child in children) {
            if (!child.visible) continue
            y -= child.size.y * 0.5f
            child.pos.set(child.pos.x, y, child.pos.z)
            y -= child.size.y * 0.5f + spacing
        }
        if (centerContent && children.isNotEmpty()) {
            val used = size.y * 0.5f - y
            for (child in children) child.pos.y += used * 0.5f
        }
    }

    override fun update(dt: Float) {
        layout()
        super.update(dt)
    }
}
