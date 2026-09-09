package com.zentra.xr.games

import android.opengl.Matrix
import com.zentra.xr.apps.XrApp
import com.zentra.xr.core.Geometry
import com.zentra.xr.xr.Material
import com.zentra.xr.core.Vec3
import com.zentra.xr.ui.Button3D
import com.zentra.xr.ui.Icon
import com.zentra.xr.ui.Icons
import com.zentra.xr.ui.Label3D
import com.zentra.xr.ui.Panel3D
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.VrRenderer
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/** Small floating HUD shared by the games. */
open class GameHud(
    protected val ctx: UiContext,
    engine: Engine,
    title: String
) {

    val panel = Panel3D(ctx, 0.44f, 0.11f)
    val titleLabel = Label3D(ctx, title, 0.022f, 2) { it.text }
    val scoreLabel = Label3D(ctx, "", 0.020f, 1) { it.textDim }
    val exitButton = Button3D(ctx, "Sair", 0.09f, 0.042f)

    init {
        panel.radius = 0.05f
        panel.add(titleLabel)
        panel.add(scoreLabel)
        panel.add(exitButton)
        titleLabel.pos.set(-0.19f, 0.022f, 0.002f)
        scoreLabel.pos.set(-0.19f, -0.022f, 0.002f)
        exitButton.pos.set(0.14f, 0f, 0.003f)
        exitButton.textHeight = 0.016f
        exitButton.radius = 0.021f
        exitButton.onTap = { engine.closeOverlay() }
    }

    open fun update(dt: Float, parent: FloatArray) {
        val theme = ctx.theme
        panel.fillTop = theme.panelTop
        panel.fillBottom = theme.panelBottom
        panel.borderColor = theme.panelBorder
        panel.borderWidth = 0.0014f
        panel.shadowStrength = 0.5f
        exitButton.fillTop = theme.raisedTop
        exitButton.fillBottom = theme.raisedBottom
        exitButton.borderColor = theme.cardBorder
        exitButton.borderWidth = 0.0012f
        exitButton.radius = 0.021f
        panel.update(dt)
        panel.updateWorld(parent)
    }

    fun targets(out: ArrayList<Widget>) {
        out.add(exitButton)
    }
}

// ---------------------------------------------------------------------------
// VR Target
// ---------------------------------------------------------------------------
class TargetGame(engine: Engine) : XrApp(engine) {

    override val title = "VR Target"
    override val icon = Icon.TARGET
    override val showWindowChrome = false

    private val ctx: UiContext = engine.ui
    private val hud = GameHud(ctx, engine, "VR Target")
    private val targets = ArrayList<Target>()
    private var score = 0
    private var combo = 1
    private var lastHitMs = 0L
    private var timeLeft = 60f
    private var spawnTimer = 0f
    private var finished = false
    private val bursts = ArrayList<Burst>()
    private val identity = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    private val material = Material()

    private class Target(
        val pos: Vec3,
        val radius: Float,
        var life: Float,
        var alive: Boolean = true,
        var pop: Float = 0f
    )

    private class Burst(val pos: Vec3, var t: Float = 0f)

    override fun onOpen() {
        hud.panel.pos.set(0f, -0.42f, -1.05f)
        hud.panel.rotX = 28f
        for (i in 0 until 3) spawn()
    }

    private fun spawn() {
        val yaw = ((Math.random() - 0.5) * 1.6f).toFloat()
        val pitch = ((Math.random() - 0.35f) * 0.9f).toFloat()
        val dist = 1.25f + (Math.random() * 0.7f).toFloat()
        val pos = Vec3(
            sin(yaw) * cos(pitch) * dist,
            sin(pitch) * dist + 0.1f,
            -cos(yaw) * cos(pitch) * dist
        )
        targets.add(Target(pos, 0.075f, 4.5f))
    }

