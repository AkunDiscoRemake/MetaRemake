package com.zentra.xr.apps

import android.opengl.Matrix
import com.zentra.xr.BuildConfig
import com.zentra.xr.core.Geometry
import com.zentra.xr.xr.Material
import com.zentra.xr.core.Mesh
import com.zentra.xr.core.MeshBuilder
import com.zentra.xr.core.Texture
import com.zentra.xr.core.Vec3
import com.zentra.xr.tracking.HandTracker
import com.zentra.xr.ui.Button3D
import com.zentra.xr.ui.Icon
import com.zentra.xr.ui.Icons
import com.zentra.xr.ui.Label3D
import com.zentra.xr.ui.Segmented3D
import com.zentra.xr.ui.Slider3D
import com.zentra.xr.ui.Toggle3D
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import com.zentra.xr.ui.ZentraLogo
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.VrRenderer
import java.util.Calendar
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
class ClockApp(engine: Engine) : XrApp(engine) {

    override val title = "VR Clock"
    override val icon = Icon.CLOCK
    override val contentWidth = 0.80f
    override val contentHeight = 0.46f

    private val ctx: UiContext = engine.ui
    private val digital = Label3D(ctx, "", 0.055f, 2) { it.text }
    private val dateLabel = Label3D(ctx, "", 0.020f, 1) { it.textDim }
    private val zones = ArrayList<Label3D>()
    private val zoneNames = arrayOf("America/Sao_Paulo", "Europe/London", "Asia/Tokyo")
    private var jsTick = 0f
    private var zoneText = arrayOf("", "", "")

    init {
        for (i in 0..2) zones.add(Label3D(ctx, "", 0.018f, 1) { it.textDim })
    }

    override fun update(dt: Float) {
        val cal = Calendar.getInstance()
        digital.value = String.format("%02d:%02d:%02d",
            cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), cal.get(Calendar.SECOND))
        dateLabel.value = String.format("%02d/%02d/%04d",
            cal.get(Calendar.DAY_OF_MONTH), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.YEAR))

        digital.pos.set(-0.16f, 0.02f, 0.02f)
        dateLabel.pos.set(-0.16f, -0.05f, 0.02f)
        digital.update(dt)
        dateLabel.update(dt)
        place(digital)
        place(dateLabel)

        // the world clocks are formatted by the JavaScript runtime
        jsTick -= dt
        if (jsTick <= 0f) {
            jsTick = 5f
            for ((index, zone) in zoneNames.withIndex()) {
                engine.js.evaluate("Zentra.zoneTime('$zone')") { result ->
                    if (!result.isNullOrBlank()) zoneText[index] = result.trim('"')
                }
            }
        }
        var y = 0.10f
        for ((index, label) in zones.withIndex()) {
            label.value = "${zoneNames[index].substringAfter('/').replace('_', ' ')}  ${zoneText[index]}"
            label.pos.set(0.14f, y, 0.02f)
            label.update(dt)
            place(label)
            y -= 0.03f
        }
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme
        val cal = Calendar.getInstance()

        // analog clock
        r.push()
        r.translate(-0.16f, 0.02f, 0f)
        drawClockFace(r, cal, theme)
        r.pop()

        digital.draw(r)
        dateLabel.draw(r)
        for (label in zones) label.draw(r)

        r.push()
        r.translate(0.14f, 0.16f, 0f)
        r.label("Fusos", 0.016f, theme.textFaint, 2, 1f, VrRenderer.ALIGN_CENTER)
        r.pop()
    }

    private fun drawClockFace(r: VrRenderer, cal: Calendar, theme: com.zentra.xr.ui.Palette) {
        val radius = 0.15f
        val ring = Material().base(theme.raisedTop)
        ring.rimLight(theme.glow, 0.5f)
        ring.spec = 0.6f
        ring.glow(0x00000000)

        r.push()
        r.scale(radius * 2f)
        r.mesh(Geometry.torus(0.045f, 48, 12), ring)
        r.pop()

        // ticks
        val tick = Material().base(theme.textDim)
        tick.glow(0x00000000)
        tick.spec = 0f
        tick.rimStrength = 0f
        for (i in 0 until 12) {
            val a = i * 30.0
            val rad = Math.toRadians(a)
            r.push()
            r.translate((sin(rad) * radius * 0.86f).toFloat(), (cos(rad) * radius * 0.86f).toFloat(), 0f)
            r.rotate(-a.toFloat(), 0f, 0f, 1f)
            r.scale(1f)
            r.push()
            r.scale(0.006f, if (i % 3 == 0) 0.026f else 0.014f, 0.006f)
            r.mesh(Geometry.box(), tick)
            r.pop()
            r.pop()
        }

        val hand = Material().base(theme.text)
        hand.glow(0x10101000)
        hand.spec = 0.4f
        hand.rimStrength = 0.2f

        val seconds = cal.get(Calendar.SECOND) + cal.get(Calendar.MILLISECOND) / 1000f
        val minutes = cal.get(Calendar.MINUTE) + seconds / 60f
        val hours = (cal.get(Calendar.HOUR_OF_DAY) % 12) + minutes / 60f

        drawHand(r, hand, hours * 30f, radius * 0.48f, 0.010f)
        drawHand(r, hand, minutes * 6f, radius * 0.72f, 0.007f)
        val secondHand = Material().base(theme.accent)
        secondHand.glow(0x1A1A1A00)
        drawHand(r, secondHand, seconds * 6f, radius * 0.80f, 0.0035f)

        r.push()
        r.translate(0f, 0f, 0.01f)
        r.circle(0.012f, theme.text, 1f)
        r.pop()
    }

    private fun drawHand(r: VrRenderer, material: Material, angleDeg: Float, length: Float, thickness: Float) {
        r.push()
        r.rotate(-angleDeg, 0f, 0f, 1f)
        r.translate(0f, length * 0.5f, 0.004f)
        r.push()
        r.scale(thickness, length, thickness)
        r.mesh(Geometry.box(), material)
        r.pop()
        r.pop()
    }
}

