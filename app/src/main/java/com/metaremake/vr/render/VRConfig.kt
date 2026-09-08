package com.metaremake.vr.render

/**
 * Runtime rendering configuration. Every field is volatile so the JS runtime
 * (via the bridge) can tune it live without synchronising with the render
 * thread.
 */
class VRConfig {
    /** Interpupillary distance in meters. */
    @Volatile var ipdMeters = 0.063f

    /** Vertical field of view per eye, degrees. */
    @Volatile var fovYDeg = 90f

    @Volatile var near = 0.1f
    @Volatile var far = 120f

    /** Supersampling factor for the eye buffers (1.0 = native). */
    @Volatile var renderScale = 1.0f

    /** Barrel lens-distortion correction pass. */
    @Volatile var distortionEnabled = true
    @Volatile var distortionK1 = 0.22f
    @Volatile var distortionK2 = 0.24f

    /** Target frame rate (renderer throttles via vsync / sleep). */
    @Volatile var targetFps = 60

    /** Clear colour. */
    @Volatile var clearR = 0.02f
    @Volatile var clearG = 0.02f
    @Volatile var clearB = 0.03f

    /** VR cursor. */
    @Volatile var cursorEnabled = true
    @Volatile var cursorScale = 1.0f

    /** Mixed reality passthrough (camera) background. */
    @Volatile var cameraEnabled = false
    @Volatile var cameraOpacity = 1.0f
    @Volatile var cameraDistance = 4.0f

    /** Android-app capture surface. */
    @Volatile var captureEnabled = false
    @Volatile var captureOpacity = 1.0f

    /** Hand-tracking landmark debug overlay. */
    @Volatile var showHandLandmarks = false

    /** Head-locked diagnostic strip. */
    @Volatile var showHud = true
    @Volatile var hudText = ""

    /** Scene content scale (world units per meter multiplier). */
    @Volatile var worldScale = 1.0f
}