    override fun update(dt: Float) {
        if (!finished) {
            timeLeft -= dt
            if (timeLeft <= 0f) {
                timeLeft = 0f
                finished = true
            }
            spawnTimer -= dt
            if (spawnTimer <= 0f && targets.count { it.alive } < 4) {
                spawnTimer = 0.7f
                spawn()
            }
        }

        hud.scoreLabel.value = "Pontos $score • x$combo • ${timeLeft.toInt()}s" +
            if (finished) " • FIM" else ""
        hud.update(dt, identity)

        val tip = engine.touch.tip
        val touching = engine.touch.tracking

        val iterator = targets.iterator()
        while (iterator.hasNext()) {
            val t = iterator.next()
            if (!t.alive) {
                t.pop += dt * 3.2f
                if (t.pop >= 1f) iterator.remove()
                continue
            }
            t.life -= dt
            if (t.life <= 0f) {
                t.alive = false
                combo = 1
                continue
            }
            if (touching && t.pos.distanceTo(tip) < t.radius + 0.035f) {
                t.alive = false
                bursts.add(Burst(Vec3().set(t.pos)))
                val now = System.currentTimeMillis()
                combo = if (now - lastHitMs < 2000L) (combo + 1).coerceAtMost(9) else 1
                lastHitMs = now
                score += 10 * combo
                engine.haptic(16L)
            }
        }

        val bit = bursts.iterator()
        while (bit.hasNext()) {
            val b = bit.next()
            b.t += dt * 2.2f
            if (b.t >= 1f) bit.remove()
        }

        if (finished && targets.isEmpty()) {
            // idle: keep the HUD alive
        }
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        hud.targets(out)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme
        material.base(theme.raisedTop)
        material.rimLight(theme.glow, 0.85f)
        material.spec = 0.6f
        material.glow(0x00000000)

        for (t in targets) {
            val pop = t.pop
            val scale = t.radius * 2f * (1f + pop * 0.8f)
            val alpha = if (t.alive) 1f else (1f - pop)
            r.push()
            r.translate(t.pos.x, t.pos.y, t.pos.z)
            r.scale(scale)
            r.mesh(Geometry.sphere(20, 14), material, alpha)
            r.pop()

            // outer ring shows the remaining time
            if (t.alive) {
                r.push()
                r.translate(t.pos.x, t.pos.y, t.pos.z)
                val ring = com.zentra.xr.xr.PanelStyle()
                ring.surface(0, 0, 0.05f)
                ring.stroke(theme.textDim, 0.006f)
                val s = t.radius * 2.4f + (1f - t.life / 4.5f) * 0.05f
                r.panel(s, s, ring, 0.55f)
                r.pop()
            }
        }

        for (b in bursts) {
            r.push()
            r.translate(b.pos.x, b.pos.y, b.pos.z)
            val ring = com.zentra.xr.xr.PanelStyle()
            ring.surface(0, 0, 0.05f)
            ring.stroke(theme.text, 0.008f * (1f - b.t))
            val s = 0.05f + b.t * 0.35f
            r.panel(s, s, ring, (1f - b.t) * 0.8f)
            r.pop()
        }

        hud.panel.draw(r)

        if (finished) {
            r.push()
            r.translate(0f, 0.12f, -1.2f)
            r.label("Fim de jogo • $score pontos", 0.05f, theme.text, 2, 1f,
                VrRenderer.ALIGN_CENTER)
            r.translate(0f, -0.06f, 0f)
            r.label("Toque em Sair ou peça para reiniciar", 0.02f, theme.textDim, 1, 1f,
                VrRenderer.ALIGN_CENTER)
            r.pop()
        } else {
            r.push()
            r.translate(0f, 0.30f, -1.4f)
            r.rotate(-12f, 1f, 0f, 0f)
            r.label("Toque nos alvos com o dedo", 0.022f, theme.textDim, 1, 0.8f,
                VrRenderer.ALIGN_CENTER)
            r.pop()
        }
    }
}

// ---------------------------------------------------------------------------
// VR Space
// ---------------------------------------------------------------------------
class SpaceGame(engine: Engine) : XrApp(engine) {

    override val title = "VR Space"
    override val icon = Icon.SPACE
    override val showWindowChrome = false

    private val ctx: UiContext = engine.ui
    private val hud = GameHud(ctx, engine, "VR Space")
    private val rings = ArrayList<Ring>()
    private var playerX = 0f
    private var playerY = 0f
    private var speed = 4f
    private var score = 0
    private var missed = 0
    private val identity = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    private val material = Material()
    private val forward = Vec3()
    private var travelled = 0f
    private var spawnZ = -26f

    private class Ring(var z: Float, var passed: Boolean = false, var hit: Boolean = false)

    override fun onOpen() {
        hud.panel.pos.set(0f, -0.42f, -1.05f)
        hud.panel.rotX = 28f
        for (i in 0 until 14) rings.add(Ring(-6f - i * 4f))
    }

