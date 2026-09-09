package com.zentra.xr.xr

import android.opengl.Matrix
import com.zentra.xr.core.Mat
import com.zentra.xr.core.Vec3
import com.zentra.xr.tracking.Vec3Filter
import com.zentra.xr.ui.Hit
import com.zentra.xr.ui.Slider3D
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import kotlin.math.max

/**
 * Direct Touch: the fingertip is a real point in the virtual world, so the user simply
 * reaches out and touches the interface. No gestures, no pinch, no magic poses.
 *
 * A gaze pointer with dwell activation is available as a fallback when the camera is not
 * available or the user prefers it.
 */
class DirectTouch(private val engine: Engine) {

    enum class Mode { AUTO, HAND, GAZE }

    /** Filtered fingertip in world space. */
    val tip = Vec3()

    @Volatile
    var tracking = false

    var mode: Mode = Mode.AUTO
    var presence = 0f
    var hovered: Widget? = null
    var lastClickMs = 0L

    private val filter = Vec3Filter()
    private val headTip = Vec3()
    private val localPoint = Vec3()
    private val hit = Hit()
    private val cursorMatrix = FloatArray(16)
    private val axisX = Vec3()
    private val axisY = Vec3()
    private val axisZ = Vec3()
    private val up = Vec3(0f, 1f, 0f)

    private var dwell = 0f
    private var lastGazeTarget: Widget? = null

    private val ripples = Array(6) { Ripple() }
    private var rippleIndex = 0

    private class Ripple {
        var active = false
        var t = 0f
        var x = 0f
        var y = 0f
        var world = FloatArray(16)
        var strength = 1f
    }

    fun configure() {
        val s = engine.settings
        mode = when (s.pointerMode) {
            1 -> Mode.HAND
            2 -> Mode.GAZE
            else -> Mode.AUTO
        }
        filter.configure(
            s.oneEuroMinCutoff * (1f - s.extraSmoothing * 0.6f),
            s.oneEuroBeta * (1f + s.extraSmoothing * 2f),
            s.oneEuroDCutoff,
            s.kalmanProcess,
            s.kalmanMeasurement
        )
    }

    /** @param targets flat list of interactive widgets of the current screen. */
    fun update(dt: Float, targets: List<Widget>) {
        val s = engine.settings
        val handAvailable = s.handTracking && engine.hands.state == com.zentra.xr.tracking.HandTracker.State.RUNNING
        val useHand = when (mode) {
            Mode.HAND -> handAvailable
            Mode.GAZE -> false
            Mode.AUTO -> handAvailable
        }

        var visibleNow = false
        if (useHand && engine.hands.poll(headTip)) {
            filter.filter(headTip, dt)
            Mat.transformPoint(engine.head.headWorld, headTip, tip)
            visibleNow = true
        } else if (!useHand) {
            // gaze: a point floating at the interface distance, straight ahead
            val m = engine.head.headWorld
            axisZ.set(-m[8], -m[9], -m[10])
            val d = s.uiDistance
            tip.set(axisZ.x * d, axisZ.y * d, axisZ.z * d)
            visibleNow = true
            filter.reset()
        }
        tracking = visibleNow
        presence += ((if (visibleNow) 1f else 0f) - presence) * (1f - max(0f, 1f - dt / 0.12f))

        if (!visibleNow) {
            for (w in targets) w.release()
            hovered = null
            dwell = 0f
            return
        }

        hit.reset()
        for (w in targets) w.hitTest(tip, hit)
        val target = hit.widget
        val depth = hit.signedDepth
        hovered = target

        if (target == null) {
            for (w in targets) w.release()
            dwell = 0f
            lastGazeTarget = null
            return
        }

        if (useHand) {
            val inRange = depth < 0.16f && depth > -0.12f
            if (inRange) {
                val clicked = target.setTouch(depth, true)
                if (clicked) {
                    lastClickMs = System.currentTimeMillis()
                    spawnRipple(target, depth)
                }
                if (target is Slider3D && target.press > 0.4f) {
                    if (target.localPoint(tip, localPoint)) target.dragTo(localPoint.x)
                }
            } else {
                target.release()
            }
        } else {
            // gaze + dwell
            target.setHover(true)
            if (target === lastGazeTarget) {
                dwell += dt
            } else {
                dwell = 0f
                lastGazeTarget = target
            }
            if (dwell > 1.05f) {
                target.setTouch(0f, true)
                lastClickMs = System.currentTimeMillis()
                spawnRipple(target, 0f)
                dwell = -0.75f
            } else if (dwell < 0f) {
                dwell += dt
            }
        }
    }

