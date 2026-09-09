package com.zentra.xr.system

import kotlin.math.max
import kotlin.math.min

/**
 * Keeps the frame budget under control.
 * Measures real frame times, caps the frame rate, scales the internal resolution and
 * decides how often hand tracking runs.
 */
class PerformanceManager {

    var frameMs = 16.7f
        private set

    var avgFrameMs = 16.7f
        private set

    var fps = 60f
        private set

    /** Dynamic resolution factor applied to the stereo framebuffer. */
    var renderScale = 1f
        private set

    var handHz = 30
        private set

    var qualityTier = 1f
        private set

    private var lastAdjustMs = 0L
    private var frameCount = 0
    private var windowStartMs = 0L
    private var beginNs = 0L

    fun beginFrame(nowNs: Long) {
        beginNs = nowNs
    }

    fun endFrame() {
        val nowNs = System.nanoTime()
        frameMs = ((nowNs - beginNs) / 1_000_000f).coerceIn(0f, 200f)
        avgFrameMs = avgFrameMs * 0.9f + frameMs * 0.1f
        frameCount++
        val nowMs = nowNs / 1_000_000L
        if (windowStartMs == 0L) windowStartMs = nowMs
        if (nowMs - windowStartMs >= 500L) {
            fps = frameCount * 1000f / (nowMs - windowStartMs)
            frameCount = 0
            windowStartMs = nowMs
        }
    }

    fun targetFrameMs(settings: Settings): Float = when (settings.targetFps) {
        1 -> 1000f / 72f
        2 -> 1000f / 90f
        3 -> 8f
        else -> 1000f / 60f
    }

    fun update(nowMs: Long, settings: Settings, thermal: ThermalManager) {
        val target = targetFrameMs(settings)

        // sustained overload detection feeds the thermal manager
        thermal.sustainedOverload = avgFrameMs > target * 1.6f

        if (nowMs - lastAdjustMs < 1500L) return
        lastAdjustMs = nowMs

        val thermalLevel = thermal.level.index
        val eco = settings.performanceMode == 2
        val boost = settings.performanceMode == 1

        val maxScale = when {
            eco -> settings.renderScale.coerceAtMost(0.75f)
            boost -> settings.renderScale.coerceAtMost(1.15f)
            else -> settings.renderScale
        }
        val minScale = when {
            thermalLevel >= 3 -> 0.55f
            thermalLevel >= 2 -> 0.65f
            eco -> 0.6f
            else -> 0.7f
        }

        if (!settings.adaptiveResolution && thermalLevel < 2) {
            renderScale = settings.renderScale
        } else if (avgFrameMs > target * 1.20f) {
            renderScale = (renderScale - 0.08f).coerceAtLeast(minScale)
        } else if (avgFrameMs < target * 0.82f) {
            renderScale = (renderScale + 0.04f).coerceAtMost(maxScale)
        }

        // quality tier drives stars, particles and shadow complexity
        val targetTier = when {
            thermalLevel >= 3 -> 0.35f
            thermalLevel >= 2 -> 0.6f
            thermalLevel >= 1 -> 0.85f
            eco -> 0.7f
            else -> 1f
        } * when (settings.graphicsQuality) {
            0 -> 0.6f
            2 -> 1f
            else -> 0.85f
        }
        qualityTier += (targetTier - qualityTier) * 0.25f

        handHz = when {
            thermalLevel >= 3 -> 12
            thermalLevel >= 2 -> 18
            thermalLevel >= 1 -> 24
            else -> settings.handTrackingHz
        }
        if (!settings.handTracking) handHz = 10

        renderScale = renderScale.coerceIn(0.5f, 1.25f)
        qualityTier = qualityTier.coerceIn(0.3f, 1f)
        handHz = max(10, min(60, handHz))
    }
}