    override fun update(dt: Float) {
        val m = engine.head.headWorld
        forward.set(-m[8], -m[9], -m[10])
        // steer with the head: looking left drifts left
        playerX = (playerX + forward.x * speed * dt * 0.55f).coerceIn(-1.6f, 1.6f)
        playerY = (playerY - forward.y * speed * dt * 0.35f).coerceIn(-1.0f, 1.2f)
        travelled += speed * dt

        for (ring in rings) {
            ring.z += speed * dt
            if (!ring.passed && ring.z > 0.15f) {
                ring.passed = true
                val d = sqrt(playerX * playerX + playerY * playerY)
                if (d < 0.62f) {
                    ring.hit = true
                    score += 5
                    engine.haptic(10L)
                } else {
                    missed++
                }
            }
            if (ring.z > 2.2f) {
                ring.z = spawnZ
                ring.passed = false
                ring.hit = false
            }
        }

        hud.scoreLabel.value = "Anéis $score • erros $missed • ${speed.toInt()} u/s"
        hud.update(dt, identity)
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        hud.targets(out)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme
        material.base(theme.raisedTop)
        material.rimLight(theme.glow, 0.9f)
        material.spec = 0.5f
        material.glow(0x00000000)

        r.push()
        r.translate(-playerX, -playerY + 0.1f, 0f)
        for (ring in rings) {
            val dist = abs(ring.z)
            val fade = (1f - dist / 26f).coerceIn(0.05f, 1f)
            r.push()
            r.translate(0f, 0f, ring.z)
            val s = 1.3f
            r.scale(s)
            r.mesh(Geometry.torus(0.06f, 36, 10), material, fade)
            r.pop()
        }
        r.pop()

        // cockpit marker
        r.push()
        r.translate(playerX * 0f, 0f, -0.55f)
        val marker = com.zentra.xr.xr.PanelStyle()
        marker.surface(0, 0, 0.05f)
        marker.stroke(theme.textFaint, 0.0016f)
        r.panel(0.05f, 0.05f, marker, 0.5f)
        r.pop()

        // speed streaks
        for (i in 0 until 26) {
            val a = i * 2.399f
            val rad = 1.4f + (i % 5) * 0.5f
            val z = -((travelled * 2.2f + i * 1.7f) % 26f)
            r.push()
            r.translate(cos(a) * rad - playerX, (sin(a) * rad * 0.5f) - playerY, z)
            val streak = com.zentra.xr.xr.PanelStyle()
            streak.surface(theme.textFaint, theme.textFaint, 0.01f)
            r.panel(0.008f, 0.10f, streak, 0.35f)
            r.pop()
        }

        hud.panel.draw(r)
    }
}

// ---------------------------------------------------------------------------
// VR Blocks
// ---------------------------------------------------------------------------
class BlocksGame(engine: Engine) : XrApp(engine) {

    override val title = "VR Blocks"
    override val icon = Icon.BLOCKS
    override val showWindowChrome = false

    private val ctx: UiContext = engine.ui
    private val hud = GameHud(ctx, engine, "VR Blocks")
    private val blocks = ArrayList<Block>()
    private val identity = FloatArray(16).apply { Matrix.setIdentityM(this, 0) }
    private val material = Material()
    private val heldPos = Vec3()
    private var held: Block? = null
    private var resetButton = Button3D(ctx, "Reiniciar", 0.11f, 0.042f)
    private var score = 0

    private class Block(
        val cell: IntArray,
        val pos: Vec3,
        val target: Vec3,
        val colorSeed: Int
    ) {
        var held = false
    }

    private val cellSize = 0.115f
    private val baseZ = -0.95f
    private val baseY = -0.28f

    override fun onOpen() {
        hud.panel.pos.set(0f, -0.48f, -1.05f)
        hud.panel.rotX = 32f
        resetButton.pos.set(0f, -0.38f, -1.05f)
        resetButton.rotX = 32f
        resetButton.textHeight = 0.016f
        resetButton.radius = 0.021f
        resetButton.onTap = { rebuild() }
        rebuild()
    }

    private fun rebuild() {
        blocks.clear()
        var index = 0
        for (row in 0 until 3) {
            for (col in 0 until 3) {
                for (layer in 0 until 2) {
                    val pos = cellPosition(col, row, layer)
                    blocks.add(Block(intArrayOf(col, row, layer), Vec3().set(pos), Vec3().set(pos), index))
                    index++
                }
            }
        }
        held = null
        score = 0
    }

