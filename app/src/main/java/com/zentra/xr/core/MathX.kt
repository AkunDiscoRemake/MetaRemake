package com.zentra.xr.core

import android.opengl.Matrix
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Allocation-free 3 component vector. */
class Vec3(var x: Float = 0f, var y: Float = 0f, var z: Float = 0f) {

    fun set(x: Float, y: Float, z: Float): Vec3 {
        this.x = x; this.y = y; this.z = z
        return this
    }

    fun set(o: Vec3): Vec3 {
        x = o.x; y = o.y; z = o.z
        return this
    }

    fun set(a: FloatArray, off: Int): Vec3 {
        x = a[off]; y = a[off + 1]; z = a[off + 2]
        return this
    }

    fun add(o: Vec3): Vec3 {
        x += o.x; y += o.y; z += o.z
        return this
    }

    fun sub(o: Vec3): Vec3 {
        x -= o.x; y -= o.y; z -= o.z
        return this
    }

    fun scale(s: Float): Vec3 {
        x *= s; y *= s; z *= s
        return this
    }

    fun addScaled(o: Vec3, s: Float): Vec3 {
        x += o.x * s; y += o.y * s; z += o.z * s
        return this
    }

    fun length(): Float = sqrt(x * x + y * y + z * z)

    fun lengthSq(): Float = x * x + y * y + z * z

    fun distanceTo(o: Vec3): Float {
        val dx = x - o.x
        val dy = y - o.y
        val dz = z - o.z
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    fun normalize(): Vec3 {
        val l = length()
        if (l > 1e-6f) {
            val i = 1f / l
            x *= i; y *= i; z *= i
        }
        return this
    }

    fun dot(o: Vec3): Float = x * o.x + y * o.y + z * o.z

    fun cross(o: Vec3): Vec3 {
        val cx = y * o.z - z * o.y
        val cy = z * o.x - x * o.z
        val cz = x * o.y - y * o.x
        x = cx; y = cy; z = cz
        return this
    }

    fun lerp(o: Vec3, t: Float): Vec3 {
        x += (o.x - x) * t
        y += (o.y - y) * t
        z += (o.z - z) * t
        return this
    }

    fun isFinite(): Boolean =
        !x.isNaN() && !y.isNaN() && !z.isNaN() && !x.isInfinite() && !y.isInfinite() && !z.isInfinite()

    fun copyFrom(o: Vec3) = set(o)

    companion object {
        fun len(x: Float, y: Float, z: Float) = sqrt(x * x + y * y + z * z)
    }
}

/** Allocation-free 2 component vector. */
class Vec2(var x: Float = 0f, var y: Float = 0f) {
    fun set(x: Float, y: Float): Vec2 {
        this.x = x; this.y = y
        return this
    }
}

/**
 * Minimal matrix helper built on top of [android.opengl.Matrix].
 * Every method writes into caller supplied arrays so the render loop is allocation free.
 */
object Mat {
    fun identity(out: FloatArray) = Matrix.setIdentityM(out, 0)

    fun perspective(out: FloatArray, fovDeg: Float, aspect: Float, near: Float, far: Float) {
        Matrix.perspectiveM(out, 0, fovDeg, aspect, near, far)
    }

    /** Off-axis (asymmetric) frustum used for the stereo eyes. */
    fun frustum(out: FloatArray, left: Float, right: Float, bottom: Float, top: Float, near: Float, far: Float) {
        Matrix.frustumM(out, 0, left, right, bottom, top, near, far)
    }

    fun multiply(out: FloatArray, a: FloatArray, b: FloatArray) = Matrix.multiplyMM(out, 0, a, 0, b, 0)

    fun invert(out: FloatArray, m: FloatArray): Boolean = Matrix.invertM(out, 0, m, 0)

    fun lookAt(out: FloatArray, eye: Vec3, center: Vec3, up: Vec3) {
        Matrix.setLookAtM(out, 0, eye.x, eye.y, eye.z, center.x, center.y, center.z, up.x, up.y, up.z)
    }

    fun translate(m: FloatArray, x: Float, y: Float, z: Float) = Matrix.translateM(m, 0, x, y, z)

    fun scale(m: FloatArray, x: Float, y: Float, z: Float) = Matrix.scaleM(m, 0, x, y, z)

    fun rotate(m: FloatArray, angleDeg: Float, x: Float, y: Float, z: Float) =
        Matrix.rotateM(m, 0, angleDeg, x, y, z)

    fun transpose(out: FloatArray, m: FloatArray) = Matrix.transposeM(out, 0, m, 0)

    /** Extracts the translation component of a matrix into [out]. */
    fun translation(m: FloatArray, out: Vec3) = out.set(m[12], m[13], m[14])

    /** Transform a point (w = 1). */
    fun transformPoint(m: FloatArray, p: Vec3, out: Vec3) {
        val x = p.x
        val y = p.y
        val z = p.z
        out.set(
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14]
        )
    }

