using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using LuaJITMR.Editor.Build;

namespace LuaJITMR.Editor.Wizard
{
    /// <summary>
    /// Editor window guiding the developer through one-time project setup (URP config,
    /// Android player settings, creating a sample XR rig).
    /// </summary>
    public class SetupWizard : EditorWindow
    {
        private Vector2 _scroll;
        private static SetupWizard _window;

        [MenuItem("Window/LuaJITMR/Setup Wizard")]
        public static void Open()
        {
            _window = GetWindow<SetupWizard>(true, "LuaJITMR Setup Wizard", true);
            _window.minSize = new Vector2(480, 520);
            _window.Show();
        }

        private void OnGUI()
        {
            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            EditorGUILayout.Space(8);
            DrawHeader();
            EditorGUILayout.Space(12);

            DrawSection("1. Render pipeline", CheckRenderPipeline, FixRenderPipeline);
            DrawSection("2. Android player settings", () =>
            {
                bool ok = true;
                if (PlayerSettings.Android.targetArchitectures != AndroidArchitecture.ARM64) ok = false;
                if (PlayerSettings.GetScriptingBackend(BuildTargetGroup.Android) != ScriptingImplementation.IL2CPP) ok = false;
                if ((int)PlayerSettings.Android.minSdkVersion < 26) ok = false;
                return ok;
            }, FixAndroid);
            DrawSection("3. Create XR Rig in active scene", CheckRigInScene, CreateRigInScene);
            DrawSection("4. Validate current build target", () =>
                EditorUserBuildSettings.activeBuildTarget == BuildTarget.Android || EditorUserBuildSettings.activeBuildTarget == BuildTarget.WebGL,
                () => { EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android); });

            EditorGUILayout.Space(12);
            if (GUILayout.Button("Run all fixes", GUILayout.Height(32)))
            {
                FixRenderPipeline(); FixAndroid(); CreateRigInScene();
                AndroidBuildValidator.ValidateAndLog();
                WebGLBuildValidator.ValidateAndLog();
            }

            EditorGUILayout.EndScrollView();
        }

        private void DrawHeader()
        {
            var style = new GUIStyle(EditorStyles.largeLabel) { fontSize = 22, fontStyle = FontStyle.Bold };
            EditorGUILayout.LabelField("LuaJITMR", style);
            EditorGUILayout.LabelField("com.aham.luajitmr — Mobile VR/MR Cardboard toolkit", EditorStyles.miniLabel);
        }

        private void DrawSection(string title, System.Func<bool> check, System.Action fix)
        {
            bool ok = false;
            try { ok = check(); } catch { ok = false; }
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);
            EditorGUILayout.BeginHorizontal();
            GUILayout.Label(ok ? "✔" : "⚠", new GUIStyle(EditorStyles.boldLabel) { normal = { textColor = ok ? new Color(0.2f,0.7f,0.3f) : new Color(0.9f,0.7f,0.1f) } }, GUILayout.Width(20));
            EditorGUILayout.LabelField(title, EditorStyles.boldLabel);
            GUILayout.FlexibleSpace();
            if (!ok && GUILayout.Button("Fix", GUILayout.Width(60))) { fix(); }
            EditorGUILayout.EndHorizontal();
            EditorGUILayout.EndVertical();
        }

        private bool CheckRenderPipeline() => UnityEngine.Rendering.GraphicsSettings.defaultRenderPipeline != null;
        private void FixRenderPipeline()
        {
            // Try to find any URP asset already in the project
            string[] guids = AssetDatabase.FindAssets("t:RenderPipelineAsset");
            if (guids.Length > 0)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[0]);
                var asset = AssetDatabase.LoadAssetAtPath<UnityEngine.Rendering.RenderPipelineAsset>(path);
                UnityEngine.Rendering.GraphicsSettings.defaultRenderPipeline = asset;
                QualitySettings.renderPipeline = asset;
                EditorUtility.SetDirty(UnityEngine.Rendering.GraphicsSettings.defaultRenderPipeline);
            }
            else
            {
                EditorUtility.DisplayDialog("URP asset not found",
                    "No URP asset found in your project. Install the Universal RP package (Window → Package Manager) and create a URP Asset (Create → Rendering → URP Asset), then run the wizard again.",
                    "OK");
            }
        }

        private void FixAndroid()
        {
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)26;
            PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)34;
            PlayerSettings.SetArchitecture(BuildTargetGroup.Android, 2 /* ARM64 */);
            PlayerSettings.colorSpace = ColorSpace.Linear;
            // Graphics APIs: Vulkan first, GLES3 fallback
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] {
                UnityEngine.Rendering.GraphicsDeviceType.Vulkan,
                UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3
            });
            PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)34;
        }

        private bool CheckRigInScene()
        {
            return Object.FindObjectOfType<LuaJITMRPlayer>() != null;
        }

        private void CreateRigInScene()
        {
            var scene = SceneManager.GetActiveScene();
            if (CheckRigInScene()) return;
            var go = new GameObject("LuaJITMR Rig");
            go.AddComponent<LuaJITMRPlayer>();
            var camGo = new GameObject("Head Camera");
            camGo.transform.SetParent(go.transform, false);
            var cam = camGo.AddComponent<Camera>();
            cam.tag = "MainCamera";
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;
            camGo.AddComponent<AudioListener>();
            var player = go.GetComponent<LuaJITMRPlayer>();
            player.targetCamera = cam;
            EditorSceneManager.MarkSceneDirty(scene);
            Selection.activeGameObject = go;
        }
    }
}
