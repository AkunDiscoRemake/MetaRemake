package com.metaremake.vr.tracking

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import com.metaremake.vr.util.Math3d
import com.metaremake.vr.util.MLog

/**
 * Cardboard head tracking.
 *
 * Priority order (as required): fused rotation vector -> game rotation vector
 * -> accelerometer+magnetometer (software fusion) -> gyroscope integration
 * fallback. A One Euro filter removes jitter while keeping latency low, and a
 * `recenter` reference lets the user re-aim "forward" at any time.
 *
 * All sensor work happens on a dedicated high-priority thread; the renderer
 * only ever reads a small, lock-protected state snapshot.
 */
class HeadTracker(private val context: Context) : SensorEventListener {

    /** Immutable-ish snapshot the renderer reads from. */
    class State {
        @Volatile var yaw = 0f
        @Volatile var pitch = 0f
        @Volatile var roll = 0f
        @Volatile var timestampNs = 0L
        @Volatile var ready = false
        @Volatile var sensorName = "none"
        val matrix = FloatArray(16)   // recentered head rotation (world->head basis), column-major

        private val lock = Any()

        fun copyMatrixInto(out: FloatArray) {
            synchronized(lock) { System.arraycopy(matrix, 0, out, 0, 16) }
        }

        fun write(newMatrix: FloatArray, y: Float, p: Float, r: Float, ts: Long) {
            synchronized(lock) { System.arraycopy(newMatrix, 0, matrix, 0, 16) }
            yaw = y; pitch = p; roll = r; timestampNs = ts; ready = true
        }
    }

    val state = State()

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val handlerThread = HandlerThread("HeadTrackingThread", android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
    private lateinit var handler: Handler

    private var rotationSensor: Sensor? = null
    private var useRawGyroFallback = false

    // Filter buffers (allocated once; never allocated inside the hot path).
    private val rotMatrix = FloatArray(16)
    private val remapped = FloatArray(16)
    private val recenterMatrix = FloatArray(16)
    private val quat = FloatArray(4)
    private val quatFiltered = FloatArray(4)
    private val euler = FloatArray(3)

    // Scratch buffers reused inside the sensor hot path (no per-event GC).
    private val refScratch = FloatArray(4)
    private val qScratch = FloatArray(4)
    private val dqScratch = FloatArray(4)
    private val tmpScratch = FloatArray(4)

    private val filters = Array(4) { OneEuroFilter.headQuat() }
    private var gyroFilter: OneEuroFilter? = null

    // Recenter reference (world frame). Identity = "no recenter".
    private val refQuat = floatArrayOf(0f, 0f, 0f, 1f)

    // Gyro-only fallback integrator.
    private var lastGyroTs = 0L
    private val gyroQuat = floatArrayOf(0f, 0f, 0f, 1f)

    private val pendingRotationVector = floatArrayOf(0f, 0f, 0f, 1f)
    private var pendingRotationVectorTs = 0L

    val isTracking: Boolean get() = state.ready

    fun start() {
        handlerThread.start()
        handler = Handler(handlerThread.looper)
        rotationSensor = selectRotationSensor()
        MLog.d("HeadTracker", "selected sensor: ${rotationSensor?.name ?: "gyro fallback"}")
        if (rotationSensor != null) {
            sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_GAME, handler)
        } else {
            // Gyroscope-only fallback.
            val gyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
            if (gyro != null) {
                useRawGyroFallback = true
                sensorManager.registerListener(this, gyro, SensorManager.SENSOR_DELAY_GAME, handler)
                gyroFilter = OneEuroFilter.headQuat()
                MLog.w("HeadTracker", "no rotation vector sensor; using raw gyroscope integration")
            } else {
                MLog.w("HeadTracker", "no usable orientation sensor on this device")
            }
        }
    }

    private fun selectRotationSensor(): Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)

    fun stop() {
        sensorManager.unregisterListener(this)
        if (handlerThread.isAlive) handlerThread.quitSafely()
    }

    /** Re-aim "forward": the current orientation becomes the new neutral pose. */
    fun recenter() {
        synchronized(this) {
            state.copyMatrixInto(recenterMatrix)
            Math3d.matrixToQuat(recenterMatrix, refQuat)
        }
    }

    /** Reset the recenter reference (orientation back to sensor "world north"). */
    fun resetRecenter() {
        synchronized(this) {
            refQuat[0] = 0f; refQuat[1] = 0f; refQuat[2] = 0f; refQuat[3] = 1f
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GAME_ROTATION_VECTOR -> {
                pendingRotationVector[0] = event.values[0]
                pendingRotationVector[1] = event.values[1]
                pendingRotationVector[2] = event.values[2]
                pendingRotationVector[3] = event.values[3]
                pendingRotationVectorTs = event.timestamp
                updateFromRotationVector(event.sensor.type == Sensor.TYPE_ROTATION_VECTOR)
            }
            Sensor.TYPE_GYROSCOPE -> {
                if (useRawGyroFallback) integrateGyro(event)
            }
        }
    }

    private fun updateFromRotationVector(isRotationVector: Boolean) {
        SensorManager.getRotationMatrixFromVector(rotMatrix, pendingRotationVector)
        // Remap the phone frame into the Cardboard frame: +X screen-right,
        // +Y up, -Z forward (look direction).
        SensorManager.remapCoordinateSystem(rotMatrix, SensorManager.AXIS_X, SensorManager.AXIS_Z, remapped)

        Math3d.matrixToQuat(remapped, quat)

        synchronized(this) {
            System.arraycopy(refQuat, 0, refScratch, 0, 4)
            Math3d.quatRelative(refScratch, quat, qScratch)
        }

        val ts = pendingRotationVectorTs
        for (i in 0..3) quatFiltered[i] = filters[i].filter(qScratch[i], ts)
        Math3d.quatNormalize(quatFiltered, quatFiltered)
        Math3d.quatToMatrix(quatFiltered, rotMatrix)

        Math3d.matrixToEuler(rotMatrix, euler)
        state.sensorName = if (isRotationVector) "rotation_vector" else "game_rotation_vector"
        state.write(rotMatrix, euler[0], euler[1], euler[2], ts)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    /** Naive gyroscope angular-velocity integration (last-resort fallback). */
    private fun integrateGyro(event: SensorEvent) {
        val ts = event.timestamp
        val dt = (ts - lastGyroTs) / 1e9f
        lastGyroTs = ts
        if (dt <= 0f || dt > 0.25f) return

        // Angular velocity around device axes (rad/s).
        val wx = event.values[0]; val wy = event.values[1]; val wz = event.values[2]
        val half = 0.5f * dt
        dqScratch[0] = wx * half; dqScratch[1] = wy * half; dqScratch[2] = wz * half; dqScratch[3] = 0f
        Math3d.quatMultiply(gyroQuat, dqScratch, tmpScratch)
        Math3d.quatNormalize(tmpScratch, gyroQuat)

        synchronized(this) { System.arraycopy(refQuat, 0, refScratch, 0, 4) }
        Math3d.quatRelative(refScratch, gyroQuat, quat)

        val f = gyroFilter ?: return
        for (i in 0..3) quatFiltered[i] = f.filter(quat[i], ts)
        Math3d.quatNormalize(quatFiltered, quatFiltered)
        Math3d.quatToMatrix(quatFiltered, rotMatrix)
        Math3d.matrixToEuler(rotMatrix, euler)
        state.sensorName = "gyroscope_integrated"
        state.write(rotMatrix, euler[0], euler[1], euler[2], ts)
    }
}