    private fun cellPosition(col: Int, row: Int, layer: Int): Vec3 = Vec3(
        (col - 1) * cellSize,
        baseY + row * cellSize,
        baseZ + layer * cellSize * 0.7f
    )

    override fun update(dt: Float) {
        val tip = engine.touch.tip
        val tracking = engine.touch.tracking

        if (tracking) {
            if (held == null) {
                var best: Block? = null
                var bestD = 0.075f
                for (block in blocks) {
                    val d = block.pos.distanceTo(tip)
                    if (d < bestD) {
                        bestD = d
                        best = block
                    }
                }
                if (best != null) {
                    held = best
                    best.held = true
                    engine.haptic(14L)
                }
            } else {
                val block = held!!
                if (block.pos.distanceTo(tip) > 0.26f) {
                    block.held = false
                    held = null
                    snapAll()
                }
            }
        } else if (held != null) {
            held?.held = false
            held = null
            snapAll()
        }

        held?.let { block ->
            block.pos.lerp(tip, 0.55f)
        }
        for (block in blocks) {
            if (!block.held) block.pos.lerp(block.target, 0.18f)
        }

        // score = highest column
        var best = 0
        for (col in 0 until 3) {
            val count = blocks.count { it.cell[0] == col && it.pos.y > baseY + cellSize * 0.5f }
            best = max(best, count)
        }
        score = best
        hud.scoreLabel.value = "Blocos: ${blocks.size} • coluna maior: $score"
        hud.update(dt, identity)
        resetButton.fillTop = engine.theme.current.raisedTop
        resetButton.fillBottom = engine.theme.current.raisedBottom
        resetButton.borderColor = engine.theme.current.cardBorder
        resetButton.borderWidth = 0.0012f
        resetButton.update(dt)
        resetButton.updateWorld(identity)
    }

    private fun snapAll() {
        // each block snaps to the closest free lattice cell
        val used = HashSet<String>()
        val sorted = blocks.sortedBy { it.cell[2] * 100 + it.cell[1] * 10 + it.cell[0] }
        for (block in sorted) {
            var bestKey = ""
            var bestD = Float.MAX_VALUE
            for (row in 0 until 5) {
                for (col in 0 until 3) {
                    for (layer in 0 until 2) {
                        val key = "$col,$row,$layer"
                        if (key in used) continue
                        val p = cellPosition(col, row, layer)
                        val d = p.distanceTo(block.pos)
                        if (d < bestD) {
                            bestD = d
                            bestKey = key
                        }
                    }
                }
            }
            used.add(bestKey)
            val parts = bestKey.split(",")
            if (parts.size == 3) {
                block.cell[0] = parts[0].toInt()
                block.cell[1] = parts[1].toInt()
                block.cell[2] = parts[2].toInt()
                block.target.set(cellPosition(block.cell[0], block.cell[1], block.cell[2]))
            }
        }
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        hud.targets(out)
        out.add(resetButton)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme

        // lattice guides
        for (row in 0 until 5) {
            for (col in 0 until 3) {
                val p = cellPosition(col, row, 0)
                r.push()
                r.translate(p.x, p.y, p.z)
                val guide = com.zentra.xr.xr.PanelStyle()
                guide.surface(0, 0, 0.05f)
                guide.stroke(theme.textFaint, 0.0012f)
                r.panel(cellSize * 0.92f, cellSize * 0.92f, guide, 0.18f)
                r.pop()
            }
        }

        material.rimLight(theme.glow, 0.7f)
        material.spec = 0.5f
        for (block in blocks) {
            val shade = if (block.held) theme.text else theme.raisedTop
            material.base(shade)
            material.glow(if (block.held) 0x1A1A1A00 else 0x00000000)
            r.push()
            r.translate(block.pos.x, block.pos.y, block.pos.z)
            val s = cellSize * if (block.held) 1.06f else 0.98f
            r.scale(s)
            r.mesh(Geometry.box(), material)
            r.pop()
        }

        hud.panel.draw(r)
        resetButton.draw(r)

        r.push()
        r.translate(0f, 0.32f, -1.3f)
        r.label("Toque em um bloco para pegá-lo • afaste o dedo para soltar", 0.019f,
            theme.textDim, 1, 0.8f, VrRenderer.ALIGN_CENTER)
        r.pop()
    }
}
