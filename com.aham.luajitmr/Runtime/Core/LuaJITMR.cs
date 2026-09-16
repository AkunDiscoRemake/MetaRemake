using System;
using LuaJITMR.Core.Platform;
using LuaJITMR.Hands;
using LuaJITMR.Input;
using LuaJITMR.WebXR;
using UnityEngine;

namespace LuaJITMR
{
    /// <summary>
    /// Entry point for all LuaJITMR functionality. Call <see cref="Initialize"/> once at startup
    /// (or simply drop <see cref="LuaJITMRPlayer"/> into a scene — it calls Initialize automatically).
    ///
    /// Every method and property is thread-safe for reading; state changes (SetMode, Recenter)
    /// must occur on Unity's main thread.
    /// </summary>
    public static class LuaJITMR
    {
        private static SubsystemManager _mgr;
        private static LuaJITMRSettings _settings;
        private static HandImpl _leftHand;
        private static HandImpl _rightHand;
        private static XRPoseAdapter _poseAdapter;

        /// <summary>True after <see cref="Initialize"/> was called successfully.</summary>
        public static bool IsInitialized => _mgr != null;

        // ── Lifecycle ──────────────────────────────────────────────

        /// <summary>Initialize the runtime. Call once from a startup MonoBehaviour.</summary>
        /// <param name="config">Optional settings asset; if null, defaults are used.</param>
        /// <param name="head">Root transform for the head; if null a new GameObject is created.</param>
        /// <param name="headCamera">Main camera; if null, Camera.main is used.</param>
        public static void Initialize(LuaJITMRSettings config = null, Transform head = null, Camera headCamera = null)
        {
            if (_mgr != null)
            {
                Debug.LogWarning("[LuaJITMR] Initialize called twice; ignoring.");
                return;
            }

            _settings = config ? config : LuaJITMRSettings.CreateDefault();
            if (headCamera == null) headCamera = Camera.main;
            if (headCamera == null)
            {
                var camGo = new GameObject("[LuaJITMR] Main Camera");
                headCamera = camGo.AddComponent<Camera>();
                camGo.tag = "MainCamera";
                camGo.AddComponent<AudioListener>();
            }
            if (head == null) head = headCamera.transform;

            // Create left/right eye cameras as children of head
            Camera left = CreateEye("LeftEye", head);
            Camera right = CreateEye("RightEye", head);

            _mgr = SubsystemManager.Create(_settings, head, headCamera, left, right);
            WebXRManager.Bind(_mgr.WebXR);
            (_mgr.Input as XRInputRouter)?.BindHead(headCamera, head);

            _leftHand = new HandImpl(Handedness.Left);
            _rightHand = new HandImpl(Handedness.Right);
            _poseAdapter = new XRPoseAdapter(_mgr);

            // Wire tracking events to facade events
            _mgr.Tracking.OnTrackingLost += () => OnTrackingLost?.Invoke();
            _mgr.Tracking.OnTrackingRegained += () => OnTrackingRegained?.Invoke();

            _mgr.Start();

            // Attach a hidden updater so we can drive LateUpdate/OnDestroy
            var updater = new GameObject("[LuaJITMR] Updater").AddComponent<LuaJITMRUpdater>();
            updater.hideFlags = HideFlags.HideAndDontSave;
            UnityEngine.Object.DontDestroyOnLoad(updater.gameObject);
            updater.Bind(_mgr, _leftHand, _rightHand);
        }

        public static void Shutdown()
        {
            if (_mgr == null) return;
            _mgr.Dispose();
            _mgr = null;
            _leftHand = null;
            _rightHand = null;
        }

        // ── Mode switching ────────────────────────────────────────

        public static XRMode CurrentMode => _mgr != null ? _mgr.Mode : XRMode.VR;

        public static void SetMode(XRMode mode)
        {
            if (_mgr == null) { Debug.LogWarning("[LuaJITMR] Call Initialize() before SetMode."); return; }
            _mgr.SetMode(mode);
        }

        // ── Tracking ──────────────────────────────────────────────

        public static bool IsTracking => _mgr?.Tracking != null && _mgr.Tracking.Quality >= TrackingQuality.RotationOnly;

