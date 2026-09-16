using System;
using Unity.Collections;
using UnityEngine;

namespace LuaJITMR.Core.Platform
{
    /// <summary>
    /// Per-hand raw results consumed by the gesture detector and rig.
    /// 21 MediaPipe landmark indices are used (0=wrist, 4=thumb-tip, 8=index-tip, 12=middle-tip, 16=ring-tip, 20=pinky-tip).
    /// </summary>
    internal struct HandSnapshot : IDisposable
    {
        public bool IsTracked;
        public float Confidence;
        public Handedness Handedness;
        /// <summary>Normalized 2D (x in [0,1], y in [0,1], z = relative depth from wrist in meters, negative towards camera).</summary>
        public NativeArray<Vector3> Landmarks2D;
        /// <summary>World-space 3D landmarks projected using depth/plane data.</summary>
        public NativeArray<Vector3> Landmarks3D;
        public long FrameTimestamp;

        public void Dispose()
        {
            if (Landmarks2D.IsCreated) Landmarks2D.Dispose();
            if (Landmarks3D.IsCreated) Landmarks3D.Dispose();
        }
    }

    /// <summary>
    /// Hand-tracking backend (MediaPipe / ML Kit / WebXR). Implementations run inference on a
    /// background thread and publish the latest snapshot via a lock-free double buffer.
    /// </summary>
    internal interface IHandTrackingProvider : IDisposable, IProfiled
    {
        void Start();
        void Stop();
        bool IsReady { get; }

        /// <summary>Returns the latest snapshots; does not allocate on the hot path.</summary>
        void GetLatestHands(ref HandSnapshot left, ref HandSnapshot right);

        event Action<string> OnError;
    }
}