// ---------------------------------------------------------------------------
// Demo / showcase
// ---------------------------------------------------------------------------
class DemoApp(engine: Engine) : XrApp(engine) {

    override val title = "VR Demo"
    override val icon = Icon.DEMO
    override val contentWidth = 0.84f
    override val contentHeight = 0.48f

    private val ctx: UiContext = engine.ui
    private val pad = Button3D(ctx, "Toque aqui", 0.30f, 0.10f)
    private val infoLabels = ArrayList<Label3D>()
    private var jsLine = "Zentra XR • plataforma Cardboard VR"
    private var jsTick = 0f
    private var spin = 0f
    private var padTouches = 0

    init {
        pad.textHeight = 0.022f
        pad.radius = 0.05f
        pad.onTap = { padTouches++ }
    }

    override fun update(dt: Float) {
        spin += dt * 22f
        pad.pos.set(0.22f, -0.10f, 0f)
        pad.fillTop = engine.theme.current.cardTop
        pad.fillBottom = engine.theme.current.cardBottom
        pad.borderColor = engine.theme.current.cardBorder
        pad.borderWidth = 0.0014f
        pad.update(dt)
        place(pad)

        jsTick -= dt
        if (jsTick <= 0f) {
            jsTick = 6f
            engine.js.evaluate("Zentra.demoLine(${engine.perf.fps.toInt()}, ${engine.thermal.level.index})") {
                if (!it.isNullOrBlank()) jsLine = it.trim('"')
            }
        }
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        out.add(pad)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme

        // rotating Zentra logo in 3D
        r.push()
        r.translate(-0.20f, 0.03f, 0.05f)
        r.rotate(spin, 0f, 1f, 0f)
        val ring = Material().base(theme.text)
        ring.rimLight(theme.glow, 0.9f)
        ring.spec = 0.8f
        r.scale(0.26f)
        r.mesh(Geometry.torus(0.075f, 48, 14), ring)
        // orbit node
        r.push()
        r.translate(0.5f, 0f, 0f)
        r.scale(0.22f)
        r.mesh(Geometry.sphere(20, 12), ring)
        r.pop()
        // the Z
        val glyph = Material().base(theme.text)
        glyph.glow(0x14141400)
        glyph.spec = 0.6f
        r.push()
        r.translate(0f, 0.15f, 0f)
        r.scale(0.30f, 0.055f, 0.055f)
        r.mesh(Geometry.box(), glyph)
        r.pop()
        r.push()
        r.translate(0f, -0.15f, 0f)
        r.scale(0.30f, 0.055f, 0.055f)
        r.mesh(Geometry.box(), glyph)
        r.pop()
        r.push()
        r.rotate(61f, 0f, 0f, 1f)
        r.scale(0.045f, 0.34f, 0.045f)
        r.mesh(Geometry.box(), glyph)
        r.pop()
        r.pop()

        // specs
        val lines = listOf(
            "Render: SBS estéreo • ${(engine.perf.renderScale * 100).toInt()}%",
            "FPS: ${engine.perf.fps.toInt()} • ${engine.perf.avgFrameMs.toInt()} ms",
            "3DoF: ${engine.head.source.name.replace('_', ' ')}",
            "Mãos: ${if (engine.hands.state == HandTracker.State.RUNNING) "${engine.hands.detectionFps.toInt()} Hz" else "off"}",
            "Térmico: ${engine.thermal.level.name} • ${engine.thermal.batteryTempC.toInt()}°C",
            jsLine
        )
        var y = 0.16f
        for (line in lines) {
            r.push()
            r.translate(0.02f, y, 0.01f)
            r.label(line, 0.017f, theme.textDim, 1, 0.95f, VrRenderer.ALIGN_LEFT, 0.56f)
            r.pop()
            y -= 0.032f
        }

        pad.draw(r)
        r.push()
        r.translate(0.22f, -0.17f, 0f)
        r.label("Toques: $padTouches", 0.015f, theme.textFaint, 1, 1f, VrRenderer.ALIGN_CENTER)
        r.pop()
    }
}

