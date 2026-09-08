package com.metaremake.vr.camera

import android.graphics.Bitmap
import android.media.Image

/**
 * CPU YUV_420_888 -> ARGB_8888 conversion (integer fixed-point BT.601-ish).
 * Handles both planar and semi-planar (interleaved UV) layouts via the plane
 * strides. Runs on the camera thread; the GL thread only ever reads the
 * resulting bitmap.
 */
class YuvToRgb {

    fun convert(image: Image, out: Bitmap) {
        val w = image.width
        val h = image.height
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]

        val yRowStride = yPlane.rowStride
        val yPixStride = yPlane.pixelStride
        val uRowStride = uPlane.rowStride
        val uPixStride = uPlane.pixelStride
        val vRowStride = vPlane.rowStride
        val vPixStride = vPlane.pixelStride

        val yBuf = yPlane.buffer
        val uBuf = uPlane.buffer
        val vBuf = vPlane.buffer

        val pixels = IntArray(w * h)
        var idx = 0
        for (row in 0 until h) {
            val yRow = row * yRowStride
            val chromaRow = (row / 2) * uRowStride
            for (col in 0 until w) {
                val y = yBuf.get(yRow + col * yPixStride).toInt() and 0xFF
                val uOff = chromaRow + (col / 2) * uPixStride
                val vOff = chromaRow + (col / 2) * vPixStride
                val u = uBuf.get(uOff).toInt() and 0xFF
                val v = vBuf.get(vOff).toInt() and 0xFF

                val c = y - 16
                val d = u - 128
                val e = v - 128
                val r = clamp((298 * c + 409 * e + 128) shr 8)
                val g = clamp((298 * c - 100 * d - 208 * e + 128) shr 8)
                val b = clamp((298 * c + 516 * d + 128) shr 8)
                pixels[idx++] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
        }
        out.setPixels(pixels, 0, w, 0, 0, w, h)
    }

    private fun clamp(v: Int): Int = if (v < 0) 0 else if (v > 255) 255 else v
}
