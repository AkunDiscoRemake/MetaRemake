using UnityEngine;
using LuaJITMR;

namespace LuaJITMR.Samples.GorillaTag
{
    /// <summary>
    /// Gorilla Tag-style locomotion: you climb by grabbing/pinching surfaces.
    /// - <b>Head</b> is always the VR/MR head pose (LuaJITMR.HeadPose).
    /// - <b>Left/Right hands</b> track via MediaPipe or OpenXR.
    /// - When a hand is <b>pinched</b> (closed fist / trigger) AND touching a surface, that
    ///   hand becomes a fixed pivot and the body/head move relative to the hand moving
    ///   (arm-swimming locomotion).
    /// - No artificial turn; rotate by turning your head physically.
    /// - Jump by releasing both hands quickly (upward velocity added).
    ///
    /// Attach to the rig root; works with zero setup in LuaJITMRPlayer scenes.
    /// </summary>
    public class GorillaPlayer : MonoBehaviour
    {
        [Header("Locomotion")]
        [Tooltip("How strongly the body follows hand movement.")]
        [Range(0.2f, 4f)] public float pullStrength = 1.8f;

        [Tooltip("Jump impulse when releasing both hands quickly while moving upward.")]
        [Range(0f, 5f)] public float jumpImpulse = 2.6f;

        [Tooltip("Maximum reach in meters. Hands further than this won't grip.")]
        [Range(0.4f, 1.5f)] public float maxReach = 0.9f;

        [Header("References")]
        public LayerMask climbableLayers = ~0;
        public Transform headAnchor;    // where the head sits relative to the body
        public GameObject leftHandVisual;
        public GameObject rightHandVisual;

        private Rigidbody _rb;
        private Vector3 _leftHandAnchor, _rightHandAnchor;
        private Vector3 _leftHandWorldPrev, _rightHandWorldPrev;
        private bool _leftGrip, _rightGrip;
        private Vector3 _prevHeadPos;
        private float _releaseTimer;

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
            if (_rb == null) _rb = gameObject.AddComponent<Rigidbody>();
            _rb.useGravity = true;
            _rb.constraints = RigidbodyConstraints.FreezeRotation;
            _rb.collisionDetectionMode = CollisionDetectionMode.Continuous;

            if (headAnchor == null)
            {
                var ha = new GameObject("HeadAnchor");
                ha.transform.SetParent(transform, false);
                ha.transform.localPosition = new Vector3(0f, 1.7f, 0f);
                headAnchor = ha.transform;
            }

            if (leftHandVisual == null) leftHandVisual = MakeHandVisual("LeftHandVisual", new Color(0.3f, 0.7f, 0.9f));
            if (rightHandVisual == null) rightHandVisual = MakeHandVisual("RightHandVisual", new Color(0.9f, 0.4f, 0.5f));
        }

        private GameObject MakeHandVisual(string name, Color c)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = name;
            go.transform.localScale = Vector3.one * 0.06f;
            go.GetComponent<Renderer>().material.color = c;
            Destroy(go.GetComponent<Collider>());
            return go;
        }

        private void FixedUpdate()
        {
            var cam = Camera.main;
            if (cam == null) return;

            Pose head = LuaJITMR.HeadPose;

            // Body follows head XZ, but we drive vertical/velocity from the grip physics.
            Vector3 headDeltaXZ = new Vector3(head.position.x - _prevHeadPos.x, 0, head.position.z - _prevHeadPos.z);
            _prevHeadPos = head.position;

            // Sample hands
            bool leftTracked = LuaJITMR.Hands_Left.IsTracked;
            bool rightTracked = LuaJITMR.Hands_Right.IsTracked;
            Vector3 leftPos = leftTracked ? LuaJITMR.Hands_Left.GetJoint(HandJoint.IndexTip).position
                                          : head.position + head.rotation * new Vector3(-0.2f, -0.3f, 0.5f);
            Vector3 rightPos = rightTracked ? LuaJITMR.Hands_Right.GetJoint(HandJoint.IndexTip).position
                                            : head.position + head.rotation * new Vector3(0.2f, -0.3f, 0.5f);

            leftHandVisual.transform.position = leftPos;
            rightHandVisual.transform.position = rightPos;

            // Determine grip: pinch (hand) OR trigger (controller) AND surface nearby
            bool leftPinch = (leftTracked && LuaJITMR.Hands_Left.IsPinching) || LuaJITMR.TriggerHeld;
            bool rightPinch = (rightTracked && LuaJITMR.Hands_Right.IsPinching) || LuaJITMR.TriggerHeld;

            UpdateGrip(ref _leftGrip, leftPinch, leftPos, ref _leftHandAnchor, ref _leftHandWorldPrev);
            UpdateGrip(ref _rightGrip, rightPinch, rightPos, ref _rightHandAnchor, ref _rightHandWorldPrev);

            // Compute pull from gripping hands
            Vector3 pull = Vector3.zero;
            int grips = 0;
            if (_leftGrip) { pull += (leftPos - transform.TransformPoint(_leftHandAnchor)) * pullStrength; grips++; }
            if (_rightGrip) { pull += (rightPos - transform.TransformPoint(_rightHandAnchor)) * pullStrength; grips++; }
            if (grips > 0)
            {
                pull /= grips;
                _rb.velocity = pull / Time.fixedDeltaTime * 0.4f; // smoothed
                _rb.useGravity = false;
            }
            else
            {
                _rb.useGravity = true;
            }

            // Jump logic: if both hands released while moving up, add upward impulse
            if (!_leftGrip && !_rightGrip)
            {
                _releaseTimer += Time.fixedDeltaTime;
                if (_releaseTimer < 0.15f && _rb.velocity.y > 0.5f)
                {
                    _rb.velocity += Vector3.up * jumpImpulse;
                    _releaseTimer = 1f;
                }
            }
            else _releaseTimer = 0f;

            // Keep the body's head anchor at the head's XZ position (prevents body from drifting away)
            Vector3 desired = new Vector3(head.position.x - headAnchor.localPosition.x, transform.position.y,
                                           head.position.z - headAnchor.localPosition.z);
            if (!_leftGrip && !_rightGrip)
            {
                transform.position = Vector3.Lerp(transform.position, desired, 0.3f);
            }

            // Surface check — mark grip as invalid if hand isn't touching something climbable
            if (_leftGrip && !IsNearSurface(leftPos)) _leftGrip = false;
            if (_rightGrip && !IsNearSurface(rightPos)) _rightGrip = false;
        }

        private bool IsNearSurface(Vector3 pos)
        {
            return Physics.CheckSphere(pos, 0.08f, climbableLayers, QueryTriggerInteraction.Ignore);
        }

        private void UpdateGrip(ref bool gripping, bool pinchPressed, Vector3 worldPos,
                                ref Vector3 anchorLocal, ref Vector3 worldPrev)
        {
            if (pinchPressed && !gripping && IsNearSurface(worldPos))
            {
                // Start grip — record anchor point on body
                gripping = true;
                anchorLocal = transform.InverseTransformPoint(worldPos);
                worldPrev = worldPos;
            }
            else if (!pinchPressed && gripping)
            {
                gripping = false;
            }
            worldPrev = worldPos;
        }
    }
}