// ---------------------------------------------------------------------------
// 3D Viewer (OBJ)
// ---------------------------------------------------------------------------
object ObjLoader {
    fun load(text: String): Mesh {
        val positions = ArrayList<Float>()
        val normals = ArrayList<Float>()
        val builder = MeshBuilder()
        var hasNormals = false

        for (rawLine in text.lineSequence()) {
            val line = rawLine.trim()
            when {
                line.startsWith("v ") -> {
                    val p = line.split(Regex("\\s+"))
                    if (p.size >= 4) {
                        positions.add(p[1].toFloatOrNull() ?: 0f)
                        positions.add(p[2].toFloatOrNull() ?: 0f)
                        positions.add(p[3].toFloatOrNull() ?: 0f)
                    }
                }
                line.startsWith("vn ") -> {
                    val p = line.split(Regex("\\s+"))
                    if (p.size >= 4) {
                        normals.add(p[1].toFloatOrNull() ?: 0f)
                        normals.add(p[2].toFloatOrNull() ?: 0f)
                        normals.add(p[3].toFloatOrNull() ?: 0f)
                        hasNormals = true
                    }
                }
                line.startsWith("f ") -> {
                    val parts = line.substring(2).trim().split(Regex("\\s+"))
                    if (parts.size < 3) continue
                    val idx = ArrayList<IntArray>()
                    for (part in parts) {
                        val comps = part.split("/")
                        val vi = (comps.getOrNull(0)?.toIntOrNull() ?: 1) - 1
                        val ni = (comps.getOrNull(2)?.toIntOrNull() ?: 0) - 1
                        idx.add(intArrayOf(vi, ni))
                    }
                    for (k in 1 until idx.size - 1) {
                        val tri = listOf(idx[0], idx[k], idx[k + 1])
                        for ((vi, ni) in tri) {
                            val px = positions.getOrElse(vi * 3) { 0f }
                            val py = positions.getOrElse(vi * 3 + 1) { 0f }
                            val pz = positions.getOrElse(vi * 3 + 2) { 0f }
                            var nx = 0f
                            var ny = 0f
                            var nz = 1f
                            if (hasNormals && ni >= 0) {
                                nx = normals.getOrElse(ni * 3) { 0f }
                                ny = normals.getOrElse(ni * 3 + 1) { 1f }
                                nz = normals.getOrElse(ni * 3 + 2) { 0f }
                            }
                            builder.normal(nx, ny, nz)
                            builder.vertex(px, py, pz, 0.5f, 0.5f)
                        }
                    }
                }
            }
        }
        return builder.build()
    }
}

class ModelViewerApp(engine: Engine) : XrApp(engine) {

    override val title = "VR 3D Viewer"
    override val icon = Icon.VIEWER
    override val contentWidth = 0.80f
    override val contentHeight = 0.48f

