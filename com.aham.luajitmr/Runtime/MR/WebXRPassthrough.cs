using System;
using LuaJITMR.Core.Platform;
using LuaJITMR.WebXR;
using UnityEngine;

namespace LuaJITMR.MR
{
    /// <summary>
    /// WebXR AR passthrough. The browser composites the camera feed behind the frame; we just
    /// make sure the camera clear is transparent so it doesn't occlude the real world.
    /// </summary>
    internal sealed class WebXRPassthrough : NullPassthrough
    {
        private readonly IWebXRBridge _bridge;
        public WebXRPassthrough(Camera cam, IWebXRBridge bridge) : base(cam) { _bridge = bridge; }

        public override void Enable()
        {
            if (_camera != null)
            {
                _camera.clearFlags = CameraClearFlags.SolidColor;
                _camera.backgroundColor = Color.clear;
            }
            IsActive = true;
            OnPassthroughStarted?.Invoke();
        }

        public override void Disable()
        {
            if (_camera != null)
            {
                _camera.clearFlags = CameraClearFlags.SolidColor;
                _camera.backgroundColor = Color.black;
            }
            IsActive = false;
            OnPassthroughStopped?.Invoke();
        }
    }
}
