using System.Collections.Generic;
using UnityEngine;
using LuaJITMR;

namespace LuaJITMR.Samples.BeatSaber
{
    /// <summary>
    /// Minimal Beat Saber-style rhythm game:
    /// - Two sabers (left/right) track to hand or to head-relative controllers when hands unavailable.
    /// - Cubes spawn in sync with a beat clock flying toward the player.
    /// - Swinging a saber through a cube of the matching color scores a hit.
    /// - Score is shown on a simple world-space UI.
    ///
    /// Works with zero prefabs — all geometry and logic are procedural.
    /// </summary>
    public class BeatSaberGame : MonoBehaviour
    {
        [Header("Beat")]
        public float bpm = 120f;
        public float approachTimeSec = 1.2f;
        public float spawnDistance = 8f;
        public float hitDistance = 1.0f; // when cube is within this distance of sabers
        public float minSaberVelocity = 1.5f; // m/s — required to slice a cube

        [Header("Colors")]
        public Color leftColor = new Color(0.2f, 0.4f, 1f);
        public Color rightColor = new Color(1f, 0.3f, 0.3f);

        private GameObject _leftSaber, _rightSaber;
        private Transform _leftSaberT, _rightSaberT;
        private Vector3 _leftPrevPos, _rightPrevPos;
        private readonly List<Note> _notes = new List<Note>();
        private double _nextBeatTime;
        private double _startTime;
        private float _beatInterval;
        private int _score, _combo, _missed;
        private GUIStyle _scoreStyle;

        private class Note
        {
            public GameObject go;
            public bool isLeft;
            public Vector3 startPos;
            public double spawnTime;
            public bool hit;
        }

        private void Start()
        {
            _beatInterval = 60f / bpm;
            _startTime = AudioSettings.dspTime;
            _nextBeatTime = _startTime + 1.0;
            BuildSabers();
        }

        private void BuildSabers()
        {
            _leftSaber = MakeSaber("LeftSaber", leftColor);
            _rightSaber = MakeSaber("RightSaber", rightColor);
            _leftSaberT = _leftSaber.transform;
            _rightSaberT = _rightSaber.transform;
        }

