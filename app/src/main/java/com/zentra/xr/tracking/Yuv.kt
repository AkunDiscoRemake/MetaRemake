package com.zentra.xr.tracking

import android.graphics.Bitmap
import androidx.camera.core.ImageProxy
import kotlin.math.min

/**
 * Minimal YUV_420_888 -> ARGB_8888 converter.
 * Rows are read in bulk (one copy per row) and the colour conversion uses fixed point
 * maths, so a 480x360 frame costs a couple of milliseconds on a mid range phone.
 */
object Yuv {

    private var yRow = ByteArray(0)
    private var uRow = ByteArray(0)
    private var vRow = ByteArray(0)

    fun toBitmap(image: ImageProxy, out: IntArray, reuse: Bitmap?): Bitmap {
        val w = image.width
        val h = image.height
        val bitmap = if (reuse != null && reuse.width == w && reuse.height == h) {
            reuse
        } else {
            Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        }

        val planes = image.planes
        val yPlane = planes[0]
        val uPlane = planes[1]
        val vPlane = planes[2]

        val yBuf = yPlane.buffer
        val uBuf = uPlane.buffer
        val vBuf = vPlane.buffer
        val yStride = yPlane.rowStride
        val uStride = uPlane.rowStride
        val vStride = vPlane.rowStride
        val yPix = yPlane.pixelStride
        val uPix = uPlane.pixelStride
        val vPix = vPlane.pixelStride

        val halfW = (w + 1) / 2
        if (yRow.size < w) yRow = ByteArray(w + 64)
        if (uRow.size < halfW) uRow = ByteArray(halfW + 64)
        if (vRow.size < halfW) vRow = ByteArray(halfW + 64)

        var o = 0
        for (j in 0 until h) {
            yBuf.position(j * yStride)
            yBuf.get(yRow, 0, min(w, yBuf.remaining()))

            val uvRow = j shr 1
            uBuf.position(uvRow * uStride)
            uBuf.get(uRow, 0, min(halfW, uBuf.remaining()))
            vBuf.position(uvRow * vStride)
            vBuf.get(vRow, 0, min(halfW, vBuf.remaining()))

            var i = 0
            while (i < w) {
                val Y = yRow[i * yPix].toInt() and 0xFF
                val uvIndex = i shr 1
                val U = (uRow[uvIndex * uPix].toInt() and 0xFF) - 128
                val V = (vRow[uvIndex * vPix].toInt() and 0xFF) - 128

                val r = Y + ((V * 1436) shr 10)
                val g = Y - ((U * 352 + V * 731) shr 10)
                val b = Y + ((U * 1815) shr 10)

                out[o++] = 0xFF000000.toInt() or
                    ((if (r < 0) 0 else if (r > 255) 255 else r) shl 16) or
                    ((if (g < 0) 0 else if (g > 255) 255 else g) shl 8) or
                    (if (b < 0) 0 else if (b > 255) 255 else b)
                i++
            }
        }
        bitmap.setPixels(out, 0, w, 0, 0, w, h)
        return bitmap
    }
}
