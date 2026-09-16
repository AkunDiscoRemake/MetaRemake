using UnityEngine;
using UnityEngine.UI;

namespace LuaJITMR.UI
{
    /// <summary>
    /// Dark glassmorphism panel: semi-transparent dark background with subtle highlight on top,
    /// rounded corners (via a rounded sprite), and soft shadow. Uses a shared procedural material
    /// so no binary art assets are required.
    /// </summary>
    [AddComponentMenu("LuaJITMR/UI/Glass Panel")]
    [ExecuteAlways]
    [RequireComponent(typeof(RectTransform))]
    public sealed class GlassPanel : MonoBehaviour
    {
        public Color panelColor = new Color(0.08f, 0.08f, 0.14f, 0.75f);
        public Color edgeHighlight = new Color(1f, 1f, 1f, 0.08f);
        public float cornerRadius = 24f;
        public Vector2 blurIntensity = new Vector2(2f, 2f); // visual hint; not actual blur (would need GrabPass)

        private Image _image;
        private static Material _glassMat;
        private static Sprite _roundedSprite;

        private void OnEnable() => Apply();

        [ContextMenu("Apply look")]
        public void Apply()
        {
            _image = GetComponent<Image>();
            if (_image == null) _image = gameObject.AddComponent<Image>();
            _image.sprite = GetRoundedSprite();
            _image.material = GetGlassMaterial();
            _image.color = panelColor;
            _image.type = Image.Type.Sliced;
        }

        public static Material GetGlassMaterial()
        {
            if (_glassMat != null) return _glassMat;
            Shader shader = Shader.Find("LuaJITMR/GlassPanel") ?? MakeFallbackShader();
            _glassMat = new Material(shader) { name = "LuaJITMR/Glass", hideFlags = HideFlags.DontSave };
            return _glassMat;
        }

        public static Sprite GetRoundedSprite()
        {
            if (_roundedSprite) return _roundedSprite;
            const int s = 64;
            const int r = 16;
            var tex = new Texture2D(s, s, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp
            };
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    bool inside = true;
                    // Four corners: distance from the inner rounded corner center
                    float dx = 0, dy = 0;
                    if (x < r && y < r) { dx = x - r; dy = y - r; }
                    else if (x > s - r && y < r) { dx = x - (s - r); dy = y - r; }
                    else if (x < r && y > s - r) { dx = x - r; dy = y - (s - r); }
                    else if (x > s - r && y > s - r) { dx = x - (s - r); dy = y - (s - r); }
                    if (dx != 0 || dy != 0)
                    {
                        float d = Mathf.Sqrt(dx * dx + dy * dy);
                        if (d > r) inside = false;
                    }
                    tex.SetPixel(x, y, inside ? Color.white : Color.clear);
                }
            tex.Apply();
            _roundedSprite = Sprite.Create(tex, new Rect(0, 0, s, s), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect,
                new Vector4(r, r, r, r));
            _roundedSprite.name = "GlassRounded";
            return _roundedSprite;
        }

        private static Shader MakeFallbackShader()
        {
            // Simple UI-default shader with tinted color is sufficient when the Glass shader
            // isn't included in the build; glass panels still look dark & rounded.
            return Shader.Find("UI/Default");
        }
    }
}