        private GameObject MakeSaber(string name, Color color)
        {
            var go = new GameObject(name);
            var blade = GameObject.CreatePrimitive(PrimitiveType.Cube);
            blade.transform.SetParent(go.transform, false);
            blade.transform.localPosition = new Vector3(0f, 0f, 0.5f);
            blade.transform.localScale = new Vector3(0.05f, 0.05f, 1.0f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"))
            { color = color,
              emissiveColor = color * 0.5f,
              globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive };
            blade.GetComponent<Renderer>().sharedMaterial = mat;
            Destroy(blade.GetComponent<Collider>());

            var handle = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            handle.transform.SetParent(go.transform, false);
            handle.transform.localPosition = new Vector3(0f, 0f, -0.1f);
            handle.transform.localScale = new Vector3(0.08f, 0.1f, 0.08f);
            Destroy(handle.GetComponent<Collider>());
            return go;
        }

        private void Update()
        {
            Pose head = LuaJITMR.HeadPose;
            Vector3 leftPos, rightPos;
            Quaternion leftRot, rightRot;

            if (LuaJITMR.Hands_Left.IsTracked)
            {
                Pose wrist = LuaJITMR.Hands_Left.GetJoint(HandJoint.Wrist);
                Pose tip = LuaJITMR.Hands_Left.GetJoint(HandJoint.IndexTip);
                leftPos = wrist.position;
                leftRot = Quaternion.LookRotation((tip.position - wrist.position).normalized);
            }
            else
            {
                leftPos = head.position + head.rotation * new Vector3(-0.25f, -0.2f, 0.3f);
                leftRot = head.rotation * Quaternion.Euler(45f, 0f, 0f);
            }
            if (LuaJITMR.Hands_Right.IsTracked)
            {
                Pose wrist = LuaJITMR.Hands_Right.GetJoint(HandJoint.Wrist);
                Pose tip = LuaJITMR.Hands_Right.GetJoint(HandJoint.IndexTip);
                rightPos = wrist.position;
                rightRot = Quaternion.LookRotation((tip.position - wrist.position).normalized);
            }
            else
            {
                rightPos = head.position + head.rotation * new Vector3(0.25f, -0.2f, 0.3f);
                rightRot = head.rotation * Quaternion.Euler(45f, 0f, 0f);
            }

            _leftSaberT.SetPositionAndRotation(leftPos, leftRot);
            _rightSaberT.SetPositionAndRotation(rightPos, rightRot);

            Vector3 leftVel = (leftPos - _leftPrevPos) / Time.deltaTime;
            Vector3 rightVel = (rightPos - _rightPrevPos) / Time.deltaTime;
            _leftPrevPos = leftPos;
            _rightPrevPos = rightPos;

            // Spawn notes
            double now = AudioSettings.dspTime;
            while (now >= _nextBeatTime)
            {
                SpawnNote(_nextBeatTime);
                _nextBeatTime += _beatInterval;
            }

            // Animate notes + collision
            for (int i = _notes.Count - 1; i >= 0; i--)
            {
                var n = _notes[i];
                double elapsed = now - n.spawnTime;
                float t = (float)(elapsed / approachTimeSec);
                Vector3 p = Vector3.Lerp(n.startPos, head.position + Vector3.up * -0.1f, Mathf.Clamp01(t));
                n.go.transform.position = p;
                n.go.transform.Rotate(0f, 120f * Time.deltaTime, 0f);

                if (t >= 1.2f && !n.hit)
                {
                    // Missed
                    Destroy(n.go);
                    _notes.RemoveAt(i);
                    _combo = 0;
                    _missed++;
                    continue;
                }

                if (!n.hit && t > 0.5f)
                {
                    // Check saber collision — saber must be on the correct side for that note color.
                    var saber = n.isLeft ? _leftSaberT : _rightSaberT;
                    var sabVel = n.isLeft ? leftVel : rightVel;
                    // When hands are not tracked, allow trigger button to activate any saber in front
                    bool handsAvailable = LuaJITMR.HandsAreTracked;
                    bool saberActive = handsAvailable
                        ? (n.isLeft ? LuaJITMR.Hands_Left.IsTracked : LuaJITMR.Hands_Right.IsTracked)
                        : LuaJITMR.TriggerHeld;
                    if (saberActive && sabVel.magnitude >= minSaberVelocity)
                    {
                        float dist = Vector3.Distance(p, saber.TransformPoint(0f, 0f, 0.5f));
                        if (dist < hitDistance)
                        {
                            n.hit = true;
                            _score += 100 + _combo * 5;
                            _combo++;
                            SlashEffect(n.go.transform.position, n.isLeft ? leftColor : rightColor);
                            Destroy(n.go);
                            _notes.RemoveAt(i);
                            LuaJITMR.HapticPulse(n.isLeft ? 0.4f : 0.4f, 0.04f);
                        }
                    }
                }
            }
        }

        private void SpawnNote(double time)
        {
            var head = LuaJITMR.HeadPose;
            bool isLeft = Random.value < 0.5f;
            float x = isLeft ? -0.7f : 0.7f;
            Vector3 pos = head.position + head.rotation * new Vector3(x, -0.1f, spawnDistance);
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.transform.position = pos;
            go.transform.localScale = Vector3.one * 0.25f;
            Color c = isLeft ? leftColor : rightColor;
            var mat = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"))
            { color = c, emissiveColor = c * 0.5f, globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive };
            go.GetComponent<Renderer>().sharedMaterial = mat;
            // Arrow-ish look — tint the top face
            _notes.Add(new Note { go = go, isLeft = isLeft, startPos = pos, spawnTime = time });
        }

        private void SlashEffect(Vector3 pos, Color c)
        {
            // Simple particle-ish: a quad that scales up and fades
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.transform.position = pos;
            go.transform.localScale = Vector3.zero;
            var r = go.GetComponent<Renderer>();
            var m = new Material(Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Color")) { color = c };
            r.sharedMaterial = m;
            StartCoroutine(FadeOut(go, 0.3f));
        }

        private System.Collections.IEnumerator FadeOut(GameObject go, float sec)
        {
            float t = 0;
            var r = go.GetComponent<Renderer>();
            Color orig = r.material.color;
            while (t < sec)
            {
                t += Time.deltaTime;
                go.transform.localScale = Vector3.one * (t / sec) * 0.6f;
                var c = orig; c.a = 1f - t / sec; r.material.color = c;
                yield return null;
            }
            Destroy(go);
        }

        private void OnGUI()
        {
            if (_scoreStyle == null) _scoreStyle = new GUIStyle(GUI.skin.label) { fontSize = 32, richText = true };
            GUILayout.BeginArea(new Rect(20, 20, 400, 200));
            GUILayout.Label($"<color=#fff>Score: {_score}</color>", _scoreStyle);
            GUILayout.Label($"<color=#ff0>Combo: {_combo}</color>", _scoreStyle);
            GUILayout.Label($"<color=#888>Misses: {_missed}</color>", _scoreStyle);
            GUILayout.EndArea();
        }
    }
}
