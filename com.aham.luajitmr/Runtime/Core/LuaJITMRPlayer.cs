using UnityEngine;

namespace LuaJITMR
{
    /// <summary>
    /// Drop this component on a GameObject in any Unity scene — zero-code setup.
    /// On Awake, it creates the head transform, stereo rig cameras, and calls
    /// <see cref="LuaJITMR.Initialize"/> with the provided <see cref="LuaJITMRSettings"/>.
    ///
    /// Usage:
    /// <code>
    /// // 1. Create scene, add a GameObject "XR Rig" at origin.
    /// // 2. Add component LuaJITMRPlayer.
    /// // 3. (Optional) Assign a LuaJITMRSettings asset, or tweak fields in the inspector.
    /// // 4. Build & run on Android (IL2CPP/ARM64), or WebGL.
    /// </code>
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("LuaJITMR/LuaJITMR Player")]
    public sealed class LuaJITMRPlayer : MonoBehaviour
    {
        [Tooltip("Settings asset. If unassigned, production defaults are used.")]
        public LuaJITMRSettings settings;

        [Tooltip("Which mode to start in.")]
        public XRMode startMode = XRMode.VR;

        [Tooltip("Target camera — if null, Camera.main is used at runtime.")]
        public Camera targetCamera;

        [Tooltip("Event fired just before rendering each frame (after head pose applied).")]
        public UnityEngine.Events.UnityEvent onPreRender;

        [Tooltip("Event fired just after rendering each frame.")]
        public UnityEngine.Events.UnityEvent onPostRender;

        private Transform _head;

        /// <summary>The active settings asset (defaults instance if none was assigned).</summary>
        public static LuaJITMRSettings ActiveSettings
        {
            get;
            private set;
        }

        private void Awake()
        {
            // Ensure the rig stays at the root so tracking space is stable.
            transform.SetParent(null);
            DontDestroyOnLoad(gameObject);

            if (targetCamera == null) targetCamera = GetComponentInChildren<Camera>();
            if (targetCamera == null) targetCamera = Camera.main;
            if (targetCamera == null)
            {
                var camGo = new GameObject("Head Camera");
                camGo.transform.SetParent(transform, false);
                targetCamera = camGo.AddComponent<Camera>();
                camGo.tag = "MainCamera";
                camGo.AddComponent<AudioListener>();
            }
            _head = targetCamera.transform;

            LuaJITMR.Initialize(settings, _head, targetCamera);

            ActiveSettings = settings != null ? settings : LuaJITMRSettings.CreateDefault();

            // Bring up the XR UI system (curved canvas, reticle, built-in screens)
            UI.XRUIManager.Ensure();

            if (startMode == XRMode.MR) LuaJITMR.SetMode(XRMode.MR);
        }

        private void OnEnable()
        {
            Application.focusChanged += OnFocusChanged;
        }
        private void OnDisable()
        {
            Application.focusChanged -= OnFocusChanged;
        }

        private void OnFocusChanged(bool focused)
        {
            if (focused)
            {
                // Re-recenter on resume for a comfortable entry.
                LuaJITMR.Recenter();
            }
        }

        private void OnDestroy()
        {
            LuaJITMR.Shutdown();
        }
    }
}
