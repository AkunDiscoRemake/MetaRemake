using UnityEditor;
using UnityEngine;

namespace LuaJITMR.Editor.Settings
{
    /// <summary>
    /// Custom inspector for LuaJITMRSettings that draws a quick "Jump to Project Settings"
    /// button and surfaces the Setup Wizard.
    /// </summary>
    [CustomEditor(typeof(LuaJITMRSettings))]
    public class LuaJITMRSettingsEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            EditorGUILayout.HelpBox(
                "These settings are also available under Project Settings → LuaJITMR. " +
                "Use Window → LuaJITMR → Setup Wizard to configure the project for Android/VR builds.",
                MessageType.Info);
            if (GUILayout.Button("Open Project Settings → LuaJITMR", GUILayout.Height(24)))
                SettingsService.OpenProjectSettings("Project/LuaJITMR");
            if (GUILayout.Button("Open Setup Wizard", GUILayout.Height(24)))
                Wizard.SetupWizard.Open();
            EditorGUILayout.Space(8);
            DrawDefaultInspector();
        }
    }
}
