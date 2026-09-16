using System.Runtime.CompilerServices;
using UnityEngine;

namespace LuaJITMR.Tracking
{
    /// <summary>
    /// Linear + angular velocity-based pose predictor. Extrapolates the latest head pose
    /// by a fixed time (typically 15-25 ms) to compensate for render latency.
    ///
    /// Position extrapolation is clamped (<see cref="MaxExtrapolationMeters"/>) to prevent
    /// runaway when ARCore pauses. Rotation is extrapolated via the exponential map so
    /// angular velocity around any axis is respected.
    /// </summary>
    public static class PosePredictor
    {
        public const float DefaultPredictSeconds = 0.018f;
        public const float MaxExtrapolationMeters = 0.05f;
        public const float MaxExtrapolationRadians = 0.15f; // ~8.6 degrees

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Pose Predict(Pose current, Vector3 linearVelocity, Vector3 angularVelocity, float secondsAhead)
        {
            if (secondsAhead <= 0f) return current;

            Vector3 p = current.position + linearVelocity * secondsAhead;
            float dist = Vector3.Distance(current.position, p);
            if (dist > MaxExtrapolationMeters)
                p = current.position + (p - current.position).normalized * MaxExtrapolationMeters;

            // Rotation — dq = exp(0.5 * omega * dt)
            Vector3 w = angularVelocity * secondsAhead;
            float wLen = w.magnitude;
            Quaternion dq;
            if (wLen > MaxExtrapolationRadians)
            {
                w = w.normalized * MaxExtrapolationRadians;
                wLen = MaxExtrapolationRadians;
            }
            if (wLen > 1e-6f)
            {
                float half = wLen * 0.5f;
                float s = Mathf.Sin(half) / wLen;
                dq = new Quaternion(w.x * s, w.y * s, w.z * s, Mathf.Cos(half));
            }
            else
            {
                dq = Quaternion.identity;
            }

            Quaternion q = dq * current.rotation;
            q.Normalize();
            return new Pose(p, q);
        }
    }
}
