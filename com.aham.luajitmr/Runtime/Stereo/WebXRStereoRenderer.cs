using System;
using LuaJITMR.Core.Platform;
using UnityEngine;

namespace LuaJITMR.Stereo
{
    /// <summary>
    /// In WebXR, the browser handles stereo rendering and lens distortion. We just point both eyes
    /// at the target eye textures the browser provides and let Unity submit to the XR display.
    /// This renderer is effectively a no-op.
    /// </summary>
    internal sealed class WebXRStereoRenderer : IStereoRenderer
    {
        private readonly Camera _left;
        private readonly Camera _right;
        public bool IsActive => true;
        public float VerticalFieldOfView => 90f; // reported by WebXR XRView

        public WebXRStereoRenderer(Camera left, Camera right)
        {
            _left = left;
            _right = right;
        }

        public void Configure(LensProfile profile, float ipdMm, StereoRenderMode mode) { }
        public void BeginFrame(Camera left, Camera right, float worldScale) { }
        public void EndFrame() { }
        public void SetChromaticAberration(bool enable) { }
        public void SetVignette(bool enable) { }
        public LensProfile LoadProfileFromQR(Uri uri) => LensProfile.CreateDefaultCardboard();
        public void Dispose() { }
    }
}
