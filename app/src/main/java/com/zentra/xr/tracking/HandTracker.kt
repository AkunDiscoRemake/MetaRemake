package com.zentra.xr.tracking

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.zentra.xr.core.Vec3
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * Rear camera hand tracking.
 *
 * The camera is used for one thing only: locating the user's fingertip so it can touch
 * the virtual interface. Frames never reach the display - there is no passthrough, no
 * augmented reality and no environment mapping anywhere in this pipeline.
 */
class HandTracker(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val onStatus: (String) -> Unit
) {

    companion object {
        private const val TAG = "ZentraHands"

        /** Physical distance between the wrist and the middle finger knuckle (meters). */
        private const val HAND_SPAN_M = 0.095f

        private const val WRIST = 0
        private const val MIDDLE_MCP = 9
        private const val INDEX_TIP = 8

        fun isSupported(context: Context): Boolean =
            context.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_ANY)
    }

    enum class State { IDLE, STARTING, RUNNING, ERROR }

    var state = State.IDLE
        private set

    var statusMessage = ""
        private set

    /** Latest fingertip position in head space (meters, -Z forward). Valid when [visible]. */
    val headSpaceTip = Vec3()

    @Volatile
    var visible = false

    @Volatile
    var confidence = 0f

    @Volatile
    var detectionFps = 0f

    @Volatile
    var lastDetectionMs = 0L

    // tuning (updated from settings every frame)
    var cameraFov = 70f
    var sensitivity = 1f
    var offsetX = 0f
    var offsetY = 0f
    var offsetZ = -0.06f
    var resolutionIndex = 1
    var targetHz = 30

    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private var cameraProvider: ProcessCameraProvider? = null
    private var analysis: ImageAnalysis? = null
    private var landmarker: HandLandmarker? = null
    private val busy = AtomicBoolean(false)
    private val running = AtomicBoolean(false)

    private var frameBitmap: Bitmap? = null
    private var rotatedBitmap: Bitmap? = null
    private val pixelBuffer = IntArray(640 * 480)

    private val lock = Object()
    private val pending = Vec3()
    private var pendingValid = false
    private var pendingConfidence = 0f

    private var lastFrameTime = 0L
    private var frameCounter = 0
    private var fpsWindowStart = 0L
    private var lastSubmitNs = 0L

    fun start(modelPath: String) {
        if (running.get()) return
        running.set(true)
        state = State.STARTING
        statusMessage = "Iniciando hand tracking"

        cameraExecutor.execute {
            try {
                landmarker?.close()
                val baseOptions = BaseOptions.builder()
                    .setModelAssetPath(modelPath)
                    .setDelegate(BaseOptions.Delegate.GPU)
                    .build()
                val options = HandLandmarker.HandLandmarkerOptions.builder()
                    .setBaseOptions(baseOptions)
                    .setNumHands(2)
                    .setRunningMode(RunningMode.VIDEO)
                    .setMinHandDetectionConfidence(0.5f)
                    .setMinHandPresenceConfidence(0.5f)
                    .setMinTrackingConfidence(0.5f)
                    .build()
                landmarker = HandLandmarker.createFromOptions(context, options)
                ContextCompat.getMainExecutor(context).execute { bindCamera() }
                state = State.RUNNING
                statusMessage = ""
            } catch (t: Throwable) {
                Log.e(TAG, "Hand tracker failed to start", t)
                state = State.ERROR
                statusMessage = t.message ?: "Falha no hand tracking"
                running.set(false)
                ContextCompat.getMainExecutor(context).execute { onStatus(statusMessage) }
            }
        }
    }

    private fun bindCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener({
            val provider = try {
                providerFuture.get()
            } catch (t: Throwable) {
                Log.e(TAG, "camera provider: ${t.message}")
                state = State.ERROR
                statusMessage = "Câmera indisponível"
                running.set(false)
                return@addListener
            }
            cameraProvider = provider
            bindUseCases(provider)
        }, ContextCompat.getMainExecutor(context))
    }

    private fun bindUseCases(provider: ProcessCameraProvider) {
        provider.unbindAll()

        val (w, h) = when (resolutionIndex) {
            0 -> 320 to 240
            2 -> 640 to 480
            else -> 480 to 360
        }
        frameBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)

        val analysisUseCase = ImageAnalysis.Builder()
            .setTargetResolution(android.util.Size(w, h))
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .build()
            .also {
                it.setAnalyzer(cameraExecutor) { proxy -> analyze(proxy) }
            }
        analysis = analysisUseCase

        val selector = CameraSelector.Builder()
            .requireLensFacing(CameraSelector.LENS_FACING_BACK)
            .build()
        try {
            provider.bindToLifecycle(lifecycleOwner, selector, analysisUseCase)
            state = State.RUNNING
            statusMessage = ""
        } catch (t: Throwable) {
            Log.e(TAG, "bind failed: ${t.message}")
            state = State.ERROR
            statusMessage = "Falha ao abrir a câmera"
            onStatus(statusMessage)
        }
    }

    fun stop() {
        running.set(false)
        cameraExecutor.execute {
            try {
                cameraProvider?.unbindAll()
            } catch (t: Throwable) {
                Log.w(TAG, "unbind failed: ${t.message}")
            }
            try {
                landmarker?.close()
            } catch (t: Throwable) {
                Log.w(TAG, "close failed: ${t.message}")
            }
            landmarker = null
        }
        state = State.IDLE
        visible = false
        synchronized(lock) { pendingValid = false }
    }

    fun release() {
        stop()
        cameraExecutor.shutdown()
    }

    private fun analyze(proxy: ImageProxy) {
        if (!running.get()) {
            proxy.close()
            return
        }
        val now = System.currentTimeMillis()
        if (targetHz > 0 && lastSubmitNs > 0 && now - lastSubmitNs < (1000L / targetHz) - 4) {
            proxy.close()
            return
        }
        lastSubmitNs = now

        if (busy.getAndSet(true)) {
            proxy.close()
            return
        }
        try {
            val bitmap = Yuv.toBitmap(proxy, pixelBuffer, frameBitmap!!)
            val rotation = proxy.imageInfo.rotationDegrees
            val input = if (rotation != 0) rotate(bitmap, rotation) else bitmap
            val landmarkerNow = landmarker ?: return

            val mpImage = BitmapImageBuilder(input).build()
            val result = landmarkerNow.detectForVideo(mpImage, now)
            val hands = result.landmarks()

            frameCounter++
            if (fpsWindowStart == 0L) fpsWindowStart = now
            if (now - fpsWindowStart > 1000L) {
                detectionFps = frameCounter * 1000f / (now - fpsWindowStart)
                frameCounter = 0
                fpsWindowStart = now
            }

            if (hands.isNotEmpty()) {
                val hand = pickHand(hands)
                val tip = hand[INDEX_TIP]
                val wrist = hand[WRIST]
                val mcp = hand[MIDDLE_MCP]

                val dx = wrist.x() - mcp.x()
                val dy = wrist.y() - mcp.y()
                val span = sqrt(dx * dx + dy * dy)
                val halfFov = tan(Math.toRadians(cameraFov * 0.5).toFloat())
                val depth = if (span > 1e-3f) {
                    (HAND_SPAN_M / (span * 2f * halfFov)).coerceIn(0.18f, 1.3f)
                } else {
                    0.6f
                }

                val aspect = input.width.toFloat() / input.height.toFloat()
                val tanX = halfFov
                val tanY = halfFov / aspect
                val ndcX = (tip.x() - 0.5f) * 2f
                val ndcY = (0.5f - tip.y()) * 2f

                var dirX = ndcX * tanX
                var dirY = ndcY * tanY
                val dirZ = -1f
                val len = sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ)
                dirX /= len
                dirY /= len

                // lateral sensitivity (helps reaching the edges of the interface)
                val px = dirX * depth * sensitivity + offsetX
                val py = dirY * depth * sensitivity + offsetY
                val pz = (dirZ / len) * depth + offsetZ

                synchronized(lock) {
                    pending.set(px, py, pz)
                    pendingValid = true
                    pendingConfidence = min(1f, span * 8f)
                }
                lastDetectionMs = now
            } else {
                synchronized(lock) { pendingValid = false }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "analysis error: ${t.message}")
        } finally {
            busy.set(false)
            proxy.close()
        }
    }

    /** Chooses the hand closest to the middle of the frame and to the camera. */
    private fun pickHand(hands: List<List<NormalizedLandmark>>) =
        hands.minByOrNull { hand ->
            val tip = hand[INDEX_TIP]
            abs(tip.x() - 0.5f) + abs(tip.y() - 0.5f) * 0.5f
        } ?: hands[0]

    private fun rotate(src: Bitmap, degrees: Int): Bitmap {
        val swapped = degrees == 90 || degrees == 270
        val w = if (swapped) src.height else src.width
        val h = if (swapped) src.width else src.height
        var dst = rotatedBitmap
        if (dst == null || dst.width != w || dst.height != h) {
            dst = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            rotatedBitmap = dst
        }
        val canvas = android.graphics.Canvas(dst)
        canvas.save()
        canvas.translate(w * 0.5f, h * 0.5f)
        canvas.rotate(degrees.toFloat())
        canvas.translate(-src.width * 0.5f, -src.height * 0.5f)
        canvas.drawBitmap(src, 0f, 0f, null)
        canvas.restore()
        return dst
    }

    /** Copies the latest detection (thread safe) and returns true when a hand is present. */
    fun poll(out: Vec3): Boolean {
        synchronized(lock) {
            if (!pendingValid) {
                visible = false
                return false
            }
            out.set(pending)
            confidence = pendingConfidence
        }
        visible = true
        return true
    }
}
