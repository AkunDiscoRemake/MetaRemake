using System.Runtime.CompilerServices;
using Unity.Mathematics;
using UnityEngine;
#if LUAJITMR_BURST
using Unity.Burst;
#endif

namespace LuaJITMR.Tracking
{
    /// <summary>
    /// One Euro Filter per scalar channel: low cutoff when idle (smooth), higher cutoff when
    /// moving fast (responsive). See: https://cristal.univ-lille.fr/~casiez/1euro/
    ///
    /// This struct is Burst-compiled and can be used for 3 axes of position and 4 axes of
    /// rotation (as quaternion log-space) without allocating per frame.
    /// </summary>
#if LUAJITMR_BURST
    [BurstCompile]
#endif
    public struct OneEuroFilter3
    {
        private OneEuroFilter _x, _y, _z;
        private bool _initialized;

        public void Init(in OneEuroFilterParams p)
        {
            _x = new OneEuroFilter(p.minCutoff, p.beta, p.derivativeCutoff);
            _y = new OneEuroFilter(p.minCutoff, p.beta, p.derivativeCutoff);
            _z = new OneEuroFilter(p.minCutoff, p.beta, p.derivativeCutoff);
            _initialized = false;
        }

        public Vector3 Filter(Vector3 sample, float dt)
        {
            if (!_initialized)
            {
                _x.Reset(sample.x); _y.Reset(sample.y); _z.Reset(sample.z);
                _initialized = true;
                return sample;
            }
            return new Vector3(_x.Filter(sample.x, dt), _y.Filter(sample.y, dt), _z.Filter(sample.z, dt));
        }

        public void Reset(Vector3 sample)
        {
            _x.Reset(sample.x); _y.Reset(sample.y); _z.Reset(sample.z);
            _initialized = true;
        }
    }

    public struct OneEuroFilter
    {
        private float _xPrev, _dXPrev;
        private readonly float _minCutoff;
        private readonly float _beta;
        private readonly float _dCutoff;
        private bool _first;

        public OneEuroFilter(float minCutoff, float beta, float dCutoff)
        {
            _minCutoff = minCutoff;
            _beta = beta;
            _dCutoff = dCutoff;
            _xPrev = 0f;
            _dXPrev = 0f;
            _first = true;
        }

        public void Reset(float x0)
        {
            _xPrev = x0;
            _dXPrev = 0f;
            _first = true;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float Filter(float x, float dt)
        {
            if (dt <= 0f) dt = 1e-4f;
            float dx = _first ? 0f : (x - _xPrev) / dt;
            _first = false;
            dx = Lowpass(dx, _dXPrev, Alpha(dt, _dCutoff));
            float cutoff = _minCutoff + _beta * math.abs(dx);
            float xf = Lowpass(x, _xPrev, Alpha(dt, cutoff));
            _xPrev = xf;
            _dXPrev = dx;
            return xf;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static float Alpha(float dt, float cutoff)
        {
            float tau = 1f / (2f * math.PI * cutoff);
            return 1f / (1f + tau / dt);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static float Lowpass(float x, float xPrev, float alpha) => alpha * x + (1f - alpha) * xPrev;
    }
}
