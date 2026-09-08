package com.metaremake.vr.input

import com.metaremake.vr.tracking.HandTrackingEngine
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Interaction layer built on the continuous hand landmarks produced by
 * [HandTrackingEngine]. Converts raw landmarks into the abstract
 * [InputEventType] vocabulary:
 *
 *  - index-finger tip        -> pointer / cursor (POINTER_MOVE)
 *  - thumb↔index pinch       -> POINTER_DOWN / DRAG / POINTER_UP (+ CLICK on tap)
 *  - dwell (hold still)      -> CLICK / SELECT
 *  - open-palm vertical move -> SCROLL
 *  - horizontal wave         -> BACK
 *  - open palm held still    -> MENU
 *  - both hands pinching     -> RECENTER
 *
 * Thresholds are deliberately conservative; they can be tuned at runtime from
 * JS via the runtime configuration (see input config in js/).
 */
class HandInputMapper {

    data class Config(
        var pinchThreshold: Float = 0.12f,
        var dwellMs: Long = 450,
        var tapMoveThreshold: Float = 0.025f,
        var dragMoveThreshold: Float = 0.012f,
        var scrollVelocity: Float = 0.35f,     // normalized units / s
        var waveAmplitude: Float = 0.18f,
        var holdMs: Long = 1200,
        var cooldownMs: Long = 900
    )

    val config = Config()

    private class HandState {
        var seenThisFrame = false
        var lastTip = FloatArray(2)
        var lastPalm = FloatArray(2)
        var down = false
        var downX = 0f
        var downY = 0f
        var dwellStart = 0L
        var dwellFired = false
        var dragActive = false
        var holdStart = 0L
        var holdFired = false
        var waveLastDir = 0
        var waveLastSwitch = 0L
        var waveStartX = 0f
        var lastTs = 0L
        var lastBackTs = 0L
    }

    private val hands = arrayOf(HandState(), HandState())

    private var lastRecenterTs = 0L
    private var bothPinchDown = false

    /**
     * Process a hand frame and emit resulting events into [sink].
     * [whichSlot] lets the caller tag events with the hand identity.
     */
    fun onHandFrame(frame: HandTrackingEngine.HandFrame, sink: (InputEvent) -> Unit) {
        val now = frame.timestampNs
        val poses = frame.hands
        for (slot in hands) slot.seenThisFrame = false

        var pinchingCount = 0
        for (p in poses) if (p.pinchDistance < config.pinchThreshold) pinchingCount++

        // Recenter: both hands pinching at the same time.
        if (pinchingCount >= 2 && poses.size >= 2) {
            if (!bothPinchDown) {
                bothPinchDown = true
                if (now - lastRecenterTs > config.cooldownMs * 1_000_000) {
                    lastRecenterTs = now
                    sink(InputEvent(InputEventType.RECENTER, "hand", timestampNs = now))
                }
            }
        } else {
            bothPinchDown = false
        }

        for ((index, p) in poses.withIndex()) {
            processHand(p, slotFor(p.handedness, index), now, sink)
        }
        // Hands that vanished this frame: release any in-flight press.
        for (slot in hands) if (!slot.seenThisFrame && slot.down) {
            slot.down = false
            slot.dragActive = false
            sink(InputEvent(InputEventType.POINTER_UP, "hand", slot.lastTip[0], slot.lastTip[1], timestampNs = now))
        }
    }

    private fun slotFor(handedness: String, index: Int): HandState {
        val id = when (handedness.lowercase()) { "left" -> 0; "right" -> 1; else -> index % 2 }
        return hands[id]
    }

