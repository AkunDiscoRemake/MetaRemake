using System;
using LuaJITMR.Core.Platform;
using LuaJITMR.WebXR;
using UnityEngine;
using Unity.Profiling;

namespace LuaJITMR.Tracking
{
    /// <summary>
    /// Head tracking sourced from WebXR <c>XRViewerPose</c>, relayed through <see cref="WebXRBridge"/>.
    /// </summary>
    internal sealed class WebXRTrackingProvider : IXRTrackingProvider
    {
        private readonly IWebXRBridge _bridge;
        private readonly Transform _head;
        private bool _running;
        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/WebXRTracking");
        public ProfilerMarker Marker => _marker;

        public WebXRTrackingProvider(IWebXRBridge bridge, Transform head)
        {
            _bridge = bridge;
            _head = head;
        }

        public TrackingQuality Quality => _bridge != null && _bridge.SessionActive ? TrackingQuality.Full6DoF : TrackingQuality.None;
        public bool IsRunning => _running;
        public Vector3 HeadAngularVelocity => Vector3.zero; // WebXR doesn't expose velocity reliably
        public Vector3 HeadVelocity => Vector3.zero;
        public event Action OnTrackingLost;
        public event Action OnTrackingRegained;

        public void Start() { _running = true; }
        public void Stop() { _running = false; }

        public Pose GetPredictedHeadPose(float predictAheadSeconds) =>
            _bridge != null && _bridge.SessionActive ? _bridge.GetHeadPose() : new Pose(Vector3.zero, Quaternion.identity);

        public Pose GetRawHeadPose() => GetPredictedHeadPose(0f);
        public bool TryRecenter() { /* In WebXR, recenter is handled by the browser. */ return true; }
        public void Dispose() => Stop();
    }
}
