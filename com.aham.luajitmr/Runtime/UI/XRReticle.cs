using UnityEngine;

namespace LuaJITMR.UI
{
    /// <summary>
    /// Adaptive world-space reticle projected at the gaze / pointer hit point.
    /// Changes size based on distance (maintains constant angular size) and changes
    /// visual style when hovering over an <see cref="IInteractable"/> or pinch-hovering.
    /// </summary>
    [AddComponentMenu("LuaJITMR/UI/XR Reticle")]
    public sealed class XRReticle : MonoBehaviour
    {
        public enum ReticleStyle
        {
            Idle,
            Hover,
            PinchHover,
            Hidden
        }

        [Header("Visuals")]
        public float angularSizeDegrees = 0.8f;       // ~0.8 degrees of visual arc — easy to see but not intrusive
        public float minDistance = 0.3f;
        public float maxDistance = 10f;
        public float smoothTime = 0.05f;
        public Color idleColor = new Color(1f, 1f, 1f, 0.8f);
        public Color hoverColor = new Color(0.4f, 0.8f, 1f, 1f);
        public Color pinchColor = new Color(1f, 0.9f, 0.2f, 1f);

        [Header("References")]
        public SpriteRenderer innerDot;
        public SpriteRenderer outerRing;
        public SpriteRenderer progressRing;       // grows for dwell

        private Vector3 _targetPos;
        private Vector3 _vel;
        private ReticleStyle _style;
        private float _dwellProgress;

        private void Reset()
        {
            BuildDefaultVisuals();
        }

        private void Awake()
        {
            if (innerDot == null || outerRing == null || progressRing == null)
                BuildDefaultVisuals();
            SetStyle(ReticleStyle.Idle);
        }

        private void LateUpdate()
        {
            Transform cam = Camera.main != null ? Camera.main.transform : null;
            if (cam == null) return;

            Ray ray;
            bool useHands = LuaJITMR.HandsAreTracked;
            if (useHands)
            {
                var h = LuaJITMR.Hands_Right.IsTracked ? LuaJITMR.Hands_Right : LuaJITMR.Hands_Left;
                Pose indexTip = h.GetJoint(HandJoint.IndexTip);
                Vector3 tipDir;
                if (h.IsTracked)
                {
                    Pose wrist = h.GetJoint(HandJoint.Wrist);
                    tipDir = (indexTip.position - wrist.position).normalized;
                }
                else
                {
                    tipDir = cam.forward;
                    indexTip.position = cam.position + cam.forward * 2f;
                }
                ray = new Ray(indexTip.position, tipDir);
            }
            else
            {
                ray = LuaJITMR.GazeRay;
            }

            float hitDistance = 2f;
            bool hitInteractive = false;

            if (Physics.Raycast(ray, out var hit, maxDistance) && hit.collider != null)
            {
                _targetPos = hit.point;
                hitDistance = Vector3.Distance(ray.origin, hit.point);
                hitInteractive = hit.collider.GetComponent<IXRInteractable>() != null;
            }
            else
            {
                _targetPos = ray.GetPoint(_dwellProgress > 0f ? hitDistance : 2f);
            }

            transform.position = Vector3.SmoothDamp(transform.position, _targetPos, ref _vel, smoothTime);
            transform.rotation = Quaternion.LookRotation(transform.position - cam.position, cam.up);

            // Size by angular diameter: size = 2 * d * tan(angle/2)
            float d = Mathf.Clamp(Vector3.Distance(cam.position, transform.position), minDistance, maxDistance);
            float size = 2f * d * Mathf.Tan(angularSizeDegrees * Mathf.Deg2Rad * 0.5f);
            transform.localScale = Vector3.one * size;

            // Visual state
            ReticleStyle desired = ReticleStyle.Idle;
            if (hitInteractive) desired = useHands && (LuaJITMR.Hands_Left.IsPinching || LuaJITMR.Hands_Right.IsPinching) ? ReticleStyle.PinchHover : ReticleStyle.Hover;
            SetStyle(desired);

            // Progress ring scale
            if (progressRing != null)
            {
                var ps = progressRing.transform.localScale;
                progressRing.transform.localScale = Vector3.one * _dwellProgress;
                progressRing.color = hoverColor * new Color(1, 1, 1, _dwellProgress);
            }
        }

