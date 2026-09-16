using System;
using LuaJITMR.Core.Platform;
using LuaJITMR.Stereo;
using TMPro;
using UnityEngine;
using UnityEngine.Serialization;
#if LUAJITMR_ARFOUNDATION_5
using UnityEngine.XR.ARSubsystems;
#endif

namespace LuaJITMR
{
    /// <summary>
    /// Parameters for the <see cref="Tracking.OneEuroFilter"/> used to smooth ARCore jitter.
    /// </summary>
    [Serializable]
    public struct OneEuroFilterParams
    {
        [Tooltip("Minimum cutoff frequency in Hz. Lower = smoother but more lag. Typical 0.5 - 1.5.")]
        public float minCutoff;

        [Tooltip("Speed coefficient — higher reacts faster to fast motion. Typical 0.0 - 0.05.")]
        public float beta;

        [Tooltip("Derivative cutoff — smoothes the velocity estimate.")]
        public float derivativeCutoff;

        public static OneEuroFilterParams Default => new OneEuroFilterParams
        {
            minCutoff = 1.0f,
            beta = 0.02f,
            derivativeCutoff = 1.0f
        };
    }

    /// <summary>
    /// Which gestures the runtime should actively detect. Disable unused gestures to save CPU.
    /// </summary>
    [Serializable]
    public struct GestureTrackerConfig
    {
        public bool pinch;
        public bool grab;
        public bool point;
        public bool openPalm;
        public bool thumbsUp;

        public static GestureTrackerConfig All => new GestureTrackerConfig
        {
            pinch = true,
            grab = true,
            point = true,
            openPalm = true,
            thumbsUp = true
        };
    }

    /// <summary>
    /// Authoritative configuration asset for the LuaJITMR runtime. Create via
    /// <c>Create → LuaJITMR → Settings</c> or edit in Project Settings → LuaJITMR.
    /// If no asset is assigned to <see cref="LuaJITMRPlayer"/>, sensible defaults are used.
    /// </summary>
    [CreateAssetMenu(fileName = "LuaJITMRSettings", menuName = "LuaJITMR/Settings", order = 100)]
    public class LuaJITMRSettings : ScriptableObject
    {
        // ── Tracking ─────────────────────────────────────────────────
        [Header("Tracking")]
        [Tooltip("Minimum quality the runtime must provide before showing content. Below this it shows the tracking-lost screen.")]
        public TrackingQuality minimumTracking = TrackingQuality.RotationOnly;

        [Tooltip("How many milliseconds to extrapolate the head pose forward. 0 disables prediction.")]
        [Range(0f, 50f)] public float posePredictionMs = 18f;

        [Tooltip("Apply latest head pose at submit time to reduce motion-to-photon latency.")]
        public bool useLateLatching = true;

        [Tooltip("Per-axis smoothing filter parameters for the head pose.")]
        public OneEuroFilterParams oneEuroFilter = OneEuroFilterParams.Default;

        [Tooltip("Global world scale (1 = meters). Use to feel larger/smaller.")]
        [Range(0.1f, 2f)] public float worldScale = 1f;

        // ── Stereo ──────────────────────────────────────────────────
        [Header("Stereo")]
        [Tooltip("Cardboard viewer lens profile (FOV, distortion k1/k2, screen-to-lens distance).")]
        public LensProfile lensProfile;

        [Tooltip("Interpupillary distance in millimeters. Used to set eye separation.")]
        [Range(50f, 75f)] public float ipdMm = 63f;

        [Tooltip("If true, IPD is adjusted from the QR viewer profile (if loaded).")]
        public bool autoDetectIPD = true;

        [Tooltip("Apply per-channel chromatic-aberration correction in the barrel warp shader. Costs ~0.3 ms/frame.")]
        public bool chromaticAberration = false;

        [Tooltip("Apply a soft vignette around the lens edge to hide distortion seams.")]
        public bool vignette = false;

        [Tooltip("Detect GPU/SOC tier at startup and automatically disable expensive effects.")]
        public bool autoTierGraphics = true;

        [Tooltip("Which stereo rendering path to use. Single-pass instanced is fastest; use Multi-pass on buggy drivers.")]
        public StereoRenderMode stereoRenderMode = StereoRenderMode.SinglePassInstanced;

        // ── MR / Passthrough ────────────────────────────────────────
        [Header("Mixed Reality")]
        public bool enablePassthroughOnStart = false;

        [Tooltip("Request ARCore Depth API for environment occlusion (if supported).")]
        public bool requestDepthApi = true;

        [Tooltip("Detect horizontal/vertical planes for content placement.")]
        public bool planeDetection = true;

        [Tooltip("Sample camera image for ambient color / intensity and apply to URP lighting.")]
        public bool lightEstimation = true;

        // ── Hands ───────────────────────────────────────────────────
        [Header("Hand Tracking")]
        [Tooltip("Enable MediaPipe hand tracking (Android) / WebXR Hands (WebGL).")]
        public bool enableHandTracking = true;

        [Tooltip("Minimum confidence (0..1) to treat a hand as detected.")]
        [Range(0.3f, 0.95f)] public float handDetectionConfidence = 0.6f;

        [Tooltip("Add small physics colliders on fingertips + palm for lightweight interaction.")]
        public bool handPhysicsColliders = true;

        public GestureTrackerConfig gestures = GestureTrackerConfig.All;

        // ── UI ──────────────────────────────────────────────────────
        [Header("UI")]
        [Tooltip("Default distance (meters) at which world-space UI canvases are placed from the head.")]
        [Range(0.5f, 10f)] public float uiDistance = 2.0f;

        [Tooltip("Curvature radius for curved XR canvases. Larger = flatter.")]
        [Range(1f, 20f)] public float uiCurveRadius = 3.0f;

        [Tooltip("Seconds of sustained gaze required to activate dwell-select.")]
        [Range(0.3f, 3f)] public float dwellTimeSeconds = 1.2f;

        public bool hapticFeedback = true;
        public bool audioFeedback = true;

        [Tooltip("Font used for built-in screens. If null, TMP default is used.")]
        public TMP_FontAsset defaultFont;

        // ── Performance ─────────────────────────────────────────────
        [Header("Performance")]
        [Range(30, 90)] public int targetFrameRate = 72;
        public bool useBurstFiltering = true;

        // ── Defaults factory ────────────────────────────────────────
        /// <summary>Returns a new instance populated with production defaults.</summary>
        public static LuaJITMRSettings CreateDefault()
        {
            var s = CreateInstance<LuaJITMRSettings>();
            s.name = "LuaJITMRSettings (Default)";
            s.lensProfile = LensProfile.CreateDefaultCardboard();
            return s;
        }
    }
}
