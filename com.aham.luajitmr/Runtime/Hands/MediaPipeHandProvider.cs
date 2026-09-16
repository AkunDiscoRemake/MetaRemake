using System;
using LuaJITMR.Core.Platform;
using Unity.Collections;
using UnityEngine;
using Unity.Profiling;

namespace LuaJITMR.Hands
{
    /// <summary>
    /// Android hand tracking via MediaPipe Hands (GPU delegate). Runs inference on a background
    /// thread and publishes <see cref="HandSnapshot"/> results through a lock-free double buffer.
    ///
    /// <para>NOTE (v0.1.x): the MediaPipe AAR is loaded on-demand; if unavailable (AAR missing,
    /// incompatible GPU), the provider stays in <c>IsReady = false</c> and returns untracked hands
    /// so the runtime falls back to gaze input. Full inference integration is wired in v0.3.x.</para>
    /// </summary>
    internal sealed class MediaPipeHandProvider : IHandTrackingProvider
    {
        private readonly LuaJITMRSettings _settings;
        private bool _running;
        private bool _ready;
        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/Hands/MediaPipe");
        public ProfilerMarker Marker => _marker;
        public bool IsReady => _ready;
        public event Action<string> OnError;

        public MediaPipeHandProvider(LuaJITMRSettings settings)
        {
            _settings = settings;
            // In v0.1.x we do not yet load the native AAR. Report not-ready; callers fall back.
            _ready = TryLoadNativePlugin();
        }

        private static bool TryLoadNativePlugin()
        {
            try
            {
                // Native entry point will be `luajitmp_hands_init()` once the AAR is shipped.
                // We probe via AndroidJavaClass without throwing on other platforms.
#if UNITY_ANDROID && !UNITY_EDITOR
                using var cls = new AndroidJavaClass("com.aham.luajitmr.MediaPipeHands");
                return cls != null;
#else
                return false;
#endif
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[LuaJITMR] MediaPipe native plugin not available ({e.Message}); hands disabled.");
                return false;
            }
        }

        public void Start()
        {
            if (_running) return;
            _running = true;
            if (!_ready)
            {
                OnError?.Invoke("MediaPipe AAR not present; hand tracking disabled.");
            }
        }

        public void Stop() { _running = false; }

        public void GetLatestHands(ref HandSnapshot left, ref HandSnapshot right)
        {
            // No inference in v0.1.x — return untracked.
            left.IsTracked = false;
            right.IsTracked = false;
            left.Handedness = Handedness.Left;
            right.Handedness = Handedness.Right;
        }

        public void Dispose() => Stop();
    }
}
