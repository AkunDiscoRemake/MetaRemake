using System;
using LuaJITMR.Core.Platform;
using UnityEngine;
using Unity.Profiling;
#if LUAJITMR_ARFOUNDATION_5
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
#endif

namespace LuaJITMR.Tracking
{
    /// <summary>
    /// ARCore 6DoF tracking provider. When ARCore is unavailable or fails to install,
    /// this provider transparently falls back to <see cref="Gyro3DoFProvider"/> so that
    /// VR mode still works on devices without Play Services for AR.
    /// </summary>
    internal sealed class ARCoreTrackingProvider : IXRTrackingProvider
    {
        private readonly Transform _head;
        private readonly Camera _camera;
        private readonly LuaJITMRSettings _settings;
        private Gyro3DoFProvider _fallback;
        private bool _running;
        private bool _usingFallback;
        private OneEuroFilter3 _posFilter;
        private OneEuroFilter3 _rotEulerFilter;
        private Pose _lastPose = Pose.identity;
        private Vector3 _lastPos;
        private Vector3 _linearVel;
        private Vector3 _angularVel;
        private float _lastFrameTime;
#if LUAJITMR_ARFOUNDATION_5
        private ARSession _arSession;
        public ARSessionOrigin SessionOrigin { get; private set; }
        private ARCameraManager _cameraManager;
        private TrackingState _lastTrackingState = TrackingState.None;
#endif
        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/ARCore");
        public ProfilerMarker Marker => _marker;

        public TrackingQuality Quality { get; private set; } = TrackingQuality.None;
        public bool IsRunning => _running;
        public Vector3 HeadAngularVelocity => _angularVel;
        public Vector3 HeadVelocity => _linearVel;

        public event Action OnTrackingLost;
        public event Action OnTrackingRegained;

        public ARCoreTrackingProvider(Transform head, Camera camera, LuaJITMRSettings settings)
        {
            _head = head;
            _camera = camera;
            _settings = settings;
            _fallback = new Gyro3DoFProvider(head, false);
            _posFilter = new OneEuroFilter3();
            _posFilter.Init(settings.oneEuroFilter);
            _rotEulerFilter = new OneEuroFilter3();
            _rotEulerFilter.Init(settings.oneEuroFilter);
        }

        public void Start()
        {
            if (_running) return;
            _running = true;
            _fallback.Start();

#if LUAJITMR_ARFOUNDATION_5
            EnsureARSession();
            // Kick off availability check; if ARCore is unsupported we permanently switch to fallback.
            CheckARCoreAvailability();
#else
            SwitchToFallback(force: true);
#endif
        }

        public void Stop()
        {
            if (!_running) return;
            _running = false;
            _fallback.Stop();
#if LUAJITMR_ARFOUNDATION_5
            if (_arSession) _arSession.enabled = false;
#endif
        }

        public Pose GetRawHeadPose() => GetPredictedHeadPose(0f);

