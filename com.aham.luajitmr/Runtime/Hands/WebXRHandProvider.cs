using System;
using LuaJITMR.Core.Platform;
using Unity.Collections;
using UnityEngine;
using Unity.Profiling;

namespace LuaJITMR.Hands
{
    /// <summary>
    /// Hand tracking via WebXR Hands API (<c>XRHand</c>). Reuses preallocated NativeArrays to
    /// avoid per-frame GC allocations.
    /// </summary>
    internal sealed class WebXRHandProvider : IHandTrackingProvider
    {
        private readonly IWebXRBridge _bridge;
        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/Hands/WebXR");
        public ProfilerMarker Marker => _marker;
        public bool IsReady => _bridge != null && _bridge.SessionActive;
        public event Action<string> OnError;

        // Pre-allocated joint storage for zero-GC hot path
        private NativeArray<Vector3> _leftJoints3D;
        private NativeArray<Vector3> _rightJoints3D;
        private bool _arraysReady;

        public WebXRHandProvider(IWebXRBridge bridge)
        {
            _bridge = bridge;
            EnsureArrays();
        }

        private void EnsureArrays()
        {
            if (_arraysReady) return;
            _leftJoints3D = new NativeArray<Vector3>(21, Allocator.Persistent);
            _rightJoints3D = new NativeArray<Vector3>(21, Allocator.Persistent);
            _arraysReady = true;
        }

        public void Start() { EnsureArrays(); }
        public void Stop() { }

        public void GetLatestHands(ref HandSnapshot left, ref HandSnapshot right)
        {
            left.IsTracked = false;
            right.IsTracked = false;
            left.Handedness = Handedness.Left;
            right.Handedness = Handedness.Right;

            // Dispose any incoming 2D arrays we don't use
            if (left.Landmarks2D.IsCreated) { left.Landmarks2D.Dispose(); left.Landmarks2D = default; }
            if (right.Landmarks2D.IsCreated) { right.Landmarks2D.Dispose(); right.Landmarks2D = default; }

            // Reuse the same NativeArray every frame — consumer reads before next frame
            if (!_arraysReady) EnsureArrays();
            if (left.Landmarks3D.IsCreated && left.Landmarks3D != _leftJoints3D) left.Landmarks3D.Dispose();
            if (right.Landmarks3D.IsCreated && right.Landmarks3D != _rightJoints3D) right.Landmarks3D.Dispose();

            left.Landmarks3D = _leftJoints3D;
            right.Landmarks3D = _rightJoints3D;

            if (_bridge == null || !_bridge.SessionActive) return;

            if (_bridge.TryGetHand(Handedness.Left, out var lj, out var lc) && lj != null && lj.Length == 21)
            {
                left.IsTracked = true;
                left.Confidence = lc;
                for (int i = 0; i < 21; i++) _leftJoints3D[i] = lj[i];
            }
            if (_bridge.TryGetHand(Handedness.Right, out var rj, out var rc) && rj != null && rj.Length == 21)
            {
                right.IsTracked = true;
                right.Confidence = rc;
                for (int i = 0; i < 21; i++) _rightJoints3D[i] = rj[i];
            }
        }

        public void Dispose()
        {
            if (_leftJoints3D.IsCreated) _leftJoints3D.Dispose();
            if (_rightJoints3D.IsCreated) _rightJoints3D.Dispose();
            _arraysReady = false;
        }
    }
}
