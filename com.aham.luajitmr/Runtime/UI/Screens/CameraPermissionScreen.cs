using UnityEngine;
using UnityEngine.UI;
using TMPro;
#if LUAJITMR_ARFOUNDATION_5
using UnityEngine.XR.ARFoundation;
#endif

namespace LuaJITMR.UI.Screens
{
    /// <summary>Camera-permission overlay: shown before MR mode until the user grants CAMERA.</summary>
    public sealed class CameraPermissionScreen : UIScreen
    {
        public TMP_Text title;
        public TMP_Text description;
        public XRButton grantButton;
        public XRButton cancelButton;

        public event Action Granted;
        public event Action Cancelled;

        protected override void Awake()
        {
            base.Awake();
            if (grantButton == null)
            {
                var rt = GetComponent<RectTransform>();
                rt.sizeDelta = new Vector2(800, 500);
                gameObject.AddComponent<GlassPanel>().Apply();
                var layout = gameObject.AddComponent<VerticalLayoutGroup>();
                layout.padding = new RectOffset(48, 48, 48, 48); layout.spacing = 16;
                layout.childControlHeight = false; layout.childControlWidth = true;
                title = UIHelpers.MakeText("Camera permission required", transform, 40, FontStyles.Bold);
                description = UIHelpers.MakeText("LuaJITMR uses the camera for passthrough MR and hand tracking.\nGrant permission when prompted.", transform, 24);
                UIHelpers.MakeSpacer(transform, 12);
                grantButton = UIHelpers.MakeXRButton("Allow camera", transform, RequestPermission);
                cancelButton = UIHelpers.MakeXRButton("Stay in VR", transform, () => { AudioFeedback.Select(); Cancelled?.Invoke(); Hide(); });
            }
        }

        private void RequestPermission()
        {
            AudioFeedback.Select();
#if LUAJITMR_ARFOUNDATION_5
            ARSession.stateChanged += OnSessionStateChanged;
            // Trigger AR session which causes the system permission dialog.
            if (ARSession.state == ARSessionState.None || ARSession.state == ARSessionState.Unsupported)
                ARSession.CheckAvailability();
#endif
        }

#if LUAJITMR_ARFOUNDATION_5
        private void OnSessionStateChanged(ARSessionState state)
        {
            if (state == ARSessionState.SessionTracking) { ARSession.stateChanged -= OnSessionStateChanged; Granted?.Invoke(); Hide(); }
            if (state == ARSessionState.Unsupported) { ARSession.stateChanged -= OnSessionStateChanged; Cancelled?.Invoke(); }
        }
#endif
    }
}
