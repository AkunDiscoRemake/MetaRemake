using System;
using UnityEngine;

namespace LuaJITMR.Core.Platform
{
    /// <summary>
    /// Platform passthrough (camera background + optional depth occlusion + light estimation).
    /// </summary>
    internal interface IMRPassthrough : IDisposable
    {
        void Enable();
        void Disable();
        bool IsActive { get; }
        bool DepthOcclusionSupported { get; }
        void EnableDepthOcclusion(bool enable);

        /// <summary>Last estimated ambient color (from ARCore / WebXR light probe).</summary>
        Color EstimatedAmbientColor { get; }
        float EstimatedAmbientIntensity { get; }
        float EstimatedColorTemperature { get; }

        event Action OnPassthroughStarted;
        event Action OnPassthroughStopped;
    }
}
