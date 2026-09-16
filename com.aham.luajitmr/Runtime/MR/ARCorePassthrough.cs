using System;
using LuaJITMR.Core.Platform;
using UnityEngine;
#if LUAJITMR_ARFOUNDATION_5
using UnityEngine.XR.ARFoundation;
#endif

namespace LuaJITMR.MR
{
    /// <summary>
    /// ARCore camera passthrough using <c>ARCameraBackground</c>. Also drives depth occlusion
    /// (AROcclusionManager) and light estimation toggles when supported.
    /// </summary>
    internal sealed class ARCorePassthrough : NullPassthrough
    {
#if LUAJITMR_ARFOUNDATION_5
        private ARCameraBackground _background;
        private AROcclusionManager _occlusion;
        private ARCameraManager _cameraManager;
        private ARSessionOrigin _origin;
        private readonly LuaJITMRSettings _settings;
        private Color? _lastAmbient;
        private float _lastIntensity = 1f;
        private float _lastTemp = 6500f;

        public ARCorePassthrough(Camera cam, ARSessionOrigin origin, LuaJITMRSettings settings) : base(cam)
        {
            _origin = origin;
            _settings = settings;
        }

        public override void Enable()
        {
            if (IsActive) return;
            if (_camera == null) return;
            _background = _camera.gameObject.GetComponent<ARCameraBackground>();
            if (!_background) _background = _camera.gameObject.AddComponent<ARCameraBackground>();
            _background.enabled = true;
            _camera.clearFlags = CameraClearFlags.SolidColor;
            _camera.backgroundColor = Color.black;
            _camera.depthTextureMode |= DepthTextureMode.Depth;

            if (_settings.requestDepthApi)
            {
                _occlusion = _camera.gameObject.GetComponent<AROcclusionManager>();
                if (!_occlusion) _occlusion = _camera.gameObject.AddComponent<AROcclusionManager>();
                _occlusion.requestedEnvironmentDepthMode = EnvironmentDepthMode.Balanced;
                _occlusion.enabled = true;
            }
            if (_settings.lightEstimation)
            {
                _cameraManager = _camera.gameObject.GetComponent<ARCameraManager>();
                if (_cameraManager != null) _cameraManager.requestedLightEstimation = LightEstimation.AmbientIntensity | LightEstimation.AmbientColor;
            }
            IsActive = true;
            // Bring up the depth lab for landmark-to-world projection
            DepthLabManager.Ensure(_camera, _origin);
            OnPassthroughStarted?.Invoke();
        }

        public override void Disable()
        {
            if (_background) { _background.enabled = false; }
            if (_occlusion) { _occlusion.enabled = false; }
            IsActive = false;
            OnPassthroughStopped?.Invoke();
        }

        public new bool DepthOcclusionSupported => _occlusion != null && _occlusion.currentEnvironmentDepthMode != EnvironmentDepthMode.Disabled;

        public new Color EstimatedAmbientColor => _lastAmbient ?? Color.white;
        public new float EstimatedAmbientIntensity => _lastIntensity;
        public new float EstimatedColorTemperature => _lastTemp;

#else
        public ARCorePassthrough(Camera cam, object origin, LuaJITMRSettings settings) : base(cam) { }
        public override void Enable() { Debug.LogWarning("[LuaJITMR] AR Foundation 5.x not installed; passthrough not available."); }
#endif
    }
}
