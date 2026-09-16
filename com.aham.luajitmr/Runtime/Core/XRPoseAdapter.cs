using UnityEngine;

namespace LuaJITMR.Core
{
    /// <summary>
    /// Utility adapter that converts the SubsystemManager's current state into common
    /// coordinate queries (head-relative transforms, gaze to world) used by UI, hand raycasters,
    /// and event systems. Kept as a small service so other modules don't have to reach into
    /// provider internals.
    /// </summary>
    internal sealed class XRPoseAdapter
    {
        private readonly SubsystemManager _mgr;

        public XRPoseAdapter(SubsystemManager mgr) { _mgr = mgr; }

        public Transform HeadTransform => Camera.current != null ? Camera.current.transform : null;

        public Pose WorldFromHead() =>
            _mgr?.Tracking != null && _mgr.Tracking.IsRunning
                ? _mgr.Tracking.GetRawHeadPose()
                : new Pose(Vector3.zero, Quaternion.identity);

        public Ray HeadForwardRay()
        {
            var p = WorldFromHead();
            return new Ray(p.position, p.rotation * Vector3.forward);
        }
    }
}
