using System;
using Unity.Collections;
using UnityEngine;

namespace LuaJITMR
{
    /// <summary>
    /// Constant indices into the 21-landmark hand layout used by MediaPipe / WebXR Hands.
    /// 0 = wrist; each finger has 4 joints (MCP, PIP, DIP, TIP).
    /// </summary>
    public static class HandJoint
    {
        public const int Wrist = 0;
        // Thumb
        public const int ThumbCMC = 1;
        public const int ThumbMCP = 2;
        public const int ThumbIP = 3;
        public const int ThumbTip = 4;
        // Index
        public const int IndexMCP = 5;
        public const int IndexPIP = 6;
        public const int IndexDIP = 7;
        public const int IndexTip = 8;
        // Middle
        public const int MiddleMCP = 9;
        public const int MiddlePIP = 10;
        public const int MiddleDIP = 11;
        public const int MiddleTip = 12;
        // Ring
        public const int RingMCP = 13;
        public const int RingPIP = 14;
        public const int RingDIP = 15;
        public const int RingTip = 16;
        // Pinky
        public const int PinkyMCP = 17;
        public const int PinkyPIP = 18;
        public const int PinkyDIP = 19;
        public const int PinkyTip = 20;

        public const int Count = 21;
    }

    /// <summary>
    /// Lightweight, NativeArray-backed snapshot of one hand's state, suitable for zero-allocation
    /// per-frame access from user code.
    /// </summary>
    public struct HandFrame : IDisposable
    {
        public bool IsTracked;
        public float Confidence;
        public Handedness Handedness;
        public Pose PalmPose;
        public float PinchStrength;
        public float GrabStrength;
        public Gesture CurrentGesture;

        /// <summary>21 world-space joint poses (see <see cref="HandJoint"/> for indices). Allocated with Allocator.Persistent.</summary>
        public NativeArray<Pose> Joints;

        public Pose GetJoint(int index)
        {
            if (!IsTracked || !Joints.IsCreated || index < 0 || index >= Joints.Length) return default;
            return Joints[index];
        }

        public void Dispose()
        {
            if (Joints.IsCreated) Joints.Dispose();
        }
    }

    /// <summary>
    /// Public-facing read accessor for a single hand. Returned from <see cref="LuaJITMR.Hands"/>.
    /// </summary>
    public interface IHand
    {
        Handedness Handedness { get; }
        HandFrame Current { get; }
        bool IsTracked { get; }
        bool IsPinching { get; }
        bool IsGrabbing { get; }
        bool IsPointing { get; }
        float PinchStrength { get; }
        float GrabStrength { get; }
        Pose GetJoint(int mediapipeIndex);

        event Action<Gesture> OnGestureStart;
        event Action<Gesture> OnGestureEnd;
    }
}
