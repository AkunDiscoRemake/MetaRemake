using System.Collections.Generic;
using System.Text;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;

namespace LuaJITMR.Editor.Build
{
    internal sealed class WebGLBuildValidator : IPreprocessBuildWithReport
    {
        public int callbackOrder => 10;

        public void OnPreprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.WebGL) return;
            var issues = Validate(out var warnings);
            if (issues.Count > 0)
            {
                var sb = new StringBuilder();
                sb.AppendLine("LuaJITMR WebGL build issues found:");
                foreach (var i in issues) sb.AppendLine(" - " + i);
                throw new BuildFailedException(sb.ToString());
            }
            foreach (var w in warnings) Debug.LogWarning("[LuaJITMR][WebGL] " + w);
        }

        public static bool ValidateAndLog()
        {
            var issues = Validate(out var warnings);
            foreach (var i in issues) Debug.LogError("[LuaJITMR][WebGL] " + i);
            foreach (var w in warnings) Debug.LogWarning("[LuaJITMR][WebGL] " + w);
            if (issues.Count == 0) Debug.Log("[LuaJITMR][WebGL] WebGL configuration looks good");
            return issues.Count == 0;
        }

        private static List<string> Validate(out List<string> warnings)
        {
            var issues = new List<string>();
            warnings = new List<string>();

            if (PlayerSettings.WebGL.memorySize < 512)
                warnings.Add("WebGL memory size < 512MB may cause out-of-memory crashes with camera passthrough emulation.");

            if (PlayerSettings.graphicsJobs)
                warnings.Add("WebXR hand tracking may be unstable with Graphics Jobs enabled on some browsers.");

            return issues;
        }
    }
}
