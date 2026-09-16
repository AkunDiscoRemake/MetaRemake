using System;
using UnityEngine;

namespace LuaJITMR.Core.Platform
{
    /// <summary>
    /// Provides head pose on any supported platform. Implementations are created by
    /// <see cref="PlatformSelector"/> based on build target and device capabilities.
    /// </summary>
    internal interface IXRTrackingProvider : IDisposable, IProfiled
    {
        /// <summary>Called after construction; starts sensors / subsystems (e.g. AR Session).</summary>
        void Start();

        /// <summary>Stops sensors / subsystems; safe to call multiple times.</summary>
        void Stop();

        /// <summary>Current best tracking quality — drives fallback logic in the facade.</summary>
        TrackingQuality Quality { get; }

        /// <summary>Whether this provider is currently running and producing poses.</summary>
        bool IsRunning { get; }

        /// <summary>
        /// Head pose extrapolated by <paramref name="predictAheadSeconds"/> to compensate for
        /// motion-to-photon latency. Called during LateUpdate.
        /// </summary>
        Pose GetPredictedHeadPose(float predictAheadSeconds);

        /// <summary>
        /// Raw (un-predicted) head pose, for late-latching submit-time correction.
        /// </summary>
        Pose GetRawHeadPose();

        /// <summary>Re-anchors current forward to identity rotation around Y.</summary>
        bool TryRecenter();

        /// <summary>Fired when tracking is lost (e.g. ARCore motion-blur, camera covered).</summary>
        event Action OnTrackingLost;

        /// <summary>Fired when tracking recovers after loss.</summary>
        event Action OnTrackingRegained;

        /// <summary>Angular / linear velocity of the head (for prediction, fall effects).</summary>
        Vector3 HeadAngularVelocity { get; }
        Vector3 HeadVelocity { get; }
    }
}
