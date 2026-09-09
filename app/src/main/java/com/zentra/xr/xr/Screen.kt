package com.zentra.xr.xr

import android.opengl.Matrix
import com.zentra.xr.ui.Widget
import kotlin.math.max

/**
 * Base class of every Zentra XR screen (hub, windows, onboarding, games).
 * `update` runs once per frame and refreshes the layout; `draw` runs once per eye and
 * must not change any state.
 */
abstract class Screen(protected val engine: Engine) {

    val root = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    val targets = ArrayList<Widget>(32)

    /** 0 = fully hidden, 1 = fully present. */
    var transition = 0f
    var closing = false
    var finished = false

    /** When true the hub behind this screen is dimmed and made non interactive. */
    open val dimsHub: Boolean = true

    /** Extra depth offset applied to the whole screen while transitioning. */
    var enterOffsetZ = -0.22f

    open fun onEnter() {}
    open fun onExit() {}

    open fun update(dt: Float) {
        transition += ((if (closing) 0f else 1f) - transition) *
            (1f - max(0f, 1f - dt / 0.16f))
        if (closing && transition < 0.01f) finished = true
        updateRoot()
        targets.clear()
        collectTargets(targets)
    }

    open fun updateRoot() {
        Matrix.setIdentityM(root, 0)
        val z = -engine.settings.uiDistance + (1f - transition) * enterOffsetZ
        Matrix.translateM(root, 0, 0f, 0f, z)
        val s = engine.settings.uiScale * engine.settings.uiSize
        Matrix.scaleM(root, 0, s, s, s)
    }

    open fun collectTargets(out: ArrayList<Widget>) = Unit

    open fun draw(r: VrRenderer) = Unit

    /** Returns true when the screen consumed the back action. */
    open fun onBack(): Boolean = false
}
