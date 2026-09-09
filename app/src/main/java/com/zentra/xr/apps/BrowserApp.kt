package com.zentra.xr.apps

import android.content.Context
import android.view.MotionEvent
import com.zentra.xr.browser.VrBrowser
import com.zentra.xr.browser.WebAppIcon
import com.zentra.xr.core.Mat
import com.zentra.xr.core.Vec3
import com.zentra.xr.system.Settings
import com.zentra.xr.ui.Button3D
import com.zentra.xr.ui.Icon
import com.zentra.xr.ui.Icon3D
import com.zentra.xr.ui.Icons
import com.zentra.xr.ui.Label3D
import com.zentra.xr.ui.Panel3D
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.VrRenderer
import org.json.JSONArray
import java.util.ArrayList

/**
 * Zentra XR Browser: a real WebView floating in space.
 * Address bar, navigation, history, favourites, Web Apps, zoom, fullscreen and a
 * virtual keyboard driven by Direct Touch.
 */
class BrowserApp(engine: Engine, initialUrl: String? = null) : XrApp(engine) {

    override val title = "VR Browser"
    override val icon = Icon.BROWSER
    override val contentWidth = 0.86f
    override val contentHeight = 0.50f

    private val ctx: UiContext = engine.ui
    private val browser = VrBrowser(engine.context, engine.hostContainer, engine.settings)
    private val history = HistoryStore(engine.context)

    private val toolbar = Panel3D(ctx, contentWidth, 0.052f)
    private val addressBar = Button3D(ctx, "", 0.42f, 0.040f)
    private val addressLabel = Label3D(ctx, "", 0.018f, 1) { it.text }
    private val surface = WebSurface()
    private val keyboardPanel = Panel3D(ctx, 0.66f, 0.20f)
    private val statusLabel = Label3D(ctx, "", 0.015f, 1) { it.textDim }

    private val keys = ArrayList<Button3D>()
    private val targets = ArrayList<Widget>(64)

    private var editing = false
    private var addressText = ""
    private var fullscreen = false
    private var showHistory = false
    private var shift = false
    private val historyCards = ArrayList<Button3D>()
    private var statusTimer = 0f
    private val identityRoot = FloatArray(16).apply { android.opengl.Matrix.setIdentityM(this, 0) }

    private val rows = arrayOf(
        "qwertyuiop",
        "asdfghjkl",
        "⇧zxcvbnm,.⌫",
        "space.com/@⏎"
    )

    init {
        initialUrl?.let { pendingUrl = it }
    }

    private var pendingUrl: String? = null

    override fun onOpen() {
        browser.attach()
        browser.onPageChanged = { url, _ ->
            addressText = url
            history.add(url)
            showStatus("Carregado")
        }
        buildToolbar()
        buildKeyboard()
        val start = pendingUrl ?: engine.settings.homeUrl
        browser.loadUrl(start)
    }

    override fun onClose() {
        browser.detach()
    }

    private fun buildToolbar() {
        val kit = engine.renderer.text
        toolbar.radius = 0.022f
        addressBar.radius = 0.02f
        addressBar.add(addressLabel)
        addressLabel.pos.set(-0.19f, 0f, 0.002f)
        addressBar.onTap = { editing = true; shift = false }
        toolbar.add(addressBar)
        targets.add(addressBar)

        val buttons = listOf(
            Icon.BACK to { browser.goBack() },
            Icon.FORWARD to { browser.goForward() },
            Icon.RELOAD to { browser.reload() },
            Icon.HOME to { browser.loadUrl(engine.settings.homeUrl) },
            Icon.STAR to { addToWebApps() },
            Icon.SEARCH to { showHistory = !showHistory },
            Icon.PLUS to { browser.zoom(1.15f) },
            Icon.DELETE to { browser.zoom(1f / 1.15f) }
        )
        var x = -contentWidth * 0.5f + 0.03f
        for ((icon, action) in buttons) {
            val button = Icon3D(ctx, Icons.texture(kit, icon), 0.024f)
            button.pos.set(x, 0f, 0.003f)
            button.onTap = { action() }
            toolbar.add(button)
            targets.add(button)
            x += 0.045f
        }
        addressBar.pos.set(x + 0.19f, 0f, 0.002f)

        val fsButton = Icon3D(ctx, Icons.texture(kit, Icon.ARROW_UP), 0.024f)
        fsButton.pos.set(contentWidth * 0.5f - 0.03f, 0f, 0.003f)
        fsButton.onTap = { fullscreen = !fullscreen }
        toolbar.add(fsButton)
        targets.add(fsButton)
    }

    private fun buildKeyboard() {
        val kit = engine.renderer.text
        keyboardPanel.radius = 0.024f
        var y = 0.072f
        for ((rowIndex, row) in rows.withIndex()) {
            val chars = if (row == "space.com/@⏎") {
                listOf("space", ".com", "/", "@", "⏎")
            } else row.map { it.toString() }.toList()
            val keyWidth = if (rowIndex == 3) 0.10f else 0.045f
            val total = chars.size * keyWidth
            var x = -total * 0.5f + keyWidth * 0.5f
            for (ch in chars) {
                val button = Button3D(ctx, label(ch), keyWidth * 0.92f, 0.036f)
                button.pos.set(x, y, 0.003f)
                button.textHeight = 0.019f
                button.onTap = { onKey(ch) }
                keyboardPanel.add(button)
                keys.add(button)
                x += keyWidth
            }
            y -= 0.042f
        }
    }

