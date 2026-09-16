using System;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace LuaJITMR.UI
{
    /// <summary>
    /// XR-friendly button. Responds to:
    /// - Gaze-and-dwell (with progress animation driven by <see cref="GazeDwellInput"/>)
    /// - Pinch gesture (any hand)
    /// - Poke (fingertip collider)
    /// - Controller trigger / mouse click
    ///
    /// Has hover, press, and release animations (scale + tint) at 150ms with ease-out.
    /// </summary>
    [AddComponentMenu("LuaJITMR/UI/XR Button")]
    public sealed class XRButton : MonoBehaviour, IXRInteractable, IPointerClickHandler, IPointerEnterHandler, IPointerExitHandler
    {
        [Header("Label")]
        public string label = "Button";
        public TMPro.TMP_Text labelText;

        [Header("Interaction")]
        public UnityEvent onClick;
        public bool requireHold = false;
        public float holdTime = 0f;
        public AudioClip clickSound;
        public bool hapticOnClick = true;
        [Range(0f, 1f)] public float hapticAmplitude = 0.4f;

        [Header("Visuals")]
        public Image background;
        public Color normalColor = new Color(0.12f, 0.14f, 0.22f, 0.9f);
        public Color hoverColor = new Color(0.22f, 0.32f, 0.55f, 0.95f);
        public Color pressedColor = new Color(0.35f, 0.6f, 1f, 1f);
        public float normalScale = 1f;
        public float hoverScale = 1.05f;
        public float pressedScale = 0.96f;
        public float animDuration = 0.15f;

        private bool _hover;
        private bool _pressed;
        private float _anim;
        private Vector3 _baseScale = Vector3.one;
        private float _holdTimer;
        private bool _wasPressed;

        private void Reset()
        {
            background = GetComponent<Image>();
            labelText = GetComponentInChildren<TMPro.TMP_Text>();
        }

        private void Start()
        {
            if (background == null) background = GetComponent<Image>();
            if (labelText != null) labelText.text = label;
            _baseScale = transform.localScale;
            if (background) background.color = normalColor;
        }

        private void OnEnable()
        {
            GazeDwellInput.Register(this);
        }
        private void OnDisable()
        {
            GazeDwellInput.Unregister(this);
            _hover = false; _pressed = false; _anim = 0;
        }

        private void Update()
        {
            // Pinch gesture triggers a click on hover (called per frame while pinched).
            bool pinchPressed = LuaJITMR.HandsAreTracked &&
                                (LuaJITMR.Hands_Left.IsPinching || LuaJITMR.Hands_Right.IsPinching);
            bool trigger = LuaJITMR.TriggerDown || pinchPressed;

            if (_hover && trigger && !_wasPressed)
            {
                Press();
            }
            _wasPressed = trigger;

            // Animation state
            float target = _pressed ? 2f : (_hover ? 1f : 0f);
            _anim = Mathf.MoveTowards(_anim, target, Time.unscaledDeltaTime / Mathf.Max(0.001f, animDuration));
            float t = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0f, 1f, Mathf.Clamp01(_anim)));
            float s = Mathf.Lerp(normalScale, _pressed ? pressedScale : hoverScale, t);
            transform.localScale = _baseScale * s;
            if (background)
                background.color = Color.Lerp(normalColor, _pressed ? pressedColor : hoverColor, t);

            if (_pressed && !_hover && !_wasPressed) _pressed = false; // release on exit
            _pressed = _pressed && (_hover || _wasPressed);
        }

        public void Press()
        {
            _pressed = true;
            if (requireHold)
            {
                _holdTimer += Time.unscaledDeltaTime;
                if (_holdTimer < holdTime) return;
                _holdTimer = 0;
            }
            onClick?.Invoke();
            if (hapticOnClick) LuaJITMR.HapticPulse(hapticAmplitude, 0.04f);
            if (clickSound != null) AudioSource.PlayClipAtPoint(clickSound, transform.position, 0.6f);
        }

        public void SetHovered(bool hover) { _hover = hover; }

        public bool IsHovered => _hover;

        public void OnPointerClick(PointerEventData eventData) { Press(); }
        public void OnPointerEnter(PointerEventData eventData) { SetHovered(true); }
        public void OnPointerExit(PointerEventData eventData) { SetHovered(false); }
    }
}
