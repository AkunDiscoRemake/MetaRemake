using System;
using System.Threading.Tasks;
using LuaJITMR.Core.Platform;
using UnityEngine;

namespace LuaJITMR.WebXR
{
    /// <summary>
    /// Non-functional bridge used on Android and in Editor. Never creates a WebXR session.
    /// </summary>
    internal sealed class NullWebXRBridge : IWebXRBridge
    {
        public bool IsAvailable => false;
        public bool SessionActive => false;
        public event Action OnSessionStarted;
        public event Action OnSessionEnded;
        public event Action<string> OnError;

        public Task<bool> RequestSessionAsync(XRMode mode, bool handTracking, bool depthSensing) => Task.FromResult(false);
        public void EndSession() { }
        public Pose GetHeadPose() => new Pose(Vector3.zero, Quaternion.identity);
        public bool TryGetHand(Handedness handedness, out Vector3[] joints21, out float confidence) { joints21 = null; confidence = 0f; return false; }
        public bool TryGetControllerState(out bool triggerDown, out bool triggerHeld, out bool primaryButton, out Vector2 joystick)
        {
            triggerDown = triggerHeld = primaryButton = false;
            joystick = Vector2.zero;
            return false;
        }
        public void Dispose() { }
    }
}
