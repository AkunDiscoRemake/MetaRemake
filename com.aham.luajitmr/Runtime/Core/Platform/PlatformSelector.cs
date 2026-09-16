using UnityEngine;
using LuaJITMR.Tracking;
using LuaJITMR.Stereo;
using LuaJITMR.Hands;
using LuaJITMR.MR;
using LuaJITMR.Input;
using LuaJITMR.WebXR;

namespace LuaJITMR.Core.Platform
{
    /// <summary>
    /// Selects the correct platform implementations at runtime, based on build target and
    /// device capability. Compile-time <c>#if</c> guards ensure we never reference
    /// platform-specific assemblies on a platform that doesn't support them.
    ///
    /// <para>Priority order on Android:
    /// <list type="number">
    /// <item><b>OpenXR runtime</b> (Monado, Quest Link, etc.) — if an XR loader is present
    ///       and reports a Head device. This is preferred when available.</item>
    /// <item><b>ARCore</b> — 6DoF with camera passthrough + depth.</item>
    /// <item><b>Gyro 3DoF</b> — always-on fallback.</item>
    /// </list>
    /// </para>
    /// </summary>
    internal static class PlatformSelector
    {
        public static void Build(
            LuaJITMRSettings settings,
            Transform head,
            Camera headCamera,
            Camera leftEye,
            Camera rightEye,
            out IXRTrackingProvider tracking,
            out IStereoRenderer stereo,
            out IHandTrackingProvider hands,
            out IMRPassthrough passthrough,
            out IXRInput input,
            out IWebXRBridge webxr)
        {
            tracking = null;
            stereo = null;
            hands = null;
            passthrough = null;
            webxr = null;

#if UNITY_EDITOR
            tracking = new Gyro3DoFProvider(head, fallbackToMouseLookInEditor: true);
            stereo = new NullStereoRenderer(leftEye, rightEye);
            hands = new NullHandProvider();
            passthrough = new NullPassthrough(headCamera);
            input = new XRInputRouter(tracking, null);
            webxr = new NullWebXRBridge();
#elif UNITY_ANDROID
            // Priority 1: OpenXR (Monado / official runtime).
            var openxr = new OpenXRTrackingProvider(head);
            bool openxrActive = false;
            try { openxrActive = openxr.IsRuntimePresent(); } catch { openxrActive = false; }

            if (openxrActive)
            {
                tracking = openxr;
                stereo = new BarrelDistortionRenderer(leftEye, rightEye, settings);
                // Prefer OpenXR hand tracking (XR_EXT_hand_tracking, true 6DoF) when available;
                // fall back to MediaPipe on-camera hands otherwise.
                var xrHands = new OpenXRHandProvider();
                xrHands.Start();
                hands = xrHands.IsReady
                    ? (IHandTrackingProvider)xrHands
                    : (settings.enableHandTracking ? (IHandTrackingProvider)new MediaPipeHandProvider(settings) : new NullHandProvider());
                passthrough = new NullPassthrough(headCamera); // Monado passthrough via XR_FB_passthrough (v0.3)
                input = new XRInputRouter(tracking, null);
                webxr = new NullWebXRBridge();
            }
            else
            {
                openxr.Dispose();
                // Priority 2: ARCore
                var arcore = new ARCoreTrackingProvider(head, headCamera, settings);
                tracking = arcore;
                stereo = new BarrelDistortionRenderer(leftEye, rightEye, settings);
                hands = settings.enableHandTracking ? (IHandTrackingProvider)new MediaPipeHandProvider(settings) : new NullHandProvider();
                passthrough = new ARCorePassthrough(headCamera, arcore.SessionOrigin, settings);
                input = new XRInputRouter(tracking, null);
                webxr = new NullWebXRBridge();
            }
#elif UNITY_WEBGL
            webxr = new WebXRBridge();
            tracking = new WebXRTrackingProvider(webxr, head);
            stereo = new WebXRStereoRenderer(leftEye, rightEye);
            hands = new WebXRHandProvider(webxr);
            passthrough = new WebXRPassthrough(headCamera, webxr);
            input = new XRInputRouter(tracking, webxr);
#else
            tracking = new Gyro3DoFProvider(head, fallbackToMouseLookInEditor: true);
            stereo = new NullStereoRenderer(leftEye, rightEye);
            hands = new NullHandProvider();
            passthrough = new NullPassthrough(headCamera);
            input = new XRInputRouter(tracking, null);
            webxr = new NullWebXRBridge();
#endif
        }
    }
}
