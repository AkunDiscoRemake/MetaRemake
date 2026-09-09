package com.zentra.xr

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.opengl.GLSurfaceView
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.zentra.xr.screens.HubScreen
import com.zentra.xr.screens.OnboardingScreen
import com.zentra.xr.ui.ZentraLogo
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.EngineHost
import kotlin.math.min

/**
 * Entry point. The activity owns the Android side only: immersive mode, permissions,
 * the GL surface and the hidden host for off screen WebViews. Everything else lives in
 * the engine.
 */
class MainActivity : ComponentActivity(), EngineHost {

    private lateinit var engine: Engine
    private lateinit var glView: GLSurfaceView
    private lateinit var webHost: FrameLayout
    private lateinit var splash: SplashView
    private val handler = Handler(Looper.getMainLooper())
    private var started = false

    override val activityContext: Context get() = this

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)

        glView = GLSurfaceView(this)
        webHost = FrameLayout(this).apply {
            // hosts off screen WebViews; never intercepts input
            isClickable = false
            isFocusable = false
        }
        splash = SplashView(this)

        val root = FrameLayout(this)
        root.addView(glView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        root.addView(webHost, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        root.addView(splash, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)

        engine = Engine(this, this)
        engine.hostContainer = webHost
        engine.setHub(HubScreen(engine))
        engine.attach(glView)
        engine.glViewRequest = { glView.requestRender() }

        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!engine.back()) {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        splash.status = "Iniciando sensores…"
        checkSensors()
        handler.postDelayed({ beginSession() }, 900L)
    }

    private fun checkSensors() {
        val missingGyro = !packageManager.hasSystemFeature(PackageManager.FEATURE_SENSOR_GYROSCOPE)
        if (missingGyro) {
            splash.status = "Aviso: giroscópio não encontrado"
        }
    }

    private fun beginSession() {
        if (started) return
        started = true
        engine.start()

        val needsOnboarding = !engine.settings.onboardingDone
        if (needsOnboarding) {
            // the camera dialog must be readable: it is requested from the VR onboarding,
            // which only advances after the user taps "Permitir"
            hideSplash()
            engine.setOnboarding(OnboardingScreen(engine))
        } else {
            ensurePermissions {
                hideSplash()
                if (engine.settings.handTracking) engine.startHandTracking()
            }
        }
    }

    private fun hideSplash() {
        handler.postDelayed({
            splash.animate().alpha(0f).setDuration(450L).withEndAction { splash.visibility = View.GONE }
                .start()
        }, 350L)
    }

    // -------------------------------------------------------------- permissions
    private val requiredPermissions: Array<String>
        get() {
            val list = mutableListOf<String>()
            if (Build.VERSION.SDK_INT >= 33) {
                list.add(Manifest.permission.READ_MEDIA_IMAGES)
                list.add(Manifest.permission.READ_MEDIA_VIDEO)
                list.add(Manifest.permission.READ_MEDIA_AUDIO)
            } else {
                list.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
            return list.toTypedArray()
        }

    private var mediaCallback: (() -> Unit)? = null

    private fun ensurePermissions(onDone: () -> Unit) {
        val missing = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            onDone()
            return
        }
        mediaCallback = onDone
        ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_MEDIA)
    }

    override fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    override fun requestCameraPermission() {
        engine.settings.cameraPermissionRequested = true
        if (!hasCameraPermission()) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            REQ_CAMERA -> {
                if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                    engine.installModelAsync { }
                }
            }
            REQ_MEDIA -> {
                val cb = mediaCallback
                mediaCallback = null
                cb?.invoke()
            }
        }
    }

    // -------------------------------------------------------------- engine host
    override fun haptic(ms: Long) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                manager.defaultVibrator.vibrate(
                    VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(ms)
                }
            }
        } catch (t: Throwable) {
            // vibration is a nice to have
        }
    }

    override fun runOnUi(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) action() else handler.post(action)
    }

    override fun finishActivity() = finish()

    override fun onResume() {
        super.onResume()
        if (started) engine.resume()
        hideSystemUi()
    }

    override fun onPause() {
        if (started) engine.pause()
        super.onPause()
    }

    override fun onDestroy() {
        if (started) engine.destroy()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
    }

    companion object {
        private const val REQ_CAMERA = 1201
        private const val REQ_MEDIA = 1202
    }

    /** Minimal 2D boot screen: only visible while permissions are being resolved. */
    private class SplashView(context: Context) : View(context) {

        var status: String = ""
            set(value) {
                field = value
                invalidate()
            }

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private var t = 0f

        init {
            setBackgroundColor(Color.BLACK)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            t += 0.016f
            val size = min(width, height) * 0.42f
            val left = (width - size) * 0.5f
            val top = (height - size) * 0.5f - height * 0.06f
            canvas.save()
            canvas.translate(left, top)
            ZentraLogo.draw(canvas, size, Color.WHITE, ring = (t * 0.7f).coerceAtMost(1f),
                glyph = ((t - 0.9f) * 0.8f).coerceIn(0f, 1f))
            canvas.restore()

            paint.color = Color.WHITE
            paint.alpha = 190
            paint.textSize = min(width, height) * 0.028f
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText("ZENTRA XR", width * 0.5f, top + size * 1.12f, paint)

            paint.alpha = 110
            paint.textSize = min(width, height) * 0.020f
            canvas.drawText(status, width * 0.5f, top + size * 1.24f, paint)

            postInvalidateDelayed(32L)
        }
    }
}
