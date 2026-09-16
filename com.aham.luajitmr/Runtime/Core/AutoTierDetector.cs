using UnityEngine;
using UnityEngine.Rendering;

namespace LuaJITMR.Core
{
    /// <summary>
    /// Detects SoC/GPU performance tier at startup. Heuristic, conservative — we'd rather
    /// classify a mid chip as Low (and disable expensive effects) than push it to 45 fps.
    /// </summary>
    internal static class AutoTierDetector
    {
        public static PerformanceTier Detect()
        {
            string gpu = SystemInfo.graphicsDeviceName ?? string.Empty;
            int vram = SystemInfo.graphicsMemorySize;
            int cores = SystemInfo.processorCount;
            int mem = SystemInfo.systemMemorySize;
            GraphicsDeviceType api = SystemInfo.graphicsDeviceType;

            int score = 0;
            if (vram >= 4096) score += 3;
            else if (vram >= 2048) score += 2;
            else score += 0;
            if (mem >= 6144) score += 2;
            else if (mem >= 3072) score += 1;
            if (cores >= 8) score += 2;
            else if (cores >= 4) score += 1;

            // Known low-end GPUs
            if (gpu.Contains("Mali-4") || gpu.Contains("Mali-T6") || gpu.Contains("Adreno (TM) 3") ||
                gpu.Contains("Adreno (TM) 4") || gpu.Contains("Adreno (TM) 50") ||
                gpu.Contains("Adreno (TM) 51") || gpu.Contains("PowerVR Rogue"))
            {
                score -= 3;
            }
            if (api == GraphicsDeviceType.OpenGLES3 && !SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBFloat))
                score -= 2;
            // Vulkan is generally faster on modern Android — reward it.
            if (api == GraphicsDeviceType.Vulkan) score += 2;

            if (score >= 5) return PerformanceTier.High;
            if (score >= 2) return PerformanceTier.Medium;
            return PerformanceTier.Low;
        }
    }
}
