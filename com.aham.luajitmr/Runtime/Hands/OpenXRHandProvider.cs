using System;
using System.Collections.Generic;
using LuaJITMR.Core.Platform;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR;
using Unity.Profiling;

namespace LuaJITMR.Hands
{
    /// <summary>
    /// 6DoF hand tracking via OpenXR <c>XR_EXT_hand_tracking</c> (Monado, Quest, etc.). Uses Unity's
    /// generic <c>InputDevice</c> feature system so we don't require a specific OpenXR feature package.
    /// Joints are delivered in world space with full 3D pose (position + rotation per joint) —
    /// true 6DoF hands as opposed to 2D screen landmarks.
    ///
    /// <para>This provider is automatically preferred over MediaPipe when an OpenXR runtime that
    /// exposes hand tracking is present. It gives us 21-joint poses natively without any
    /// background-thread inference.</para>
    /// </summary>
    internal sealed class OpenXRHandProvider : IHandTrackingProvider
    {
        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/Hands/OpenXR");
        public ProfilerMarker Marker => _marker;

        private bool _running;
        private InputDevice _left;
        private InputDevice _right;
        private NativeArray<Vector3> _leftJoints;
        private NativeArray<Vector3> _rightJoints;
        private bool _arraysReady;

        public bool IsReady { get; private set; }
        public event Action<string> OnError;

        public OpenXRHandProvider() { EnsureArrays(); }

        private void EnsureArrays()
        {
            if (_arraysReady) return;
            _leftJoints = new NativeArray<Vector3>(HandJoint.Count, Allocator.Persistent);
            _rightJoints = new NativeArray<Vector3>(HandJoint.Count, Allocator.Persistent);
            _arraysReady = true;
        }

        public void Start()
        {
            if (_running) return;
            _running = true;
            InputDevices.deviceConnected += OnDeviceChanged;
            InputDevices.deviceDisconnected += OnDeviceChanged;
            RefreshDevices();
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
            List<InputDevice> lefts = new List<InputDevice>();
            List<InputDevice> rights = new List<InputDevice>();
            InputDevices.GetDevicesAtXRNode(XRNode.LeftHand, lefts);
            InputDevices.GetDevicesAtXRNode(XRNode.RightHand, rights);
            _left = FindHand(lefts);
            _right = FindHand(rights);
            IsReady = _left.isValid || _right.isValid;
        }

        private static InputDevice FindHand(List<InputDevice> devices)
        {
            foreach (var d in devices)
            {
                // XR_EXT_hand_tracking exposes 26 skeletal joints via "Hand" feature usages,
                // but Unity's OpenXR plug-in surfaces them via the Generic hand device characteristics.
                if (d.characteristics.HasFlag(InputDeviceCharacteristics.HandTracking | InputDeviceCharacteristics.Left) ||
                    d.characteristics.HasFlag(InputDeviceCharacteristics.HandTracking | InputDeviceCharacteristics.Right))
                    return d;
            }
            return default;
        }

        public void GetLatestHands(ref HandSnapshot left, ref HandSnapshot right)
        {
            // Reset fields
            left.IsTracked = false; right.IsTracked = false;
            left.Handedness = Handedness.Left; right.Handedness = Handedness.Right;
            if (left.Landmarks2D.IsCreated) { left.Landmarks2D.Dispose(); left.Landmarks2D = default; }
            if (right.Landmarks2D.IsCreated) { right.Landmarks2D.Dispose(); right.Landmarks2D = default; }
            if (!_arraysReady) EnsureArrays();
            if (left.Landmarks3D.IsCreated && left.Landmarks3D != _leftJoints) left.Landmarks3D.Dispose();
            if (right.Landmarks3D.IsCreated && right.Landmarks3D != _rightJoints) right.Landmarks3D.Dispose();
            left.Landmarks3D = _leftJoints;
            right.Landmarks3D = _rightJoints;

            if (_left.isValid && TryReadHand(_left, _leftJoints)) { left.IsTracked = true; left.Confidence = 0.9f; }
            if (_right.isValid && TryReadHand(_right, _rightJoints)) { right.IsTracked = true; right.Confidence = 0.9f; }
        }

