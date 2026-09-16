using System;

namespace LuaJITMR
{
    /// <summary>
    /// Quality level of head tracking currently provided by the active <see cref="Core.Platform.IXRTrackingProvider"/>.
    /// </summary>
    public enum TrackingQuality
    {
        /// <summary>No tracking at all (camera feed frozen, head pose is identity).</summary>
        None = 0,

        /// <summary>Rotation-only 3DoF — position is locked at recenter height. Used when ARCore unavailable.</summary>
        RotationOnly = 1,

        /// <summary>6DoF but with reduced accuracy (e.g. ARCore initializing, weak features).</summary>
        Limited = 2,

        /// <summary>Full 6DoF with ARCore / WebXR — position and rotation reliable.</summary>
        Full6DoF = 3
    }

    /// <summary>
    /// State of a runtime camera permission request.
    /// </summary>
    public enum PermissionState
    {
        NotDetermined = 0,
        UserPrompting = 1,
        Granted = 2,
        Denied = 3,
        Restricted = 4
    }

    /// <summary>
    /// Which hand a pose/gesture originates from.
    /// </summary>
    public enum Handedness
    {
        Left = 0,
        Right = 1
    }

    /// <summary>
    /// High-level hand gestures the runtime detects.
    /// </summary>
    public enum Gesture
    {
        None = 0,
        Pinch = 1,
        Grab = 2,
        Point = 3,
        OpenPalm = 4,
        ThumbsUp = 5
    }

    /// <summary>
    /// Hints passed between subsystems to drive automatic tiering (graphics, CPU).
    /// </summary>
    [Flags]
    public enum PerformanceTier
    {
        Low = 1,
        Medium = 2,
        High = 4
    }
}
