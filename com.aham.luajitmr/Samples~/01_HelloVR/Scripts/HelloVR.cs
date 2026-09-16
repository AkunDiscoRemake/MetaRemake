using UnityEngine;
using LuaJITMR;

namespace LuaJITMR.Samples.HelloVR
{
    /// <summary>
    /// Minimal sample: float a cube in front of the user, turn it green while the gaze
    /// ray hits it, and let the user select with dwell / trigger / pinch.
    /// </summary>
    public class HelloVR : MonoBehaviour
    {
        [Tooltip("Cube prefab spawned at 2m ahead.")]
        public GameObject cubePrefab;
        public float distance = 2f;

        private GameObject _cube;
        private Renderer _cubeR;
        private float _dwell;

        private void Start()
        {
            if (LuaJITMR.IsInitialized == false) LuaJITMR.Initialize();
            SpawnCube();
        }

        private void SpawnCube()
        {
            var prefab = cubePrefab;
            if (prefab == null)
            {
                // Build a primitive if no prefab assigned.
                prefab = GameObject.CreatePrimitive(PrimitiveType.Cube);
                prefab.transform.localScale = Vector3.one * 0.2f;
            }
            var head = Camera.main != null ? Camera.main.transform : null;
            Vector3 forward = head != null ? head.forward : Vector3.forward;
            Vector3 spawnPos = (head != null ? head.position : Vector3.zero) + forward * distance + Vector3.down * 0.2f;
            _cube = Instantiate(prefab, spawnPos, Quaternion.identity);
            _cubeR = _cube.GetComponentInChildren<Renderer>();
        }

        private void Update()
        {
            if (_cube == null) return;
            _cube.transform.Rotate(0, 30f * Time.deltaTime, 0);

            Ray ray = LuaJITMR.GazeRay;
            bool hit = Physics.Raycast(ray, out var hitInfo, 10f) && hitInfo.collider != null && hitInfo.collider.gameObject == _cube;
            if (_cubeR) _cubeR.material.color = hit ? Color.Lerp(Color.red, Color.green, Mathf.Clamp01(_dwell)) : Color.white;

            if (hit)
            {
                _dwell += Time.deltaTime;
                if (_dwell > 1.2f || LuaJITMR.TriggerDown)
                {
                    OnSelect();
                    _dwell = 0;
                }
            }
            else _dwell = 0;
        }

        private void OnSelect()
        {
            _cube.transform.localScale *= 1.1f;
            LuaJITMR.HapticPulse(0.6f, 0.08f);
        }
    }
}