    private val ctx: UiContext = engine.ui
    private val models = ArrayList<Pair<String, Mesh?>>()
    private var current = 0
    private var rotationY = 25f
    private var rotationX = -12f
    private var zoom = 1f
    private val slider = Slider3D(ctx, "Escala", 0.4f, 2f, 1f, 0.24f)
    private val buttons = ArrayList<Button3D>()
    private val localTip = Vec3()
    private val center = Vec3(0f, 0.02f, 0.06f)
    private var grabbing = false
    private var lastX = 0f
    private var lastY = 0f
    private var spinSpeed = 12f

    override fun onOpen() {
        models.clear()
        models.add("Esfera" to null)
        models.add("Torus" to null)
        models.add("Cubo" to null)
        models.add("Cilindro" to null)
        for (name in listOf("icosahedron", "torusknot", "helix")) {
            val mesh = try {
                val text = engine.context.assets.open("models/$name.obj").bufferedReader().readText()
                ObjLoader.load(text)
            } catch (t: Throwable) {
                null
            }
            models.add(name.replaceFirstChar { it.uppercase() } to mesh)
        }
        slider.onChanged = { zoom = it }
        for ((index, pair) in models.withIndex()) {
            val button = Button3D(ctx, pair.first, 0.115f, 0.038f)
            button.textHeight = 0.014f
            button.radius = 0.019f
            button.onTap = { current = index }
            buttons.add(button)
        }
    }

    override fun onClose() {
        for (pair in models) pair.second?.release()
    }

    override fun update(dt: Float) {
        if (!engine.settings.animations) spinSpeed = 0f
        // direct touch rotation: grab the model and turn it
        val tip = engine.touch.tip
        if (engine.touch.tracking) {
            val d = distanceToTip(tip)
            val touching = d < 0.20f
            if (touching && !grabbing) {
                grabbing = true
                lastX = tip.x
                lastY = tip.y
                engine.haptic(10L)
            } else if (!touching) {
                grabbing = false
            } else {
                rotationY += (tip.x - lastX) * 320f
                rotationX += (tip.y - lastY) * -320f
                lastX = tip.x
                lastY = tip.y
            }
        } else {
            grabbing = false
        }
        if (!grabbing) rotationY += dt * spinSpeed

        rotationX = rotationX.coerceIn(-80f, 80f)
        zoom = slider.value

        val theme = engine.theme.current
        slider.pos.set(-0.27f, -0.19f, 0f)
        slider.format = { "${(it * 100).toInt()}%" }
        slider.update(dt)
        place(slider)

        var x = -0.33f
        var y = 0.19f
        for ((index, button) in buttons.withIndex()) {
            button.pos.set(x, y, 0f)
            button.fillTop = if (index == current) theme.raisedTop else theme.cardTop
            button.fillBottom = if (index == current) theme.raisedBottom else theme.cardBottom
            button.borderColor = if (index == current) theme.text else theme.cardBorder
            button.borderWidth = if (index == current) 0.0016f else 0.001f
            button.update(dt)
            place(button)
            x += 0.125f
            if (x > 0.33f) {
                x = -0.33f
                y -= 0.046f
            }
        }
    }

    private fun distanceToTip(tip: Vec3): Float {
        val dx = tip.x - center.x
        val dy = tip.y - center.y
        val dz = tip.z - center.z
        return kotlin.math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        out.add(slider)
        out.addAll(buttons)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme
        val material = Material().base(theme.raisedTop)
        material.rimLight(theme.glow, 0.75f)
        material.spec = 0.55f
        material.glow(0x08080800)

        r.push()
        r.translate(center.x, center.y, center.z)
        r.rotate(rotationX, 1f, 0f, 0f)
        r.rotate(rotationY, 0f, 1f, 0f)
        val s = 0.34f * zoom
        r.scale(s)
        val (_, mesh) = models.getOrNull(current) ?: return
        when (current) {
            0 -> r.mesh(Geometry.sphere(32, 20), material)
            1 -> r.mesh(Geometry.torus(0.16f, 40, 18), material)
            2 -> r.mesh(Geometry.box(), material)
            3 -> r.mesh(Geometry.cylinder(32), material)
            else -> mesh?.let { r.mesh(it, material) }
                ?: r.mesh(Geometry.sphere(24, 16), material)
        }
        r.pop()

        // pedestal
        r.push()
        r.translate(center.x, -0.19f, center.z)
        r.scale(0.42f, 0.012f, 0.42f)
        val base = Material().base(theme.raisedBottom)
        base.rimStrength = 0.2f
        r.mesh(Geometry.box(), base)
        r.pop()

        slider.draw(r)
        for (button in buttons) button.draw(r)

        r.push()
        r.translate(0f, -0.235f, 0f)
        r.label("Gire o modelo com o dedo • use o slider para escalar", 0.014f,
            theme.textFaint, 1, 0.9f, VrRenderer.ALIGN_CENTER)
        r.pop()
    }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
class SettingsApp(engine: Engine) : XrApp(engine) {

