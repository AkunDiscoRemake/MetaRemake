using UnityEngine;

namespace LuaJITMR.Core.Platform
{
    /// <summary>
    /// Unified input state sampled once per frame — fuses gaze, trigger, gamepad, hands.
    /// </summary>
    internal interface IXRInput : IProfiled
    {
        void Tick();

        /// <summary>World-space ray originating from the headset (or dominant hand pointer when hands tracked).</summary>
        Ray GazeRay { get; }

        /// <summary>True on the first frame the primary trigger is pressed (edge).</summary>
        bool TriggerDown { get; }

        /// <summary>True while the primary trigger is held.</summary>
        bool TriggerHeld { get; }

        /// <summary>True on the first frame a secondary / menu button is pressed.</summary>
        bool PrimaryButtonDown { get; }

        /// <summary>Bluetooth gamepad / thumbstick 2D value (-1..1 per axis).</summary>
        Vector2 Joystick { get; }

        /// <summary>Fire a short haptic pulse on the controller/phone vibrator.</summary>
        void HapticPulse(float amplitude = 0.5f, float durationSeconds = 0.05f);
    }
}
