using TMPro;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace LuaJITMR.UI
{
    /// <summary>Factory for UGUI controls at runtime — no prefabs or binary assets required.</summary>
    internal static class UIHelpers
    {
        private static TMP_FontAsset _font;
        private static Font _fallbackFont;

        public static TMP_FontAsset GetFont()
        {
            if (_font != null) return _font;
            _font = TMP_Settings.defaultFontAsset;
            if (_font == null)
            {
                // Try to load by common name
                _font = Resources.Load<TMP_FontAsset>("LiberationSans SDF");
            }
            return _font;
        }

        public static TMP_Text MakeText(string text, Transform parent, int size, FontStyles style = FontStyles.Normal)
        {
            var go = new GameObject("Text", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(0, size + 10);
            var t = go.AddComponent<TextMeshProUGUI>();
            t.text = text;
            t.fontSize = size;
            t.fontStyle = style;
            t.alignment = TextAlignmentOptions.Center;
            t.color = Color.white;
            t.font = GetFont();
            t.raycastTarget = false;
            var fitter = go.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            fitter.horizontalFit = ContentSizeFitter.FitMode.Unconstrained;
            var le = go.AddComponent<LayoutElement>(); le.minHeight = size + 8;
            return t;
        }

        public static GameObject MakeSpacer(Transform parent, float height)
        {
            var go = new GameObject("Spacer", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var le = go.AddComponent<LayoutElement>(); le.minHeight = height; le.preferredHeight = height;
            return go;
        }

        public static GameObject MakeRow(Transform parent)
        {
            var go = new GameObject("Row", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(0, 80);
            var h = go.AddComponent<HorizontalLayoutGroup>();
            h.spacing = 24; h.childForceExpandWidth = true; h.childForceExpandHeight = false;
            h.childControlHeight = false; h.childControlWidth = true;
            var le = go.AddComponent<LayoutElement>(); le.minHeight = 80;
            return go;
        }

        public static XRButton MakeXRButton(string text, Transform parent, UnityAction onClick)
        {
            var go = new GameObject("Button_" + text, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(0, 80);
            var img = go.GetComponent<Image>();
            img.color = new Color(0.12f, 0.14f, 0.22f, 0.9f);
            img.sprite = GlassPanel.GetRoundedSprite();
            img.type = Image.Type.Sliced;
            var le = go.AddComponent<LayoutElement>(); le.minHeight = 80;

            var lblGo = new GameObject("Label", typeof(RectTransform));
            lblGo.transform.SetParent(go.transform, false);
            var lbl = lblGo.AddComponent<TextMeshProUGUI>();
            lbl.text = text;
            lbl.fontSize = 32;
            lbl.color = Color.white;
            lbl.alignment = TextAlignmentOptions.Center;
            lbl.font = GetFont();
            lbl.raycastTarget = false;
            var labelRt = lblGo.GetComponent<RectTransform>();
            labelRt.anchorMin = Vector2.zero; labelRt.anchorMax = Vector2.one;
            labelRt.offsetMin = new Vector2(0, 0); labelRt.offsetMax = new Vector2(0, 0);

            var btn = go.AddComponent<XRButton>();
            btn.label = text;
            btn.labelText = lbl;
            btn.background = img;
            btn.onClick = new UnityEngine.Events.UnityEvent();
            btn.onClick.AddListener(onClick);
            return btn;
        }

        public static Slider MakeSlider(Transform parent, float min, float max, float val, UnityAction<float> onChanged)
        {
            var go = new GameObject("Slider", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var le = go.AddComponent<LayoutElement>(); le.minHeight = 60;
            var slider = go.AddComponent<Slider>();
            // Background
            var bgGo = new GameObject("Background", typeof(RectTransform), typeof(Image));
            bgGo.transform.SetParent(go.transform, false);
            var bgRt = bgGo.GetComponent<RectTransform>();
            bgRt.anchorMin = new Vector2(0, 0.35f); bgRt.anchorMax = new Vector2(1, 0.65f);
            bgRt.offsetMin = Vector2.zero; bgRt.offsetMax = Vector2.zero;
            bgGo.GetComponent<Image>().color = new Color(1, 1, 1, 0.15f);
            // Fill
            var fillGo = new GameObject("Fill", typeof(RectTransform), typeof(Image));
            fillGo.transform.SetParent(go.transform, false);
            var fillRt = fillGo.GetComponent<RectTransform>();
            fillRt.anchorMin = new Vector2(0, 0.3f); fillRt.anchorMax = new Vector2(0, 0.7f);
            fillRt.offsetMin = Vector2.zero; fillRt.offsetMax = Vector2.zero;
            fillGo.GetComponent<Image>().color = new Color(0.4f, 0.7f, 1f, 0.9f);
            // Handle
            var handleGo = new GameObject("Handle", typeof(RectTransform), typeof(Image));
            handleGo.transform.SetParent(go.transform, false);
            var hrt = handleGo.GetComponent<RectTransform>();
            hrt.sizeDelta = new Vector2(40, 60);
            handleGo.GetComponent<Image>().color = Color.white;
            handleGo.GetComponent<Image>().sprite = GlassPanel.GetRoundedSprite();

            slider.targetGraphic = handleGo.GetComponent<Image>();
            slider.fillRect = fillRt;
            slider.handleRect = hrt;
            slider.direction = Slider.Direction.LeftToRight;
            slider.minValue = min; slider.maxValue = max; slider.value = val;
            slider.onValueChanged.AddListener(onChanged);
            return slider;
        }

        public static (Toggle toggle, TMP_Text label) MakeLabelToggle(Transform row, string label, bool initial, UnityAction<bool> onChanged)
        {
            var go = new GameObject("Toggle_" + label, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(row, false);
            var le = go.AddComponent<LayoutElement>(); le.minHeight = 60; le.flexibleWidth = 1;
            var lblGo = new GameObject("Label", typeof(RectTransform));
            lblGo.transform.SetParent(go.transform, false);
            var lbl = lblGo.AddComponent<TextMeshProUGUI>();
            lbl.text = label; lbl.fontSize = 28; lbl.color = Color.white; lbl.alignment = TextAlignmentOptions.MidlineLeft; lbl.font = GetFont();
            lbl.raycastTarget = false;
            var lrt = lblGo.GetComponent<RectTransform>();
            lrt.anchorMin = Vector2.zero; lrt.anchorMax = new Vector2(0.85f, 1f);
            lrt.offsetMin = new Vector2(10, 0); lrt.offsetMax = Vector2.zero;

            var tgo = new GameObject("Checkbox", typeof(RectTransform), typeof(Image));
            tgo.transform.SetParent(go.transform, false);
            var trt = tgo.GetComponent<RectTransform>();
            trt.anchorMin = new Vector2(0.9f, 0.5f); trt.anchorMax = new Vector2(1f, 0.5f);
            trt.sizeDelta = new Vector2(40, 40); trt.anchoredPosition = Vector2.zero;
            tgo.GetComponent<Image>().sprite = GlassPanel.GetRoundedSprite();
            tgo.GetComponent<Image>().color = initial ? new Color(0.4f, 0.7f, 1f) : new Color(1, 1, 1, 0.2f);

            var tog = go.AddComponent<Toggle>();
            tog.targetGraphic = tgo.GetComponent<Image>();
            tog.isOn = initial;
            tog.onValueChanged.AddListener(v =>
            {
                tgo.GetComponent<Image>().color = v ? new Color(0.4f, 0.7f, 1f) : new Color(1, 1, 1, 0.2f);
                onChanged?.Invoke(v);
            });
            tog.graphic = null;
            return (tog, lbl);
        }
    }
}
