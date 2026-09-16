using UnityEngine;
using TMPro;

namespace LuaJITMR.UI
{
    /// <summary>
    /// Sizes a TMP_Text by angular size (degrees of visual arc) instead of fixed pixel size,
    /// so text stays legible regardless of Canvas distance / scale.
    ///
    /// Attach to any TMP_Text and set <see cref="angularSizeDegrees"/> (typical body text: 1.2–1.8°,
    /// headings: 3–4°).
    /// </summary>
    [ExecuteAlways]
    [RequireComponent(typeof(TMP_Text))]
    [AddComponentMenu("LuaJITMR/UI/TMP Angular Sizer")]
    public sealed class TMPAngularSizer : MonoBehaviour
    {
        [Tooltip("Target character height in degrees of visual arc.")]
        [Range(0.3f, 10f)] public float angularSizeDegrees = 1.5f;

        private TMP_Text _tmp;
        private Camera _cam;

        private void Awake()
        {
            _tmp = GetComponent<TMP_Text>();
            _tmp.fontSize = 0.1f; // base size — DPI scaling will update in LateUpdate
        }

        private void LateUpdate()
        {
            if (_cam == null) _cam = Camera.main;
            if (_cam == null || _tmp == null) return;
            float d = Vector3.Distance(_cam.transform.position, transform.position);
            d = Mathf.Max(d, 0.1f);
            float heightMeters = 2f * d * Mathf.Tan(angularSizeDegrees * Mathf.Deg2Rad * 0.5f);
            // TMP fontSize is in world units for world-space canvases with 1 unit = 1 meter.
            float pointsPerMeter = 2834f; // ~72 DPI / 0.0254 m/in -> 2834 points/meter
            _tmp.fontSize = heightMeters * pointsPerMeter;
            _tmp.richText = true;
        }
    }
}
