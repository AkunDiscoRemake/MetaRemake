package com.zentra.xr.screens

import android.Manifest
import android.content.pm.PackageManager
import android.opengl.Matrix
import com.zentra.xr.core.Texture
import com.zentra.xr.tracking.HandTracker
import com.zentra.xr.tracking.ModelInstaller
import com.zentra.xr.ui.Button3D
import com.zentra.xr.ui.Icon
import com.zentra.xr.ui.Icons
import com.zentra.xr.ui.Label3D
import com.zentra.xr.ui.Panel3D
import com.zentra.xr.ui.Segmented3D
import com.zentra.xr.ui.Slider3D
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import com.zentra.xr.ui.ZentraLogo
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.HeadTracker.Source
import com.zentra.xr.xr.Screen
import com.zentra.xr.xr.VrRenderer
import kotlin.math.sin

/**
 * First run: logo, sensor check, camera permission, VR setup, calibration and a
 * hands-on explanation of Direct Touch.
 */
class OnboardingScreen(engine: Engine) : Screen(engine) {

    private enum class Step { LOGO, SENSORS, CAMERA, VR_MODE, CALIBRATE, DIRECT_TOUCH, DONE }

    private val ctx: UiContext = engine.ui
    private var step = Step.LOGO
    private var stepTime = 0f

    private val panel = Panel3D(ctx, 0.62f, 0.42f)
    private val title = Label3D(ctx, "", 0.030f, 2) { it.text }
    private val body = Label3D(ctx, "", 0.017f, 1) { it.textDim }
    private val detail = Label3D(ctx, "", 0.014f, 1) { it.textFaint }
    private val primary = Button3D(ctx, "Continuar", 0.20f, 0.05f)
    private val secondary = Button3D(ctx, "Pular", 0.14f, 0.05f)
    private val ipdSlider = Slider3D(ctx, "IPD", 0.050f, 0.075f, engine.settings.ipd, 0.34f)
    private val modeSegments = Segmented3D(ctx, listOf("SBS", "Mono"), 0, 0.34f)
    private var logoTexture: Texture? = null
    private var installedAsked = false

    init {
        enterOffsetZ = -0.4f
        panel.radius = 0.03f
        panel.add(title)
        panel.add(body)
        panel.add(detail)
        panel.add(primary)
        panel.add(secondary)
        title.pos.set(0f, 0.13f, 0.002f)
        body.pos.set(0f, 0.06f, 0.002f)
        detail.pos.set(0f, 0.005f, 0.002f)
        primary.pos.set(0.09f, -0.155f, 0.003f)
        secondary.pos.set(-0.17f, -0.155f, 0.003f)
        primary.textHeight = 0.020f
        secondary.textHeight = 0.020f
        primary.radius = 0.025f
        secondary.radius = 0.025f
        primary.onTap = { advance() }
        secondary.onTap = { advance(skip = true) }

        ipdSlider.pos.set(0f, 0.03f, 0.003f)
        ipdSlider.format = { "${(it * 1000).toInt()} mm" }
        ipdSlider.onChanged = { engine.settings.ipd = it }
        modeSegments.pos.set(0f, -0.05f, 0.003f)
        modeSegments.onChanged = { engine.settings.monoMode = it == 1 }
        panel.add(ipdSlider)
        panel.add(modeSegments)
    }

    override fun onEnter() {
        applyStep()
    }

    /** GPU resources are created lazily: the first update already runs on the GL thread. */
    private fun ensureAssets() {
        if (logoTexture != null) return
        logoTexture = engine.renderer.text.art("zentra.logo", 256) { canvas, size ->
            ZentraLogo.draw(canvas, size.toFloat(), 0xFFFFFFFF.toInt())
        }
    }

    private fun advance(skip: Boolean = false) {
        when (step) {
            Step.LOGO -> step = Step.SENSORS
            Step.SENSORS -> step = Step.CAMERA
            Step.CAMERA -> {
                if (!skip) engine.host.requestCameraPermission()
                step = Step.VR_MODE
            }
            Step.VR_MODE -> step = Step.CALIBRATE
            Step.CALIBRATE -> {
                engine.head.recenter()
                step = Step.DIRECT_TOUCH
            }
            Step.DIRECT_TOUCH -> step = Step.DONE
            Step.DONE -> {
                engine.settings.onboardingDone = true
                closing = true
                onExit()
            }
        }
        stepTime = 0f
        applyStep()
    }

