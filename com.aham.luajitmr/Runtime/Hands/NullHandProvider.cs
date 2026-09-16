using System;
using LuaJITMR.Core.Platform;
using Unity.Collections;

namespace LuaJITMR.Hands
{
    /// <summary>
    /// No-op hand tracker. Reports no hands, raises no events. Used when hands are disabled
    /// or MediaPipe fails to load (gaze input takes over automatically).
    /// </summary>
    internal sealed class NullHandProvider : IHandTrackingProvider
    {
        private readonly Unity.Profiling.ProfilerMarker _marker = new Unity.Profiling.ProfilerMarker("LuaJITMR/Hands/Null");
        public Unity.Profiling.ProfilerMarker Marker => _marker;

        public bool IsReady => true;
        public event Action<string> OnError;

        public void Start() { }
        public void Stop() { }
        public void GetLatestHands(ref HandSnapshot left, ref HandSnapshot right)
        {
            left.IsTracked = false;
            right.IsTracked = false;
        }
        public void Dispose() { }
    }
}
