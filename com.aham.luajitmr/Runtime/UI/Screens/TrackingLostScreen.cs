using UnityEngine;
using TMPro;

namespace LuaJITMR.UI.Screens
{
    /// <summary>Shown when ARCore tracking is lost. Hints to look around.</summary>
    public sealed class TrackingLostScreen : UIScreen
    {
        public TMP_Text message;
        public TMP_Text subMessage;

        protected override void Awake()
        {
            base.Awake();
            if (message == null)
            {
                var rt = GetComponent<RectTransform>();
                rt.sizeDelta = new Vector2(900, 400);
                var panel = gameObject.AddComponent<GlassPanel>(); panel.Apply();
                var layout = gameObject.AddComponent<VerticalLayoutGroup>();
                layout.padding = new RectOffset(60, 60, 60, 60); layout.spacing = 20;
                layout.childControlHeight = false; layout.childControlWidth = true;
                layout.childForceExpandHeight = false;
                message = UIHelpers.MakeText("Tracking lost", transform, 56, FontStyles.Bold);
                message.color = new Color(1f, 0.4f, 0.3f);
                subMessage = UIHelpers.MakeText("Look around your environment slowly.\nMove the camera so the room is well-lit.", transform, 28);
                subMessage.alignment = TextAlignmentOptions.Center;
            }
            LuaJITMR.OnTrackingLost += ShowMe;
            LuaJITMR.OnTrackingRegained += HideMe;
        }

        private void OnDestroy()
        {
            LuaJITMR.OnTrackingLost -= ShowMe;
            LuaJITMR.OnTrackingRegained -= HideMe;
        }

        private void ShowMe() => Show();
        private void HideMe() => Hide();
    }
}