    private fun spawnRipple(widget: Widget, depth: Float) {
        if (widget.localPoint(tip, localPoint)) {
            val r = ripples[rippleIndex]
            rippleIndex = (rippleIndex + 1) % ripples.size
            r.active = true
            r.t = 0f
            r.x = localPoint.x
            r.y = localPoint.y
            r.strength = 1f
            System.arraycopy(widget.world, 0, r.world, 0, 16)
        }
    }

    fun updateRipples(dt: Float) {
        for (r in ripples) {
            if (!r.active) continue
            r.t += dt / 0.5f
            if (r.t >= 1f) r.active = false
        }
    }

    fun draw(r: VrRenderer) {
        if (presence <= 0.01f) return
        val theme = r.theme
        val size = engine.settings.cursorSize

        drawRipples(r, theme)

        // fingertip cursor: a small glowing bead plus a billboarded ring
        buildBillboard(cursorMatrix, tip, r.camPos)
        r.push(cursorMatrix)

        r.push()
        r.scale(1f)
        val beadStyle = PanelStyle()
        beadStyle.surface(theme.text, theme.text, 0.02f)
        beadStyle.halo(theme.glow, 0.9f)
        val bead = 0.010f * size
        r.panel(bead, bead, beadStyle, presence * 0.95f)
        r.pop()

        val ringStyle = PanelStyle()
        ringStyle.surface(0, 0, 0.05f)
        ringStyle.stroke(theme.text, 0.0016f)
        val hoveredNow = hovered != null
        val ringSize = (if (hoveredNow) 0.030f else 0.042f) * size
        r.panel(ringSize, ringSize, ringStyle, presence * (if (hoveredNow) 0.85f else 0.35f))
        r.pop()
    }

    private fun drawRipples(r: VrRenderer, theme: com.zentra.xr.ui.Palette) {
        for (rp in ripples) {
            if (!rp.active) continue
            val t = rp.t
            val scale = 0.01f + t * 0.12f
            val alpha = (1f - t) * (1f - t) * presence
            r.push(rp.world)
            r.translate(rp.x, rp.y, 0.004f)
            val style = PanelStyle()
            style.surface(0, 0, 0.05f)
            style.stroke(theme.text, 0.0035f * (1f - t))
            r.panel(scale, scale, style, alpha * 0.85f)
            r.pop()
        }
    }

    /** Builds a matrix that faces the camera at [pos]. */
    private fun buildBillboard(out: FloatArray, pos: Vec3, cam: Vec3) {
        axisZ.set(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z).normalize()
        axisX.set(up).cross(axisZ).normalize()
        if (axisX.lengthSq() < 0.5f) axisX.set(1f, 0f, 0f)
        axisY.set(axisZ).cross(axisX).normalize()
        out[0] = axisX.x
        out[1] = axisX.y
        out[2] = axisX.z
        out[3] = 0f
        out[4] = axisY.x
        out[5] = axisY.y
        out[6] = axisY.z
        out[7] = 0f
        out[8] = axisZ.x
        out[9] = axisZ.y
        out[10] = axisZ.z
        out[11] = 0f
        out[12] = pos.x
        out[13] = pos.y
        out[14] = pos.z
        out[15] = 1f
    }

    fun resetFilter() = filter.reset()
}
