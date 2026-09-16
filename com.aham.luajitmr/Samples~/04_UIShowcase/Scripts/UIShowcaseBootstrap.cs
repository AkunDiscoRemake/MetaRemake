using UnityEngine;
using LuaJITMR;

namespace LuaJITMR.Samples.UIShowcase
{
    /// <summary>
    /// Builds a simple curved world-space menu at runtime: three labeled buttons the user can
    /// activate with gaze-and-dwell, pinch, or a key press. This is a minimal demonstration
    /// of the UI system's interaction model — the full glassmorphism canvas system ships in v0.2.x.
    /// </summary>
    public class UIShowcaseBootstrap : MonoBehaviour
    {
        public float menuDistance = 2.0f;
        public float menuWidth = 0.8f;
        public int buttonCount = 3;
        public float buttonSize = 0.15f;
        public float dwellTime = 1.2f;

        private Transform _menuRoot;
        private Transform[] _buttons;
        private float[] _dwell;
        private int _focused = -1;

        private void Start()
        {
            if (!LuaJITMR.IsInitialized) LuaJITMR.Initialize();
            BuildMenu();
        }

        private void BuildMenu()
        {
            _menuRoot = new GameObject("UI Menu").transform;
            Vector3 headP = Camera.main != null ? Camera.main.transform.position : Vector3.zero;
            Vector3 headF = Camera.main != null ? Camera.main.transform.forward : Vector3.forward;
            _menuRoot.SetPositionAndRotation(headP + headF * menuDistance, Quaternion.LookRotation(_menuRoot.position - headP, Vector3.up));

            _buttons = new Transform[buttonCount];
            _dwell = new float[buttonCount];

            for (int i = 0; i < buttonCount; i++)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                go.transform.SetParent(_menuRoot, false);
                float x = (i - (buttonCount - 1) / 2f) * (buttonSize * 1.3f);
                go.transform.localPosition = new Vector3(x, 0, 0);
                go.transform.localScale = new Vector3(buttonSize, buttonSize, 0.01f);
                var mat = go.GetComponent<Renderer>().material;
                mat.color = new Color(0.2f, 0.2f, 0.3f, 0.7f);
                _buttons[i] = go.transform;

                var label = new GameObject($"Label_{i}").AddComponent<TextMesh>();
                label.text = $"Item {i + 1}";
                label.characterSize = 0.02f;
                label.fontSize = 40;
                label.transform.SetParent(go.transform, false);
                label.transform.localPosition = new Vector3(0, 0, -0.006f);
                label.transform.localScale = Vector3.one * 0.1f;
                label.color = Color.white;
            }
        }

        private void Update()
        {
            if (_menuRoot == null) return;
            // Face the camera each frame so menu stays in front of the user.
            var cam = Camera.main;
            if (cam != null)
                _menuRoot.rotation = Quaternion.LookRotation(_menuRoot.position - cam.transform.position, Vector3.up);

            Ray ray = LuaJITMR.GazeRay;
            int closest = -1;
            float closestDist = float.MaxValue;

            for (int i = 0; i < _buttons.Length; i++)
            {
                var b = _buttons[i];
                var col = b.GetComponent<Collider>();
                if (col.Raycast(ray, out var hit, 10f) && hit.distance < closestDist)
                {
                    closestDist = hit.distance;
                    closest = i;
                }
                _dwell[i] = 0;
            }

            if (closest != _focused)
            {
                if (_focused >= 0) SetButtonColor(_focused, new Color(0.2f, 0.2f, 0.3f, 0.7f));
                _focused = closest;
            }

            if (closest >= 0)
            {
                _dwell[closest] += Time.deltaTime;
                SetButtonColor(closest, Color.Lerp(new Color(0.2f, 0.2f, 0.3f, 0.7f), new Color(0.4f, 0.7f, 1f, 0.9f), _dwell[closest] / dwellTime));
                if (_dwell[closest] >= dwellTime || LuaJITMR.TriggerDown)
                {
                    Activate(closest);
                    _dwell[closest] = 0;
                }
            }
        }

        private void Activate(int idx)
        {
            Debug.Log($"[UIShowcase] Activated button {idx}");
            LuaJITMR.HapticPulse(0.5f, 0.06f);
            _buttons[idx].localScale = new Vector3(buttonSize * 1.1f, buttonSize * 1.1f, 0.01f);
        }

        private static void SetButtonColor(int i, Color c)
        {
            var r = GameObject.Find($"UI Menu/Cube({i})")?.GetComponent<Renderer>();
            if (r) r.material.color = c;
        }
    }
}
