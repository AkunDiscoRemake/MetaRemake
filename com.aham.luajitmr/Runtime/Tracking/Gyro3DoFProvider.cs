using Unity.Profiling;
using UnityEngine;
using LuaJITMR.Core.Platform;
using System;

namespace LuaJITMR.Tracking
{
    /// <summary>
    /// Fallback 3DoF tracking provider using the device gyroscope + attitude.
    /// Position is locked at y = <c>headHeight</c> (default 1.7 m). Used as automatic fallback
    /// when ARCore is unsupported, and as editor mouse-look in play mode.
    /// </summary>
    internal sealed class Gyro3DoFProvider : IXRTrackingProvider
    {
        private readonly Transform _head;
        private readonly bool _mouseLookInEditor;
        private readonly float _headHeight;
        private bool _running;
        private bool _gyroAvailable;
        private Quaternion _yawCorrection = Quaternion.identity;
        private Quaternion _lastAttitude = Quaternion.identity;
        private Vector3 _angularVel;

        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/Gyro3DoF");
        public ProfilerMarker Marker => _marker;

        public TrackingQuality Quality => _running ? TrackingQuality.RotationOnly : TrackingQuality.None;
        public bool IsRunning => _running;
        public Vector3 HeadAngularVelocity => _angularVel;
        public Vector3 HeadVelocity => Vector3.zero;

        public event Action OnTrackingLost;
        public event Action OnTrackingRegained;

        public Gyro3DoFProvider(Transform head, bool fallbackToMouseLookInEditor = false, float headHeightMeters = 1.7f)
        {
            _head = head;
            _mouseLookInEditor = fallbackToMouseLookInEditor;
            _headHeight = headHeightMeters;
        }

        public void Start()
        {
            if (_running) return;
            _running = true;
            Input.gyro.enabled = true;
            _gyroAvailable = SystemInfo.supportsGyroscope;
            Input.compensateSensors = true;
            if (!_gyroAvailable)
            {
                Debug.Log("[LuaJITMR] No gyroscope detected; using editor mouse-look or static pose.");
            }
            // Reset recenter
            _yawCorrection = Quaternion.identity;
        }

        public void Stop()
        {
            if (!_running) return;
            _running = false;
            Input.gyro.enabled = false;
        }

        public Pose GetRawHeadPose() => GetPredictedHeadPose(0f);

        public Pose GetPredictedHeadPose(float predictAheadSeconds)
        {
            Quaternion rot;
            Vector3 pos = new Vector3(0f, _headHeight, 0f);

            if (_gyroAvailable && !_mouseLookInEditor)
            {
                // Gyro attitude is in right-handed landscape-left orientation; convert to Unity.
                Quaternion att = Input.gyro.attitude;
                att = new Quaternion(att.x, att.y, -att.z, -att.w);
                rot = _yawCorrection * att;
                _angularVel = Input.gyro.rotationRateUnbiased;
            }
#if UNITY_EDITOR
            else if (_mouseLookInEditor)
            {
                // Simple alt-mouse-drag look for editor iteration, does not affect device builds.
                if (Input.GetKey(KeyCode.LeftAlt))
                {
                    float y = Input.GetAxis("Mouse X") * 180f * Time.deltaTime;
                    float p = -Input.GetAxis("Mouse Y") * 180f * Time.deltaTime;
                    _lastAttitude *= Quaternion.Euler(p, y, 0f);
                }
                rot = _yawCorrection * _lastAttitude;
                _angularVel = Vector3.zero;
            }
#endif
            else
            {
                rot = _yawCorrection * _lastAttitude;
            }

            if (predictAheadSeconds > 0f && _angularVel.sqrMagnitude > 0f)
            {
                rot = rot * Quaternion.Euler(_angularVel * Mathf.Rad2Deg * predictAheadSeconds);
            }

            return new Pose(pos, rot);
        }

        public bool TryRecenter()
        {
            // Snap current yaw so that "forward" matches the current viewing direction's forward projected onto XZ.
            Pose cur = GetRawHeadPose();
            Vector3 fwd = cur.rotation * Vector3.forward;
            fwd.y = 0;
            if (fwd.sqrMagnitude < 1e-5f) return false;
            Quaternion desired = Quaternion.LookRotation(fwd, Vector3.up);
            // We want desired = _yawCorrection * att -> _yawCorrection = desired * Quaternion.Inverse(att)
            Quaternion att = Input.gyro.enabled ? new Quaternion(Input.gyro.attitude.x, Input.gyro.attitude.y, -Input.gyro.attitude.z, -Input.gyro.attitude.w) : _lastAttitude;
            _yawCorrection = desired * Quaternion.Inverse(att);
            OnTrackingRegained?.Invoke();
            return true;
        }

        public void Dispose() => Stop();
    }
}
