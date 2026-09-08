package com.metaremake.vr.camera

import android.content.Context
import android.graphics.Bitmap
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager as SystemCameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Size
import com.metaremake.vr.util.MLog
import java.util.concurrent.atomic.AtomicInteger

/**
 * Camera2 wrapper used by the Mixed Reality passthrough and the hand-tracking
 * pipeline. Frames are converted YUV->RGB on a dedicated thread and published
 * through a double buffer so the GL uploader never blocks the camera thread.
 */
class CameraManager(private val context: Context) {

    @Volatile
    var resolution = Size(640, 360)

    @Volatile
    var useFrontCamera = false

    @Volatile
    var isRunning = false
        private set

    private val sysManager = context.getSystemService(Context.CAMERA_SERVICE) as SystemCameraManager
    private var cameraThread: HandlerThread? = null
    private var cameraHandler: Handler? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null

    // Double buffer for RGB frames.
    private val buffers = arrayOfNulls<Bitmap>(2)
    private val latestIndex = AtomicInteger(-1)

    private val yuvConverter = YuvToRgb()

    /** Latest completed RGB frame (for GL upload). Do not mutate. */
    fun latestBitmap(): Bitmap? {
        val i = latestIndex.get()
        return if (i >= 0) buffers[i] else null
    }

    /** Safe copy of the latest frame (for the hand tracker). */
    fun copyLatestFrame(): Bitmap? = latestBitmap()?.copy(Bitmap.Config.ARGB_8888, false)

    fun start() {
        if (isRunning) return
        cameraThread = HandlerThread("CameraThread", android.os.Process.THREAD_PRIORITY_DISPLAY)
        cameraThread!!.start()
        cameraHandler = Handler(cameraThread!!.looper)
        try {
            val cameraId = pickCameraId()
            sysManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    device = camera
                    createSession(camera)
                }
                override fun onDisconnected(camera: CameraDevice) {
                    camera.close(); device = null; isRunning = false
                }
                override fun onError(camera: CameraDevice, error: Int) {
                    MLog.e("Camera", "camera error $error")
                    camera.close(); device = null; isRunning = false
                }
            }, cameraHandler)
        } catch (t: Throwable) {
            MLog.e("Camera", "open failed", t)
            isRunning = false
        }
    }

    private fun pickCameraId(): String {
        val lens = if (useFrontCamera) CameraCharacteristics.LENS_FACING_FRONT else CameraCharacteristics.LENS_FACING_BACK
        for (id in sysManager.cameraIdList) {
            val ch = sysManager.getCameraCharacteristics(id)
            if (ch.get(CameraCharacteristics.LENS_FACING) == lens) return id
        }
        return sysManager.cameraIdList.first()
    }

    private fun createSession(camera: CameraDevice) {
        val reader = ImageReader.newInstance(resolution.width, resolution.height, android.graphics.ImageFormat.YUV_420_888, 2)
        reader.setOnImageAvailableListener({ r ->
            val image = try { r.acquireLatestImage() } catch (t: Throwable) { null } ?: return@setOnImageAvailableListener
            try {
                publish(image)
            } finally {
                image.close()
            }
        }, cameraHandler)
        imageReader = reader

        val surface = reader.surface
        camera.createCaptureSession(listOf(surface), object : CameraCaptureSession.StateCallback() {
            override fun onConfigured(s: CameraCaptureSession) {
                session = s
                val req = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                    addTarget(surface)
                    set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                }
                try {
                    s.setRepeatingRequest(req.build(), null, cameraHandler)
                    isRunning = true
                } catch (t: Throwable) {
                    MLog.e("Camera", "repeating request failed", t)
                }
            }
            override fun onConfigureFailed(s: CameraCaptureSession) {
                MLog.e("Camera", "session configure failed")
            }
        }, cameraHandler)
    }

    private fun publish(image: Image) {
        val idx = (latestIndex.get() + 1) % 2
        var bmp = buffers[idx]
        val w = image.width
        val h = image.height
        if (bmp == null || bmp.width != w || bmp.height != h) {
            bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            buffers[idx] = bmp
        }
        yuvConverter.convert(image, bmp)
        latestIndex.set(idx)
    }

    fun stop() {
        isRunning = false
        try { session?.close() } catch (_: Throwable) {}
        try { device?.close() } catch (_: Throwable) {}
        try { imageReader?.close() } catch (_: Throwable) {}
        session = null; device = null; imageReader = null
        latestIndex.set(-1)
        cameraThread?.quitSafely()
        cameraThread = null
        cameraHandler = null
    }
}
