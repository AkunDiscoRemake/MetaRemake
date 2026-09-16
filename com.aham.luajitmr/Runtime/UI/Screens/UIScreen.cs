using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace LuaJITMR.UI.Screens
{
    /// <summary>Base class for every overlay screen. Handles fade-in/fade-out and stack integration.</summary>
    [RequireComponent(typeof(CanvasGroup))]
    public abstract class UIScreen : MonoBehaviour
    {
        public float fadeDuration = 0.15f;
        public bool hideOnStart = true;

        protected CanvasGroup _cg;
        private Coroutine _fadeRoutine;

        protected virtual void Awake()
        {
            _cg = GetComponent<CanvasGroup>();
            if (_cg == null) _cg = gameObject.AddComponent<CanvasGroup>();
        }

        protected virtual void Start()
        {
            if (hideOnStart) { _cg.alpha = 0; _cg.interactable = false; _cg.blocksRaycasts = false; gameObject.SetActive(false); }
        }

        public void Show(Action onDone = null)
        {
            gameObject.SetActive(true);
            if (_fadeRoutine != null) StopCoroutine(_fadeRoutine);
            _fadeRoutine = StartCoroutine(Fade(0, 1, onDone));
            _cg.interactable = true;
            _cg.blocksRaycasts = true;
            OnShow();
        }

        public void Hide(Action onDone = null)
        {
            if (_fadeRoutine != null) StopCoroutine(_fadeRoutine);
            _fadeRoutine = StartCoroutine(Fade(1, 0, () =>
            {
                gameObject.SetActive(false);
                onDone?.Invoke();
            }));
            _cg.interactable = false;
            _cg.blocksRaycasts = false;
            OnHide();
        }

        public bool IsShown => gameObject.activeSelf && _cg.alpha > 0.1f;

        protected virtual void OnShow() { }
        protected virtual void OnHide() { }

        private IEnumerator Fade(float from, float to, Action onDone)
        {
            float t = 0;
            _cg.alpha = from;
            while (t < fadeDuration)
            {
                t += Time.unscaledDeltaTime;
                _cg.alpha = Mathf.SmoothStep(from, to, t / fadeDuration);
                yield return null;
            }
            _cg.alpha = to;
            onDone?.Invoke();
        }
    }
}
