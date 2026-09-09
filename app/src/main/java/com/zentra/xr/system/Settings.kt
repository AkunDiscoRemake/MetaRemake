package com.zentra.xr.system

import android.content.Context
import android.content.SharedPreferences

/**
 * Single source of truth for every user adjustable value in Zentra XR.
 * Values are read live by the renderer and the tracking pipeline, so changes apply instantly.
 */
class Settings(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("zentra_xr_prefs", Context.MODE_PRIVATE)

    // ---------------------------------------------------------------- VR
    var ipd: Float
        get() = prefs.getFloat("vr_ipd", 0.064f)
        set(v) = prefs.edit().putFloat("vr_ipd", v).apply()

    var fov: Float
        get() = prefs.getFloat("vr_fov", 92f)
        set(v) = prefs.edit().putFloat("vr_fov", v).apply()

    var uiDistance: Float
        get() = prefs.getFloat("vr_ui_distance", 1.75f)
        set(v) = prefs.edit().putFloat("vr_ui_distance", v).apply()

    var uiScale: Float
        get() = prefs.getFloat("vr_ui_scale", 1f)
        set(v) = prefs.edit().putFloat("vr_ui_scale", v).apply()

    var panelDistance: Float
        get() = prefs.getFloat("vr_panel_distance", 1.5f)
        set(v) = prefs.edit().putFloat("vr_panel_distance", v).apply()

    /** 0 = low, 1 = balanced, 2 = high */
    var graphicsQuality: Int
        get() = prefs.getInt("vr_quality", 2)
        set(v) = prefs.edit().putInt("vr_quality", v).apply()

    var sbsSwap: Boolean
        get() = prefs.getBoolean("vr_sbs_swap", false)
        set(v) = prefs.edit().putBoolean("vr_sbs_swap", v).apply()

    var monoMode: Boolean
        get() = prefs.getBoolean("vr_mono", false)
        set(v) = prefs.edit().putBoolean("vr_mono", v).apply()

    var barrelDistortion: Float
        get() = prefs.getFloat("vr_barrel", 0.65f)
        set(v) = prefs.edit().putFloat("vr_barrel", v).apply()

    var chromaticAberration: Float
        get() = prefs.getFloat("vr_aberration", 0.006f)
        set(v) = prefs.edit().putFloat("vr_aberration", v).apply()

    var vignette: Float
        get() = prefs.getFloat("vr_vignette", 0.25f)
        set(v) = prefs.edit().putFloat("vr_vignette", v).apply()

    /** Screen to sensor rotation fix: -1 = auto, otherwise 0/90/180/270 */
    var screenRotationOverride: Int
        get() = prefs.getInt("vr_rotation_override", -1)
        set(v) = prefs.edit().putInt("vr_rotation_override", v).apply()

    // ---------------------------------------------------------- Tracking
    var handTracking: Boolean
        get() = prefs.getBoolean("track_enabled", true)
        set(v) = prefs.edit().putBoolean("track_enabled", v).apply()

    var trackingSensitivity: Float
        get() = prefs.getFloat("track_sensitivity", 1f)
        set(v) = prefs.edit().putFloat("track_sensitivity", v).apply()

    var oneEuroEnabled: Boolean
        get() = prefs.getBoolean("track_one_euro", true)
        set(v) = prefs.edit().putBoolean("track_one_euro", v).apply()

    var oneEuroMinCutoff: Float
        get() = prefs.getFloat("track_one_euro_min", 1.5f)
        set(v) = prefs.edit().putFloat("track_one_euro_min", v).apply()

    var oneEuroBeta: Float
        get() = prefs.getFloat("track_one_euro_beta", 0.02f)
        set(v) = prefs.edit().putFloat("track_one_euro_beta", v).apply()

    var oneEuroDCutoff: Float
        get() = prefs.getFloat("track_one_euro_d", 1f)
        set(v) = prefs.edit().putFloat("track_one_euro_d", v).apply()

    var kalmanEnabled: Boolean
        get() = prefs.getBoolean("track_kalman", true)
        set(v) = prefs.edit().putBoolean("track_kalman", v).apply()

    var kalmanProcess: Float
        get() = prefs.getFloat("track_kalman_q", 0.02f)
        set(v) = prefs.edit().putFloat("track_kalman_q", v).apply()

    var kalmanMeasurement: Float
        get() = prefs.getFloat("track_kalman_r", 0.35f)
        set(v) = prefs.edit().putFloat("track_kalman_r", v).apply()

    var cursorSize: Float
        get() = prefs.getFloat("track_cursor", 1f)
        set(v) = prefs.edit().putFloat("track_cursor", v).apply()

    var extraSmoothing: Float
        get() = prefs.getFloat("track_smoothing", 0.25f)
        set(v) = prefs.edit().putFloat("track_smoothing", v).apply()

    /** Assumed horizontal field of view of the rear camera. */
    var cameraFov: Float
        get() = prefs.getFloat("track_camera_fov", 70f)
        set(v) = prefs.edit().putFloat("track_camera_fov", v).apply()

    /** Camera position relative to the midpoint of the eyes, in meters. */
    var cameraOffsetX: Float
        get() = prefs.getFloat("track_cam_x", 0.0f)
        set(v) = prefs.edit().putFloat("track_cam_x", v).apply()

    var cameraOffsetY: Float
        get() = prefs.getFloat("track_cam_y", 0.02f)
        set(v) = prefs.edit().putFloat("track_cam_y", v).apply()

    var cameraOffsetZ: Float
        get() = prefs.getFloat("track_cam_z", -0.06f)
        set(v) = prefs.edit().putFloat("track_cam_z", v).apply()

    var cameraResolution: Int
        get() = prefs.getInt("track_camera_res", 1)   // 0 = 320x240, 1 = 480x360, 2 = 640x480
        set(v) = prefs.edit().putInt("track_camera_res", v).apply()

    /** 0 = auto (hand then gaze), 1 = hand only, 2 = gaze only */
    var pointerMode: Int
        get() = prefs.getInt("track_pointer_mode", 0)
        set(v) = prefs.edit().putInt("track_pointer_mode", v).apply()

    // ------------------------------------------------------- Performance
    /** 0 = 60, 1 = 72, 2 = 90, 3 = unlimited */
    var targetFps: Int
        get() = prefs.getInt("perf_fps", 0)
        set(v) = prefs.edit().putInt("perf_fps", v).apply()

    var renderScale: Float
        get() = prefs.getFloat("perf_scale", 1f)
        set(v) = prefs.edit().putFloat("perf_scale", v).apply()

    var adaptiveResolution: Boolean
        get() = prefs.getBoolean("perf_adaptive", true)
        set(v) = prefs.edit().putBoolean("perf_adaptive", v).apply()

    /** 0 = auto, 1 = performance, 2 = eco */
    var performanceMode: Int
        get() = prefs.getInt("perf_mode", 0)
        set(v) = prefs.edit().putInt("perf_mode", v).apply()

    var thermalOptimization: Boolean
        get() = prefs.getBoolean("perf_thermal", true)
        set(v) = prefs.edit().putBoolean("perf_thermal", v).apply()

    var handTrackingHz: Int
        get() = prefs.getInt("perf_hand_hz", 30)
        set(v) = prefs.edit().putInt("perf_hand_hz", v).apply()

    var showFps: Boolean
        get() = prefs.getBoolean("perf_show_fps", false)
        set(v) = prefs.edit().putBoolean("perf_show_fps", v).apply()

    // --------------------------------------------------------- Interface
    var lightTheme: Boolean
        get() = prefs.getBoolean("ui_light", false)
        set(v) = prefs.edit().putBoolean("ui_light", v).apply()

    var uiSize: Float
        get() = prefs.getFloat("ui_size", 1f)
        set(v) = prefs.edit().putFloat("ui_size", v).apply()

    var animations: Boolean
        get() = prefs.getBoolean("ui_animations", true)
        set(v) = prefs.edit().putBoolean("ui_animations", v).apply()

    var showGrid: Boolean
        get() = prefs.getBoolean("ui_grid", true)
        set(v) = prefs.edit().putBoolean("ui_grid", v).apply()

    var starIntensity: Float
        get() = prefs.getFloat("ui_stars", 0.85f)
        set(v) = prefs.edit().putFloat("ui_stars", v).apply()

    var haptics: Boolean
        get() = prefs.getBoolean("ui_haptics", true)
        set(v) = prefs.edit().putBoolean("ui_haptics", v).apply()

    // ------------------------------------------------------------- state
    var onboardingDone: Boolean
        get() = prefs.getBoolean("state_onboarding", false)
        set(v) = prefs.edit().putBoolean("state_onboarding", v).apply()

    var cameraPermissionRequested: Boolean
        get() = prefs.getBoolean("state_camera_asked", false)
        set(v) = prefs.edit().putBoolean("state_camera_asked", v).apply()

    var handModelInstalled: Boolean
        get() = prefs.getBoolean("state_model", false)
        set(v) = prefs.edit().putBoolean("state_model", v).apply()

    var homeUrl: String
        get() = prefs.getString("browser_home", DEFAULT_HOME_URL) ?: DEFAULT_HOME_URL
        set(v) = prefs.edit().putString("browser_home", v).apply()

    fun reset() {
        prefs.edit().clear().apply()
    }

    companion object {
        const val DEFAULT_HOME_URL = "https://www.google.com/"
    }
}
