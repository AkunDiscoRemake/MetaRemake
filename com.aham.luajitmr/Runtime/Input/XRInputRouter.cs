using Unity.Profiling;
using UnityEngine;
using LuaJITMR.Core.Platform;

namespace LuaJITMR.Input
{
    /// <summary>
    /// Fuses gaze (from tracking), screen/cardboard trigger (tap on screen), bluetooth gamepad
    /// (left joystick, A button), WebXR controller state, and hand pinch into a single
    /// <see cref="IXRInput"/> snapshot each frame.
    ///
    /// Volume keys are handled via a small Android JNI helper (some devices expose them as
    /// KeyCode events, but not all — the JNI helper catches them at the Activity level).
    /// </summary>
    internal sealed class XRInputRouter : IXRInput
    {
        private readonly IXRTrackingProvider _tracking;
        private readonly Core.Platform.IWebXRBridge _webxr;
        private Camera _headCamera;
        private Transform _head;

        private bool _triggerDown;
        private bool _triggerHeld;
        private bool _primaryDown;
        private Vector2 _joystick;
        private Ray _gazeRay;
        private bool _prevScreenTouch;
        private bool _prevTriggerAxis;

        private readonly ProfilerMarker _marker = new ProfilerMarker("LuaJITMR/Input");
        public ProfilerMarker Marker => _marker;

        // Pinch (from HandImpl) is injected externally — read via a static flag set by the hand manager.
        internal bool PinchPressed;
        internal bool PinchHeld;

        public XRInputRouter(IXRTrackingProvider tracking, Core.Platform.IWebXRBridge webxr)
        {
            _tracking = tracking;
            _webxr = webxr;
        }

        public void BindHead(Camera camera, Transform head)
        {
            _headCamera = camera;
            _head = head;
        }

        public void Tick()
        {
            using (_marker.Auto())
            {
                // Gaze ray
                if (_headCamera != null)
                    _gazeRay = new Ray(_headCamera.transform.position, _headCamera.transform.forward);
                else if (_head != null)
                    _gazeRay = new Ray(_head.position, _head.forward);

                // Reset edge triggers
                _triggerDown = false;
                _primaryDown = false;

                // (a) Screen tap = cardboard trigger
                bool screenTouch = (Input.touchCount > 0 && Input.GetTouch(0).phase != TouchPhase.Ended)
                                   || Input.GetMouseButton(0);
                bool pressed = screenTouch;
                if (pressed && !_prevScreenTouch) _triggerDown = true;
                _triggerHeld = pressed;
                _prevScreenTouch = pressed;

                // (b) Escape / back button = primary/menu
                if (Input.GetKeyDown(KeyCode.Escape)) _primaryDown = true;

                // (c) Gamepad
                float jx = Input.GetAxisRaw("Horizontal");
                float jy = Input.GetAxisRaw("Vertical");
                Vector2 stick = new Vector2(jx, jy);
                if (stick.sqrMagnitude > 0.01f) _joystick = stick; else _joystick = Vector2.Lerp(_joystick, Vector2.zero, Time.unscaledDeltaTime * 8f);

                if (Input.GetKeyDown(KeyCode.JoystickButton0) || Input.GetKeyDown(KeyCode.Space))
                {
                    if (!_triggerHeld) _triggerDown = true;
                    _triggerHeld = true;
                }

                // (d) Pinch gesture — routed from HandImpl via static flag (avoids circular asmref)
                if (PinchPressed) _triggerDown = true;
                if (PinchHeld) _triggerHeld = true;

                // (e) WebXR controller, if active
                if (_webxr != null && _webxr.SessionActive)
                {
                    if (_webxr.TryGetControllerState(out var td, out var th, out var pb, out var js))
                    {
                        if (td && !_prevTriggerAxis) _triggerDown = true;
                        _triggerHeld |= th;
                        _primaryDown |= pb;
                        if (js.sqrMagnitude > _joystick.sqrMagnitude) _joystick = js;
                        _prevTriggerAxis = th;
                    }
                }
                else
                {
                    _prevTriggerAxis = false;
                }
            }
        }

        public Ray GazeRay => _gazeRay;
        public bool TriggerDown => _triggerDown;
        public bool TriggerHeld => _triggerHeld;
        public bool PrimaryButtonDown => _primaryDown;
        public Vector2 Joystick => _joystick;

        public void HapticPulse(float amplitude, float durationSeconds)
        {
            if (Mathf.Approximately(amplitude, 0f)) return;
#if UNITY_ANDROID && !UNITY_EDITOR
            try { AndroidHaptics.Vibrate(amplitude, durationSeconds); }
            catch { /* permission denied — ignore */ }
#elif UNITY_WEBGL && !UNITY_EDITOR
            WebXRHaptics.Pulse(amplitude, durationSeconds);
#endif
        }
    }
}
