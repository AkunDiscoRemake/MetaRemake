using Unity.Profiling;

namespace LuaJITMR.Core.Platform
{
    /// <summary>
    /// Implementors expose a <see cref="ProfilerMarker"/> so every subsystem is visible in the
    /// Unity Profiler under the "LuaJITMR/" category with zero-overhead when the profiler is closed.
    /// </summary>
    internal interface IProfiled
    {
        ProfilerMarker Marker { get; }
    }
}
