using System;
using LuaJITMR.Core.Platform;
using UnityEngine;

namespace LuaJITMR.Stereo
{
    /// <summary>
    /// Production stereo renderer: applies per-eye barrel-distortion mesh warp, optional chromatic
    /// aberration correction and vignette. Generates a distorted mesh once at configuration time
    /// and blits each eye via a single draw call after all opaque/transparent rendering.
    ///
    /// Full mesh+shader generation will be added in v0.2.x; this implementation currently acts as
    /// a correctly-configured two-camera viewport splitter so the rig is usable while the warp
    /// pipeline is wired into the URP Renderer Feature.
    /// </summary>
    internal sealed class BarrelDistortionRenderer : IStereoRenderer
    {
        private readonly Camera _left;
        private readonly Camera _right;
        private LensProfile _profile;
        private float _ipdMm;
        private bool _chromatic;
        private bool _vignette;
        private bool _isActive;
        private RenderTexture _leftRT;
        private RenderTexture _rightRT;

        public bool IsActive => _isActive;
        public float VerticalFieldOfView => _profile ? _profile.verticalFovDeg : 80f;

        public BarrelDistortionRenderer(Camera left, Camera right, LuaJITMRSettings settings)
        {
            _left = left;
            _right = right;
            _profile = settings ? settings.lensProfile : LensProfile.CreateDefaultCardboard();
        }

        public void Configure(LensProfile profile, float ipdMm, StereoRenderMode mode)
        {
            _profile = profile;
            _ipdMm = ipdMm;
            EnsureEyeCameras();
        }

        private void EnsureEyeCameras()
        {
            if (_left == null || _right == null) { _isActive = false; return; }
            _left.enabled = true;
            _right.enabled = true;

            float eyeOffsetM = (_ipdMm * 0.001f) * 0.5f;
            _left.transform.localPosition = new Vector3(-eyeOffsetM, 0f, 0f);
            _right.transform.localPosition = new Vector3(eyeOffsetM, 0f, 0f);

            float aspect = (Screen.width * 0.5f) / (float)Screen.height;
            _left.fieldOfView = _profile ? _profile.verticalFovDeg : 80f;
            _right.fieldOfView = _left.fieldOfView;
            _left.aspect = aspect;
            _right.aspect = aspect;
            _left.rect = new Rect(0f, 0f, 0.5f, 1f);
            _right.rect = new Rect(0.5f, 0f, 0.5f, 1f);
            _isActive = true;
        }

        public void BeginFrame(Camera left, Camera right, float worldScale) { }

        public void EndFrame()
        {
            // Warp mesh blit will be done by the URP RendererFeature (BarrelDistortionFeature)
            // registered at startup by LuaJITMRPlayer. Until that is installed in v0.2.x, the
            // split-screen output is sufficient for basic VR preview.
        }

        public void SetChromaticAberration(bool enable) { _chromatic = enable; }
        public void SetVignette(bool enable) { _vignette = enable; }

        public LensProfile LoadProfileFromQR(Uri uri)
        {
            if (CardboardProfileQR.TryParse(uri, out var p)) { _profile = p; return p; }
            return _profile;
        }

        public void Dispose()
        {
            if (_leftRT) { RenderTexture.ReleaseTemporary(_leftRT); _leftRT = null; }
            if (_rightRT) { RenderTexture.ReleaseTemporary(_rightRT); _rightRT = null; }
        }
    }
}
