package com.zentra.xr.screens

import android.opengl.Matrix
import com.zentra.xr.apps.XrApp
import com.zentra.xr.ui.Button3D
import com.zentra.xr.ui.Icon3D
import com.zentra.xr.ui.Icons
import com.zentra.xr.ui.Panel3D
import com.zentra.xr.ui.Palette
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.Screen
import com.zentra.xr.xr.VrRenderer

/**
 * A floating window that hosts one Zentra XR app.
 * The window keeps the system chrome (icon, title, close) so every app feels native.
 */
class AppWindowScreen(engine: Engine, val app: XrApp) : Screen(engine) {

    private val ctx = engine.ui
    private val windowMatrix = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    private val contentMatrix = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }

    private var width = 0.92f
    private var height = 0.64f

    private val frame = Panel3D(ctx, width, height)
    private val titleLabel = com.zentra.xr.ui.Label3D(ctx, app.title, 0.026f, 2)
    private val closeButton = Icon3D(ctx, null, 0.026f)
    private val iconView = com.zentra.xr.ui.Icon3D(ctx, null, 0.034f).apply { interactive = false }

    private var firstLayout = true

    init {
        enterOffsetZ = -0.35f
    }

    override fun onEnter() {
        app.onOpen()
        closeButton.onTap = { engine.closeOverlay() }
    }

    override fun onExit() {
        app.onClose()
    }

    override fun updateRoot() {
        super.updateRoot()
        if (!app.showWindowChrome) {
            // immersive apps (games) draw straight into the world around the player
            Matrix.setIdentityM(contentMatrix, 0)
            Matrix.setIdentityM(windowMatrix, 0)
            return
        }
        Matrix.setIdentityM(windowMatrix, 0)
        Matrix.translateM(windowMatrix, 0, 0f, 0f, 0.14f + (1f - transition) * 0.18f)
        Matrix.scaleM(windowMatrix, 0, transition * 0.12f + 0.88f, transition * 0.12f + 0.88f, 1f)
        Matrix.multiplyMM(windowMatrix, 0, root, 0, windowMatrix, 0)

        Matrix.setIdentityM(contentMatrix, 0)
        Matrix.translateM(contentMatrix, 0, 0f, -0.045f, 0.004f)
        Matrix.multiplyMM(contentMatrix, 0, windowMatrix, 0, contentMatrix, 0)
    }

    override fun update(dt: Float) {
        super.update(dt)
        app.parentMatrix = contentMatrix
        if (!app.showWindowChrome) {
            app.update(dt)
            return
        }
        val theme = engine.theme.current
        width = app.contentWidth + 0.06f
        height = app.contentHeight + 0.14f
        frame.size.set(width, height)
        frame.fillTop = theme.panelTop
        frame.fillBottom = theme.panelBottom
        frame.borderColor = theme.cardBorder
        frame.borderWidth = 0.0016f
        frame.radius = 0.03f
        frame.shadowStrength = 0.55f
        frame.shadowSize = 0.09f
        frame.alpha = transition

        if (firstLayout) {
            firstLayout = false
            iconView.icon = Icons.texture(engine.renderer.text, app.icon)
            closeButton.icon = Icons.texture(engine.renderer.text, com.zentra.xr.ui.Icon.CLOSE)
            frame.add(titleLabel)
            frame.add(closeButton)
            frame.add(iconView)
        }
        iconView.iconSize = 0.034f
        iconView.size.set(0.04f, 0.04f)
        iconView.pos.set(-width * 0.5f + 0.045f, height * 0.5f - 0.038f, 0f)
        titleLabel.value = app.title
        titleLabel.pos.set(-width * 0.5f + 0.082f, height * 0.5f - 0.038f, 0f)
        titleLabel.size.set(width * 0.6f, 0.03f)
        closeButton.pos.set(width * 0.5f - 0.038f, height * 0.5f - 0.038f, 0f)
        closeButton.baseZ = 0f

        frame.update(dt)
        frame.updateWorld(windowMatrix)
        app.update(dt)
    }

    override fun collectTargets(out: java.util.ArrayList<com.zentra.xr.ui.Widget>) {
        if (transition < 0.35f) return
        if (app.showWindowChrome) out.add(closeButton)
        app.collectTargets(out)
    }

    override fun draw(r: VrRenderer) {
        if (transition <= 0.01f) return
        if (!app.showWindowChrome) {
            app.draw(r)
            return
        }
        r.push(windowMatrix)
        frame.draw(r)
        // separator under the title bar
        r.push()
        r.translate(0f, height * 0.5f - 0.072f, 0.0012f)
        val sep = com.zentra.xr.xr.PanelStyle()
        sep.surface(r.theme.panelBorder, r.theme.panelBorder, 0.001f)
        r.panel(width * 0.94f, 0.0012f, sep, transition * 0.8f)
        r.pop()
        r.pop()

        r.push(contentMatrix)
        app.draw(r)
        r.pop()
    }

    override fun onBack(): Boolean {
        if (app.onBack()) return true
        return false
    }
}
