using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using LuaJITMR.UI.Screens;

namespace LuaJITMR.UI
{
    /// <summary>
    /// Central XR UI orchestrator. Auto-creates a world-space curved canvas at head distance,
    /// a procedural reticle, an EventSystem for UGUI, and all built-in screens (main menu,
    /// settings, tracking lost, camera permission, gesture tutorial). Accessed via the
    /// static <see cref="Instance"/> — one is created automatically by LuaJITMRPlayer on startup.
    /// </summary>
    [AddComponentMenu("LuaJITMR/UI/XR UI Manager")]
    public sealed class XRUIManager : MonoBehaviour
    {
        public static XRUIManager Instance { get; private set; }

        [Header("References (auto-created if null)")]
        public Canvas canvas;
        public CurvedCanvas curved;
        public XRReticle reticle;
        public EventSystem eventSystem;
        public StandaloneInputModule inputModule;

        public MainMenuScreen mainMenu;
        public SettingsScreen settings;
        public TrackingLostScreen trackingLost;
        public CameraPermissionScreen cameraPermission;
        public GestureTutorialScreen tutorial;

        private Transform _canvasT;

        public static void Ensure()
        {
            if (Instance != null) return;
            var go = new GameObject("[LuaJITMR] UI Manager");
            DontDestroyOnLoad(go);
            Instance = go.AddComponent<XRUIManager>();
            Instance.Build();
        }

        private void Build()
        {
            var cam = Camera.main;
            if (cam == null) { Debug.LogWarning("[XRUIManager] No main camera."); return; }

            // EventSystem
            var esGo = new GameObject("EventSystem");
            esGo.transform.SetParent(transform, false);
            eventSystem = esGo.AddComponent<EventSystem>();
            inputModule = esGo.AddComponent<StandaloneInputModule>();

            // Canvas
            var canvasGo = new GameObject("XR Canvas");
            canvasGo.transform.SetParent(transform, false);
            canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.sortingOrder = 10;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.dynamicPixelsPerUnit = 40f;
            var rt = canvas.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(1200, 900);
            _canvasT = canvasGo.transform;
            curved = canvasGo.AddComponent<CurvedCanvas>();
            curved.distance = 2f; curved.curveRadius = 3f; curved.widthMeters = 1.2f;

            // Safe area container
            var safeGo = new GameObject("SafeArea", typeof(RectTransform));
            safeGo.transform.SetParent(canvasGo.transform, false);
            var srt = safeGo.GetComponent<RectTransform>();
            srt.anchorMin = Vector2.zero; srt.anchorMax = Vector2.one;
            srt.offsetMin = Vector2.zero; srt.offsetMax = Vector2.zero;
            safeGo.AddComponent<XRCanvasSafeArea>();

            Transform container = safeGo.transform;

            mainMenu = AddScreen<MainMenuScreen>(container, "MainMenu");
            settings = AddScreen<SettingsScreen>(container, "Settings");
            trackingLost = AddScreen<TrackingLostScreen>(container, "TrackingLost");
            cameraPermission = AddScreen<CameraPermissionScreen>(container, "CameraPermission");
            tutorial = AddScreen<GestureTutorialScreen>(container, "Tutorial");

            mainMenu.OnSettings += () => { mainMenu.Hide(); settings.Show(); };
            settings.Back += () => { settings.Hide(); mainMenu.Show(); };
            mainMenu.OnPlay += () => { mainMenu.Hide(); tutorial.Show(); };

            // Reticle
            var retGo = new GameObject("Reticle");
            retGo.transform.SetParent(transform, false);
            reticle = retGo.AddComponent<XRReticle>();

            // Place canvas in front of camera initially
            canvasGo.transform.SetPositionAndRotation(cam.transform.position + cam.transform.forward * curved.distance,
                Quaternion.LookRotation(cam.transform.forward, Vector3.up));

            mainMenu.Show();
        }

        private Transform canvasGO_transform;

        private T AddScreen<T>(Transform parent, string name) where T : UIScreen
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
            var s = go.AddComponent<T>();
            return s;
        }

        public void ShowMainMenu()
        {
            foreach (var s in GetComponentsInChildren<UIScreen>()) s.Hide();
            mainMenu.Show();
        }

        private void LateUpdate()
        {
            if (curved == null || reticle == null) return;
            // Curved canvas updates itself; reticle updates itself.
        }
    }
}
