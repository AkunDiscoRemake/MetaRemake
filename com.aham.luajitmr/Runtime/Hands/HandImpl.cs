using System;
using LuaJITMR.Core.Platform;
using Unity.Collections;
using UnityEngine;

namespace LuaJITMR.Hands
{
    /// <summary>
    /// Main-thread facade for a single hand. Consumes the latest <see cref="HandSnapshot"/> from the
    /// active <see cref="IHandTrackingProvider"/>, projects landmarks to world space, computes gestures,
    /// and surfaces public events.
    /// </summary>
    internal sealed class HandImpl : IHand, IDisposable
    {
        private readonly Handedness _handedness;
        private HandFrame _current;
        private Gesture _lastGesture;

        public HandImpl(Handedness h)
        {
            _handedness = h;
            _current = new HandFrame
            {
                IsTracked = false,
                Joints = new NativeArray<Pose>(HandJoint.Count, Allocator.Persistent)
            };
        }

        public Handedness Handedness => _handedness;
        public HandFrame Current => _current;
        public bool IsTracked => _current.IsTracked;
        public bool IsPinching => _current.IsTracked && _current.PinchStrength > 0.8f;
        public bool IsGrabbing => _current.IsTracked && _current.GrabStrength > 0.7f;
        public bool IsPointing => _current.IsTracked && _current.CurrentGesture == Gesture.Point;
        public float PinchStrength => _current.PinchStrength;
        public float GrabStrength => _current.GrabStrength;

        public event Action<Gesture> OnGestureStart;
        public event Action<Gesture> OnGestureEnd;

        public Pose GetJoint(int mediapipeIndex) => _current.GetJoint(mediapipeIndex);

        /// <summary>Called every LateUpdate by the updater.</summary>
        internal void Tick(IHandTrackingProvider provider)
        {
            if (provider == null) { MarkLost(); return; }

            var left = default(HandSnapshot);
            var right = default(HandSnapshot);
            provider.GetLatestHands(ref left, ref right);
            ref HandSnapshot snap = ref (_handedness == Handedness.Left ? ref left : ref right);

            if (!snap.IsTracked)
            {
                MarkLost();
                // Dispose any native arrays returned from WebXR provider
                if (snap.Landmarks3D.IsCreated) snap.Landmarks3D.Dispose();
                if (snap.Landmarks2D.IsCreated) snap.Landmarks2D.Dispose();
                return;
            }

            // Project 2D landmarks to world poses — fallback: use palm position as wrist pose at gaze distance.
            _current.IsTracked = true;
            _current.Confidence = snap.Confidence;
            _current.Handedness = snap.Handedness;

            Pose palm = ComputePalmPose(snap);
            _current.PalmPose = palm;

            if (snap.Landmarks3D.IsCreated && snap.Landmarks3D.Length == HandJoint.Count)
            {
                for (int i = 0; i < HandJoint.Count; i++)
                {
                    Vector3 p = snap.Landmarks3D[i];
                    _current.Joints[i] = new Pose(p, Quaternion.identity);
                }
                snap.Landmarks3D.Dispose();
            }
            else
            {
                // Place joints around palm pose as fallback so UI raycast still works
                for (int i = 0; i < HandJoint.Count; i++)
                {
                    float f = i / (float)(HandJoint.Count - 1);
                    Vector3 offset = palm.forward * (0.05f + f * 0.05f);
                    _current.Joints[i] = new Pose(palm.position + offset, palm.rotation);
                }
            }

            // Gesture detection (lightweight heuristics for v0.1.x — full detector in v0.3.x)
            _current.PinchStrength = ComputePinchStrength();
            _current.GrabStrength = ComputeGrabStrength();
            _current.CurrentGesture = DecideGesture();

            if (_current.CurrentGesture != _lastGesture)
            {
                if (_lastGesture != Gesture.None) OnGestureEnd?.Invoke(_lastGesture);
                if (_current.CurrentGesture != Gesture.None) OnGestureStart?.Invoke(_current.CurrentGesture);
                if (_current.CurrentGesture != Gesture.None)
                    LuaJITMR.RaiseGesture(_handedness, _current.CurrentGesture);
                _lastGesture = _current.CurrentGesture;
            }

            if (snap.Landmarks2D.IsCreated) snap.Landmarks2D.Dispose();
        }

        private void MarkLost()
        {
            if (_current.IsTracked)
            {
                _current.IsTracked = false;
                if (_lastGesture != Gesture.None)
                {
                    OnGestureEnd?.Invoke(_lastGesture);
                    _lastGesture = Gesture.None;
                }
            }
        }

        private Pose ComputePalmPose(HandSnapshot snap)
        {
            // Palm pose is approximated from wrist (0) and middle MCP (9)
            if (_current.Joints.IsCreated && _current.Joints.Length >= HandJoint.MiddleMCP + 1)
            {
                return _current.Joints[HandJoint.Wrist];
            }
            return new Pose(Vector3.zero, Quaternion.identity);
        }

        private float ComputePinchStrength()
        {
            if (!_current.IsTracked) return 0f;
            Vector3 thumb = _current.Joints[HandJoint.ThumbTip].position;
            Vector3 index = _current.Joints[HandJoint.IndexTip].position;
            float dist = Vector3.Distance(thumb, index);
            // 0 when fingertips > 6 cm apart, 1 when touching.
            return 1f - Mathf.Clamp01(dist / 0.06f);
        }

        private float ComputeGrabStrength()
        {
            if (!_current.IsTracked) return 0f;
            Vector3 wrist = _current.Joints[HandJoint.Wrist].position;
            Vector3 midTip = _current.Joints[HandJoint.MiddleTip].position;
            Vector3 ringTip = _current.Joints[HandJoint.RingTip].position;
            float dMid = Vector3.Distance(wrist, midTip);
            float dRing = Vector3.Distance(wrist, ringTip);
            // Closed fist: fingertips close to wrist; open hand: far.
            return 1f - Mathf.Clamp01((dMid + dRing) * 0.5f / 0.12f);
        }

        private Gesture DecideGesture()
        {
            if (_current.PinchStrength > 0.8f) return Gesture.Pinch;
            if (_current.GrabStrength > 0.7f) return Gesture.Grab;
            return Gesture.None;
        }

        public void Dispose()
        {
            if (_current.Joints.IsCreated) _current.Joints.Dispose();
        }
    }
}