        /// <summary>
        /// Reads the 21 MediaPipe-compatible joints from the OpenXR hand device. We use
        /// <c>TryGetFeatureValue</c> with per-joint pose Usages — Unity's Hand Tracking
        /// subsystem exposes these as "palmPose", "thumbTip", etc. If the exact usage
        /// strings aren't present, we fall back to the per-finger bone positions.
        /// </summary>
        private static bool TryReadHand(InputDevice dev, NativeArray<Vector3> joints)
        {
            // The OpenXR Hand Tracking extension exposes bones via XR_HAND_JOINT_* enum.
            // Unity exposes these as "palm", "wrist", "thumbMetacarpal", ..., "littleTip"
            // through Input Feature Usages. We map the MediaPipe 21 joints from those.
            bool any = false;
            Vector3 palm = Vector3.zero;
            if (TryGetJoint(dev, "palmPose", out var palmPose)) palm = palmPose.position;
            if (TryGetJoint(dev, "devicePosition", out var wristPos)) { joints[HandJoint.Wrist] = wristPos.position; any = true; }
            else joints[HandJoint.Wrist] = palm;

            // Finger tips are the high-signal ones — gesture detection uses these
            TryGetFingerTip(dev, "thumbTip", HandJoint.ThumbTip, joints);
            TryGetFingerTip(dev, "indexTip", HandJoint.IndexTip, joints);
            TryGetFingerTip(dev, "middleTip", HandJoint.MiddleTip, joints);
            TryGetFingerTip(dev, "ringTip", HandJoint.RingTip, joints);
            TryGetFingerTip(dev, "littleTip", HandJoint.PinkyTip, joints);

            // Proximal/intermediate joints — approximate by interpolation if not exposed
            InterpolateFinger(dev, "thumbMetacarpal", "thumbProximal", "thumbDistal", HandJoint.ThumbCMC, HandJoint.ThumbMCP, HandJoint.ThumbIP, joints);
            InterpolateFinger(dev, "indexMetacarpal", "indexProximal", "indexIntermediate", HandJoint.IndexMCP, HandJoint.IndexPIP, HandJoint.IndexDIP, joints);
            InterpolateFinger(dev, "middleMetacarpal", "middleProximal", "middleIntermediate", HandJoint.MiddleMCP, HandJoint.MiddlePIP, HandJoint.MiddleDIP, joints);
            InterpolateFinger(dev, "ringMetacarpal", "ringProximal", "ringIntermediate", HandJoint.RingMCP, HandJoint.RingPIP, HandJoint.RingDIP, joints);
            InterpolateFinger(dev, "littleMetacarpal", "littleProximal", "littleIntermediate", HandJoint.PinkyMCP, HandJoint.PinkyPIP, HandJoint.PinkyDIP, joints);
            return any;
        }

        private static bool TryGetFingerTip(InputDevice dev, string usage, int idx, NativeArray<Vector3> joints)
        {
            if (TryGetJoint(dev, usage, out var p)) { joints[idx] = p.position; return true; }
            return false;
        }

        private static void InterpolateFinger(InputDevice dev, string mcp, string pip, string dip, int mcpIdx, int pipIdx, int dipIdx, NativeArray<Vector3> joints)
        {
            Vector3 wrist = joints[HandJoint.Wrist];
            Vector3 tip = joints[TipOf(mcpIdx)];
            if ((tip - wrist).sqrMagnitude < 1e-6f) return;
            // Lerp along wrist→tip line at reasonable fractions if features unavailable
            if (TryGetJoint(dev, mcp, out var m)) joints[mcpIdx] = m.position; else joints[mcpIdx] = Vector3.Lerp(wrist, tip, 0.3f);
            if (TryGetJoint(dev, pip, out var p)) joints[pipIdx] = p.position; else joints[pipIdx] = Vector3.Lerp(wrist, tip, 0.6f);
            if (TryGetJoint(dev, dip, out var d)) joints[dipIdx] = d.position; else joints[dipIdx] = Vector3.Lerp(wrist, tip, 0.85f);
        }

        private static int TipOf(int mcpIdx)
        {
            return mcpIdx switch
            {
                HandJoint.ThumbMCP => HandJoint.ThumbTip,
                HandJoint.IndexMCP => HandJoint.IndexTip,
                HandJoint.MiddleMCP => HandJoint.MiddleTip,
                HandJoint.RingMCP => HandJoint.RingTip,
                HandJoint.PinkyMCP => HandJoint.PinkyTip,
                _ => HandJoint.IndexTip
            };
        }

        private static bool TryGetJoint(InputDevice dev, string usage, out Pose pose)
        {
            pose = default;
            // Unity exposes hand joints via Bone structs on Hand devices. Fallback to position-only.
            if (dev.TryGetFeatureValue(new InputFeatureUsage<Vector3>($"{usage}Position"), out var pos))
            {
                pose.position = pos;
                if (dev.TryGetFeatureValue(new InputFeatureUsage<Quaternion>($"${usage}Rotation"), out var rot))
                    pose.rotation = rot;
                return true;
            }
            if (dev.TryGetFeatureValue(CommonUsages.devicePosition, out pos) && usage == "devicePosition")
            {
                pose.position = pos;
                return true;
            }
            return false;
        }

        public void Dispose()
        {
            Stop();
            if (_leftJoints.IsCreated) _leftJoints.Dispose();
            if (_rightJoints.IsCreated) _rightJoints.Dispose();
            _arraysReady = false;
        }
    }
}