    private fun processHand(
        p: HandTrackingEngine.HandPose,
        slot: HandState,
        now: Long,
        sink: (InputEvent) -> Unit
    ) {
        slot.seenThisFrame = true
        val tip = p.pointerTip
        val palm = floatArrayOf(p.landmarks[0], p.landmarks[1])
        val pinch = p.pinchDistance < config.pinchThreshold

        // --- pointer movement -------------------------------------------------
        sink(InputEvent(InputEventType.POINTER_MOVE, "hand", tip[0], tip[1], tip[2], timestampNs = now))

        if (slot.lastTs != 0L) {
            val dt = (now - slot.lastTs) / 1e9f
            if (dt > 0f) {
                // --- open-palm scroll ----------------------------------------
                val palmVy = (palm[1] - slot.lastPalm[1]) / dt
                val palmVx = (palm[0] - slot.lastPalm[0]) / dt
                if (!pinch && abs(palmVy) > config.scrollVelocity && abs(palmVx) < abs(palmVy) * 0.5f) {
                    sink(InputEvent(InputEventType.SCROLL, "hand", deltaY = -palmVy * dt, timestampNs = now))
                }

                // --- horizontal wave -> BACK ----------------------------------
                val dx = palm[0] - slot.waveStartX
                val dir = if (abs(dx) > config.waveAmplitude) { if (dx > 0) 1 else -1 } else 0
                if (dir != 0 && dir != slot.waveLastDir) {
                    if (now - slot.waveLastSwitch < 700_000_000 && now - slot.lastBackTs > config.cooldownMs * 1_000_000) {
                        slot.lastBackTs = now
                        sink(InputEvent(InputEventType.BACK, "hand", timestampNs = now))
                    }
                    slot.waveLastSwitch = now
                    slot.waveLastDir = dir
                    slot.waveStartX = palm[0]
                }
            }
        }
        slot.lastPalm[0] = palm[0]
        slot.lastPalm[1] = palm[1]

        // --- hold open palm -> MENU ------------------------------------------
        if (!pinch) {
            if (slot.holdStart == 0L) slot.holdStart = now
            else if (now - slot.holdStart > config.holdMs * 1_000_000 && !slot.holdFired) {
                slot.holdFired = true
                sink(InputEvent(InputEventType.MENU, "hand", timestampNs = now))
            }
        } else {
            slot.holdStart = 0L
            slot.holdFired = false
        }

        // --- pinch press / drag / release ------------------------------------
        if (pinch && !slot.down) {
            slot.down = true
            slot.dragActive = false
            slot.downX = tip[0]; slot.downY = tip[1]
            slot.dwellStart = now
            slot.dwellFired = false
            sink(InputEvent(InputEventType.POINTER_DOWN, "hand", tip[0], tip[1], tip[2], timestampNs = now))
        } else if (pinch && slot.down) {
            val moved = hypot(tip[0] - slot.downX, tip[1] - slot.downY)
            if (!slot.dragActive && moved > config.dragMoveThreshold) {
                slot.dragActive = true
            }
            if (slot.dragActive) {
                sink(InputEvent(InputEventType.DRAG, "hand", tip[0], tip[1], tip[2],
                    deltaX = tip[0] - slot.lastTip[0], deltaY = tip[1] - slot.lastTip[1], timestampNs = now))
            } else if (moved < config.tapMoveThreshold && !slot.dwellFired && now - slot.dwellStart > config.dwellMs * 1_000_000) {
                // Dwell click.
                slot.dwellFired = true
                sink(InputEvent(InputEventType.CLICK, "hand", tip[0], tip[1], tip[2], timestampNs = now))
                sink(InputEvent(InputEventType.SELECT, "hand", tip[0], tip[1], tip[2], timestampNs = now))
            }
        } else if (!pinch && slot.down) {
            val moved = hypot(tip[0] - slot.downX, tip[1] - slot.downY)
            sink(InputEvent(InputEventType.POINTER_UP, "hand", tip[0], tip[1], tip[2], timestampNs = now))
            if (!slot.dragActive && moved < config.tapMoveThreshold) {
                sink(InputEvent(InputEventType.CLICK, "hand", tip[0], tip[1], tip[2], timestampNs = now))
                sink(InputEvent(InputEventType.SELECT, "hand", tip[0], tip[1], tip[2], timestampNs = now))
            }
            slot.down = false
            slot.dragActive = false
        }

        slot.lastTip[0] = tip[0]
        slot.lastTip[1] = tip[1]
        slot.lastTs = now
    }
}