    /** Transform a direction (w = 0). */
    fun transformDir(m: FloatArray, p: Vec3, out: Vec3) {
        val x = p.x
        val y = p.y
        val z = p.z
        out.set(
            m[0] * x + m[4] * y + m[8] * z,
            m[1] * x + m[5] * y + m[9] * z,
            m[2] * x + m[6] * y + m[10] * z
        )
    }

    /** Inverse-transform a point. Returns false when the matrix is singular. */
    private val tmpInv = FloatArray(16)
    private val tmpVec = FloatArray(4)
    fun inverseTransformPoint(m: FloatArray, p: Vec3, out: Vec3): Boolean {
        if (!Matrix.invertM(tmpInv, 0, m, 0)) return false
        val x = p.x
        val y = p.y
        val z = p.z
        out.set(
            tmpInv[0] * x + tmpInv[4] * y + tmpInv[8] * z + tmpInv[12],
            tmpInv[1] * x + tmpInv[5] * y + tmpInv[9] * z + tmpInv[13],
            tmpInv[2] * x + tmpInv[6] * y + tmpInv[10] * z + tmpInv[14]
        )
        return true
    }
}

/**
 * Fixed depth matrix stack. All matrices are pre-allocated: the render loop never
 * allocates while pushing/popping transforms.
 */
class MatrixStack(depth: Int = 24) {
    private val data = Array(depth) { FloatArray(16) }
    private var index = 0
    private val scratch = FloatArray(16)
    private val tmp = FloatArray(16)

    init {
        Matrix.setIdentityM(data[0], 0)
    }

    val top: FloatArray get() = data[index]

    fun reset() {
        Matrix.setIdentityM(data[0], 0)
        index = 0
    }

    fun push(): MatrixStack {
        require(index + 1 < data.size) { "Matrix stack overflow" }
        System.arraycopy(data[index], 0, data[index + 1], 0, 16)
        index++
        return this
    }

    fun push(model: FloatArray): MatrixStack {
        push()
        System.arraycopy(model, 0, data[index], 0, 16)
        return this
    }

    fun pop(): MatrixStack {
        if (index > 0) index--
        return this
    }

    fun translate(x: Float, y: Float, z: Float): MatrixStack {
        Matrix.translateM(data[index], 0, x, y, z)
        return this
    }

    fun translate(v: Vec3): MatrixStack = translate(v.x, v.y, v.z)

    fun scale(x: Float, y: Float, z: Float): MatrixStack {
        Matrix.scaleM(data[index], 0, x, y, z)
        return this
    }

    fun scale(s: Float): MatrixStack = scale(s, s, s)

    fun rotate(angleDeg: Float, x: Float, y: Float, z: Float): MatrixStack {
        Matrix.rotateM(data[index], 0, angleDeg, x, y, z)
        return this
    }

    fun multiply(model: FloatArray): MatrixStack {
        Matrix.multiplyMM(scratch, 0, data[index], 0, model, 0)
        System.arraycopy(scratch, 0, data[index], 0, 16)
        return this
    }

    /** out = viewProj * top */
    fun mvp(viewProj: FloatArray, out: FloatArray) {
        Matrix.multiplyMM(out, 0, viewProj, 0, data[index], 0)
    }

    /** World space distance from [p] to the current matrix translation. */
    fun distanceTo(p: Vec3): Float {
        val m = data[index]
        val dx = m[12] - p.x
        val dy = m[13] - p.y
        val dz = m[14] - p.z
        return sqrt(dx * dx + dy * dy + dz * dz)
    }
}

/** Small math helpers. */
object Mathf {
    fun clamp(v: Float, lo: Float, hi: Float): Float = max(lo, min(hi, v))
    fun clamp01(v: Float): Float = clamp(v, 0f, 1f)
    fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t
    fun smoothStep(edge0: Float, edge1: Float, x: Float): Float {
        val t = clamp01((x - edge0) / (edge1 - edge0))
        return t * t * (3f - 2f * t)
    }

    /** Frame rate independent exponential approach. */
    fun damp(current: Float, target: Float, smoothTime: Float, dt: Float): Float {
        val t = 1f - expNeg(dt / max(0.0001f, smoothTime))
        return current + (target - current) * t
    }

    private fun expNeg(x: Float): Float {
        // fast approximation of e^-x for x >= 0
        if (x <= 0f) return 1f
        if (x > 8f) return 0f
        var r = 1f
        var term = 1f
        for (i in 1..6) {
            term *= -x / i
            r += term
        }
        return max(0f, r)
    }

    fun easeOutCubic(t: Float): Float {
        val f = 1f - clamp01(t)
        return 1f - f * f * f
    }

    fun easeInOutCubic(t: Float): Float {
        val x = clamp01(t)
        val t = -2f * x + 2f
        return if (x < 0.5f) 4f * x * x * x else 1f - (t * t * t) / 2f
    }

    fun abs(v: Float): Float = kotlin.math.abs(v)
}
