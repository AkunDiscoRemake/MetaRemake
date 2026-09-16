using System.Collections.Generic;
using System.Text;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace LuaJITMR.Editor.Build
{
    internal sealed class AndroidBuildValidator : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;

        public void OnPreprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.Android) return;
            var issues = Validate(out var warnings);
            if (issues.Count > 0)
            {
                var sb = new StringBuilder();
                sb.AppendLine("LuaJITMR Android build issues found:");
                foreach (var i in issues) sb.AppendLine(" - " + i);
                throw new BuildFailedException(sb.ToString());
            }
            foreach (var w in warnings) Debug.LogWarning("[LuaJITMR][Build] " + w);
        }

        public static bool ValidateAndLog()
        {
            var issues = Validate(out var warnings);
            foreach (var i in issues) Debug.LogError("[LuaJITMR][Build] " + i);
            foreach (var w in warnings) Debug.LogWarning("[LuaJITMR][Build] " + w);
            if (issues.Count == 0) Debug.Log("[LuaJITMR][Build] Android configuration looks good");
            return issues.Count == 0;
        }

        private static List<string> Validate(out List<string> warnings)
        {
            var issues = new List<string>();
            warnings = new List<string>();

#if !UNITY_2023_1_OR_NEWER
            int minSdk = (int)PlayerSettings.Android.minSdkVersion;
#else
            int minSdk = PlayerSettings.Android.minSdkVersion == AndroidSdkVersions.AndroidApiLevelAuto ? 0 : (int)PlayerSettings.Android.minSdkVersion;
#endif
            if (minSdk != 0 && minSdk < 26)
                issues.Add($"Minimum Android SDK must be at least 26 (currently {minSdk}).");
            if ((PlayerSettings.Android.targetArchitectures & AndroidArchitecture.ARM64) == 0)
                issues.Add("ARM64 target architecture must be enabled.");
            if (PlayerSettings.GetScriptingBackend(BuildTargetGroup.Android) != ScriptingImplementation.IL2CPP)
                issues.Add("Scripting backend must be IL2CPP for Android.");

            if (PlayerSettings.colorSpace != ColorSpace.Linear)
                warnings.Add("Recommend Linear color space for correct URP lighting.");

            if (PlayerSettings.Android.targetSdkVersion < (AndroidSdkVersions)33)
                warnings.Add("Target SDK should be set to 33+ for Play Store compliance.");

            var rpAsset = GraphicsSettings.defaultRenderPipeline;
            if (rpAsset == null) warnings.Add("No URP asset assigned in Graphics Settings. LuaJITMR requires URP.");

            var apis = PlayerSettings.GetGraphicsAPIs(BuildTarget.Android);
            bool hasVulkan = false, hasGLES3 = false;
            foreach (var a in apis)
            {
                if (a == GraphicsDeviceType.Vulkan) hasVulkan = true;
                if (a == GraphicsDeviceType.OpenGLES3) hasGLES3 = true;
            }
            if (!hasVulkan && !hasGLES3)
                issues.Add("At least one of Vulkan or OpenGLES3 must be in Android Graphics APIs list.");
            if (apis.Length > 0 && apis[0] != GraphicsDeviceType.Vulkan)
                warnings.Add("Recommend moving Vulkan to the first position in Graphics APIs for better performance.");

            return issues;
        }
    }
}