        public void SetDwellProgress(float p) { _dwellProgress = Mathf.Clamp01(p); }
        public void SetHidden(bool hidden) { gameObject.SetActive(!hidden); SetStyle(hidden ? ReticleStyle.Hidden : ReticleStyle.Idle); }

        public void SetStyle(ReticleStyle style)
        {
            _style = style;
            Color c = style switch
            {
                ReticleStyle.Hover => hoverColor,
                ReticleStyle.PinchHover => pinchColor,
                _ => idleColor
            };
            if (innerDot) innerDot.color = c;
            if (outerRing) outerRing.color = c;
        }

        private void BuildDefaultVisuals()
        {
            innerDot = MakeSprite("InnerDot", SpriteType.Circle, 0.1f, idleColor);
            innerDot.transform.SetParent(transform, false);
            outerRing = MakeSprite("OuterRing", SpriteType.Ring, 0.4f, idleColor);
            outerRing.transform.SetParent(transform, false);
            progressRing = MakeSprite("Progress", SpriteType.Ring, 0.45f, hoverColor);
            progressRing.transform.SetParent(transform, false);
        }

        private SpriteRenderer MakeSprite(string n, SpriteType t, float scale, Color c)
        {
            var go = new GameObject(n, typeof(SpriteRenderer));
            go.transform.SetParent(transform, false);
            var sr = go.GetComponent<SpriteRenderer>();
            sr.sprite = SpriteFactory.Get(t);
            sr.color = c;
            sr.sortingOrder = 100;
            go.transform.localScale = Vector3.one * scale;
            return sr;
        }

        private enum SpriteType { Circle, Ring }

        /// <summary>Generates simple circular sprites procedurally (no binary assets).</summary>
        private static class SpriteFactory
        {
            private static Sprite _circle, _ring;
            public static Sprite Get(SpriteType t) => t == SpriteType.Circle ? Circle() : Ring();
            private static Sprite Circle()
            {
                if (_circle) return _circle;
                const int r = 32;
                var tex = new Texture2D(r * 2, r * 2, TextureFormat.RGBA32, false);
                tex.filterMode = FilterMode.Bilinear;
                for (int y = 0; y < r * 2; y++) for (int x = 0; x < r * 2; x++)
                    {
                        float dx = (x - r) / (float)r, dy = (y - r) / (float)r;
                        float d = Mathf.Sqrt(dx * dx + dy * dy);
                        tex.SetPixel(x, y, d <= 1f ? Color.white : Color.clear);
                    }
                tex.Apply();
                _circle = Sprite.Create(tex, new Rect(0, 0, r * 2, r * 2), new Vector2(0.5f, 0.5f));
                return _circle;
            }
            private static Sprite Ring()
            {
                if (_ring) return _ring;
                const int r = 32;
                var tex = new Texture2D(r * 2, r * 2, TextureFormat.RGBA32, false);
                tex.filterMode = FilterMode.Bilinear;
                for (int y = 0; y < r * 2; y++) for (int x = 0; x < r * 2; x++)
                    {
                        float dx = (x - r) / (float)r, dy = (y - r) / (float)r;
                        float d = Mathf.Sqrt(dx * dx + dy * dy);
                        float a = d <= 1f && d >= 0.82f ? 1f : 0f;
                        tex.SetPixel(x, y, new Color(1, 1, 1, a));
                    }
                tex.Apply();
                _ring = Sprite.Create(tex, new Rect(0, 0, r * 2, r * 2), new Vector2(0.5f, 0.5f));
                return _ring;
            }
        }
    }

    /// <summary>Marker interface for objects the reticle should respond to.</summary>
    public interface IXRInteractable { }
}
