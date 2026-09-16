using System;
using System.Collections.Generic;
using Unity.Profiling;
using UnityEngine;
using UnityEngine.XR;
using LuaJITMR.Core.Platform;
using XRSubsystemManager = UnityEngine.XR.SubsystemManager;

namespace LuaJITMR.Tracking
{
    /// <summary>
    /// Optional 6DoF tracking provider using the Unity OpenXR plug-in. When a Monado-based
    /// runtime is detected on Android (or any other OpenXR runtime), this is preferred over
    /// ARCore because it provides hand tracking extensions and can drive off-the-shelf OpenXR
    /// runtimes (Monado, Quest Link, SteamVR, etc.).
    ///
    /// <para>This provider uses Unity's generic InputDevice/XR.InputSubsystem API so it does
    /// <b>not</b> take a hard dependency on <c>com.unity.xr.openxr</c> — it works with any
    /// XR loader that populates <see cref="InputDevices"/> (OpenXR, Oculus, etc.).</para>
    /// </summary>
    internal sealed class OpenXRTrackingProvider : IXRTrackingProvider
    {
        private readonly Transform _head;
        private bool _running;
        private bool _available;
        private InputDevice _headDevice;
        private InputDevice _leftController;
        private InputDevice _rightController;
        private Vector3 _lastPos;
        private Quaternion _lastRot = Quaternion.identity;
        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/OpenXR");
        public ProfilerMarker Marker => _marker;

        public TrackingQuality Quality => _running && _headDevice.isValid ? TrackingQuality.Full6DoF : TrackingQuality.None;
        public bool IsRunning => _running;
        public Vector3 HeadAngularVelocity { get; private set; }
        public Vector3 HeadVelocity { get; private set; }

        public event Action OnTrackingLost;
        public event Action OnTrackingRegained;

        public OpenXRTrackingProvider(Transform head) { _head = head; }

        public void Start()
        {
            if (_running) return;
            try
            {
                RefreshDevices();
                InputDevices.deviceConnected += OnDeviceChanged;
                InputDevices.deviceDisconnected += OnDeviceChanged;
                _running = true;
                _available = true;
                OnTrackingRegained?.Invoke();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[LuaJITMR] OpenXR start failed: {e.Message}");
                _available = false;
            }
        }

        public void Stop()
        {
            if (!_running) return;
            _running = false;
            InputDevices.deviceConnected -= OnDeviceChanged;
            InputDevices.deviceDisconnected -= OnDeviceChanged;
        }

        private void OnDeviceChanged(InputDevice d) => RefreshDevices();

        private void RefreshDevices()
        {
            _headDevice = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            _leftController = InputDevices.GetDeviceAtXRNode(XRNode.LeftHand);
            _rightController = InputDevices.GetDeviceAtXRNode(XRNode.RightHand);
        }

        public Pose GetRawHeadPose()
        {
            if (_headDevice.isValid &&
                _headDevice.TryGetFeatureValue(CommonUsages.devicePosition, out var pos) &&
                _headDevice.TryGetFeatureValue(CommonUsages.deviceRotation, out var rot))
            {
                float dt = Mathf.Max(Time.unscaledDeltaTime, 1e-3f);
                HeadVelocity = (pos - _lastPos) / dt;
                if (rot != _lastRot)
                {
                    (rot * Quaternion.Inverse(_lastRot)).ToAngleAxis(out float deg, out var axis);
                    HeadAngularVelocity = deg > 0.01f ? axis * (deg * Mathf.Deg2Rad / dt) : Vector3.zero;
                }
                _lastPos = pos;
                _lastRot = rot;
                return new Pose(pos, rot);
            }
            return new Pose(_head != null ? _head.position : Vector3.zero, _head != null ? _head.rotation : Quaternion.identity);
        }

        public Pose GetPredictedHeadPose(float predictAheadSeconds)
        {
            Pose p = GetRawHeadPose();
            if (predictAheadSeconds > 0f)
                return PosePredictor.Predict(p, HeadVelocity, HeadAngularVelocity, predictAheadSeconds);
            return p;
        }

        public bool TryRecenter()
        {
            var subsystems = new List<XRInputSubsystem>();
            XRSubsystemManager.GetInstances(subsystems);
            foreach (var s in subsystems) s.TryRecenter();
            return true;
        }

        /// <summary>True if any XR loader is active and a Head input device is present.</summary>
        public bool IsRuntimePresent()
        {
            var h = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            return h.isValid;
        }

        public bool TryGetController(XRNode node, out bool triggerDown, out bool triggerHeld, out bool primary, out Vector2 stick, out Pose pointer)
        {
            triggerDown = false; triggerHeld = false; primary = false; stick = Vector2.zero; pointer = default;
            var dev = node == XRNode.LeftHand ? _leftController : _rightController;
            if (!dev.isValid) return false;
            if (dev.TryGetFeatureValue(CommonUsages.triggerButton, out bool tb)) triggerDown = tb;
            if (dev.TryGetFeatureValue(CommonUsages.trigger, out float tv)) triggerHeld = tv > 0.1f;
            if (dev.TryGetFeatureValue(CommonUsages.primaryButton, out bool pb)) primary = pb;
            if (dev.TryGetFeatureValue(CommonUsages.primary2DAxis, out Vector2 ax)) stick = ax;
            if (dev.TryGetFeatureValue(CommonUsages.devicePosition, out var pp) &&
                dev.TryGetFeatureValue(CommonUsages.deviceRotation, out var pr))
                pointer = new Pose(pp, pr);
            return true;
        }

        public void Dispose() => Stop();
    }
}
