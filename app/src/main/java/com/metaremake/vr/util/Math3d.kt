package com.metaremake.vr.util

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Small, dependency-free 3D math helpers used by the head tracker and the
 * stereo camera. All matrices are column-major float[16] / float[9] in the
 * OpenGL convention (same layout as [android.opengl.Matrix]).
 */
object Math3d {

    val PI = Math.PI.toFloat()

    /** Quaternion multiply: out = q * r (Hamilton product). */
    fun quatMultiply(q: FloatArray, r: FloatArray, out: FloatArray) {
        val qx = q[0]; val qy = q[1]; val qz = q[2]; val qw = q[3]
        val rx = r[0]; val ry = r[1]; val rz = r[2]; val rw = r[3]
        out[0] = qw * rx + qx * rw + qy * rz - qz * ry
        out[1] = qw * ry - qx * rz + qy * rw + qz * rx
        out[2] = qw * rz + qx * ry - qy * rx + qz * rw
        out[3] = qw * rw - qx * rx - qy * ry - qz * rz
    }

    /** Conjugate of a unit quaternion (== inverse). */
    fun quatConjugate(q: FloatArray, out: FloatArray) {
        out[0] = -q[0]; out[1] = -q[1]; out[2] = -q[2]; out[3] = q[3]
    }

    fun quatNormalize(q: FloatArray, out: FloatArray) {
        val n = sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3])
        if (n < 1e-6f) {
            out[0] = 0f; out[1] = 0f; out[2] = 0f; out[3] = 1f
            return
        }
        out[0] = q[0] / n; out[1] = q[1] / n; out[2] = q[2] / n; out[3] = q[3] / n
    }

    /**
     * Relative rotation: out = qRef^-1 * q (what you need to rotate qRef onto
     * q). Allocation-free (conjugate is computed inline) for use in the sensor
     * hot path.
     */
    fun quatRelative(reference: FloatArray, current: FloatArray, out: FloatArray) {
        // conj(reference) * current, then normalize.
        val qx = -reference[0]; val qy = -reference[1]; val qz = -reference[2]; val qw = reference[3]
        val rx = current[0]; val ry = current[1]; val rz = current[2]; val rw = current[3]
        out[0] = qw * rx + qx * rw + qy * rz - qz * ry
        out[1] = qw * ry - qx * rz + qy * rw + qz * rx
        out[2] = qw * rz + qx * ry - qy * rx + qz * rw
        out[3] = qw * rw - qx * rx - qy * ry - qz * rz
        quatNormalize(out, out)
    }

    /** Rotation matrix (column-major 3x3 or 4x4) -> unit quaternion (x,y,z,w). */
    fun matrixToQuat(m: FloatArray, out: FloatArray) {
        // m is column-major: m[0..2] = first column (X axis), m[4..6] = Y, m[8..10] = Z.
        val m00 = m[0]; val m01 = m[1]; val m02 = m[2]
        val m10 = m[4]; val m11 = m[5]; val m12 = m[6]
        val m20 = m[8]; val m21 = m[9]; val m22 = m[10]

        val trace = m00 + m11 + m22
        if (trace > 0f) {
            val s = 0.5f / sqrt(trace + 1f)
            out[0] = (m21 - m12) * s
            out[1] = (m02 - m20) * s
            out[2] = (m10 - m01) * s
            out[3] = 0.25f / s
        } else if (m00 > m11 && m00 > m22) {
            val s = 2f * sqrt(1f + m00 - m11 - m22)
            out[0] = 0.25f * s
            out[1] = (m01 + m10) / s
            out[2] = (m02 + m20) / s
            out[3] = (m21 - m12) / s
        } else if (m11 > m22) {
            val s = 2f * sqrt(1f + m11 - m00 - m22)
            out[0] = (m01 + m10) / s
            out[1] = 0.25f * s
            out[2] = (m12 + m21) / s
            out[3] = (m02 - m20) / s
        } else {
            val s = 2f * sqrt(1f + m22 - m00 - m11)
            out[0] = (m02 + m20) / s
            out[1] = (m12 + m21) / s
            out[2] = 0.25f * s
            out[3] = (m10 - m01) / s
        }
        quatNormalize(out, out)
    }

    /** Unit quaternion -> column-major rotation matrix (float[16], GL layout). */
    fun quatToMatrix(q: FloatArray, out: FloatArray) {
        val x = q[0]; val y = q[1]; val z = q[2]; val w = q[3]
        val x2 = x * x; val y2 = y * y; val z2 = z * z
        val xy = x * y; val xz = x * z; val yz = y * z
        val wx = w * x; val wy = w * y; val wz = w * z

        out[0] = 1f - 2f * (y2 + z2); out[1] = 2f * (xy + wz);        out[2] = 2f * (xz - wy);        out[3] = 0f
        out[4] = 2f * (xy - wz);       out[5] = 1f - 2f * (x2 + z2);  out[6] = 2f * (yz + wx);        out[7] = 0f
        out[8] = 2f * (xz + wy);       out[9] = 2f * (yz - wx);       out[10] = 1f - 2f * (x2 + y2);  out[11] = 0f
        out[12] = 0f; out[13] = 0f; out[14] = 0f; out[15] = 1f
    }

    /** Euler (degrees, ZYX order) -> column-major rotation matrix. */
    fun eulerToMatrix(rxDeg: Float, ryDeg: Float, rzDeg: Float, out: FloatArray) {
        val cx = cos(rxDeg * PI / 180f); val sx = sin(rxDeg * PI / 180f)
        val cy = cos(ryDeg * PI / 180f); val sy = sin(ryDeg * PI / 180f)
        val cz = cos(rzDeg * PI / 180f); val sz = sin(rzDeg * PI / 180f)

        // R = Rz * Ry * Rx  (column-major)
        out[0] = cy * cz;                 out[1] = cy * sz;                 out[2] = -sy;       out[3] = 0f
        out[4] = sx * sy * cz - cx * sz;  out[5] = sx * sy * sz + cx * cz;  out[6] = sx * cy;   out[7] = 0f
        out[8] = cx * sy * cz + sx * sz;  out[9] = cx * sy * sz - sx * cz;  out[10] = cx * cy;  out[11] = 0f
        out[12] = 0f; out[13] = 0f; out[14] = 0f; out[15] = 1f
    }

    /** Euler angles (degrees) from a rotation matrix; returns [yaw, pitch, roll]. */
    fun matrixToEuler(m: FloatArray, out: FloatArray) {
        val m00 = m[0]; val m01 = m[1]; val m02 = m[2]
        val m10 = m[4]; val m11 = m[5]; val m12 = m[6]
        val m20 = m[8]; val m21 = m[9]; val m22 = m[10]
        val sy = -m20
        val pitch: Float
        val yaw: Float
        val roll: Float
        if (sy > 1f - 1e-6f) {
            pitch = -PI / 2f
            yaw = atan2(-m12, m11)
            roll = 0f
        } else if (sy < -(1f - 1e-6f)) {
            pitch = PI / 2f
            yaw = atan2(-m12, m11)
            roll = 0f
        } else {
            pitch = kotlin.math.asin(sy)
            yaw = atan2(m10, m00)
            roll = atan2(m21, m22)
        }
        out[0] = yaw * 180f / PI
        out[1] = pitch * 180f / PI
        out[2] = roll * 180f / PI
    }

    fun normalize3(v: FloatArray) {
        val n = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        if (n > 1e-6f) {
            v[0] /= n; v[1] /= n; v[2] /= n
        }
    }
}
