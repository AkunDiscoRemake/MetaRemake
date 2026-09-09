package com.zentra.xr.screens

import android.opengl.Matrix
import com.zentra.xr.apps.BrowserApp
import com.zentra.xr.browser.WebApp
import com.zentra.xr.system.DeviceStatus
import com.zentra.xr.ui.Button3D
import com.zentra.xr.ui.Card3D
import com.zentra.xr.ui.Icon
import com.zentra.xr.ui.Icon3D
import com.zentra.xr.ui.Icons
import com.zentra.xr.ui.Label3D
import com.zentra.xr.ui.Panel3D
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import com.zentra.xr.ui.ZentraLogo
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.Screen
import com.zentra.xr.xr.VrRenderer
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * The Zentra XR hub: a floating VR launcher.
 * Status bar, an arc of 3D cards and a dock - all positioned in space, never a flat screen.
 */
class HubScreen(engine: Engine) : Screen(engine) {

    enum class Tab { HOME, GAMES, APPS, WEB_APPS }

    var externalDim = 1f
    var tab = Tab.HOME
        private set

    private val ctx: UiContext = engine.ui
    private val device = DeviceStatus(engine.context)

    private val statusMatrix = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    private val dockMatrix = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    private val arcMatrix = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }

    private val statusBar = Panel3D(ctx, 0.72f, 0.09f)
    private val dock = Panel3D(ctx, 0.94f, 0.10f)

    private val clockLabel = Label3D(ctx, "", 0.030f, 2)
    private val dateLabel = Label3D(ctx, "", 0.014f, 1) { it.textDim }
    private val batteryLabel = Label3D(ctx, "", 0.016f, 1) { it.textDim }
    private val batteryIcon = Icon3D(ctx, null, 0.022f).apply { interactive = false }
    private val thermalLabel = Label3D(ctx, "", 0.016f, 1) { it.textDim }
    private val fpsLabel = Label3D(ctx, "", 0.014f, 1) { it.textFaint }

    private val trackingButton = Icon3D(ctx, null, 0.026f)
    private val recenterButton = Icon3D(ctx, null, 0.026f)
    private val logoBadge = Icon3D(ctx, null, 0.05f).apply { interactive = false }

    private val dockButtons = ArrayList<Button3D>(6)
    private val cards = ArrayList<Card3D>(8)
    private val visibleCards = ArrayList<Card3D>(8)
    private val allWidgets = ArrayList<Widget>(32)

    private var builtTabs = false
    private var lastTab: Tab? = null
    private var lastWebAppCount = -1
    private var logoTexture: com.zentra.xr.core.Texture? = null

    private val cardRadius = 1.15f
    private val cardStep = 0.215f

    /** GPU resources are created lazily: the first update already runs on the GL thread. */
    private fun ensureAssets() {
        if (builtTabs) return
        logoTexture = engine.renderer.text.art("zentra.logo", 256) { canvas, size ->
            ZentraLogo.draw(canvas, size.toFloat(), 0xFFFFFFFF.toInt())
        }
        logoBadge.icon = logoTexture
        trackingButton.icon = Icons.texture(engine.renderer.text, Icon.HAND)
        recenterButton.icon = Icons.texture(engine.renderer.text, Icon.RELOAD)
        recenterButton.onTap = { engine.head.recenter() }
        trackingButton.onTap = { openApp(AppRegistry.apps.first { it.id == "app.settings" }) }

        buildStatusBar()
        buildDock()
    }

    private fun buildStatusBar() {
        statusBar.radius = 0.045f
        statusBar.add(logoBadge)
        statusBar.add(clockLabel)
        statusBar.add(dateLabel)
        statusBar.add(batteryIcon)
        statusBar.add(batteryLabel)
        statusBar.add(thermalLabel)
        statusBar.add(fpsLabel)
        statusBar.add(trackingButton)
        statusBar.add(recenterButton)
        allWidgets.add(trackingButton)
        allWidgets.add(recenterButton)
    }

    private fun buildDock() {
        val items = listOf(
            Tab.HOME to Icon.HOME to "Home",
            Tab.GAMES to Icon.GAMES to "Games",
            Tab.APPS to Icon.APPS to "Apps",
            Tab.WEB_APPS to Icon.WEB_APPS to "Web Apps"
        )
        for ((pair, title) in items) {
            val (t, icon) = pair
            val button = Button3D(ctx, title, 0.15f, 0.062f)
            button.icon = Icons.texture(engine.renderer.text, icon)
            button.iconSize = 0.026f
            button.textHeight = 0.017f
            button.onTap = { setTab(t) }
            dockButtons.add(button)
            dock.add(button)
            allWidgets.add(button)
        }

        val browser = Button3D(ctx, "Browser", 0.15f, 0.062f)
        browser.icon = Icons.texture(engine.renderer.text, Icon.BROWSER)
        browser.iconSize = 0.026f
        browser.textHeight = 0.017f
        browser.onTap = { openApp(AppRegistry.apps.first { it.id == "app.browser" }) }
        dockButtons.add(browser)
        dock.add(browser)
        allWidgets.add(browser)

        val settings = Button3D(ctx, "Settings", 0.15f, 0.062f)
        settings.icon = Icons.texture(engine.renderer.text, Icon.SETTINGS)
        settings.iconSize = 0.026f
        settings.textHeight = 0.017f
        settings.onTap = { openApp(AppRegistry.apps.first { it.id == "app.settings" }) }
        dockButtons.add(settings)
        dock.add(settings)
        allWidgets.add(settings)
        builtTabs = true
    }

    fun setTab(next: Tab) {
        tab = next
    }

    private fun openApp(entry: AppEntry) {
        engine.openOverlay(AppWindowScreen(engine, entry.factory(engine)))
    }

    private fun openWebApp(webApp: WebApp) {
        engine.openOverlay(AppWindowScreen(engine, BrowserApp(engine, webApp.url)))
    }

    // ------------------------------------------------------------------ update
    override fun update(dt: Float) {
        super.update(dt)
        ensureAssets()
        device.update(System.currentTimeMillis())
        if (!builtTabs) return

        val theme = engine.theme.current
        val alpha = transition * externalDim
        val interactive = externalDim > 0.6f

        // ---- status bar ------------------------------------------------
        Matrix.setIdentityM(statusMatrix, 0)
        Matrix.translateM(statusMatrix, 0, 0f, 0.40f, -0.06f)
        Matrix.rotateM(statusMatrix, 0, -17f, 1f, 0f, 0f)
        Matrix.multiplyMM(statusMatrix, 0, root, 0, statusMatrix, 0)

        statusBar.alpha = alpha * 0.96f
        statusBar.fillTop = theme.panelTop
        statusBar.fillBottom = theme.panelBottom
        statusBar.borderColor = theme.panelBorder
        statusBar.borderWidth = 0.0014f
        statusBar.shadowStrength = 0.4f
        statusBar.radius = 0.045f

        val w = statusBar.size.x
        val h = statusBar.size.y
        logoBadge.pos.set(-w * 0.5f + 0.042f, 0f, 0.002f)
        clockLabel.value = device.timeText
        clockLabel.pos.set(-w * 0.5f + 0.085f, 0.012f, 0.002f)
        dateLabel.value = device.dateText
        dateLabel.pos.set(-w * 0.5f + 0.085f, -0.021f, 0.002f)

        batteryIcon.icon = Icons.texture(engine.renderer.text, Icon.BATTERY)
        batteryIcon.pos.set(w * 0.5f - 0.30f, 0f, 0.002f)
        batteryLabel.value = "${device.level}%"
        batteryLabel.pos.set(w * 0.5f - 0.30f, -0.024f, 0.002f)

        val thermal = engine.thermal
        thermalLabel.value = if (thermal.level.index > 0) "${thermal.batteryTempC.toInt()}°C" else ""
        thermalLabel.pos.set(w * 0.5f - 0.20f, -0.024f, 0.002f)

        fpsLabel.value = if (engine.settings.showFps) "${engine.perf.fps.toInt()} fps" else ""
        fpsLabel.pos.set(w * 0.5f - 0.11f, -0.024f, 0.002f)

        trackingButton.pos.set(w * 0.5f - 0.075f, 0f, 0.002f)
        recenterButton.pos.set(w * 0.5f - 0.030f, 0f, 0.002f)
        trackingButton.interactive = interactive
        recenterButton.interactive = interactive
        statusBar.update(dt)
        statusBar.updateWorld(statusMatrix)

        // ---- dock ------------------------------------------------------
        Matrix.setIdentityM(dockMatrix, 0)
        Matrix.translateM(dockMatrix, 0, 0f, -0.34f, 0.16f)
        Matrix.rotateM(dockMatrix, 0, 24f, 1f, 0f, 0f)
        Matrix.multiplyMM(dockMatrix, 0, root, 0, dockMatrix, 0)

        dock.alpha = alpha * 0.95f
        dock.fillTop = theme.panelTop
        dock.fillBottom = theme.panelBottom
        dock.borderColor = theme.panelBorder
        dock.borderWidth = 0.0014f
        dock.shadowStrength = 0.45f
        dock.radius = 0.05f
        val step = dock.size.x / dockButtons.size
        for ((index, button) in dockButtons.withIndex()) {
            button.pos.set(-dock.size.x * 0.5f + step * (index + 0.5f), 0f, 0.003f)
            button.baseZ = 0.003f
            button.alpha = alpha
            button.interactive = interactive
            val selected = when (tab) {
                Tab.HOME -> index == 0
                Tab.GAMES -> index == 1
                Tab.APPS -> index == 2
                Tab.WEB_APPS -> index == 3
            }
            button.fillTop = if (selected) theme.raisedTop else theme.panelTop
            button.fillBottom = if (selected) theme.raisedBottom else theme.panelBottom
            button.borderColor = if (selected) theme.cardBorder else theme.panelBorder
            button.borderWidth = if (selected) 0.0018f else 0.0008f
            button.glowStrength = if (selected) 0.25f else 0f
            button.glowColor = theme.glow
            button.radius = 0.026f
        }
        dock.update(dt)
        dock.updateWorld(dockMatrix)

        // ---- cards -----------------------------------------------------
        maybeRebuildCards()
        Matrix.setIdentityM(arcMatrix, 0)
        Matrix.translateM(arcMatrix, 0, 0f, -0.02f, 0f)
        Matrix.multiplyMM(arcMatrix, 0, root, 0, arcMatrix, 0)

        visibleCards.clear()
        for (card in cards) if (card.visible) visibleCards.add(card)
        for ((index, card) in visibleCards.withIndex()) {
            val theta = (index - (visibleCards.size - 1) * 0.5f) * cardStep
            val x = sin(theta) * cardRadius
            val z = (1f - cos(theta)) * cardRadius
            card.pos.x = x
            card.pos.y = 0f
            card.rotY = Math.toDegrees(atan2(-x, engine.settings.uiDistance - z).toDouble()).toFloat()
            card.baseZ = z
            card.alpha = alpha
            card.interactive = interactive
            card.update(dt)
            card.updateWorld(arcMatrix)
        }
    }

    private fun maybeRebuildCards() {
        val webApps = engine.webApps.list
        if (tab == lastTab && webApps.size == lastWebAppCount) return
        lastTab = tab
        lastWebAppCount = webApps.size
        cards.clear()

        val kit = engine.renderer.text
        when (tab) {
            Tab.HOME -> {
                for (id in AppRegistry.featured) {
                    AppRegistry.find(id)?.let { entry -> cards.add(appCard(entry, kit)) }
                }
            }
            Tab.GAMES -> AppRegistry.games.forEach { cards.add(appCard(it, kit)) }
            Tab.APPS -> AppRegistry.apps.forEach { cards.add(appCard(it, kit)) }
            Tab.WEB_APPS -> {
                for (webApp in webApps) {
                    val card = Card3D(ctx, webApp.name, hostOf(webApp.url), 0.24f, 0.16f)
                    card.icon = Icons.texture(kit, Icon.LINK)
                    card.cornerTag = "WEB"
                    card.onTap = { openWebApp(webApp) }
                    cards.add(card)
                }
                if (webApps.isEmpty()) {
                    val empty = Card3D(ctx, "Nenhum Web App", "Salve sites pelo navegador", 0.26f, 0.16f)
                    empty.icon = Icons.texture(kit, Icon.PLUS)
                    empty.onTap = { openApp(AppRegistry.apps.first { it.id == "app.browser" }) }
                    cards.add(empty)
                }
            }
        }
    }

    private fun appCard(entry: AppEntry, kit: com.zentra.xr.core.TextKit): Card3D {
        val card = Card3D(ctx, entry.title, entry.subtitle, 0.24f, 0.16f)
        card.icon = Icons.texture(kit, entry.icon)
        card.cornerTag = if (entry.game) "GAME" else ""
        card.onTap = { openApp(entry) }
        return card
    }

    private fun hostOf(url: String): String {
        return try {
            val host = java.net.URI(url).host ?: url
            host.removePrefix("www.")
        } catch (t: Throwable) {
            url
        }
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        if (externalDim > 0.6f) {
            for (w in allWidgets) if (w.visible) out.add(w)
            for (c in cards) if (c.visible) out.add(c)
        }
    }

    override fun draw(r: VrRenderer) {
        val alpha = transition * externalDim
        if (alpha <= 0.01f) return

        val theme = r.theme

        // soft horizon glow behind everything
        r.push(root)
        r.translate(0f, -0.06f, -0.6f)
        val halo = com.zentra.xr.xr.PanelStyle()
        halo.surface(theme.accentSoft, theme.accentSoft, 0.6f)
        r.panel(3.2f, 1.6f, halo, alpha * 0.10f)
        r.pop()

        r.push(root)
        statusBar.draw(r)
        dock.draw(r)

        for (card in cards) {
            if (!card.visible) continue
            card.draw(r)
        }
        r.pop()

        // greeting / contextual hint
        r.push(root)
        r.translate(0f, 0.20f, -0.02f)
        r.rotate(-8f, 1f, 0f, 0f)
        val title = when (tab) {
            Tab.HOME -> "Bem-vindo ao Zentra XR"
            Tab.GAMES -> "Games"
            Tab.APPS -> "Apps"
            Tab.WEB_APPS -> "Web Apps"
        }
        r.label(title, 0.036f, theme.text, 2, alpha * 0.92f, VrRenderer.ALIGN_CENTER)
        r.translate(0f, -0.038f, 0f)
        val hint = hintText()
        r.label(hint, 0.017f, theme.textDim, 1, alpha * 0.8f, VrRenderer.ALIGN_CENTER)
        r.pop()
    }

    private fun hintText(): String {
        val tracking = engine.touch.tracking
        return when {
            !engine.settings.handTracking -> "Hand tracking desativado • use o olhar ou ative em Settings"
            engine.hands.state == com.zentra.xr.tracking.HandTracker.State.RUNNING && tracking ->
                "Aponte e toque nos elementos com o dedo"
            engine.hands.state == com.zentra.xr.tracking.HandTracker.State.RUNNING ->
                "Mostre sua mão à câmera para usar o Direct Touch"
            else -> "Toque em Install em Settings para baixar o modelo de mãos"
        }
    }

    override fun onBack(): Boolean = false
}