    override val title = "Settings"
    override val icon = Icon.SETTINGS
    override val contentWidth = 0.86f
    override val contentHeight = 0.52f

    private val ctx: UiContext = engine.ui
    private val pages = listOf("VR", "Tracking", "Performance", "Interface", "System")
    private var page = 0
    private val rows = ArrayList<Widget>()
    private val pageButtons = ArrayList<Button3D>()
    private val statusLabel = Label3D(ctx, "", 0.015f, 1) { it.textDim }
    private var scroll = 0
    private var statusText = ""
    private var statusTimer = 0f

    override fun onOpen() {
        for ((index, name) in pages.withIndex()) {
            val button = Button3D(ctx, name, 0.15f, 0.042f)
            button.textHeight = 0.015f
            button.radius = 0.021f
            button.onTap = { setPage(index) }
            pageButtons.add(button)
        }
    }

    private fun setPage(index: Int) {
        page = index
        scroll = 0
        rebuild()
    }

    private fun clearRows() = rows.clear()

    private fun rebuild() {
        clearRows()
        val s = engine.settings
        when (page) {
            0 -> {
                addSlider("IPD", 0.050f, 0.075f, s.ipd, { "${(it * 1000).toInt()} mm" }) { s.ipd = it }
                addSlider("Field of View", 70f, 110f, s.fov, { "${it.toInt()}°" }) { s.fov = it }
                addSlider("Distância da UI", 1.0f, 3.0f, s.uiDistance, { "%.2f m".format(it) }) {
                    s.uiDistance = it
                }
                addSlider("Escala da UI", 0.7f, 1.6f, s.uiScale, { "${(it * 100).toInt()}%" }) {
                    s.uiScale = it
                }
                addSlider("Distância dos painéis", 1.0f, 2.5f, s.panelDistance) { s.panelDistance = it }
                addSegmented("Qualidade gráfica", listOf("Baixa", "Média", "Alta"), s.graphicsQuality) {
                    s.graphicsQuality = it
                }
                addSlider("Distorção (Cardboard)", 0f, 1f, s.barrelDistortion) { s.barrelDistortion = it }
                addSlider("Aberração cromática", 0f, 0.02f, s.chromaticAberration) {
                    s.chromaticAberration = it
                }
                addToggle("Inverter olhos (SBS swap)", s.sbsSwap) { s.sbsSwap = it }
                addToggle("Modo mono (sem óculos)", s.monoMode) { s.monoMode = it }
                addSegmented("Rotação da tela", listOf("Auto", "0", "90", "180", "270"),
                    s.screenRotationOverride + 1) {
                    s.screenRotationOverride = it - 1
                    engine.head.refreshDisplayRotation()
                }
                addButton("Recalibrar orientação") {
                    engine.head.recenter()
                    statusText = "Orientação recalibrada"
                    statusTimer = 2f
                }
            }
            1 -> {
                addToggle("Hand tracking", s.handTracking) {
                    s.handTracking = it
                    if (it) engine.startHandTracking() else engine.hands.stop()
                }
                addSegmented("Ponteiro", listOf("Auto", "Mãos", "Olhar"), s.pointerMode) {
                    s.pointerMode = it
                }
                addSlider("Sensibilidade", 0.5f, 2f, s.trackingSensitivity) { s.trackingSensitivity = it }
                addToggle("One Euro Filter", s.oneEuroEnabled) { s.oneEuroEnabled = it }
                addSlider("One Euro min cutoff", 0.3f, 5f, s.oneEuroMinCutoff) { s.oneEuroMinCutoff = it }
                addSlider("One Euro beta", 0f, 0.2f, s.oneEuroBeta) { s.oneEuroBeta = it }
                addSlider("One Euro d cutoff", 0.2f, 3f, s.oneEuroDCutoff) { s.oneEuroDCutoff = it }
                addToggle("Kalman Filter", s.kalmanEnabled) { s.kalmanEnabled = it }
                addSlider("Kalman processo (Q)", 0.001f, 0.2f, s.kalmanProcess) { s.kalmanProcess = it }
                addSlider("Kalman medição (R)", 0.02f, 1.5f, s.kalmanMeasurement) { s.kalmanMeasurement = it }
                addSlider("Tamanho do cursor", 0.5f, 2f, s.cursorSize) { s.cursorSize = it }
                addSlider("Suavização extra", 0f, 1f, s.extraSmoothing) { s.extraSmoothing = it }
                addSlider("FOV da câmera", 50f, 95f, s.cameraFov) { s.cameraFov = it }
                addSlider("Offset câmera X", -0.12f, 0.12f, s.cameraOffsetX) { s.cameraOffsetX = it }
                addSlider("Offset câmera Y", -0.12f, 0.12f, s.cameraOffsetY) { s.cameraOffsetY = it }
                addSlider("Offset câmera Z", -0.20f, 0.05f, s.cameraOffsetZ) { s.cameraOffsetZ = it }
                addSegmented("Resolução da câmera", listOf("320", "480", "640"), s.cameraResolution) {
                    s.cameraResolution = it
                    restartTracking()
                }
            }
            2 -> {
                addSegmented("FPS alvo", listOf("60", "72", "90", "Max"), s.targetFps) { s.targetFps = it }
                addSlider("Resolução interna", 0.6f, 1.25f, s.renderScale, { "${(it * 100).toInt()}%" }) {
                    s.renderScale = it
                }
                addToggle("Resolução adaptativa", s.adaptiveResolution) { s.adaptiveResolution = it }
                addSegmented("Modo", listOf("Auto", "Performance", "Econômico"), s.performanceMode) {
                    s.performanceMode = it
                }
                addToggle("Otimização térmica", s.thermalOptimization) { s.thermalOptimization = it }
                addSlider("Hand tracking Hz", 10f, 60f, s.handTrackingHz.toFloat(),
                    { "${it.toInt()} Hz" }) {
                    s.handTrackingHz = it.toInt()
                }
                addToggle("Mostrar FPS", s.showFps) { s.showFps = it }
                addLabel("Status", "${engine.perf.fps.toInt()} fps • " +
                    "${(engine.perf.renderScale * 100).toInt()}% res • ${engine.thermal.level.name}")
            }
            3 -> {
                addSegmented("Tema", listOf("Dark", "Light"), if (s.lightTheme) 1 else 0) {
                    s.lightTheme = it == 1
                }
                addSlider("Tamanho da UI", 0.8f, 1.4f, s.uiSize) { s.uiSize = it }
                addToggle("Animações", s.animations) { s.animations = it }
                addToggle("Grade no chão", s.showGrid) { s.showGrid = it }
                addSlider("Estrelas", 0f, 1.5f, s.starIntensity) { s.starIntensity = it }
                addToggle("Vibração (haptics)", s.haptics) { s.haptics = it }
            }
            4 -> {
                addLabel("Zentra XR", "Versão ${BuildConfig.VERSION_LABEL}")
                addLabel("Tecnologia", "Smartphone • Cardboard/VR Box • SBS • 3DoF • MediaPipe • Direct Touch")
                addLabel("Hand tracking", modelStatus())
                addButton("Instalar modelo de mãos") {
                    statusText = "Baixando modelo…"
                    statusTimer = 6f
                    engine.installModelAsync { ok ->
                        statusText = if (ok) "Modelo instalado" else "Falha no download"
                        statusTimer = 3f
                        rebuild()
                    }
                }
                addButton("Refazer onboarding") {
                    s.onboardingDone = false
                    statusText = "Reinicie o app para ver o onboarding"
                    statusTimer = 3f
                }
                addButton("Restaurar padrões") {
                    s.reset()
                    statusText = "Configurações restauradas"
                    statusTimer = 3f
                    setPage(page)
                }
                addLabel("Permissões", if (engine.host.hasCameraPermission()) "Câmera concedida" else "Câmera não concedida")
                addButton("Solicitar permissão da câmera") { engine.host.requestCameraPermission() }
            }
        }
        layoutRows()
    }

