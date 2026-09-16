using System.Runtime.InteropServices;
#if UNITY_WEBGL && !UNITY_EDITOR
using System;
#endif

namespace LuaJITMR.Input
{
    internal static class WebXRHaptics
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void luajitmr_haptics_pulse(float amp, float dur);
#endif
        public static void Pulse(float amplitude01, float durationSeconds)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            try { luajitmr_haptics_pulse(amplitude01, durationSeconds); } catch { /* bridge not present */ }
#endif
        }
    }
}