        public static TrackingQuality TrackingQuality => _mgr?.Tracking?.Quality ?? TrackingQuality.None;

        public static Pose HeadPose => _mgr?.Tracking != null ? _mgr.Tracking.GetRawHeadPose() : Pose.identity;

        public static void Recenter() { _mgr?.TryRecenter(); }

        public static float WorldScale
        {
            get => _settings ? _settings.worldScale : 1f;
            set { if (_settings) _settings.worldScale = Mathf.Clamp(value, 0.1f, 2f); }
        }

        // ── Hands ─────────────────────────────────────────────────

        /// <summary>Access left hand; never null. Check <c>IsTracked</c> before use.</summary>
        public static IHand Hands_Left => _leftHand;
        /// <summary>Access right hand; never null. Check <c>IsTracked</c> before use.</summary>
        public static IHand Hands_Right => _rightHand;

        public static bool HandsAreTracked => (_leftHand?.IsTracked ?? false) || (_rightHand?.IsTracked ?? false);

        // ── Input ─────────────────────────────────────────────────

        private static IXRInput Input_Internal => _mgr?.Input;

        public static Ray GazeRay => Input_Internal?.GazeRay ?? new Ray(Vector3.zero, Vector3.forward);
        public static bool TriggerDown => Input_Internal?.TriggerDown ?? false;
        public static bool TriggerHeld => Input_Internal?.TriggerHeld ?? false;
        public static bool PrimaryButton => Input_Internal?.PrimaryButtonDown ?? false;

        public static void HapticPulse(float amplitude = 0.5f, float durationSeconds = 0.05f)
            => Input_Internal?.HapticPulse(amplitude, durationSeconds);

        // ── MR ────────────────────────────────────────────────────

        public static bool PassthroughSupported => _mgr?.Passthrough != null;
        public static bool DepthOcclusionSupported => _mgr?.Passthrough?.DepthOcclusionSupported ?? false;

        public static bool PlaceAnchor(Pose worldPose, out MRAnchor anchor)
        {
            anchor = null;
            if (_mgr == null) return false;
            var go = new GameObject("MRAnchor");
            anchor = go.AddComponent<MRAnchor>();
            anchor.Place(worldPose);
            return true;
        }

        public static bool RaycastAgainstPlanes(Ray ray, out Pose hitPose)
        {
            hitPose = default;
            return _mgr != null && _mgr.RaycastAgainstPlanes(ray, out hitPose);
        }

        // ── WebXR ─────────────────────────────────────────────────

        public static bool IsWebXR => WebXRManager.IsWebXR;
        public static bool IsWebXRSessionActive => WebXRManager.SessionActive;

        /// <summary>Request a WebXR session (no-op on Android/Editor).</summary>
        public static System.Threading.Tasks.Task<bool> EnterWebXRAsync(XRMode mode) => WebXRManager.EnterXR(mode);
        public static void ExitWebXR() => WebXRManager.ExitXR();

        // ── Events ────────────────────────────────────────────────

        public static event Action<XRMode> OnModeChanged;
        public static event Action OnTrackingLost;
        public static event Action OnTrackingRegained;
        public static event Action<Handedness, Gesture> OnGesture;
        public static event Action<PermissionState> OnCameraPermissionChanged;
        public static event Action<XRMode> OnModeChangeFailed;

        // Internal event raisers (called by SubsystemManager)
        internal static void RaiseModeChanged(XRMode m) => OnModeChanged?.Invoke(m);
        internal static void RaiseModeChangeFailed(XRMode m) => OnModeChangeFailed?.Invoke(m);
        internal static void RaiseGesture(Handedness h, Gesture g) => OnGesture?.Invoke(h, g);
        internal static void RaisePermissionChanged(PermissionState s) => OnCameraPermissionChanged?.Invoke(s);

        // ── Helpers ───────────────────────────────────────────────

        private static Camera CreateEye(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var cam = go.AddComponent<Camera>();
            cam.stereoTargetEye = name.StartsWith("Left") ? StereoTargetEyeMask.Left : StereoTargetEyeMask.Right;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;
            cam.depth = 1;
            return cam;
        }
    }
}
