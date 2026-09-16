using System.IO;
using UnityEditor;
using UnityEngine;
using LuaJITMR;

namespace LuaJITMR.Editor.Settings
{
    /// <summary>
    /// Exposes <see cref="LuaJITMRSettings"/> in Unity's Project Settings window so developers
    /// don't have to hunt for the asset on disk.
    /// </summary>
    internal static class LuaJITMRSettingsProvider
    {
        private const string SettingsPath = "Project/LuaJITMR";
        private static LuaJITMRSettings _settings;
        private static UnityEditor.Editor _editor;

        public static LuaJITMRSettings Settings
        {
            get
            {
                if (_settings == null) _settings = LoadOrCreate();
                return _settings;
            }
        }

        [SettingsProvider]
        public static SettingsProvider CreateProvider()
        {
            var provider = new SettingsProvider(SettingsPath, SettingsScope.Project)
            {
                label = "LuaJITMR",
                keywords = new System.Collections.Generic.HashSet<string> { "LuaJITMR", "VR", "MR", "Cardboard", "XR", "ARCore", "WebXR" },
                guiHandler = (searchContext) =>
                {
                    var s = Settings;
                    if (s == null)
                    {
                        EditorGUILayout.HelpBox("Could not load or create LuaJITMRSettings asset.", MessageType.Error);
                        return;
                    }
                    if (_editor == null) _editor = UnityEditor.Editor.CreateEditor(s);
                    _editor.OnInspectorGUI();

                    EditorGUILayout.Space(12);
                    EditorGUILayout.BeginHorizontal();
                    if (GUILayout.Button("Open Setup Wizard", GUILayout.Height(28)))
                    {
                        Wizard.SetupWizard.Open();
                    }
                    if (GUILayout.Button("Validate Build Settings", GUILayout.Height(28)))
                    {
                        Build.AndroidBuildValidator.ValidateAndLog();
                        Build.WebGLBuildValidator.ValidateAndLog();
                    }
                    EditorGUILayout.EndHorizontal();
                }
            };
            return provider;
        }

        private static LuaJITMRSettings LoadOrCreate()
        {
            // Search the whole project for an existing settings asset.
            string[] guids = AssetDatabase.FindAssets("t:LuaJITMRSettings");
            if (guids.Length > 0)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[0]);
                return AssetDatabase.LoadAssetAtPath<LuaJITMRSettings>(path);
            }

            // Create a default one in the ProjectSettings folder of the package.
            const string folder = "Assets/LuaJITMR";
            if (!AssetDatabase.IsValidFolder(folder)) AssetDatabase.CreateFolder("Assets", "LuaJITMR");
            string assetPath = folder + "/LuaJITMRSettings.asset";
            var s = LuaJITMRSettings.CreateDefault();
            AssetDatabase.CreateAsset(s, assetPath);
            AssetDatabase.SaveAssets();
            Debug.Log($"[LuaJITMR] Created default settings asset at {assetPath}");
            return s;
        }
    }
}
