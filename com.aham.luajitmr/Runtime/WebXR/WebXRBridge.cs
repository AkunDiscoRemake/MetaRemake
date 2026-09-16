using System;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using AOT;
using LuaJITMR.Core.Platform;
using UnityEngine;

namespace LuaJITMR.WebXR
{
    /// <summary>
    /// P/Invoke bridge against luajitmr_webxr.jslib. Used only on WebGL builds; callers should
    /// check <see cref="IsAvailable"/> before invoking.
    /// </summary>
    internal sealed class WebXRBridge : IWebXRBridge
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern int luajitmr_xr_is_supported();
        [DllImport("__Internal")] private static extern void luajitmr_xr_request_session(int mode, int hands, int depth, IntPtr cb);
        [DllImport("__Internal")] private static extern void luajitmr_xr_end_session();
        [DllImport("__Internal")] private static extern int luajitmr_xr_get_view(IntPtr pos3, IntPtr rot4);
        [DllImport("__Internal")] private static extern int luajitmr_xr_get_hand(int handedness, IntPtr joints21Ptr);
        [DllImport("__Internal")] private static extern int luajitmr_xr_get_input(IntPtr statePtr);
        [DllImport("__Internal")] private static extern void luajitmr_haptics_pulse(float amp, float dur);

        [MonoPInvokeCallback(typeof(Action<int>))]
        private static void OnSessionResult(int ok)
        {
            _pendingTcs?.TrySetResult(ok == 1);
            _pendingTcs = null;
            if (ok == 1) Instance.RaiseSessionStarted();
            else Instance.RaiseError("WebXR session request rejected.");
        }

        [MonoPInvokeCallback(typeof(Action))]
        private static void OnSessionEndedCallback()
        {
            Instance._sessionActive = false;
            Instance.OnSessionEnded?.Invoke();
        }
#else
        private static int luajitmr_xr_is_supported() => 0;
        private static void luajitmr_xr_request_session(int mode, int hands, int depth, IntPtr cb) { }
        private static void luajitmr_xr_end_session() { }
        private static int luajitmr_xr_get_view(IntPtr pos3, IntPtr rot4) => 0;
        private static int luajitmr_xr_get_hand(int handedness, IntPtr j) => 0;
        private static int luajitmr_xr_get_input(IntPtr s) => 0;
        private static void luajitmr_haptics_pulse(float a, float d) { }
        private static void OnSessionResult(int ok) { }
        private static void OnSessionEndedCallback() { }
#endif

        private static TaskCompletionSource<bool> _pendingTcs;
        internal static WebXRBridge Instance { get; private set; }

        private bool _sessionActive;
        public bool IsAvailable
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                return luajitmr_xr_is_supported() != 0;
#else
                return false;
#endif
            }
        }

        public bool SessionActive => _sessionActive;
        public event Action OnSessionStarted;
        public event Action OnSessionEnded;
        public event Action<string> OnError;

        public WebXRBridge() { Instance = this; }

        public Task<bool> RequestSessionAsync(XRMode mode, bool handTracking, bool depthSensing)
        {
            if (_pendingTcs != null) _pendingTcs.TrySetCanceled();
            var tcs = new TaskCompletionSource<bool>();
            _pendingTcs = tcs;
            int m = (mode == XRMode.MR) ? 1 : 0;
            var cb = Marshal.GetFunctionPointerForDelegate<Action<int>>(OnSessionResult);
            try
            {
                luajitmr_xr_request_session(m, handTracking ? 1 : 0, depthSensing ? 1 : 0, cb);
            }
            catch (Exception e)
            {
                tcs.TrySetException(e);
                _pendingTcs = null;
                RaiseError(e.Message);
            }
            return tcs.Task;
        }

        public void EndSession()
        {
            try { luajitmr_xr_end_session(); }
            catch { /* ignore */ }
            _sessionActive = false;
        }

        public Pose GetHeadPose()
        {
            Vector3 p = Vector3.zero;
            Quaternion r = Quaternion.identity;
            unsafe
            {
                float* pos = stackalloc float[3];
                float* rot = stackalloc float[4];
                if (luajitmr_xr_get_view((IntPtr)pos, (IntPtr)rot) == 1)
                {
                    p = new Vector3(pos[0], pos[1], pos[2]);
                    r = new Quaternion(rot[0], rot[1], rot[2], rot[3]);
                }
            }
            return new Pose(p, r);
        }

        public bool TryGetHand(Handedness handedness, out Vector3[] joints21, out float confidence)
        {
            joints21 = null;
            confidence = 0f;
            unsafe
            {
                float* buf = stackalloc float[21 * 3];
                int ok = luajitmr_xr_get_hand((int)handedness, (IntPtr)buf);
                if (ok != 1) return false;
                joints21 = new Vector3[21];
                for (int i = 0; i < 21; i++)
                    joints21[i] = new Vector3(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);
                confidence = 0.9f;
                return true;
            }
        }

        public bool TryGetControllerState(out bool triggerDown, out bool triggerHeld, out bool primaryButton, out Vector2 joystick)
        {
            triggerDown = triggerHeld = primaryButton = false;
            joystick = Vector2.zero;
            unsafe
            {
                // state: float[5] = {triggerPressed (0/1), triggerValue (0..1), primary (0/1), axisX, axisY}
                float* s = stackalloc float[5];
                if (luajitmr_xr_get_input((IntPtr)s) != 1) return false;
                triggerDown = s[0] > 0.5f && s[1] >= 0.9f;
                triggerHeld = s[1] > 0.1f;
                primaryButton = s[2] > 0.5f;
                joystick = new Vector2(s[3], s[4]);
                return true;
            }
        }

        internal void RaiseSessionStarted()
        {
            _sessionActive = true;
            OnSessionStarted?.Invoke();
        }
        internal void RaiseError(string msg) => OnError?.Invoke(msg);

        public void Dispose()
        {
            EndSession();
            if (Instance == this) Instance = null;
        }
    }
}
