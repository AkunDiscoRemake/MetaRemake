package com.zentra.xr.apps

import android.opengl.Matrix
import com.zentra.xr.ui.Icon
import com.zentra.xr.ui.Widget
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.VrRenderer

/**
 * An application that runs inside a Zentra XR window.
 * Apps draw into the content area of their window (origin at the centre of the content).
 */
abstract class XrApp(protected val engine: Engine) {

    open val title: String = "App"
    open val subtitle: String = ""
    open val icon: Icon = Icon.APPS
    open val contentWidth: Float = 0.82f
    open val contentHeight: Float = 0.44f
    open val showWindowChrome: Boolean = true

    open fun onOpen() {}
    open fun onClose() {}
    open fun update(dt: Float) {}
    open fun draw(r: VrRenderer) {}
    open fun collectTargets(out: java.util.ArrayList<Widget>) {}
    open fun onBack(): Boolean = false

    /** Parent transform of the app content, updated by the host window every frame. */
    var parentMatrix = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }

    /** Places a root level widget of the app inside its window. */
    protected fun place(widget: Widget) = widget.updateWorld(parentMatrix)
}
