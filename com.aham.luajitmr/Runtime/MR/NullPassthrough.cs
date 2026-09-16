using System;
using LuaJITMR.Core.Platform;
using UnityEngine;

namespace LuaJITMR.MR
{
    /// <summary>
    /// Null passthrough: VR-only black/skybox background, no camera overlay.
    /// </summary>
    internal sealed class NullPassthrough : IMRPassthrough
    {
        protected readonly Camera _camera;
        private CameraClearFlags _prevFlags;
        private Color _prevBg;

        public bool IsActive { get; private set; }
        public bool DepthOcclusionSupported => false;
        public Color EstimatedAmbientColor => Color.white;
        public float EstimatedAmbientIntensity => 1f;
        public float EstimatedColorTemperature => 6500f;

        public event Action OnPassthroughStarted;
        public event Action OnPassthroughStopped;

        public NullPassthrough(Camera camera) { _camera = camera; }

        public virtual void Enable()
        {
            if (_camera == null) return;
            _prevFlags = _camera.clearFlags;
            _prevBg = _camera.backgroundColor;
            // In VR mode without camera passthrough, clear to black.
            _camera.clearFlags = CameraClearFlags.SolidColor;
            _camera.backgroundColor = Color.black;
            IsActive = false; // null passthrough can never actually show camera
        }

        public virtual void Disable()
        {
            if (_camera == null) return;
            _camera.clearFlags = _prevFlags;
            _camera.backgroundColor = _prevBg;
            IsActive = false;
            OnPassthroughStopped?.Invoke();
        }

        public void EnableDepthOcclusion(bool enable) { /* no-op */ }
        public void Dispose() => Disable();
    }
}
