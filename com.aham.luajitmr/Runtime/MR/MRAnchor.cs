using System;
using UnityEngine;

namespace LuaJITMR
{
    /// <summary>
    /// State of an <see cref="MRAnchor"/> attachment to the real world.
    /// </summary>
    public enum AnchorTrackingState
    {
        /// <summary>No anchor created yet; the object sits at its transform (inert).</summary>
        Unplaced = 0,
        /// <summary>Anchor requested but not yet localized by ARCore/WebXR.</summary>
        Localizing = 1,
        /// <summary>Tracked and being held in real-world coordinates.</summary>
        Tracking = 2,
        /// <summary>Tracking lost for this anchor; transform is no longer updated (frozen).</summary>
        Lost = 3
    }

    /// <summary>
    /// Attach to a GameObject to lock it in real-world space.
    /// When <see cref="Place(Pose)"/> is called, the component asks the active tracking provider
    /// to create an anchor and keeps the transform aligned with it every frame.
    /// </summary>
    [AddComponentMenu("LuaJITMR/MR Anchor")]
    [DisallowMultipleComponent]
    public class MRAnchor : MonoBehaviour
    {
        [Tooltip("If true, placement will snap to the nearest detected plane.")]
        public bool attachToPlane = true;

        [Tooltip("Which kind of trackable to prefer when placing (planes, feature points, etc.).")]
        public MRAnchorAttachment attachment = MRAnchorAttachment.HorizontalPlane;

        /// <summary>Current tracking state for this anchor.</summary>
        public AnchorTrackingState TrackingState { get; private set; } = AnchorTrackingState.Unplaced;

        /// <summary>Fired once the anchor is successfully localized.</summary>
        public event Action OnAnchorFound;

        /// <summary>Fired if the anchor becomes untracked.</summary>
        public event Action OnAnchorLost;

        private int _nativeHandle = -1;
        private Pose _lastLocalPose;
        private bool _pendingPlace;
        private Pose _pendingPlacementPose;

        /// <summary>Request anchoring at the current transform (or a provided pose).</summary>
        public void Place() => Place(new Pose(transform.position, transform.rotation));

        public void Place(Pose worldPose)
        {
            _pendingPlace = true;
            _pendingPlacementPose = worldPose;
            TrackingState = AnchorTrackingState.Localizing;
        }

        /// <summary>Detach from real-world tracking and keep current transform.</summary>
        public void Release()
        {
            if (_nativeHandle >= 0 && Core.SubsystemManager.Instance != null)
            {
                Core.SubsystemManager.Instance.ReleaseAnchor(_nativeHandle);
                _nativeHandle = -1;
            }
            TrackingState = AnchorTrackingState.Unplaced;
        }

        private void Update()
        {
            if (_pendingPlace)
            {
                _pendingPlace = false;
                var mgr = Core.SubsystemManager.Instance;
                if (mgr != null && mgr.TryCreateAnchor(_pendingPlacementPose, attachToPlane, attachment, out _nativeHandle))
                {
                    TrackingState = AnchorTrackingState.Tracking;
                    OnAnchorFound?.Invoke();
                }
                else
                {
                    TrackingState = AnchorTrackingState.Unplaced;
                }
            }

            if (_nativeHandle >= 0 && Core.SubsystemManager.Instance != null)
            {
                if (Core.SubsystemManager.Instance.TryGetAnchorPose(_nativeHandle, out var pose))
                {
                    transform.SetPositionAndRotation(pose.position, pose.rotation);
                    if (TrackingState != AnchorTrackingState.Tracking)
                    {
                        TrackingState = AnchorTrackingState.Tracking;
                        OnAnchorFound?.Invoke();
                    }
                }
                else if (TrackingState == AnchorTrackingState.Tracking)
                {
                    TrackingState = AnchorTrackingState.Lost;
                    OnAnchorLost?.Invoke();
                }
            }
        }

        private void OnDestroy() => Release();
    }

    public enum MRAnchorAttachment
    {
        AnyPlane,
        HorizontalPlane,
        VerticalPlane,
        FeaturePoint
    }
}