    private fun label(ch: String): String = when (ch) {
        "space" -> "espaço"
        "⇧" -> "shift"
        "⌫" -> "apagar"
        "⏎" -> "ok"
        else -> ch
    }

    private fun onKey(ch: String) {
        when (ch) {
            "⇧" -> shift = !shift
            "⌫" -> if (editing) addressText = addressText.dropLast(1) else browser.key(67)
            "⏎" -> {
                if (editing) {
                    browser.loadUrl(addressText)
                    editing = false
                } else {
                    browser.key(66)
                }
            }
            "space" -> type(' ')
            ".com" -> typeText(".com")
            else -> type(ch.firstOrNull() ?: ' ')
        }
    }

    private fun type(ch: Char) {
        val c = if (shift) ch.uppercaseChar() else ch.lowercaseChar()
        if (editing) {
            addressText += c
            shift = false
        } else {
            browser.type(c)
        }
    }

    private fun typeText(value: String) {
        if (editing) addressText += value else value.forEach { browser.type(it) }
    }

    private fun addToWebApps() {
        val url = browser.url
        if (url.isBlank()) return
        val name = browser.title.ifBlank { engine.webApps.hostOf(url) }
        engine.webApps.add(name, url)
        showStatus("Adicionado aos Web Apps")
    }

    private fun showStatus(text: String) {
        statusLabel.value = text
        statusTimer = 2.5f
    }

    override fun update(dt: Float) {
        browser.tick()
        val theme = engine.theme.current

        if (statusTimer > 0f) {
            statusTimer -= dt
            if (statusTimer <= 0f) statusLabel.value = ""
        }

        // layout
        val showKeys = editing
        val contentHeightNow = if (fullscreen) contentHeight + 0.06f else if (showKeys) 0.24f else contentHeight - 0.06f
        val contentWidthNow = if (fullscreen) contentWidth + 0.04f else contentWidth

        toolbar.visible = !fullscreen
        toolbar.alpha = if (fullscreen) 0f else 1f
        toolbar.pos.set(0f, contentHeight * 0.5f - 0.03f, 0f)
        toolbar.fillTop = theme.panelTop
        toolbar.fillBottom = theme.panelBottom
        toolbar.borderColor = theme.panelBorder
        toolbar.borderWidth = 0.0012f
        toolbar.update(dt)
        toolbar.updateWorld(identityRoot)

        addressBar.fillTop = theme.raisedTop
        addressBar.fillBottom = theme.raisedBottom
        addressBar.borderColor = if (editing) theme.text else theme.cardBorder
        addressBar.borderWidth = if (editing) 0.0022f else 0.0012f
        addressBar.glowStrength = if (editing) 0.35f else 0f
        addressBar.glowColor = theme.glow
        addressLabel.value = if (editing) addressText + "|" else (browser.url.ifBlank { "Digite um endereço" })

        surface.size.set(contentWidthNow, contentHeightNow)
        surface.pos.set(0f, if (fullscreen) 0f else -0.026f, 0.002f)
        surface.update(dt)
        place(surface)

        keyboardPanel.visible = showKeys
        keyboardPanel.pos.set(0f, -contentHeight * 0.5f + 0.12f, 0.02f)
        keyboardPanel.rotX = -18f
        keyboardPanel.fillTop = theme.panelTop
        keyboardPanel.fillBottom = theme.panelBottom
        keyboardPanel.borderColor = theme.cardBorder
        keyboardPanel.borderWidth = 0.0014f
        keyboardPanel.shadowStrength = 0.5f
        for (key in keys) {
            key.fillTop = theme.raisedTop
            key.fillBottom = theme.raisedBottom
            key.borderColor = theme.cardBorder
            key.borderWidth = 0.001f
        }
        if (showKeys) {
            keyboardPanel.update(dt)
            keyboardPanel.updateWorld(identityRoot)
        }

        statusLabel.pos.set(-contentWidth * 0.5f + 0.02f, -contentHeight * 0.5f + 0.012f, 0f)
        statusLabel.update(dt)
        statusLabel.updateWorld(identityRoot)

        // history panel
        rebuildHistoryIfNeeded()
        var hy = contentHeight * 0.5f - 0.09f
        for (card in historyCards) {
            card.pos.set(0f, hy, 0.01f)
            card.fillTop = theme.raisedTop
            card.fillBottom = theme.raisedBottom
            card.borderColor = theme.cardBorder
            card.borderWidth = 0.001f
            card.update(dt)
            card.updateWorld(identityRoot)
            hy -= 0.042f
        }
    }