    private fun modelStatus(): String {
        val state = engine.hands.state
        return when {
            !engine.model.isReady() -> "Modelo ausente (instale abaixo)"
            state == HandTracker.State.RUNNING -> "Ativo • ${engine.hands.detectionFps.toInt()} Hz"
            state == HandTracker.State.ERROR -> engine.hands.statusMessage
            else -> "Parado"
        }
    }

    private fun restartTracking() {
        engine.hands.stop()
        engine.startHandTracking()
    }

    private fun addSlider(
        title: String,
        min: Float,
        max: Float,
        value: Float,
        format: (Float) -> String = { "%.2f".format(it) },
        onChange: (Float) -> Unit
    ) {
        val slider = Slider3D(ctx, title, min, max, value, 0.38f)
        slider.format = format
        slider.onChanged = onChange
        rows.add(slider)
    }

    private fun addToggle(title: String, value: Boolean, onChange: (Boolean) -> Unit) {
        val toggle = Toggle3D(ctx, title, value, 0.38f)
        toggle.onChanged = onChange
        rows.add(toggle)
    }

    private fun addSegmented(title: String, options: List<String>, selected: Int, onChange: (Int) -> Unit) {
        val wrapper = Segmented3D(ctx, options, selected, 0.22f)
        wrapper.onChanged = onChange
        rows.add(TitledRow(ctx, title, wrapper, 0.38f))
    }

