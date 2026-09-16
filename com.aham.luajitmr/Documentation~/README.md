# LuaJITMR — `com.aham.luajitmr`

Turn any Android phone into a **6DoF VR / MR headset** with a Cardboard viewer, ARCore passthrough,
MediaPipe hand tracking, and a **WebXR runtime** so the same content runs in the browser.

- **Unity:** 2022.3 LTS+
- **Render pipeline:** URP 14+
- **Platforms:** Android (IL2CPP / ARM64 / OpenGL ES 3 + Vulkan), WebGL (WebXR)
- **Features:** 6DoF head tracking with automatic 3DoF fallback, barrel-distortion stereo,
  AR passthrough with depth occlusion, MediaPipe hand tracking (21 landmarks/hand, 5 gestures),
  curved glassmorphism UI system, WebXR export.

---

## Installation via Git URL

In the Unity Package Manager, select **+ → Add package from git URL**:

```
https://github.com/AkunDiscoRemake/MetaRemake.git?path=com.aham.luajitmr#arena/01a0a7e7-metaremake
```

Or add it directly to your `Packages/manifest.json`:

```json
{
  "dependencies": {
    "com.aham.luajitmr": "https://github.com/AkunDiscoRemake/MetaRemake.git?path=com.aham.luajitmr#arena/01a0a7e7-metaremake",
    "com.unity.render-pipelines.universal": "14.0.11",
    "com.unity.xr.arfoundation": "5.1.5",
    "com.unity.xr.arcore": "5.1.5"
  }
}
```

After installation, open **Window → LuaJITMR → Setup Wizard** and run the fixes.

---

## Quickstart (5 lines)

```csharp
using UnityEngine;
using LuaJITMR;

public class GameBootstrap : MonoBehaviour
{
    void Start()
    {
        // Drop LuaJITMRPlayer in the scene OR call Initialize manually.
        LuaJITMR.Initialize();                           // 1
        LuaJITMR.SetMode(XRMode.MR);                     // 2 — passthrough!
        LuaJITMR.Recenter();                             // 3
        var ray = LuaJITMR.GazeRay;                      // 4
        if (LuaJITMR.TriggerDown) Debug.Log("Select");   // 5
    }
}
```

Or even shorter: just add `LuaJITMRPlayer` to a GameObject in any scene. Press play. Done.

---

## Public API (summary)

| Namespace | API | Use |
|---|---|---|
| `LuaJITMR` | `Initialize(settings)` | Starts runtime (auto-called by LuaJITMRPlayer) |
| | `SetMode(XRMode.VR/MR)` | Switch between immersive VR and passthrough MR at runtime |
| | `Recenter()` | Re-orient forward direction |
| | `IsTracking`, `TrackingQuality`, `HeadPose` | Tracking state |
| | `Hands_Left`, `Hands_Right` → `IHand` | Access joint poses, pinch/grab strength, gesture events |
| | `GazeRay`, `TriggerDown`, `TriggerHeld`, `PrimaryButton` | Unified input |
| | `HapticPulse(amplitude, seconds)` | Vibration |
| | `PlaceAnchor(pose)` / `RaycastAgainstPlanes(ray)` | MR content anchoring |
| | `OnModeChanged`, `OnTrackingLost`, `OnGesture`, `OnCameraPermissionChanged` | Static events |
| `LuaJITMR.WebXR` | `EnterXRAsync(mode)`, `ExitXR()` | Browser session control |
| `LuaJITMR` (MonoBehaviour) | `LuaJITMRPlayer` | Drop-in rig; zero-code setup |
| | `MRAnchor` | Anchors a GameObject in the real world |

See `api-reference.md` for full details.

---

## Samples

Import them via Package Manager → LuaJITMR → Samples:

1. **01_HelloVR** — minimal VR scene with a floating cube you can dwell-select.
2. **02_MRPassthrough** — toggle VR⇄MR, place cubes on planes.
3. **03_HandInteraction** — pinch to grab & throw.
4. **04_UIShowcase** — curved world-space menu.
5. **05_WebXR** — same scene exported to WebGL.
6. **06_GorillaTag** 🆕 — Gorilla Tag-clone: arm-reach climbing, procedural obstacle course.
7. **07_BeatSaber** 🆕 — Beat Saber-clone: dual sabers, rhythm notes, score+combo, haptics.

---

## Performance targets

| Chipset | Target FPS | Hands | Depth | Chromatic |
|---|---|---|---|---|
| Snapdragon 8 gen 1+ (flagship) | 90 | ✔ (OpenXR or MediaPipe) | ✔ | ✔ |
| Snapdragon 7 / Dimensity 8-series | 72 | ✔ | ✔ | ✘ (Vulkan on) |
| Snapdragon 6 / Helio G | 60 | ✘ (gaze fallback) | ✘ | ✘ |
| Monado OpenXR runtime (Android/Linux) | 90 | ✔ (XR_EXT_hand_tracking) | ✔ | ✘ |

### Supported XR runtimes (Android)
| Runtime | Tracking | Hands | Passthrough |
|---|---|---|---|
| **OpenXR (Monado, Quest Link, SteamVR)** | 6DoF | 6DoF (XR_EXT_hand_tracking) | XR_FB_passthrough (v0.3) |
| **ARCore (Google Play Services for AR)** | 6DoF | 2D (MediaPipe) + depth lifting | ✔ (camera + Depth API) |
| **Gyro 3DoF fallback** | 3DoF | — | — |

All frame-loop hot paths are allocation-free (NativeArray + Burst). MediaPipe inference runs
on a background thread with a double-buffered result swap consumed on the main thread.

---

## Known limitations (v0.1.x)

- **MediaPipe AAR** is not shipped in-repo due to size (~30 MB); the package includes a download helper and falls back gracefully to gaze+dwell input when the AAR is absent. Full inference integration lands in v0.3.x.
- **Barrel distortion mesh warp** is currently a split-screen viewport; full warp shader + chromatic aberration URP Render Feature lands in v0.2.x.
- **Cardboard magnetic ring** is not supported (deprecated hardware). Supported triggers: screen tap, volume key, Bluetooth controller, pinch gesture.
- **Hand physics** uses lightweight capsule colliders on fingertips, not a full joint chain (too expensive for 72fps on mid-range Android).
- **ARCore Depth API** requires a supported device (Pixel 4+, Samsung S20+ or newer).
- **iOS** is out of scope — this package targets Android Cardboard and WebXR.

---

## License

MIT — see `LICENSE.md` in this folder.