    private var lastHistorySize = -1
    private fun rebuildHistoryIfNeeded() {
        val size = if (showHistory) history.items.size else 0
        if (size == lastHistorySize) return
        lastHistorySize = size
        historyCards.clear()
        if (!showHistory) return
        for (item in history.items.take(7)) {
            val card = Button3D(ctx, item, contentWidth * 0.86f, 0.036f)
            card.textHeight = 0.016f
            card.onTap = { browser.loadUrl(item); showHistory = false }
            historyCards.add(card)
        }
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        out.add(surface)
        if (!fullscreen) {
            for (w in targets) if (w.visible) out.add(w)
        }
        if (editing) for (k in keys) out.add(k)
        if (showHistory) for (c in historyCards) out.add(c)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme

        // page surface
        r.push(surface.world)
        if (fullscreen) {
            r.push()
            r.translate(0f, 0f, -0.004f)
            val back = com.zentra.xr.xr.PanelStyle()
            back.surface(theme.panelBottom, theme.panelBottom, 0.02f)
            r.panel(surface.size.x + 0.02f, surface.size.y + 0.02f, back, 1f)
            r.pop()
        }
        val webStyle = com.zentra.xr.xr.PanelStyle()
        webStyle.surface(0xFFFFFFFF.toInt(), 0xFFFFFFFF.toInt(), 0.006f)
        webStyle.image(browser.texture, 1f)
        webStyle.stroke(theme.cardBorder, 0.0014f)
        browser.upload()
        r.panel(surface.size.x, surface.size.y, webStyle, 1f)
        r.pop()

        if (browser.loading) {
            r.push(surface.world)
            r.translate(0f, surface.size.y * 0.5f - 0.004f, 0.004f)
            val bar = com.zentra.xr.xr.PanelStyle()
            bar.surface(theme.text, theme.text, 0.003f)
            val p = (browser.progress / 100f).coerceIn(0.02f, 1f)
            r.panel(surface.size.x * p, 0.005f, bar, 0.9f)
            r.pop()
        }

        if (!fullscreen) {
            toolbar.draw(r)
            statusLabel.draw(r)
            for (card in historyCards) card.draw(r)
        }
        if (editing) keyboardPanel.draw(r)

        r.push()
        r.translate(0f, -contentHeight * 0.5f - 0.028f, 0f)
        r.label(
            if (editing) "Teclado ativo • ⏎ para abrir" else "Toque na página para interagir",
            0.014f, theme.textFaint, 1, 0.75f, VrRenderer.ALIGN_CENTER
        )
        r.pop()
    }

    /** The web page surface: forwards Direct Touch to the WebView. */
    private inner class WebSurface : Panel3D(ctx, contentWidth, 0.34f) {

        private val local = Vec3()
        private var dragging = false
        private var downU = 0f
        private var downV = 0f
        private var moved = false

        init {
            radius = 0.008f
            touchPad = 0f
            contact = 0.022f
        }

        override fun update(dt: Float) {
            fillTop = 0xFFFFFFFF.toInt()
            fillBottom = 0xFFFFFFFF.toInt()
            val tip = engine.touch.tip
            if (engine.touch.tracking && localPoint(tip, local)) {
                val u = (local.x / size.x + 0.5f).coerceIn(0f, 1f)
                val v = (0.5f - local.y / size.y).coerceIn(0f, 1f)
                val touching = local.z < 0.024f && local.z > -0.12f
                if (touching && !dragging) {
                    dragging = true
                    moved = false
                    downU = u
                    downV = v
                    browser.touch(u, v, MotionEvent.ACTION_DOWN)
                    engine.haptic(8L)
                } else if (dragging && !touching) {
                    dragging = false
                    browser.touch(u, v, MotionEvent.ACTION_UP)
                } else if (dragging) {
                    if (!moved && (kotlin.math.abs(u - downU) > 0.012f || kotlin.math.abs(v - downV) > 0.012f)) {
                        moved = true
                    }
                    if (moved) browser.touch(u, v, MotionEvent.ACTION_MOVE)
                }
            } else if (dragging) {
                dragging = false
                browser.touch(downU, downV, MotionEvent.ACTION_UP)
            }
            super.update(dt)
        }

        override fun draw(r: VrRenderer) {
            // the page itself is drawn by BrowserApp.draw (needs the texture upload)
        }

        override fun onClick() {
            editing = false
        }
    }

    /** Recent URLs, persisted. */
    private class HistoryStore(context: Context) {
        private val prefs = context.getSharedPreferences("zentra_history", Context.MODE_PRIVATE)
        val items = ArrayList<String>()

        init {
            val raw = prefs.getString("items", null)
            if (!raw.isNullOrEmpty()) {
                try {
                    val array = JSONArray(raw)
                    for (i in 0 until array.length()) items.add(array.getString(i))
                } catch (t: Throwable) {
                    items.clear()
                }
            }
        }

        fun add(url: String) {
            if (url.isBlank()) return
            items.remove(url)
            items.add(0, url)
            while (items.size > 30) items.removeAt(items.size - 1)
            val array = JSONArray()
            for (item in items) array.put(item)
            prefs.edit().putString("items", array.toString()).apply()
        }
    }
}
