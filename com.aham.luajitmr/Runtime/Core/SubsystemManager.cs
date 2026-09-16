using System;
using System.Collections.Generic;
using Unity.Profiling;
using UnityEngine;
using LuaJITMR.Core.Platform;

namespace LuaJITMR.Core
{
    /// <summary>
    /// Central orchestrator: creates platform providers based on <see cref="LuaJITMRSettings"/> and
    /// the current build target, owns their lifetime, and ticks them each frame.
    ///
    /// A single instance is lazily created by <see cref="LuaJITMR.Initialize"/> — never instantiate directly.
    /// </summary>
    internal sealed class SubsystemManager : IDisposable
    {
        public static SubsystemManager Instance { get; private set; }

        public LuaJITMRSettings Settings { get; private set; }
        public XRMode Mode { get; private set; } = XRMode.VR;

        public IXRTrackingProvider Tracking { get; private set; }
        public IStereoRenderer Stereo { get; private set; }
        public IHandTrackingProvider Hands { get; private set; }
        public IMRPassthrough Passthrough { get; private set; }
        public IXRInput Input { get; private set; }
        public IWebXRBridge WebXR { get; private set; }

        private Camera _leftEye;
        private Camera _rightEye;
        private Camera _headCamera;
        private Transform _headTransform;

        private bool _disposed;
        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/SubsystemManager.Tick");

        // ── Anchors (internal registry, proxied to the active tracking provider) ──
        private readonly Dictionary<int, Pose> _anchorPoses = new Dictionary<int, Pose>();
        private int _nextAnchorHandle = 1;

        private SubsystemManager() { }

        public static SubsystemManager Create(LuaJITMRSettings settings, Transform head, Camera headCamera, Camera left, Camera right)
        {
            if (Instance != null) throw new InvalidOperationException("LuaJITMR already initialized. Call Shutdown() first.");
            var mgr = new SubsystemManager
            {
                Settings = settings ? settings : LuaJITMRSettings.CreateDefault(),
                _headTransform = head,
                _headCamera = headCamera,
                _leftEye = left,
                _rightEye = right
            };
            Instance = mgr;
            mgr.BuildPlatformProviders();
            mgr.ApplyPerformanceSettings();
            return mgr;
        }

        private void BuildPlatformProviders()
        {
            PlatformSelector.Build(Settings, _headTransform, _headCamera, _leftEye, _rightEye,
                out var tracking, out var stereo, out var hands, out var passthrough, out var input, out var webxr);
            Tracking = tracking;
            Stereo = stereo;
            Hands = hands;
            Passthrough = passthrough;
            Input = input;
            WebXR = webxr;
        }

        private void ApplyPerformanceSettings()
        {
            Application.targetFrameRate = Settings.targetFrameRate;
            QualitySettings.vSyncCount = 0;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            if (Settings.autoTierGraphics)
            {
                var tier = AutoTierDetector.Detect();
                bool lowEnd = tier == PerformanceTier.Low;
                // Disable expensive effects on low-end hardware (Mali-4xx, Adreno 5xx and below).
                if (lowEnd)
                {
                    Settings.chromaticAberration = false;
                    Settings.vignette = false;
                    Settings.enableHandTracking = SystemInfo.supportsComputeShaders;
                    Debug.Log("[LuaJITMR] Auto-tier: detected Low-end GPU — disabling chromatic aberration and vignette.");
                }
            }
        }

        public void Start()
        {
            Tracking?.Start();
            Hands?.Start();
            Stereo?.Configure(Settings.lensProfile, Settings.ipdMm, Settings.stereoRenderMode);
            Stereo?.SetChromaticAberration(Settings.chromaticAberration);
            Stereo?.SetVignette(Settings.vignette);
            if (Settings.enablePassthroughOnStart) SetMode(XRMode.MR);
        }

        public void SetMode(XRMode mode)
        {
            if (mode == Mode) return;
            switch (mode)
            {
                case XRMode.MR:
                    if (Passthrough != null)
                    {
                        Passthrough.Enable();
                        Mode = XRMode.MR;
                        // Bring up the depth lab for landmark-to-world projection
                        MR.DepthLabManager.Ensure(_headCamera, null /* session origin passed by ARCorePassthrough */);
                    }
                    else
                    {
                        Debug.LogWarning("[LuaJITMR] MR passthrough not available on this platform; staying in VR mode.");
                        LuaJITMR.RaiseModeChangeFailed(XRMode.MR);
                        return;
                    }
                    break;
                case XRMode.VR:
                    Passthrough?.Disable();
                    Mode = XRMode.VR;
                    break;
            }
            LuaJITMR.RaiseModeChanged(Mode);
        }

        public bool TryRecenter()
        {
            return Tracking != null && Tracking.TryRecenter();
        }

        /// <summary>Called from LateUpdate by the Player. Runs the full hot-path.</summary>
        public void Tick(float deltaTime, Camera left, Camera right)
        {
            using (_marker.Auto())
            {
                // 1. Sample head pose
                float predictSec = Settings.posePredictionMs / 1000f;
                Pose head = Tracking != null && Tracking.IsRunning
                    ? Tracking.GetPredictedHeadPose(predictSec)
                    : new Pose(Vector3.zero, Quaternion.identity);
                _headTransform.SetPositionAndRotation(head.position, head.rotation);

                // 2. Input
                Input?.Tick();

                // 3. Stereo rendering frame setup
                Stereo?.BeginFrame(left, right, Settings.worldScale);

                // 4. Apply world scale (simple head-space scale)
                _headTransform.localScale = Vector3.one * Settings.worldScale;
            }
        }

        public void LateLatchSubmit()
        {
            if (!Settings.useLateLatching || Tracking == null || !Tracking.IsRunning) return;
            Pose raw = Tracking.GetRawHeadPose();
            _headTransform.SetPositionAndRotation(raw.position, raw.rotation);
        }

        public void EndFrame()
        {
            Stereo?.EndFrame();
        }

        // ── Anchor API (simple — will be expanded in the MR module) ──
        public bool TryCreateAnchor(Pose worldPose, bool attachToPlane, MRAnchorAttachment attachment, out int handle)
        {
            handle = _nextAnchorHandle++;
            // Real AR anchor backend is wired by MR.PlaneDetectionManager when available;
            // otherwise we simply store the current pose (static anchor in tracking space).
            _anchorPoses[handle] = worldPose;
            return true;
        }

        public bool TryGetAnchorPose(int handle, out Pose pose)
        {
            return _anchorPoses.TryGetValue(handle, out pose);
        }

        public void ReleaseAnchor(int handle) => _anchorPoses.Remove(handle);

        public bool RaycastAgainstPlanes(Ray ray, out Pose hitPose)
        {
            // Default stub — MR.HitTestController replaces this at runtime.
            // If Passthrough isn't active, we just intersect a y=0 floor plane for convenience.
            float t;
            Plane floor = new Plane(Vector3.up, 0f);
            if (floor.Raycast(ray, out t))
            {
                hitPose = new Pose(ray.GetPoint(t), Quaternion.LookRotation(-ray.direction, Vector3.up));
                return true;
            }
            hitPose = default;
            return false;
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            Hands?.Stop();
            Tracking?.Stop();
            Passthrough?.Disable();
            Hands?.Dispose();
            Tracking?.Dispose();
            Passthrough?.Dispose();
            Stereo?.Dispose();
            WebXR?.Dispose();
            Instance = null;
        }
    }
}
