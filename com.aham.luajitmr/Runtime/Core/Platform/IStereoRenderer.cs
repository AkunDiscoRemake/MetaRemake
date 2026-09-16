using System;
using LuaJITMR.Stereo;
using UnityEngine;

namespace LuaJITMR.Core.Platform
{
    internal enum StereoRenderMode
    {
        SinglePassInstanced = 0,
        MultiPass = 1,
        Mono = 2  // editor / magic window fallback
    }

    /// <summary>
    /// Platform-specific stereo rendering implementation.
    /// </summary>
    internal interface IStereoRenderer : IDisposable
    {
        void Configure(LensProfile profile, float ipdMm, StereoRenderMode mode);
        void BeginFrame(Camera left, Camera right, float worldScale);
        void EndFrame();
        void SetChromaticAberration(bool enable);
        void SetVignette(bool enable);
        bool IsActive { get; }

        /// <summary>Parses a Google Cardboard viewer-profile URI and returns a populated LensProfile.</summary>
        LensProfile LoadProfileFromQR(Uri cardboardUri);

        /// <summary>Recommended field of view per eye, from the active LensProfile.</summary>
        float VerticalFieldOfView { get; }
    }
}
