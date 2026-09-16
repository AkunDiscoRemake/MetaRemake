using System;
using LuaJITMR.Core.Platform;
using UnityEngine;

namespace LuaJITMR.Stereo
{
    /// <summary>
    /// Mono/no-distortion renderer. Used in-editor and on platforms where stereo is unavailable.
    /// Simply keeps the single main camera rendering at full viewport.
    /// </summary>
    internal sealed class NullStereoRenderer : IStereoRenderer
    {
        private readonly Camera _left;
        private readonly Camera _right;
        private LensProfile _profile;

        public bool IsActive => false;
        public float VerticalFieldOfView => _profile ? _profile.verticalFovDeg : 60f;

        public NullStereoRenderer(Camera left, Camera right)
        {
            _left = left;
            _right = right;
            _profile = LensProfile.CreateDefaultCardboard();
            if (_right) _right.enabled = false;
        }

        public void Configure(LensProfile profile, float ipdMm, StereoRenderMode mode)
        {
            _profile = profile;
            if (_left) _left.fieldOfView = _profile.verticalFovDeg;
        }
        public void BeginFrame(Camera left, Camera right, float worldScale) { }
        public void EndFrame() { }
        public void SetChromaticAberration(bool enable) { }
        public void SetVignette(bool enable) { }
        public LensProfile LoadProfileFromQR(Uri uri)
        {
            if (CardboardProfileQR.TryParse(uri, out var p)) { _profile = p; return p; }
            return _profile;
        }
        public void Dispose() { }
    }
}
