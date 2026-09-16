using System;
using System.Threading.Tasks;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace LuaJITMR.Core.Platform
{
    /// <summary>
    /// Browser bridge for WebXR sessions. Active only on WebGL.
    /// </summary>
    internal interface IWebXRBridge : IDisposable
    {
        bool IsAvailable { get; }
        bool SessionActive { get; }

        Task<bool> RequestSessionAsync(XRMode mode, bool handTracking, bool depthSensing);
        void EndSession();

        Pose GetHeadPose();
        bool TryGetHand(Handedness handedness, out Vector3[] joints21, out float confidence);
        bool TryGetControllerState(out bool triggerDown, out bool triggerHeld, out bool primaryButton, out Vector2 joystick);

        event Action OnSessionStarted;
        event Action OnSessionEnded;
        event Action<string> OnError;
    }
}