    private fun addButton(text: String, action: () -> Unit) {
        val button = Button3D(ctx, text, 0.38f, 0.044f)
        button.textHeight = 0.017f
        button.radius = 0.022f
        button.onTap = action
        rows.add(button)
    }

    private fun addLabel(title: String, value: String) {
        val row = TitledRow(ctx, title, Label3D(ctx, value, 0.015f, 1) { it.textDim }, 0.38f)
        row.child.size.set(0.22f, 0.03f)
        rows.add(row)
    }

    private fun layoutRows() {
        var index = 0
        for (row in rows) {
            val col = index % 2
            val line = index / 2
            row.pos.set(if (col == 0) -0.215f else 0.215f, 0.18f - line * 0.055f, 0f)
            place(row)
            index++
        }
    }

    override fun update(dt: Float) {
        if (rows.isEmpty()) rebuild()
        if (statusTimer > 0f) {
            statusTimer -= dt
            if (statusTimer <= 0f) statusText = ""
        }
        val theme = engine.theme.current
        var x = -0.34f
        for ((index, button) in pageButtons.withIndex()) {
            button.pos.set(x, 0.235f, 0f)
            button.fillTop = if (index == page) theme.raisedTop else theme.panelTop
            button.fillBottom = if (index == page) theme.raisedBottom else theme.panelBottom
            button.borderColor = if (index == page) theme.text else theme.panelBorder
            button.borderWidth = if (index == page) 0.0016f else 0.0008f
            button.update(dt)
            place(button)
            x += 0.16f
        }
        for (row in rows) row.update(dt)
        statusLabel.value = statusText
        statusLabel.pos.set(-0.42f, -0.235f, 0f)
        place(statusLabel)
        statusLabel.update(dt)
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        out.addAll(pageButtons)
        for (row in rows) {
            when (row) {
                is TitledRow -> out.add(row.child)
                else -> out.add(row)
            }
        }
    }

    override fun draw(r: VrRenderer) {
        for (button in pageButtons) button.draw(r)
        for (row in rows) row.draw(r)
        statusLabel.draw(r)
    }

    /** Label + control row used by the settings pages. */
    private class TitledRow(ctx: UiContext, val text: String, val child: Widget, width: Float) :
        Widget(ctx) {

        private val label = Label3D(ctx, text, 0.016f, 1) { it.textDim }

        init {
            size.set(width, 0.05f)
            childZ = 0f
            children.add(label)
            children.add(child)
        }

        override fun update(dt: Float) {
            label.pos.set(-size.x * 0.5f, 0f, 0f)
            child.pos.set(size.x * 0.5f - child.size.x * 0.5f, 0f, 0.001f)
            super.update(dt)
        }

        override fun draw(r: VrRenderer) {
            r.push()
            r.multiply(local)
            label.draw(r)
            child.draw(r)
            r.pop()
        }


    }
}
