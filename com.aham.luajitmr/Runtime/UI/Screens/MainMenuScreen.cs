using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace LuaJITMR.UI.Screens
{
    /// <summary>Main menu: title + Play/Enter MR/Settings/Quit buttons with glass panels and animation.</summary>
    public sealed class MainMenuScreen : UIScreen
    {
        public TMP_Text titleText;
        public XRButton playButton;
        public XRButton mrButton;
        public XRButton settingsButton;
        public XRButton quitButton;

        public event Action OnPlay;
        public event Action OnEnterMR;
        public event Action OnSettings;

        protected override void Awake()
        {
            base.Awake();
            BuildIfMissing();
        }

        private void BuildIfMissing()
        {
            if (playButton != null && mrButton != null) return;
            var rt = GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(700, 800);
            var panel = gameObject.AddComponent<GlassPanel>(); panel.Apply();

            var layout = gameObject.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(48, 48, 56, 48);
            layout.spacing = 24;
            layout.childControlHeight = false;
            layout.childControlWidth = true;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = true;

            titleText = UIHelpers.MakeText("LuaJITMR", transform, 64, FontStyles.Bold);
            UIHelpers.MakeSpacer(transform, 16);

            playButton = UIHelpers.MakeXRButton("Play VR", transform, HandlePlay);
            mrButton = UIHelpers.MakeXRButton("Enter MR", transform, HandleMR);
            settingsButton = UIHelpers.MakeXRButton("Settings", transform, HandleSettings);
            quitButton = UIHelpers.MakeXRButton("Quit", transform, HandleQuit);
        }

        private void HandlePlay() { AudioFeedback.Select(); OnPlay?.Invoke(); }
        private void HandleMR() { AudioFeedback.Select(); LuaJITMR.SetMode(XRMode.MR); OnEnterMR?.Invoke(); Hide(); }
        private void HandleSettings() { AudioFeedback.Select(); OnSettings?.Invoke(); }
        private void HandleQuit()
        {
            AudioFeedback.Error();
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        protected override void OnShow() { AudioFeedback.Hover(); }
    }
}
