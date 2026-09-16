using UnityEngine;
using LuaJITMR;

namespace LuaJITMR.Samples.HandInteraction
{
    /// <summary>
    /// Spawns cubes that can be pinched-grabbed using the closest fingertip (pinch gesture)
    /// or the gaze+trigger when hand tracking isn't available.
    /// </summary>
    public class PinchGrab : MonoBehaviour
    {
        public GameObject cubePrefab;
        public int cubeCount = 5;
        public float spawnRadius = 1.0f;

        private GameObject[] _cubes;
        private GameObject _grabbed;
        private Vector3 _grabOffset;
        private Transform _pointer;

        private void Start()
        {
            if (!LuaJITMR.IsInitialized) LuaJITMR.Initialize();
            _cubes = new GameObject[cubeCount];
            for (int i = 0; i < cubeCount; i++)
            {
                Vector3 pos = Random.insideUnitSphere * spawnRadius + Vector3.forward * 1.5f + Vector3.up * -0.3f;
                var go = cubePrefab != null
                    ? Instantiate(cubePrefab, pos, Random.rotation)
                    : GameObject.CreatePrimitive(PrimitiveType.Cube);
                go.transform.localScale = Vector3.one * 0.1f;
                if (go.GetComponent<Rigidbody>() == null) go.AddComponent<Rigidbody>();
                _cubes[i] = go;
            }
        }

        private void Update()
        {
            bool usingHands = LuaJITMR.HandsAreTracked;
            Vector3 pointerPos = Vector3.zero;
            bool pinchOrTrigger = false;
            Ray pointerRay;

            if (usingHands)
            {
                var hand = LuaJITMR.Hands_Right.IsTracked ? LuaJITMR.Hands_Right : LuaJITMR.Hands_Left;
                Pose indexTip = hand.GetJoint(HandJoint.IndexTip);
                Pose thumbTip = hand.GetJoint(HandJoint.ThumbTip);
                pointerPos = indexTip.position;
                pointerRay = new Ray(indexTip.position, (thumbTip.position - indexTip.position).normalized);
                pinchOrTrigger = hand.IsPinching;
            }
            else
            {
                pointerRay = LuaJITMR.GazeRay;
                pinchOrTrigger = LuaJITMR.TriggerDown || LuaJITMR.TriggerHeld;
            }

            if (_grabbed == null && pinchOrTrigger)
            {
                if (Physics.SphereCast(pointerRay, 0.02f, out var hit, 5f))
                {
                    _grabbed = hit.collider.gameObject;
                    if (_grabbed.TryGetComponent<Rigidbody>(out var rb)) rb.isKinematic = true;
                    _grabOffset = _grabbed.transform.InverseTransformPoint(pointerRay.origin);
                }
            }
            else if (_grabbed != null)
            {
                _grabbed.transform.position = pointerRay.origin + pointerRay.direction * 0.15f;
                if (!pinchOrTrigger)
                {
                    if (_grabbed.TryGetComponent<Rigidbody>(out var rb)) rb.isKinematic = false;
                    _grabbed = null;
                    LuaJITMR.HapticPulse(0.3f, 0.04f);
                }
            }
        }
    }
}
