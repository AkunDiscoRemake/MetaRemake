using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace LuaJITMR.UI.Screens
{
    /// <summary>Animated tutorial explaining pinch/grab/point/dwell. Plays once when the user first enters MR/VR.</summary>
    public sealed class GestureTutorialScreen : UIScreen
    {
        public TMP_Text title;
        public TMP_Text description;
        public Image icon;
        public XRButton nextButton;
        public XRButton skipButton;

        private readonly (string title, string desc)[] _steps =
        {
            ("Look around", "Turn your head. The reticle always follows your gaze."),
            ("Pinch to select", "Bring thumb and index finger together. Or press the trigger / tap the screen."),
            ("Grab to move", "Close your fist to pick up and throw objects."),
            ("Point for rays", "Extend your index finger to point at distant objects."),
            ("Recenter", "Press and hold the primary button to re-center your view forward."),
        };
        private int _index;

        protected override void Awake()
        {
            base.Awake();
            if (title == null)
            {
                var rt = GetComponent<RectTransform>();
                rt.sizeDelta = new Vector2(900, 500);
                gameObject.AddComponent<GlassPanel>().Apply();
                var layout = gameObject.AddComponent<VerticalLayoutGroup>();
                layout.padding = new RectOffset(48, 48, 48, 48); layout.spacing = 20;
                layout.childControlHeight = false; layout.childControlWidth = true;
                title = UIHelpers.MakeText("Tutorial", transform, 48, FontStyles.Bold);
                description = UIHelpers.MakeText("", transform, 28);
                description.alignment = TextAlignmentOptions.Center;
                UIHelpers.MakeSpacer(transform, 16);
                var btnRow = UIHelpers.MakeRow(transform);
                btnRow.GetComponent<HorizontalLayoutGroup>().spacing = 32;
                skipButton = UIHelpers.MakeXRButton("Skip", btnRow.transform, () => { AudioFeedback.Select(); Hide(); });
                nextButton = UIHelpers.MakeXRButton("Next", btnRow.transform, NextStep);
            }
        }

        protected override void OnShow()
        {
            _index = 0; ShowStep(0);
            AudioFeedback.Hover();
        }

        private void NextStep()
        {
            AudioFeedback.Select();
            _index++;
            if (_index >= _steps.Length) { Hide(); return; }
            ShowStep(_index);
        }

        private void ShowStep(int i)
        {
            title.text = $"{i + 1}/{_steps.Length}: {_steps[i].title}";
            description.text = _steps[i].desc;
            nextButton.label = i == _steps.Length - 1 ? "Done" : "Next";
            nextButton.GetComponentInChildren<TMP_Text>().text = nextButton.label;
        }
    }
}
