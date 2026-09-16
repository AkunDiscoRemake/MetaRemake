using UnityEngine;
using LuaJITMR.Hands;
using LuaJITMR.Input;

namespace LuaJITMR.Core
{
    /// <summary>
    /// Hidden MonoBehaviour that drives the main-thread tick of the SubsystemManager.
    /// Auto-created by <see cref="LuaJITMR.Initialize"/> — users never interact with it directly.
    /// </summary>
    [AddComponentMenu("")]
    internal sealed class LuaJITMRUpdater : MonoBehaviour
    {
        private SubsystemManager _mgr;
        private HandImpl _left;
        private HandImpl _right;

        public void Bind(SubsystemManager mgr, HandImpl left, HandImpl right)
        {
            _mgr = mgr;
            _left = left;
            _right = right;
        }

        private void LateUpdate()
        {
            if (_mgr == null) return;
            _mgr.Tick(Time.deltaTime, null, null);

            // Read pinch state BEFORE hand tick so we can inject into Input for the next frame
            bool leftPinchHold = _left != null && _left.IsPinching;
            bool rightPinchHold = _right != null && _right.IsPinching;
            bool anyPinchHeld = leftPinchHold || rightPinchHold;
            static bool PinchGestureStart(HandImpl h) =>
                h != null && h.IsTracked && h.Current.CurrentGesture == Gesture.Pinch;
            bool pinchEdge = (PinchGestureStart(_left) || PinchGestureStart(_right));

            // Forward pinch into input router
            if (_mgr.Input is XRInputRouter xr)
            {
                xr.PinchHeld = anyPinchHeld;
                xr.PinchPressed = pinchEdge;
            }

            _left?.Tick(_mgr.Hands);
            _right?.Tick(_mgr.Hands);

            _mgr.EndFrame();
        }

        private void OnApplicationQuit() => LuaJITMR.Shutdown();
        private void OnDestroy()
        {
            if (_mgr != null) LuaJITMR.Shutdown();
        }
    }
}
