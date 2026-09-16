using UnityEngine;

namespace LuaJITMR.Input
{
    /// <summary>
    /// Minimal Android haptics via the Vibrator system service. Uses the VIBRATE permission
    /// declared in the package manifest. No third-party plugin needed.
    /// </summary>
    internal static class AndroidHaptics
    {
        private static AndroidJavaObject _vibrator;
        private static AndroidJavaClass _vibrationEffectClass;
        private static bool _tried;
        private static bool _supported;
        private static int _sdkVersion = -1;

        private static void EnsureInitialized()
        {
            if (_tried) return;
            _tried = true;
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using var playerClass = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                using var act = playerClass.GetStatic<AndroidJavaObject>("currentActivity");
                _vibrator = act.Call<AndroidJavaObject>("getSystemService", "vibrator");
                _supported = _vibrator != null;
                using var buildVersion = new AndroidJavaClass("android.os.Build$VERSION");
                _sdkVersion = buildVersion.GetStatic<int>("SDK_INT");
                if (_sdkVersion >= 26)
                    _vibrationEffectClass = new AndroidJavaClass("android.os.VibrationEffect");
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[LuaJITMR] Haptics unavailable: {e.Message}");
                _supported = false;
            }
#else
            _supported = false;
#endif
        }

        public static void Vibrate(float amplitude01, float durationSeconds)
        {
            EnsureInitialized();
            if (!_supported || _vibrator == null) return;
            long ms = Mathf.Clamp((long)(durationSeconds * 1000f), 5, 500);
            int amp = Mathf.Clamp((int)(amplitude01 * 255), 1, 255);
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                if (_sdkVersion >= 26 && _vibrationEffectClass != null)
                {
                    using var effect = _vibrationEffectClass.CallStatic<AndroidJavaObject>("createOneShot", ms, amp);
                    _vibrator.Call("vibrate", effect);
                }
                else
                {
                    _vibrator.Call("vibrate", ms);
                }
            }
            catch (System.Exception)
            {
                // ignore — some restricted ROMs block haptics
            }
#endif
        }
    }
}
