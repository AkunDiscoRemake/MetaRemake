using UnityEngine;

namespace LuaJITMR.UI
{
    /// <summary>
    /// Procedural UI audio feedback — generates short beep/blip tones at runtime without any
    /// binary audio assets, to keep the package small.
    /// </summary>
    public static class AudioFeedback
    {
        private static AudioSource _source;
        private static AudioClip _hoverClip;
        private static AudioClip _selectClip;
        private static AudioClip _errorClip;

        private static AudioSource Ensure()
        {
            if (_source != null) return _source;
            var go = new GameObject("[LuaJITMR] UI Audio") { hideFlags = HideFlags.HideAndDontSave };
            UnityEngine.Object.DontDestroyOnLoad(go);
            _source = go.AddComponent<AudioSource>();
            _source.playOnAwake = false;
            _source.spatialBlend = 0f;
            _source.volume = 0.3f;
            return _source;
        }

        public static void Hover() { Ensure(); PlayClip(ref _hoverClip, 880f, 0.04f, 0.15f); }
        public static void Select()
        {
            Ensure();
            PlayClip(ref _selectClip, 1320f, 0.08f, 0.35f);
        }
        public static void Error()
        {
            Ensure();
            PlayClip(ref _errorClip, 220f, 0.2f, 0.3f);
        }

        private static void PlayClip(ref AudioClip clip, float freq, float seconds, float volume)
        {
            if (clip == null) clip = MakeBeep(freq, seconds);
            _source.PlayOneShot(clip, volume);
        }

        private static AudioClip MakeBeep(float freqHz, float seconds)
        {
            int sr = 44100;
            int samples = Mathf.CeilToInt(sr * seconds);
            var data = new float[samples];
            for (int i = 0; i < samples; i++)
            {
                float t = i / (float)sr;
                float envelope = Mathf.Exp(-t * 8f); // quick decay
                data[i] = Mathf.Sin(2f * Mathf.PI * freqHz * t) * envelope * 0.5f;
            }
            var clip = AudioClip.Create($"beep_{freqHz}", samples, 1, sr, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
