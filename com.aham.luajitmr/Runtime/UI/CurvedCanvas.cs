using System.Collections.Generic;
using UnityEngine;

namespace LuaJITMR.UI
{
    /// <summary>
    /// Bends a world-space UI canvas onto a cylindrical surface so that all content is equidistant
    /// from the viewer's head at a given radius. Call <see cref="RefreshCurve"/> after adding/removing
    /// children — each child is rotated & offset to follow the cylinder but remains a standard
    /// RectTransform for UGUI layout.
    ///
    /// This is a lightweight approach: we don't deform geometry; we place each child at the proper
    /// position/orientation on the cylinder.
    /// </summary>
    [ExecuteAlways]
    [AddComponentMenu("LuaJITMR/UI/Curved Canvas")]
    [DisallowMultipleComponent]
    public sealed class CurvedCanvas : MonoBehaviour
    {
        [Tooltip("Distance from the head to the canvas center (meters).")]
        [Range(0.5f, 8f)] public float distance = 2f;

        [Tooltip("Radius of curvature. Smaller = more curved. Infinity = flat.")]
        [Range(0.6f, 20f)] public float curveRadius = 3f;

        [Tooltip("Width in meters covered by the canvas at full curve.")]
        [Range(0.3f, 8f)] public float widthMeters = 1.2f;

        [Tooltip("Vertical FOV-based safe area (top/bottom inset as fraction of height).")]
        [Range(0f, 0.3f)] public float verticalSafeInset = 0.05f;

        [Tooltip("Automatically face the camera each frame.")]
        public bool faceCamera = true;

        private Transform _cam;
        private readonly List<Transform> _children = new List<Transform>();

        private void OnEnable()
        {
            _cam = Camera.main != null ? Camera.main.transform : null;
            RefreshCurve();
        }

        /// <summary>Rescan children and re-apply curvature.</summary>
        [ContextMenu("Refresh Curve")]
        public void RefreshCurve()
        {
            _children.Clear();
            foreach (Transform t in transform) _children.Add(t);
        }

        private void LateUpdate()
        {
            if (_cam == null) _cam = Camera.main != null ? Camera.main.transform : null;
            if (_cam == null) return;

            if (faceCamera)
            {
                Vector3 dir = transform.position - _cam.position;
                dir.y = 0;
                if (dir.sqrMagnitude > 1e-4f)
                    transform.rotation = Quaternion.LookRotation(dir, Vector3.up);

                // Keep at `distance` from head, at head height
                Vector3 desired = _cam.position + _cam.forward * distance;
                desired.y = _cam.position.y - 0.15f; // slightly below eye line
                transform.position = Vector3.Lerp(transform.position, desired, Time.deltaTime * 8f);
            }

            // Bend children onto a cylinder of radius `curveRadius`
            float halfAngle = (widthMeters * 0.5f) / curveRadius; // radians half width
            for (int i = 0; i < _children.Count; i++)
            {
                var child = _children[i];
                if (child == null) continue;
                // Use the child's anchored X position as normalized across the canvas width
                var rt = child as RectTransform;
                float x = rt != null ? (rt.anchoredPosition.x / (widthMeters * 500f)) : child.localPosition.x / widthMeters;
                x = Mathf.Clamp(x, -1f, 1f);
                float angle = -x * halfAngle * Mathf.Rad2Deg;
                float offsetX = Mathf.Sin(angle * Mathf.Deg2Rad) * curveRadius;
                float offsetZ = curveRadius - Mathf.Cos(angle * Mathf.Deg2Rad) * curveRadius;
                child.localPosition = new Vector3(offsetX, child.localPosition.y, offsetZ);
                child.localRotation = Quaternion.Euler(0f, angle, 0f);
            }
        }
    }
}
