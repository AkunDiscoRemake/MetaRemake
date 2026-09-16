using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace LuaJITMR.UI
{
    /// <summary>
    /// Per-frame gaze/dwell driver. Raycasts from the head (or dominant-hand pointer when hands
    /// are tracked), tracks the currently-hovered <see cref="XRButton"/>, drives the reticle's
    /// progress ring, and fires <see cref="XRButton.Press"/> when dwell time elapses.
    ///
    /// A singleton is auto-created at runtime; user code never constructs it directly.
    /// </summary>
    public sealed class GazeDwellInput : MonoBehaviour
    {
        private static GazeDwellInput _instance;

        public static GazeDwellInput Instance
        {
            get
            {
                if (_instance == null)
                {
                    var go = new GameObject("[LuaJITMR] GazeDwellInput");
                    DontDestroyOnLoad(go);
                    _instance = go.AddComponent<GazeDwellInput>();
                }
                return _instance;
            }
        }

        public float dwellTime = 1.2f;
        public float maxDistance = 20f;
        public LayerMask uiMask = ~0;
        public XRReticle reticle;

        private readonly List<XRButton> _buttons = new List<XRButton>(64);
        private XRButton _current;
        private float _dwell;
        private Camera _cam;
        private PointerEventData _pointer;
        private List<RaycastResult> _rr = new List<RaycastResult>(16);

        internal static void Register(XRButton b)
        {
            var i = Instance;
            if (!i._buttons.Contains(b)) i._buttons.Add(b);
            if (b.GetComponent<Collider>() == null && b.GetComponent<Graphic>() != null)
            {
                // Add a 3D collider sized from the RectTransform for physics raycast fallback.
                var rt = b.GetComponent<RectTransform>();
                if (rt != null)
                {
                    var col = b.gameObject.AddComponent<BoxCollider>();
                    col.size = new Vector3(rt.rect.width * rt.lossyScale.x, rt.rect.height * rt.lossyScale.y, 0.02f);
                    col.isTrigger = true;
                }
            }
        }

        internal static void Unregister(XRButton b)
        {
            var i = Instance;
            i._buttons.Remove(b);
            if (i._current == b) { i._current = null; i._dwell = 0; }
        }

        private void LateUpdate()
        {
            _cam = Camera.main;
            if (_cam == null || _buttons.Count == 0) { if (reticle) reticle.SetDwellProgress(0f); return; }

            bool useHands = LuaJITMR.HandsAreTracked;
            Ray ray;
            if (useHands)
            {
                var h = LuaJITMR.Hands_Right.IsTracked ? LuaJITMR.Hands_Right : LuaJITMR.Hands_Left;
                Pose idx = h.GetJoint(HandJoint.IndexTip);
                Pose wrist = h.GetJoint(HandJoint.Wrist);
                Vector3 dir = h.IsTracked ? (idx.position - wrist.position).normalized : _cam.transform.forward;
                Vector3 origin = h.IsTracked ? idx.position : _cam.transform.position;
                ray = new Ray(origin, dir);
            }
            else
            {
                ray = LuaJITMR.GazeRay;
            }

            XRButton hit = null;
            float closest = float.MaxValue;
            // Physics raycast against XRButton colliders
            if (Physics.Raycast(ray, out var p, maxDistance, uiMask, QueryTriggerInteraction.Collide))
            {
                var b = p.collider.GetComponentInParent<XRButton>();
                if (b != null) { hit = b; closest = p.distance; }
            }

            // Update button state
            if (hit != _current)
            {
                if (_current != null) _current.SetHovered(false);
                _current = hit;
                _dwell = 0f;
                if (_current != null) _current.SetHovered(true);
            }

            float progress = 0f;
            if (_current != null)
            {
                bool trigger = LuaJITMR.TriggerDown ||
                               (useHands && (LuaJITMR.Hands_Left.IsPinching || LuaJITMR.Hands_Right.IsPinching));
                if (trigger) _dwell = dwellTime; // instant
                else _dwell += Time.unscaledDeltaTime;
                progress = Mathf.Clamp01(_dwell / dwellTime);
                if (progress >= 1f)
                {
                    _current.Press();
                    _dwell = 0f;
                    progress = 0f;
                }
            }
            if (reticle != null) reticle.SetDwellProgress(progress);
        }
    }
}
