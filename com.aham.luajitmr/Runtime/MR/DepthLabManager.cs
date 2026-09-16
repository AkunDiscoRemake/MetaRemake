using System;
using System.Collections.Generic;
using Unity.Collections;
using UnityEngine;
using UnityEngine.Rendering;
#if LUAJITMR_ARFOUNDATION_5
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
#endif

namespace LuaJITMR.MR
{
    /// <summary>
    /// Depth Lab — advanced depth utilities built on ARCore Depth API. Provides:
    /// <list type="bullet">
    /// <item><b>RaycastToDepth</b> — hit-test against the live environment depth texture
    ///       (works even where no plane is detected).</item>
    /// <item><b>World-space projection of 2D landmarks</b> — used by HandImpl to project
    ///       MediaPipe normalized 2D keypoints into 3D via a per-frame AsyncGPUReadback.</item>
    /// <item><b>Plane-fallback raycasting</b> when depth isn't available.</item>
    /// <item>Temporal smoothing on projected points to reduce flicker.</item>
    /// </list>
    ///
    /// A single instance is auto-created when MR mode is enabled.
    /// </summary>
    public sealed class DepthLabManager : MonoBehaviour
    {
        public static DepthLabManager Instance { get; private set; }

        [Tooltip("How many meters away to place objects when depth is unknown.")]
        public float fallbackDistanceMeters = 1.3f;

        [Tooltip("Smoothing on depth hits to reduce temporal flicker (0..1).")]
        [Range(0f, 0.95f)] public float temporalSmoothing = 0.55f;

#if LUAJITMR_ARFOUNDATION_5
        private AROcclusionManager _occlusion;
        private ARCameraManager _cameraManager;
        private ARSessionOrigin _origin;
        private Texture2D _depthCpuCopy;
        private bool _readbackPending;
        private readonly Dictionary<int, Vector3> _smoothedHits = new Dictionary<int, Vector3>();
#endif
        private Camera _cam;

        public static void Ensure(Camera cam, object sessionOrigin)
        {
            if (Instance != null) { Instance.Bind(cam, sessionOrigin); return; }
            var go = new GameObject("[LuaJITMR] DepthLab");
            DontDestroyOnLoad(go);
            Instance = go.AddComponent<DepthLabManager>();
            Instance.Bind(cam, sessionOrigin);
        }

        private void Bind(Camera cam, object origin)
        {
            _cam = cam;
#if LUAJITMR_ARFOUNDATION_5
            _cameraManager = cam != null ? cam.GetComponent<ARCameraManager>() : null;
            _occlusion = cam != null ? cam.GetComponent<AROcclusionManager>() : null;
            _origin = origin as ARSessionOrigin;
#endif
        }

        private void LateUpdate()
        {
#if LUAJITMR_ARFOUNDATION_5
            // Kick an async GPU readback once per frame so we have a CPU-side depth snapshot
            // for hand landmark projection. We don't block on it — stale data is acceptable
            // because of the temporal smoothing.
            if (!_readbackPending && _occlusion != null)
            {
                var tex = _occlusion.environmentDepthTexture;
                if (tex != null)
                {
                    int w = tex.width, h = tex.height;
                    if (_depthCpuCopy == null || _depthCpuCopy.width != w || _depthCpuCopy.height != h)
                    {
                        if (_depthCpuCopy) Destroy(_depthCpuCopy);
                        _depthCpuCopy = new Texture2D(w, h, TextureFormat.RHalf, false);
                    }
                    AsyncGPUReadback.Request(tex, 0, TextureFormat.RHalf, OnDepthReadback);
                    _readbackPending = true;
                }
            }
#endif
        }

#if LUAJITMR_ARFOUNDATION_5
        private void OnDepthReadback(AsyncGPUReadbackRequest req)
        {
            _readbackPending = false;
            if (req.hasError) return;
            if (_depthCpuCopy == null) return;
            var data = req.GetData<ushort>();
            if (data.Length == _depthCpuCopy.width * _depthCpuCopy.height)
                _depthCpuCopy.LoadRawTextureData(data.GetUnsafeReadOnlyPtr(), data.Length * sizeof(ushort));
            _depthCpuCopy.Apply(false);
        }
#endif

        /// <summary>
        /// Project a normalized screen point (0..1 in camera viewport) into world space using
        /// environment depth. Falls back to plane raycast, then to <see cref="fallbackDistanceMeters"/>.
        /// </summary>
        public bool TryProjectScreenPoint(Vector2 normalizedScreen, out Vector3 worldPoint)
        {
            worldPoint = default;
            Camera cam = _cam != null ? _cam : Camera.main;
            if (cam == null) return false;
            Ray ray = cam.ViewportPointToRay(normalizedScreen);

#if LUAJITMR_ARFOUNDATION_5
            float dist = SampleDepthAtScreen(normalizedScreen);
            if (dist > 0f)
            {
                worldPoint = ray.GetPoint(dist);
                return true;
            }
            if (_origin != null)
            {
                var hits = new List<ARRaycastHit>();
                if (_origin.Raycast(ray, hits, TrackableType.Planes) && hits.Count > 0)
                {
                    worldPoint = hits[0].pose.position;
                    return true;
                }
            }
#endif
            worldPoint = ray.GetPoint(fallbackDistanceMeters);
            return true;
        }

        /// <summary>
        /// Project an array of 2D landmarks (normalized 0..1 UVs) into 3D world space using depth.
        /// </summary>
        public Vector3[] ProjectLandmarks2Dto3D(Vector2[] landmarks2D, int smoothingId = -1)
        {
            if (landmarks2D == null) return Array.Empty<Vector3>();
            Vector3[] result = new Vector3[landmarks2D.Length];
            for (int i = 0; i < landmarks2D.Length; i++)
            {
                if (TryProjectScreenPoint(landmarks2D[i], out var p))
                {
                    int key = smoothingId * 100 + i;
                    if (smoothingId >= 0 && _smoothedHits.TryGetValue(key, out var prev))
                        p = Vector3.Lerp(prev, p, 1f - temporalSmoothing);
                    result[i] = p;
                    if (smoothingId >= 0) _smoothedHits[key] = p;
                }
                else result[i] = Vector3.zero;
            }
            return result;
        }

#if LUAJITMR_ARFOUNDATION_5
        private float SampleDepthAtScreen(Vector2 uv)
        {
            if (_depthCpuCopy == null) return -1f;
            int x = Mathf.Clamp((int)(uv.x * _depthCpuCopy.width), 0, _depthCpuCopy.width - 1);
            int y = Mathf.Clamp((int)(uv.y * _depthCpuCopy.height), 0, _depthCpuCopy.height - 1);
            // RHalf = half-precision float in meters
            var px = _depthCpuCopy.GetPixel(x, y);
            // Treat the red channel as luminance; RHalf stores the distance in meters in [0..8].
            float d = px.r;
            if (float.IsNaN(d) || d < 0.1f || d > 8f) return -1f;
            return d;
        }
#endif

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
#if LUAJITMR_ARFOUNDATION_5
            if (_depthCpuCopy) Destroy(_depthCpuCopy);
#endif
        }
    }
}
