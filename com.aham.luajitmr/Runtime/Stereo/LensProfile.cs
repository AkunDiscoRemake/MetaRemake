using System;
using UnityEngine;

namespace LuaJITMR.Stereo
{
    /// <summary>
    /// Optical model of a Cardboard-compatible viewer. All linear units in meters unless noted.
    /// Corresponds to the parameters encoded in a Google Cardboard viewer URI.
    /// </summary>
    [Serializable]
    [CreateAssetMenu(fileName = "LensProfile", menuName = "LuaJITMR/Lens Profile", order = 101)]
    public class LensProfile : ScriptableObject
    {
        [Header("Viewer identity")]
        public string viewerName = "Cardboard v2";
        public string vendor = "Google";

        [Header("Optics")]
        [Tooltip("Lens center horizontal offset from screen center, in meters. (Half of lens-to-lens distance.)")]
        public float lensCenterOffsetM = 0.0315f;

        [Tooltip("Distance from the screen (display surface) to the lens, in meters.")]
        public float screenToLensDistanceM = 0.037f;

        [Tooltip("Distance from the lens to the virtual image plane (eye relief), in meters.")]
        public float eyeToLensDistanceM = 0.012f;

        [Tooltip("Barrel distortion coefficients k1, k2. r' = r*(1 + k1*r^2 + k2*r^4).")]
        public Vector2 distortionK1K2 = new Vector2(0.34f, 0.55f);

        [Tooltip("Horizontal field of view per eye (left edge to right edge), degrees.")]
        [Range(40f, 100f)] public float horizontalFovDeg = 80f;

        [Tooltip("Vertical field of view per eye, degrees.")]
        [Range(40f, 100f)] public float verticalFovDeg = 80f;

        [Header("Screen")]
        [Tooltip("Vertical distance from screen center to lens center (for viewers with off-center lenses).")]
        public float verticalAlignmentOffsetM = 0f;

        [Tooltip("Display tray-to-lens offset for magnetic-ring alignment (legacy).")]
        public float trayToLensDistanceM = 0.010f;

        [Tooltip("Whether this viewer has a physical magnet ring (deprecated, unsupported).")]
        public bool hasMagnet = false;

        /// <summary>Approximate IPD implied by the lens separation: 2 * lensCenterOffsetM, in millimeters.</summary>
        public float ImpliedIpdMm => lensCenterOffsetM * 2f * 1000f;

        /// <summary>
        /// Applies barrel distortion to a radial distance (in normalized FOV units, 0..1).
        /// Returns distorted radius for inverse-warping UV.
        /// </summary>
        public float Distort(float r)
        {
            float r2 = r * r;
            return r * (1f + distortionK1K2.x * r2 + distortionK1K2.y * r2 * r2);
        }

        /// <summary>
        /// Inverse of <see cref="Distort"/> — Newton-Raphson refinement (fast, 3 its). Used by the barrel mesh and shader.
        /// </summary>
        public float Undistort(float rDistorted)
        {
            float r = rDistorted;
            for (int i = 0; i < 4; i++)
            {
                float r2 = r * r;
                float r4 = r2 * r2;
                float f = r * (1f + distortionK1K2.x * r2 + distortionK1K2.y * r4) - rDistorted;
                float fprime = 1f + 3f * distortionK1K2.x * r2 + 5f * distortionK1K2.y * r4;
                if (Mathf.Abs(fprime) < 1e-6f) break;
                r -= f / fprime;
            }
            return Mathf.Clamp01(r);
        }

        /// <summary>Default Cardboard v2 profile — reasonable starting point before QR scan.</summary>
        public static LensProfile CreateDefaultCardboard()
        {
            var p = CreateInstance<LensProfile>();
            p.viewerName = "Cardboard v2 (default)";
            p.vendor = "Google";
            p.lensCenterOffsetM = 0.0315f;
            p.screenToLensDistanceM = 0.037f;
            p.eyeToLensDistanceM = 0.012f;
            p.distortionK1K2 = new Vector2(0.34f, 0.55f);
            p.horizontalFovDeg = 80f;
            p.verticalFovDeg = 80f;
            return p;
        }
    }
}
