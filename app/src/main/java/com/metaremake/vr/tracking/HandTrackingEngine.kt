package com.metaremake.vr.tracking

import android.content.Context
import android.graphics.Bitmap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import com.metaremake.vr.util.MLog
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.hypot

/**
 * MediaPipe Hand Landmarker integration.
 *
 * This is continuous tracking, not gesture spotting: every frame it publishes
 * all 21 normalized landmarks + optional world landmarks, per-hand handedness,
 * per-hand confidence, the index-finger tip used as the VR pointer, thumb↔index
 * pinch distance and pointer velocity. One Euro + Kalman filters smooth the
 * landmarks without adding noticeable latency.
 */
class HandTrackingEngine(private val context: Context) {

    companion object {
        const val LANDMARK_COUNT = 21
        const val COORDS = 3
        const val MODEL_ASSET = "ml/hand_landmarker.task"
    }

    /** Continuous per-frame result (single frame, possibly two hands). */
    data class HandPose(
        val handedness: String,
        val handednessScore: Float,
        val confidence: Float,
        val landmarks: FloatArray,        // 21*3 normalized, filtered (x right, y down, z smaller=closer)
        val worldLandmarks: FloatArray,   // 21*3 world meters (zeros if unavailable)
        val pointerTip: FloatArray,       // x,y,z (landmark 8)
        val thumbTip: FloatArray,         // x,y,z (landmark 4)
        val pinchDistance: Float,         // normalized 3D distance thumb-tip ↔ index-tip
        val velocity: Float,              // normalized units / second of the pointer tip
        val timestampNs: Long
    )

    data class HandFrame(
        val hands: List<HandPose>,
        val timestampNs: Long
    )

    interface Listener {
        fun onHandFrame(frame: HandFrame)
        fun onModelMissing(reason: String)
    }

    var listener: Listener? = null

    /** Feeds frames: returns the latest camera bitmap, or null when none is ready. */
    var frameProvider: (() -> Bitmap?)? = null

    @Volatile
    var modelLoaded = false
        private set

    @Volatile
    var modelError: String? = null
        private set

    private var handLandmarker: HandLandmarker? = null
    private val running = AtomicBoolean(false)
    private var thread: Thread? = null

    // Slot state keyed by MediaPipe handedness index (0/1), so identity is
    // stable across frames.
    private class Slot {
        val filters = Array(LANDMARK_COUNT) { Array(COORDS) { OneEuroFilter.handLandmark() } }
        val kalmans = Array(LANDMARK_COUNT) { Array(COORDS) { KalmanFilter1D() } }
        var lastTip = FloatArray(3)
        var lastTipTs = 0L
        var velocity = 0f
        var hasPrev = false
    }

    private val slots = arrayOf(Slot(), Slot())

    private val lock = Object()
    private var busy = false

    // Reused buffers (avoid allocation in the tracking loop).
    private val filtered = FloatArray(LANDMARK_COUNT * COORDS)
    private val world = FloatArray(LANDMARK_COUNT * COORDS)

    /** Load the model. Safe to call repeatedly; no-op once loaded. */
    @Synchronized
    fun ensureLoaded(): Boolean {
        if (modelLoaded) return true
        if (modelError != null) return false
        try {
            val base = BaseOptions.builder()
                .setModelAssetPath(MODEL_ASSET)
                .setDelegate(Delegate.GPU)
                .build()
            val options = HandLandmarker.HandLandmarkerOptions.builder()
                .setBaseOptions(base)
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setNumHands(2)
                .setMinHandDetectionConfidence(0.5f)
                .setMinHandPresenceConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .setResultListener(this::onResult)
                .build()
            handLandmarker = HandLandmarker.createFromOptions(context, options)
            modelLoaded = true
            MLog.d("HandTracking", "Hand Landmarker model loaded from $MODEL_ASSET")
        } catch (t: Throwable) {
            modelError = t.message ?: "failed to load model"
            MLog.e("HandTracking", "failed to load Hand Landmarker: $modelError")
            handLandmarker = null
        }
        return modelLoaded
    }

    fun start() {
        if (!running.compareAndSet(false, true)) return
        thread = Thread({ loop() }, "HandTrackingThread").apply {
            priority = Thread.NORM_PRIORITY
            start()
        }
    }

    fun stop() {
        running.set(false)
        synchronized(lock) { lock.notifyAll() }
        thread?.interrupt()
        thread = null
    }

    fun close() {
        stop()
        handLandmarker?.close()
        handLandmarker = null
        modelLoaded = false
    }

