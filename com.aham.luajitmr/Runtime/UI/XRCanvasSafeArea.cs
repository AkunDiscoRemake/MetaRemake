using UnityEngine;

namespace LuaJITMR.UI.Screens
{
    /// <summary>Applies a top/bottom inset to the container based on the visible camera's field of view,
    /// ensuring that no important content is rendered where the lens vignette hides it.</summary>
    [AddComponentMenu("LuaJITMR/UI/XR Canvas Safe Area")]
    [RequireComponent(typeof(RectTransform))]
    public sealed class XRCanvasSafeArea : MonoBehaviour
    {
        [Range(0f, 0.25f)] public float top = 0.08f;
        [Range(0f, 0.25f)] public float bottom = 0.10f;
        [Range(0f, 0.15f)] public float sides = 0.05f;

        private RectTransform _rt;
        private Rect _last;

        private void Awake() { _rt = GetComponent<RectTransform>(); Apply(); }
        private void OnEnable() { Apply(); }
        private void OnRectTransformDimensionsChange() { Apply(); }

        private void Apply()
        {
            if (_rt == null) _rt = GetComponent<RectTransform>();
            var parent = _rt.parent as RectTransform;
            if (parent == null) return;
            float w = parent.rect.width;
            float h = parent.rect.height;
            var inset = new RectOffset(
                Mathf.RoundToInt(w * sides),
                Mathf.RoundToInt(w * sides),
                Mathf.RoundToInt(h * bottom),
                Mathf.RoundToInt(h * top));
            _rt.offsetMin = new Vector2(inset.left, inset.bottom);
            _rt.offsetMax = new Vector2(-inset.right, -inset.top);
        }
    }
}
