using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace LuaJITMR.UI.Screens
{
    /// <summary>Settings screen: IPD slider, VR/MR toggle, brightness, quality, haptics, back button.</summary>
    public sealed class SettingsScreen : UIScreen
    {
        public TMP_Text title;
        public XRButton backButton;
        public Slider ipdSlider;
        public TMP_Text ipdLabel;
        public Toggle vrToggle;
        public Toggle mrToggle;
        public Slider brightnessSlider;
        public Slider qualitySlider;
        public Toggle hapticsToggle;

        public event Action Back;

        protected override void Awake()
        {
            base.Awake();
            BuildIfMissing();
        }

        private void BuildIfMissing()
        {
            if (ipdSlider != null) return;
            var rt = GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(800, 900);
            gameObject.AddComponent<GlassPanel>().Apply();

            var layout = gameObject.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(48, 48, 48, 48); layout.spacing = 18;
            layout.childControlHeight = false; layout.childControlWidth = true;
            layout.childForceExpandHeight = false; layout.childForceExpandWidth = true;

            title = UIHelpers.MakeText("Settings", transform, 48, FontStyles.Bold);
            UIHelpers.MakeSpacer(transform, 8);

            ipdLabel = UIHelpers.MakeText("IPD: 63 mm", transform, 28);
            ipdSlider = UIHelpers.MakeSlider(transform, 50f, 75f, 63f, v =>
            {
                var s = LuaJITMRPlayer.ActiveSettings;
                if (s != null) { s.ipdMm = v; ipdLabel.text = $"IPD: {v:0} mm"; }
            });

            var toggleRow1 = UIHelpers.MakeRow(transform);
            UIHelpers.MakeLabelToggle(toggleRow1.transform, "VR Mode", true, v => { if (v) LuaJITMR.SetMode(XRMode.VR); });
            var toggleRow2 = UIHelpers.MakeRow(transform);
            UIHelpers.MakeLabelToggle(toggleRow2.transform, "MR Passthrough", false, v => { if (v) LuaJITMR.SetMode(XRMode.MR); });
            var toggleRow3 = UIHelpers.MakeRow(transform);
            UIHelpers.MakeLabelToggle(toggleRow3.transform, "Haptics", true, v => { /* store */ });

            UIHelpers.MakeText("Brightness", transform, 28);
            brightnessSlider = UIHelpers.MakeSlider(transform, 0.3f, 1.5f, 1f, v =>
            {
                // Adjust post-exposure on the main camera via URP Volume if present.
                if (Camera.main != null) Camera.main.backgroundColor = new Color(v, v, v, 1);
            });

            UIHelpers.MakeText("Quality", transform, 28);
            qualitySlider = UIHelpers.MakeSlider(transform, 0, 2, 1, v => { QualitySettings.SetQualityLevel((int)v, true); });

            UIHelpers.MakeSpacer(transform, 24);
            backButton = UIHelpers.MakeXRButton("Back", transform, () => { AudioFeedback.Select(); Hide(); Back?.Invoke(); });
        }

        protected override void OnShow() { AudioFeedback.Hover(); }
    }
}
