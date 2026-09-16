namespace LuaJITMR
{
    /// <summary>
    /// XR rendering mode the rig operates in.
    /// </summary>
    public enum XRMode
    {
        /// <summary>
        /// Fully immersive virtual reality — black / skybox background, stereo rendering.
        /// </summary>
        VR = 0,

        /// <summary>
        /// Mixed reality passthrough — real camera feed as background, virtual content
        /// composited on top. Requires camera permission and ARCore support for full 6DoF.
        /// </summary>
        MR = 1
    }
}