    private fun loop() {
        if (!ensureLoaded()) {
            listener?.onModelMissing(modelError ?: "unknown")
            return
        }
        while (running.get()) {
            val provider = frameProvider ?: break
            val bmp = try { provider() } catch (t: Throwable) { null }
            if (bmp == null || bmp.isRecycled) {
                Thread.sleep(16)
                continue
            }
            synchronized(lock) {
                busy = true
            }
            try {
                val image = BitmapImageBuilder(bmp).build()
                val ts = System.nanoTime() / 1_000_000
                handLandmarker?.detectAsync(image, ts)
            } catch (t: Throwable) {
                synchronized(lock) { busy = false; lock.notifyAll() }
                MLog.d("HandTracking", "detectAsync failed: ${t.message}")
                Thread.sleep(16)
                continue
            }
            // Wait until the async callback releases us (frame-rate limiting).
            synchronized(lock) {
                val waitUntil = System.currentTimeMillis() + 100
                while (busy && running.get()) {
                    lock.wait(20)
                    if (System.currentTimeMillis() > waitUntil) break
                }
            }
        }
    }

    private fun onResult(result: HandLandmarkerResult, image: com.google.mediapipe.framework.image.MPImage) {
        val frame = buildFrame(result)
        try {
            listener?.onHandFrame(frame)
        } finally {
            synchronized(lock) { busy = false; lock.notifyAll() }
        }
    }

    private fun buildFrame(result: HandLandmarkerResult): HandFrame {
        val ts = System.nanoTime()
        val landmarksList = result.landmarks()
        val handednessList = result.handedness()
        val worldList = result.worldLandmarks()

        val poses = ArrayList<HandPose>(landmarksList.size)
        for (h in landmarksList.indices) {
            val lm = landmarksList[h]
            if (lm.size < LANDMARK_COUNT) continue

            // Determine slot: prefer the MediaPipe handedness index.
            val cats = if (h < handednessList.size) handednessList[h] else emptyList()
            var slotIndex = h.coerceAtMost(1)
            var label = "unknown"
            var labelScore = 0f
            if (cats.isNotEmpty()) {
                label = cats[0].categoryName()
                labelScore = cats[0].score()
                slotIndex = cats[0].index().coerceIn(0, 1)
            }
            val slot = slots[slotIndex]

            var confSum = 0f
            var confCount = 0
            var idx = 0
            for (i in 0 until LANDMARK_COUNT) {
                val l = lm[i]
                val raw = floatArrayOf(l.x(), l.y(), l.z())
                for (c in 0 until COORDS) {
                    val e = slot.filters[i][c].filter(raw[c], ts)
                    val k = slot.kalmans[i][c].filter(e.toDouble(), ts).toFloat()
                    filtered[idx] = k
                    confSum += k
                    confCount++
                    idx++
                }
            }
            val confidence = (confSum / confCount).coerceIn(0f, 1f)

            // World landmarks (meters, hand-centric) if present.
            java.util.Arrays.fill(world, 0f)
            if (h < worldList.size && worldList[h].size >= LANDMARK_COUNT) {
                for (i in 0 until LANDMARK_COUNT) {
                    val wl = worldList[h][i]
                    world[i * 3] = wl.x()
                    world[i * 3 + 1] = wl.y()
                    world[i * 3 + 2] = wl.z()
                }
            }

            // Pointer tip (8) and thumb tip (4).
            val tip = floatArrayOf(filtered[8 * 3], filtered[8 * 3 + 1], filtered[8 * 3 + 2])
            val thumb = floatArrayOf(filtered[4 * 3], filtered[4 * 3 + 1], filtered[4 * 3 + 2])
            val pinch = pinchDistance(thumb, tip)

            // Pointer velocity (normalized units / second).
            var vel = 0f
            if (slot.hasPrev) {
                val dt = (ts - slot.lastTipTs) / 1e9f
                if (dt > 1e-4f) {
                    val d = hypot(hypot(tip[0] - slot.lastTip[0], tip[1] - slot.lastTip[1]), (tip[2] - slot.lastTip[2]) * 2f)
                    val inst = d / dt
                    vel = slot.velocity * 0.8f + inst * 0.2f
                }
            }
            slot.lastTip[0] = tip[0]; slot.lastTip[1] = tip[1]; slot.lastTip[2] = tip[2]
            slot.lastTipTs = ts
            slot.velocity = vel
            slot.hasPrev = true

            // Map MediaPipe handedness to the user's physical hand: the camera
            // frame is mirrored, so MediaPipe's "Right" is the user's left hand.
            val physical = when (label.lowercase()) {
                "right" -> "left"
                "left" -> "right"
                else -> label
            }

            poses.add(
                HandPose(
                    handedness = physical,
                    handednessScore = labelScore,
                    confidence = confidence,
                    landmarks = filtered.copyOf(),
                    worldLandmarks = world.copyOf(),
                    pointerTip = tip.copyOf(),
                    thumbTip = thumb.copyOf(),
                    pinchDistance = pinch,
                    velocity = vel,
                    timestampNs = ts
                )
            )
        }
        return HandFrame(poses, ts)
    }

    private fun pinchDistance(thumb: FloatArray, tip: FloatArray): Float {
        val dx = thumb[0] - tip[0]
        val dy = thumb[1] - tip[1]
        val dz = (thumb[2] - tip[2]) * 2f
        return kotlin.math.sqrt(dx * dx + dy * dy + dz * dz)
    }
}