    private fun applyStep() {
        val s = engine.settings
        when (step) {
            Step.LOGO -> {
                title.value = "Zentra XR"
                body.value = "Plataforma Cardboard VR para smartphone"
                detail.value = "Toque em Continuar"
            }
            Step.SENSORS -> {
                val source = engine.head.source
                title.value = "Sensores"
                body.value = when (source) {
                    Source.ROTATION_VECTOR -> "Giroscópio + acelerômetro + magnetômetro"
                    Source.GAME_ROTATION_VECTOR -> "Giroscópio + acelerômetro"
                    Source.GYROSCOPE -> "Somente giroscópio"
                    else -> "Nenhum sensor de orientação encontrado"
                }
                detail.value = "3DoF ativo • gire a cabeça para olhar ao redor"
            }
            Step.CAMERA -> {
                title.value = "Câmera para Hand Tracking"
                body.value = "A câmera detecta suas mãos para o Direct Touch."
                detail.value = "Nada é exibido em passagem: você continua no mundo virtual."
            }
            Step.VR_MODE -> {
                title.value = "Modo VR"
                body.value = "Ajuste o IPD e o formato da imagem"
                detail.value = "Inverta para SBS swap nas configurações se necessário"
            }
            Step.CALIBRATE -> {
                title.value = "Calibração"
                body.value = "Olhe para frente e toque em Continuar"
                detail.value = "Isso define o centro do seu mundo virtual"
            }
            Step.DIRECT_TOUCH -> {
                title.value = "Direct Touch"
                body.value = "Aponte e toque nos elementos com o dedo indicador"
                detail.value = if (engine.hands.state == HandTracker.State.RUNNING)
                    "Mão detectada • teste agora" else
                    "Mostre a mão aberta à câmera traseira"
            }
            Step.DONE -> {
                title.value = "Tudo pronto"
                body.value = "Bem-vindo ao Zentra XR"
                detail.value = "Toque em Continuar para entrar no hub"
            }
        }
        primary.label = when (step) {
            Step.CAMERA -> "Permitir"
            Step.DONE -> "Entrar"
            else -> "Continuar"
        }
        val showSetup = step == Step.VR_MODE
        ipdSlider.visible = showSetup
        modeSegments.visible = showSetup
        secondary.visible = step == Step.CAMERA || step == Step.DIRECT_TOUCH
        secondary.label = if (step == Step.CAMERA) "Agora não" else "Pular"
        body.size.set(0.54f, 0.04f)
        detail.size.set(0.54f, 0.04f)
    }

    override fun update(dt: Float) {
        super.update(dt)
        ensureAssets()
        stepTime += dt

        // auto advance the splash screen
        if (step == Step.LOGO && stepTime > 3.4f) advance()

        // hand tracking can start as soon as the permission is granted
        if (!installedAsked && engine.host.hasCameraPermission()) {
            installedAsked = true
            if (!engine.model.isReady()) {
                engine.installModelAsync { }
            } else {
                engine.startHandTracking()
            }
            if (step == Step.CAMERA) {
                detail.value = "Permissão concedida • preparando o modelo"
            }
        }

        val theme = engine.theme.current
        panel.fillTop = theme.panelTop
        panel.fillBottom = theme.panelBottom
        panel.borderColor = theme.cardBorder
        panel.borderWidth = 0.0016f
        panel.shadowStrength = 0.6f
        panel.shadowSize = 0.10f
        primary.fillTop = theme.text
        primary.fillBottom = theme.text
        primary.borderColor = 0
        primary.borderWidth = 0f
        primary.textHeight = 0.020f
        secondary.fillTop = theme.raisedTop
        secondary.fillBottom = theme.raisedBottom
        secondary.borderColor = theme.cardBorder
        secondary.borderWidth = 0.0012f

        panel.update(dt)
        panel.updateWorld(root)
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        if (transition < 0.3f) return
        out.add(primary)
        if (secondary.visible) out.add(secondary)
        if (ipdSlider.visible) out.add(ipdSlider)
        if (modeSegments.visible) out.add(modeSegments)
    }

    override fun draw(r: VrRenderer) {
        if (transition <= 0.01f) return
        val theme = r.theme

        // logo + progress for the boot step
        if (step == Step.LOGO) {
            r.push(root)
            r.translate(0f, 0.12f, 0.10f)
            val t = (stepTime / 3.4f).coerceIn(0f, 1f)
            val size = 0.30f * (0.85f + 0.15f * t)
            r.push()
            r.translate(-size * 0.5f, size * 0.5f, 0f)
            r.sprite(logoTexture, size, size, theme.text, transition,
                useTex = true)
            r.pop()
            r.translate(0f, -0.06f, 0f)
            val bar = com.zentra.xr.xr.PanelStyle()
            bar.surface(theme.textDim, theme.textDim, 0.002f)
            r.panel(0.34f, 0.004f, bar, 0.25f)
            r.push()
            r.translate(-0.17f + 0.17f * t, 0f, 0.002f)
            val fill = com.zentra.xr.xr.PanelStyle()
            fill.surface(theme.text, theme.text, 0.002f)
            r.panel(0.34f * t, 0.004f, fill, 1f)
            r.pop()
            r.pop()
        }

        r.push(root)
        panel.draw(r)
        r.pop()

        // floating hint spheres demonstrating depth
        r.push(root)
        for (i in 0 until 3) {
            val a = engine.time * 0.4f + i * 2.1f
            r.push()
            r.translate(sin(a) * 0.42f, 0.28f + sin(a * 1.7f) * 0.03f, -0.18f + i * 0.06f)
            r.circle(0.012f + i * 0.004f, theme.textFaint, 0.35f)
            r.pop()
        }
        r.pop()

        if (step == Step.DIRECT_TOUCH) {
            val tracking = engine.touch.tracking
            r.push(root)
            r.translate(0f, -0.30f, 0.14f)
            r.rotate(-20f, 1f, 0f, 0f)
            r.label(
                if (tracking) "Mão detectada: toque no botão Continuar" else "Sem mão detectada",
                0.016f, if (tracking) theme.text else theme.textFaint, 1, 0.9f,
                VrRenderer.ALIGN_CENTER
            )
            r.pop()

            // a demo pad to touch
            r.push(root)
            r.translate(0f, -0.16f, 0.20f)
            r.rotate(-25f, 1f, 0f, 0f)
            val pad = com.zentra.xr.xr.PanelStyle()
            pad.surface(theme.raisedTop, theme.raisedBottom, 0.03f)
            pad.stroke(theme.cardBorder, 0.0014f)
            r.panel(0.18f, 0.10f, pad, 0.9f)
            r.translate(0f, 0f, 0.002f)
            r.label("toque", 0.018f, theme.textDim, 1, 0.8f, VrRenderer.ALIGN_CENTER)
            r.pop()
        }
    }

    override fun onBack(): Boolean = true
}
