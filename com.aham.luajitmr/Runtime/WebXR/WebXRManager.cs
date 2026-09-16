using System;
using System.Threading.Tasks;
using UnityEngine;

namespace LuaJITMR.WebXR
{
    /// <summary>
    /// High-level public helper to request WebXR sessions from user code.
    /// Access via <see cref="LuaJITMR"/> facade.
    /// </summary>
    public static class WebXRManager
    {
        private static IWebXRBridge _bridge;
        private static bool _initialized;

        internal static bool IsWebXR
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                return true;
#else
                return false;
#endif
            }
        }

        internal static bool SessionActive => _bridge != null && _bridge.SessionActive;

        internal static void Bind(IWebXRBridge bridge)
        {
            _bridge = bridge;
            _initialized = true;
            if (_bridge != null) _bridge.OnSessionEnded += () => OnSessionStateChanged?.Invoke(false);
        }

        /// <summary>True if the current browser can start the requested XR mode.</summary>
        public static bool IsSupported(XRMode mode) => _bridge?.IsAvailable ?? false;

        /// <summary>Ask the browser to start an XR session (immersive-vr or immersive-ar).</summary>
        public static async Task<bool> EnterXR(XRMode mode, bool handTracking = true, bool depthSensing = true)
        {
            if (_bridge == null) return false;
            bool ok = await _bridge.RequestSessionAsync(mode, handTracking, depthSensing);
            OnSessionStateChanged?.Invoke(ok);
            return ok;
        }

        public static void ExitXR() => _bridge?.EndSession();

        public static event Action<bool> OnSessionStateChanged;
    }
}