        public Pose GetPredictedHeadPose(float predictAheadSeconds)
        {
            using (_marker.Auto())
            {
                Pose pose;
                if (_usingFallback)
                {
                    pose = _fallback.GetPredictedHeadPose(predictAheadSeconds);
                    _linearVel = _fallback.HeadVelocity;
                    _angularVel = _fallback.HeadAngularVelocity;
                    Quality = _fallback.Quality;
                }
                else
                {
#if LUAJITMR_ARFOUNDATION_5
                    if (_camera != null && _camera.transform != null)
                    {
                        var raw = new Pose(_camera.transform.position, _camera.transform.rotation);
                        float dt = Mathf.Max(Time.unscaledDeltaTime, 1e-3f);
                        Vector3 smoothPos = _posFilter.Filter(raw.position, dt);
                        Vector3 smoothEuler = _rotEulerFilter.Filter(raw.rotation.eulerAngles, dt);
                        pose = new Pose(smoothPos, Quaternion.Euler(smoothEuler));

                        // Compute velocities for prediction
                        float invDt = 1f / dt;
                        _linearVel = (pose.position - _lastPos) * invDt;
                        Quaternion deltaQ = pose.rotation * Quaternion.Inverse(_lastPose.rotation);
                        deltaQ.ToAngleAxis(out float angleDeg, out Vector3 axis);
                        _angularVel = (angleDeg > 0.01f) ? axis * (angleDeg * Mathf.Deg2Rad * invDt) : Vector3.zero;

                        // Track state change events
                        var state = _cameraManager ? _cameraManager.currentTrackingState : TrackingState.Tracking;
                        if (state == TrackingState.Tracking)
                        {
                            if (_lastTrackingState != TrackingState.Tracking)
                                OnTrackingRegained?.Invoke();
                            Quality = TrackingQuality.Full6DoF;
                        }
                        else if (state == TrackingState.Limited)
                        {
                            Quality = TrackingQuality.Limited;
                        }
                        else
                        {
                            Quality = TrackingQuality.RotationOnly;
                            if (_lastTrackingState == TrackingState.Tracking)
                                OnTrackingLost?.Invoke();
                        }
                        _lastTrackingState = state;

                        _lastPos = pose.position;
                        _lastPose = pose;
                    }
                    else
                    {
                        pose = Pose.identity;
                    }
#else
                    pose = Pose.identity;
#endif
                    pose = PosePredictor.Predict(pose, _linearVel, _angularVel, predictAheadSeconds);
                }
                return pose;
            }
        }

        public bool TryRecenter()
        {
            // 6DoF recenter only rotates yaw (we don't shift position in ARCore anchored space).
            return _fallback.TryRecenter();
        }

        public void Dispose() => Stop();

#if LUAJITMR_ARFOUNDATION_5
        private void EnsureARSession()
        {
            if (_arSession) return;
            var go = new GameObject("[LuaJITMR] ARSession");
            UnityEngine.Object.DontDestroyOnLoad(go);
            _arSession = go.AddComponent<ARSession>();
            var inputMgr = go.AddComponent<ARInputManager>();
            // Session origin
            var originGo = new GameObject("[LuaJITMR] ARSessionOrigin");
            UnityEngine.Object.DontDestroyOnLoad(originGo);
            SessionOrigin = originGo.AddComponent<ARSessionOrigin>();
            SessionOrigin.camera = _camera;
            // Reparent camera to session origin for AR tracking to work.
            _camera.transform.SetParent(SessionOrigin.transform, worldPositionStays: true);
            _cameraManager = _camera.gameObject.GetComponent<ARCameraManager>();
            if (!_cameraManager) _cameraManager = _camera.gameObject.AddComponent<ARCameraManager>();
            _cameraManager.enabled = true;
        }

        private async void CheckARCoreAvailability()
        {
            try
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                var result = await ARSession.CheckAvailability();
                bool supported = result == ARSessionAvailability.Supported ||
                                 result == ARSessionAvailability.SupportedInstalled;
                if (!supported)
                {
                    Debug.Log("[LuaJITMR] ARCore unsupported on this device — falling back to 3DoF.");
                    SwitchToFallback(force: true);
                    return;
                }
                if (result == ARSessionAvailability.NeedsInstall)
                {
                    var install = await ARSession.Install();
                    if (install != ARSessionInstallStatus.Installed)
                    {
                        Debug.LogWarning("[LuaJITMR] ARCore install cancelled/failed — falling back to 3DoF.");
                        SwitchToFallback(force: true);
                        return;
                    }
                }
                _arSession.enabled = true;
                Quality = TrackingQuality.Full6DoF;
                OnTrackingRegained?.Invoke();
#else
                SwitchToFallback(force: true);
#endif
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[LuaJITMR] ARCore init failed: {e.Message}; falling back to 3DoF.");
                SwitchToFallback(force: true);
            }
        }
#endif

        private void SwitchToFallback(bool force)
        {
            _usingFallback = true;
            Quality = TrackingQuality.RotationOnly;
#if LUAJITMR_ARFOUNDATION_5
            if (_arSession && force) _arSession.enabled = false;
#endif
        }
    }
}
