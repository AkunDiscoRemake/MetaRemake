# LuaJITMR — Architecture & Public API

> Package: `com.aham.luajitmr`  
> Targets: Android (IL2CPP, ARM64), WebGL (WebXR)  
> Unity: 2022.3 LTS+ / URP  
> Namespace: `LuaJITMR`

---

## 1. Module Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEVELOPER  PUBLIC  API                              │
│                                                                              │
│   LuaJITMR (static facade)     LuaJITMRSettings (SO)     LuaJITMRPlayer      │
│   ILuaJITMRSubsystem           IUIToggleProvider         (MonoBehaviour)     │
│   Events (static C# events)    XRMode enum               Prefabs             │
├─────────────────────────────────────────────────────────────────────────────┤
│                         CORE  LAYER  (Runtime/Core)                          │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ XRState      │  │ XRModeSwitch │  │ Lifecycle    │  │ ProfilerMarkers  │ │
│  │ Machine      │  │ Coordinator  │  │ Manager      │  │ (ProfilerMarker) │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────────────────┘ │
│         │                 │                 │                                │
├─────────┴─────────────────┴─────────────────┴────────────────────────────────┤
│                        PLATFORM ABSTRACTION LAYER                            │
│                                                                              │
│  IXRTrackingProvider       IStereoRenderer       IHandTrackingProvider       │
│  ├─ ARCoreTracking         ├─ BarrelMesh          ├─ MediaPipeHands          │
│  ├─ Gyro3DoF (fallback)    ├─ NullStereo(2D)      ├─ MLKitHands(alt)         │
│  └─ WebXRTracking          └─ WebXRStereo         └─ WebXRHands              │
│                                                                              │
│  IMRPassthrough            IXRInput              IWebXRBridge                │
│  ├─ ARCoreCameraBg         ├─ GazeInput          ├─ WebGL jslib impl        │
│  ├─ NullPassthrough        ├─ CardboardTrigger   └─ NullBridge(Android)     │
│  └─ WebXRARBackground      ├─ GamepadInput                                  │
│                             └─ WebXRInput                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                         FEATURE MODULES                                      │
│                                                                              │
│  Tracking/       Stereo/         Hands/          MR/            WebXR/       │
│  ├ TrackedPose   ├ LensProfile   ├ HandPose       ├ Passthrough  ├ WebXRInit │
│  ├ PosePredictor ├ Distortion    ├ HandRig        ├ PlaneManager ├ XRInputSrc│
│  ├ LateLatch     ├ Mesh          ├ GestureDetect  ├ DepthOccl    ├ JSLib     │
│  ├ OneEuroFilter ├ QRReader      ├ HandRaycaster  ├ LightEst     ├ HTMLPage  │
│  ├ Recenter      ├ Chromatic     ├ PhysicsHand    ├ Anchors      └ SessionMgmt│
│  └ TrackingState └ Vignette      └ SkinnedMesh    └ HitTest                   │
│                                                                              │
│  Input/           UI/                                                         │
│  ├ GazeReticle    ├ CurvedCanvas                                            │
│  ├ DwellTimer     ├ XRButton / XRToggle                                     │
│  ├ InputRouter    ├ GlassPanel (glassmorphism)                               │
│  └ Haptics        ├ GazeDwellHandler                                        │
│                    ├ PinchPokeInput                                          │
│                    ├ Screens (Main, Settings, TrackingLost, Permissions,    │
│                    │          GestureTutorial)                               │
│                    ├ TMPWrapper (angular-size)                               │
│                    └ Audio/UI feedback                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                       NATIVE / PLUGIN LAYER                                   │
│                                                                              │
│   Plugins/Android/     Plugins/WebGL/                                        │
│   ├ luajitmr-mediapipe.aar   └ luajitmr_webxr.jslib                          │
│   ├ libmediapipe_hands.so (arm64-v8a)                                        │
│   └─ Google Cardboard QR URI parser (managed code, no native)                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Package Layout (file tree)

```
com.aham.luajitmr/
├── package.json
├── Runtime/
│   ├── LuaJITMR.Runtime.asmdef
│   ├── Core/
│   │   ├── LuaJITMR.cs                  # static facade
│   │   ├── XRState.cs                   # enum + state machine
│   │   ├── XRMode.cs                    # VR / MR enum
│   │   ├── SubsystemManager.cs          # starts/stops providers
│   │   ├── LifecycleManager.cs          # Unity hooks
│   │   ├── XRSettings.cs                # ScriptableObject
│   │   ├── IProfiled.cs                 # profiler marker interface
│   │   └── Platform/
│   │       ├── IXRTrackingProvider.cs
│   │       ├── IStereoRenderer.cs
│   │       ├── IHandTrackingProvider.cs
│   │       ├── IMRPassthrough.cs
│   │       ├── IXRInput.cs
│   │       ├── IWebXRBridge.cs
│   │       └── PlatformSelector.cs      # picks impl at runtime
│   ├── Tracking/
│   │   ├── TrackedPoseDriver.cs         # replaces XR Plugin pose
│   │   ├── ARCoreTrackingProvider.cs
│   │   ├── Gyro3DoFProvider.cs
│   │   ├── WebXRTrackingProvider.cs
│   │   ├── PosePredictor.cs             # velocity-based extrapolation
│   │   ├── LateLatchUpdater.cs          # camera-relative pose on submit
│   │   ├── OneEuroFilter.cs             # per-axis, Burst-compiled
│   │   ├── RecenterController.cs
│   │   └── TrackingStateMonitor.cs      # lost/regained events
│   ├── Stereo/
│   │   ├── BarrelDistortionRenderer.cs  # URP Render Feature
│   │   ├── LensProfile.cs               # ScriptableObject
│   │   ├── CardboardProfileQR.cs        # URI parser (v1 cardboard URI)
│   │   ├── StereoRig.cs                 # left/eye cameras setup
│   │   ├── ChromaticAberration.cs
│   │   ├── VignetteEffect.cs
│   │   └── AutoTierDetector.cs          # GPU/SoC tier
│   ├── Hands/
│   │   ├── HandPose.cs                  # struct, NativeArray-friendly
│   │   ├── Handedness.cs
│   │   ├── GestureType.cs
│   │   ├── MediaPipeHandProvider.cs
│   │   ├── WebXRHandProvider.cs
│   │   ├── GestureDetector.cs           # pinch/grab/point/palm/thumbsup
│   │   ├── HandRig.cs                   # skinned mesh driver
│   │   ├── HandRaycaster.cs             # pinch ray
│   │   ├── PhysicsFinger.cs             # fingertip colliders
│   │   └── DoubleBuffer.cs              # thread-safe hand data swap
│   ├── MR/
│   │   ├── PassthroughManager.cs
│   │   ├── ARCorePassthrough.cs
│   │   ├── WebXRPassthrough.cs
│   │   ├── PlaneDetectionManager.cs
│   │   ├── DepthOcclusionManager.cs     # ARCore Depth + shader
│   │   ├── MRAnchor.cs
│   │   ├── LightEstimationUpdater.cs    # ambient color/intensity → URP
│   │   └── HitTestController.cs
│   ├── Input/
│   │   ├── XRInput.cs                   # GazeRay, Trigger, PrimaryButton
│   │   ├── GazeReticle.cs
│   │   ├── DwellInputHandler.cs
│   │   ├── CardboardTriggerInput.cs     # magnetic / touch / volume
│   │   ├── GamepadInput.cs              # bluetooth controller
│   │   ├── HapticsManager.cs            # Android vibration
│   │   └── WebXRInputSource.cs
│   ├── WebXR/
│   │   ├── WebXRManager.cs
│   │   ├── WebXRBridge.cs               # jslib bindings
│   │   ├── WebXRInputSourceMap.cs
│   │   └── WebXRSessionState.cs
│   └── UI/
│       ├── CurvedCanvas.cs              # world-space bend
│       ├── XRCanvasSafeArea.cs          # FOV-aware
│       ├── XRButton.cs                  # interactable (gaze + pinch + poke)
│       ├── GlassPanel.cs                # glassmorphism graphic
│       ├── XRReticle.cs                 # adaptive reticle
│       ├── Screens/
│       │   ├── MainMenuScreen.cs
│       │   ├── SettingsScreen.cs
│       │   ├── CameraPermissionScreen.cs
│       │   ├── TrackingLostScreen.cs
│       │   └── GestureTutorialScreen.cs
│       ├── TMPAngularSizer.cs           # text size by angular units
│       ├── AudioFeedback.cs             # UI sounds
│       └── UIPrefabs/                   # .prefab binaries described here
├── Editor/
│   ├── LuaJITMR.Editor.asmdef
│   ├── Settings/
│   │   ├── LuaJITMRSettingsProvider.cs  # Project Settings UI
│   │   └── LuaJITMRSettingsEditor.cs
│   ├── Build/
│   │   ├── AndroidBuildValidator.cs
│   │   └── WebGLBuildValidator.cs
│   ├── Wizard/
│   │   └── SetupWizard.cs
│   └── Prefabs/
│       └── PrefabBuilder.cs             # programmatically creates prefabs
├── Plugins/
│   ├── Android/
│   │   └── (placeholder .aar + README; MediaPipe bin referenced)
│   └── WebGL/
│       └── luajitmr_webxr.jslib
├── Samples~/
│   ├── 01_HelloVR/
│   │   └── Scenes/HelloVR.unity (described)
│   ├── 02_MRPassthrough/
│   ├── 03_HandInteraction/
│   ├── 04_UIShowcase/
│   └── 05_WebXR/
├── Tests/
│   ├── EditMode/
│   └── PlayMode/
└── Documentation~/
    ├── README.md
    ├── api-reference.md
    ├── CHANGELOG.md
    └── LICENSE.md
```

---

## 3. Public API Surface (developer-facing)

### 3.1 The Static Facade — `LuaJITMR`

```csharp
namespace LuaJITMR
{
    /// <summary>Entry point for all LuaJITMR functionality. Call Initialize() once at startup.</summary>
    public static class LuaJITMR
    {
        // ── Lifecycle ──────────────────────────────────────────────
        public static void Initialize(LuaJITMRConfig config = null);
        public static void Shutdown();
        public static bool IsInitialized { get; }

        // ── Mode switching ─────────────────────────────────────────
        public static XRMode CurrentMode { get; }
        public static void SetMode(XRMode mode);       // VR | MR

        // ── Tracking ───────────────────────────────────────────────
        public static bool IsTracking { get; }
        public static TrackingQuality TrackingQuality { get; } // Full6DoF | RotationOnly | Limited | None
        public static Pose HeadPose { get; }           // world-space, predicted
        public static void Recenter();
        public static float WorldScale { get; set; }   // default 1.0f

        // ── Hands ──────────────────────────────────────────────────
        public static IHand Hands_Left { get; }        // null if not tracked
        public static IHand Hands_Right { get; }       // null if not tracked
        public static bool HandsAreTracked { get; }

        // ── Input ──────────────────────────────────────────────────
        public static IXRInput Input { get; }
        public static Ray GazeRay => Input.GazeRay;
        public static bool TriggerDown => Input.TriggerDown;
        public static bool TriggerHeld => Input.TriggerHeld;
        public static bool PrimaryButton => Input.PrimaryButtonDown;

        // ── MR ─────────────────────────────────────────────────────
        public static bool PassthroughSupported { get; }
        public static bool DepthOcclusionSupported { get; }
        public static bool PlaceAnchor(Pose worldPose, out MRAnchor anchor);
        public static bool RaycastAgainstPlanes(Ray ray, out Pose hitPose);

        // ── WebXR helpers ──────────────────────────────────────────
        public static bool IsWebXR => WebXRManager.IsWebXR;
        public static bool IsWebXRSessionActive => WebXRManager.SessionActive;

        // ── Events ─────────────────────────────────────────────────
        public static event Action<XRMode>              OnModeChanged;
        public static event Action                      OnTrackingLost;
        public static event Action                      OnTrackingRegained;
        public static event Action<Handedness, Gesture> OnGesture;
        public static event Action<PermissionState>     OnCameraPermissionChanged;
        public static event Action<XRMode>              OnModeChangeFailed; // fallback
    }
}
```

### 3.2 Enums & Data Types

```csharp
namespace LuaJITMR
{
    public enum XRMode { VR, MR }

    public enum TrackingQuality { None, RotationOnly, Limited, Full6DoF }

    public enum Gesture { None, Pinch, Grab, Point, OpenPalm, ThumbsUp }

    public enum PermissionState { NotDetermined, Denied, Granted, Restricted }

    public enum Handedness { Left, Right }

    /// <summary>Lightweight pose + metadata snapshot for one hand.</summary>
    public readonly struct HandPose
    {
        public bool IsTracked { get; }
        public float Confidence { get; }
        public Pose PalmPose { get; }
        public NativeSlice<Pose> Joints { get; } // 21 MediaPipe landmarks world-space
        public Gesture CurrentGesture { get; }
        public float PinchStrength { get; }   // 0..1
        public float GrabStrength { get; }    // 0..1
    }

    public interface IHand
    {
        Handedness Handedness { get; }
        HandPose Current { get; }
        Pose GetJoint(int mediapipeIndex); // 0..20
        bool IsPinching { get; }
        bool IsGrabbing { get; }
        event Action<Gesture> OnGestureStart;
        event Action<Gesture> OnGestureEnd;
    }

    public interface IXRInput
    {
        Ray GazeRay { get; }
        bool TriggerDown { get; }
        bool TriggerHeld { get; }
        bool PrimaryButtonDown { get; }
        Vector2 Joystick { get; }
        void HapticPulse(float amplitude = 0.5f, float durationSec = 0.05f);
    }

    public interface IProfiled { ProfilerMarker Marker { get; } }
}
```

### 3.3 Configuration — `LuaJITMRConfig` & `LuaJITMRSettings` (ScriptableObject)

```csharp
namespace LuaJITMR
{
    [CreateAssetMenu(menuName = "LuaJITMR/Settings")]
    public class LuaJITMRSettings : ScriptableObject
    {
        // Tracking
        public TrackingQuality minimumTracking = TrackingQuality.RotationOnly;
        public float posePredictionMs = 18f;          // 0 disables
        public bool useLateLatching = true;
        public OneEuroFilterParams oneEuroFilter;      // beta, minCutoff
        public float worldScale = 1f;

        // Stereo
        public LensProfile lensProfile;               // Cardboard VR profile
        public float ipdMm = 63f;
        public bool autoDetectIPD = true;
        public bool chromaticAberration = false;
        public bool vignette = false;
        public bool autoTierGraphics = true;
        public StereoRenderMode stereoRenderMode = StereoRenderMode.SinglePassInstanced;

        // MR
        public bool enablePassthrough = false;
        public bool requestDepthApi = true;
        public bool planeDetection = true;
        public bool lightEstimation = true;

        // Hands
        public bool enableHandTracking = true;
        public float handDetectionConfidence = 0.6f;
        public bool handPhysicsColliders = true;
        public GestureTrackerConfig gestures;         // which gestures to detect

        // UI
        public float uiDistance = 2.0f;
        public float uiCurveRadius = 3.0f;
        public float dwellTimeSeconds = 1.2f;
        public bool hapticFeedback = true;
        public bool audioFeedback = true;
        public TMP_FontAsset defaultFont;

        // Performance
        public int targetFrameRate = 72;
        public bool useBurstFiltering = true;
    }

    public enum StereoRenderMode { SinglePassInstanced, MultiPass }
}
```

### 3.4 The Drag-and-Drop Component — `LuaJITMRPlayer`

```csharp
namespace LuaJITMR
{
    /// <summary>Drop this on a GameObject in any scene — zero-code setup.</summary>
    [DisallowMultipleComponent]
    public class LuaJITMRPlayer : MonoBehaviour
    {
        public LuaJITMRSettings settings;
        public XRMode startMode = XRMode.VR;
        public CameraEvent onPreRender;                // user hooks
        public CameraEvent onPostRender;

        // Auto-created at runtime if missing:
        //   - StereoRig (head + left/eye cameras)
        //   - TrackedPoseDriver on head
        //   - AR Session + AR Session Origin (Android)
        //   - BarrelDistortionRenderer URP Feature
        //   - Hand rigs (if enabled)
        //   - MR Passthrough layer (if enabled)
    }
}
```

### 3.5 MR Anchors

```csharp
namespace LuaJITMR
{
    /// <summary>Place on an empty GameObject to anchor it in real-world space.</summary>
    public class MRAnchor : MonoBehaviour
    {
        public bool attachToPlane = true;
        public TrackableType attachmentType = TrackableType.Planes;
        public AnchorTrackingState TrackingState { get; }
        public event Action OnAnchorFound;
        public event Action OnAnchorLost;
    }
}
```

---

## 4. Key Subsystem Interfaces (internal)

These are the **platform-abstraction contracts** that make the same API work on Android and WebGL without `#if` in user code:

```csharp
namespace LuaJITMR.Core.Platform
{
    internal interface IXRTrackingProvider : IDisposable, IProfiled
    {
        void Start();
        void Stop();
        TrackingQuality Quality { get; }
        Pose GetPredictedHeadPose(float predictAheadSec);
        Pose GetRawHeadPose();
        bool TryRecenter();
        event Action OnTrackingLost;
        event Action OnTrackingRegained;
    }

    internal interface IStereoRenderer : IDisposable
    {
        void Configure(LensProfile profile, float ipdMm, StereoRenderMode mode);
        void BeginFrame();
        void EndFrame();
        void SetChromaticAberration(bool enable);
        void SetVignette(bool enable);
        LensProfile LoadProfileFromQR(string cardboardUri);
    }

    internal interface IHandTrackingProvider : IDisposable, IProfiled
    {
        void Start();
        void Stop();
        bool IsReady { get; }
        void GetLatestHands(out HandPose left, out HandPose right);
        event Action<string> OnError;  // fires on model-load error, etc.
    }

    internal interface IMRPassthrough : IDisposable
    {
        void Enable();
        void Disable();
        bool IsActive { get; }
        bool DepthOcclusionSupported { get; }
        void EnableDepthOcclusion(bool enable);
    }

    internal interface IWebXRBridge
    {
        bool IsAvailable { get; }
        bool SessionActive { get; }
        Task<bool> RequestSessionAsync(XRMode mode, bool optionalFeatures);
        void EndSession();
        Pose GetHeadPose();
        HandPose? GetHand(Handedness h);
        event Action OnSessionEnded;
    }
}
```

`PlatformSelector` uses `#if UNITY_ANDROID` / `#if UNITY_WEBGL` compile-time switches to pick implementations **once** at initialization, then the facade talks to interfaces. User code never sees conditional compilation.

---

## 5. Data Flow Per Frame

```
┌────────────────────────────────────────────────────────────────┐
│  LATE UPDATE (main thread)                                     │
│  1. SubsystemManager.Tick()                                    │
│     ├ IXRTrackingProvider.GetPredictedHeadPose(dt)             │
│     │   └─ apply OneEuroFilter + PosePredictor                 │
│     ├ IHandTrackingProvider (worker thread already produced)    │
│     │   └─ swap double-buffer → HandPose snapshot             │
│     │   └─ GestureDetector.Evaluate() → fire events            │
│     ├ IXRInput.Sample()                                        │
│     │   └─ combine gaze + trigger + gamepad                    │
│     └ Passthrough/LightEst update                              │
│                                                                │
│  2. Apply pose to camera transform (LateLatch keeps it open)   │
│  3. UI raycasts update (gaze/pinch/poke)                       │
│  4. URP Rendering:                                             │
│     ├ MR: ARCameraBackground renders camera YUV                │
│     ├ Opaques → Transparents → DepthOcclusion (if MR+Depth)   │
│     └ After post: BarrelDistortionRenderer (combine eyes,     │
│        mesh-warp, chromatic, vignette)                        │
│  5. LateLatchUpdater: re-apply latest pose at submit time      │
│                                                                │
│  WORKER THREAD (background)                                    │
│  - MediaPipe inference: grab latest camera preview byte[]      │
│    → run model → write to double-buffer (front/back)           │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Rendering Approach

### Stereo
- **Single-pass instanced** on Android (two view/proj matrices per draw call).
- Two eye cameras (`LeftEye` / `RightEye`) as children of `Head` under `LuaJITMRPlayer`.
- A single URP `ScriptableRendererFeature` (`BarrelDistortionRenderer`) runs after post-processing:
  - Renders each eye's viewport into a temporary RT (`_LeftEyeTex`, `_RightEyeTex`).
  - Draws a barrel-distortion mesh (generated once at startup from `LensProfile`) that maps screen pixels back through lens distortion.
  - Applies optional chromatic-aberration UV offset per channel in the same shader.
  - Optional vignette baked into the mesh alpha.
- When running in-editor (non-Android, non-WebGL), falls back to a single camera (no stereo, no distortion) — developer can still iterate on game logic.

### MR Passthrough
- On Android: standard `ARCameraBackground` + optional `AROcclusionManager` (Depth API).
- Depth occlusion uses the ARCore environment depth texture in a URP Render Feature that writes depth before opaque geometry.
- On WebGL: WebXR `immersive-ar` session + `camera-access` feature → camera image via WebXR Layers.
- VR mode: solid black (or skybox) background.

---

## 7. Hand Tracking Threading Model

```
Camera preview (GPU texture)
        │
        ▼
┌──────────────────────┐   (main thread, early update)
│ Readback small ROI   │    → NativeArray<byte> (480×270 grayscale via GPU)
└─────────┬────────────┘
          │ queue
          ▼
┌──────────────────────┐   (background thread, BackgroundWorker Priority)
│ MediaPipe Hands GPU  │    → 21×2 landmarks normalized + handedness
│ delegate inference   │    → double-buffer write (Back buffer)
└─────────┬────────────┘
          │ atomic swap
          ▼
┌──────────────────────┐   (main thread, late update)
│ HandProcessor        │    → swap front/back if new data ready
│  - project via depth │    → project landmarks → world space using camera +
│    or plane pose     │      ARCore depth hit-test per landmark (or palm plane)
│  - OneEuro filter    │    → apply per-joint smoothing
│  - GestureDetector   │    → pinch (thumb-tip dist < 2cm), grab (finger curl),
│                        │      point (index ext, others flex), open palm,
│                        │      thumbs up (heuristic on bone angles)
└──────────────────────┘
```

When MediaPipe can't load / camera permission denied / ARCore depth unavailable, hand world positions fall back to estimated depth at **gaze ray intersection** so pinch still selects UI.

---

## 8. WebXR Bridge

`luajitmr_webxr.jslib` implements the browser side:

```js
// Functions exposed to C# via DllImport("__Internal"):
//   luajitmr_xr_is_supported() -> int (0/1 for vr, 2 for ar, 3 for both)
//   luajitmr_xr_request_session(mode) -> Promise (maps to C# Task via callback)
//   luajitmr_xr_end_session()
//   luajitmr_xr_get_view(ref position, ref rotation)  // head
//   luajitmr_xr_get_hand(handedness, jointsArrPtr)    // 21 * 7 floats (pos+rot)
//   luajitmr_xr_get_input(...)                         // controller/hands state
//
// Calls into Unity:
//   _luajitmr_on_session_started(mode)
//   _luajitmr_on_session_ended()
//   _luajitmr_on_frame()
```

The WebGL template includes a minimal HTML shell with "Enter XR" button, magic-window fallback (deviceorientation for 3DoF in browser without XR), and permission prompts.

---

## 9. Dependency Graph (asmdefs)

```
LuaJITMR.Editor ──→ LuaJITMR.Runtime ──→ Unity.XR.ARFoundation
                                       ├─ Unity.XR.ARCore
                                       ├─ Unity.RenderPipelines.Universal
                                       ├─ Unity.TextMeshPro
                                       ├─ Unity.Burst               (optional, checked)
                                       ├─ Unity.Collections         (for NativeArray)
                                       └─ Unity.Mathematics         (for burst filters)
```

- `asmdef` is set up with `autoReferenced = true` so user scripts can simply `using LuaJITMR;`.
- `Editor` asmdef references `Runtime` + `UnityEditor` + `Unity.RenderPipelines.Universal.Editor`.

---

## 10. Fallback Chain Summary

| Capability | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Tracking | ARCore 6DoF | WebXR 6DoF | Gyroscope 3DoF |
| Rendering | Single-pass instanced + barrel | Multi-pass + barrel | Single cam (editor) |
| Hands | MediaPipe (Android) / WebXR Hands | Gaze + dwell | Trigger button only |
| MR | ARCore + Depth | WebXR AR | VR only |
| Input | Pinch + hands | Gaze + dwell | Cardboard trigger / gamepad |
| Graphics | Full (chromatic + vignette) | Medium | Low (no post) |

Detection at startup:
- `SystemInfo.graphicsDeviceVendor` + Android `Build.SOC_MODEL` → tier.
- ARCore availability check via `ARCoreSession.CheckAvailability()`.
- WebXR support detected in JS via `navigator.xr.isSessionSupported()`.

---

## 11. Testing Strategy

- **EditMode tests**: OneEuroFilter stability, QR URI parsing, gesture-detector math, platform selector on given preprocessor symbols, `LuaJITMRSettings` defaults.
- **PlayMode tests** (with `[UnityTest]` coroutines): Initialize/Shutdown, mode switch VR→MR, recenter math, event wiring on facade, hand double-buffer swap, URP feature injection.
- Tests asmdef references: `LuaJITMR.Runtime`, `UnityEditor.TestRunner`, `UnityEngine.TestRunner`, `NUnit`.

---

## 12. Build / Manifest Requirements

`AndroidManifest.xml` (merged automatically from the package):
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera.ar" android:required="false" />
<uses-permission android:name="android.permission.VIBRATE" />
<!-- ARCore optional - minSdk 26, targetSdk 34 -->
<meta-data android:name="com.google.ar.core" android:value="optional" />
```

Build validator (in Editor) ensures:
- Minimum Android API level ≥ 26
- Target SDK ≥ current (34)
- IL2CPP + ARM64 enabled
- ARCore loader not present in XR Plug-in Management (we drive AR Foundation directly to avoid double-track)
- URP asset assigned with depth texture + Opaque Texture enabled
- Active Input Handling set to "Both" or "New Input System" (for WebXR gamepads)
- Camera permission description filled

---

## 13. Open Design Decisions Requiring Your Confirmation

1. **MediaPipe AAR shipping**: I'll include placeholders and a download helper in Editor (the full MediaPipe Hands AAR + tflite model is ~30MB and cannot be in a public repo). The package works without it (fallback to gaze). You OK with this?
2. **Barrel mesh vs distortion post-process**: Mesh-based is faster on mobile (single draw call per eye) and is the approach used by official Cardboard open-source. Approve?
3. **Hand physics**: I'll add configurable capsule colliders per fingertip and palm using `Physics.ComputePenetration` for lightweight interactions — not a full joint physics chain (too expensive on Snapdragon 7 for 72fps). OK?
4. **UI sounds**: I'll generate short procedural UI beeps via `AudioClip.Create` (no binary audio assets in package) so the package stays small. OK?
5. **Cardboard trigger**: The magnetic ring cannot be read from standard Android API without the native Cardboard SDK. I'll implement screen tap + volume-key + Bluetooth trigger as supported triggers, and document magnetic is deprecated. Approve?
6. **Single-pass instanced fallback on GLES3**: Some GLES3 drivers have bugs with SPI + stereo RT. I'll auto-detect and fall back to multi-pass on blacklisted GPUs (Mali-4xx, Adreno 5xx and below). OK?

---

**After your approval, I will generate files in this order:**
1. `package.json` + root asmdefs + folder scaffolding
2. Core (facade, settings, platform interfaces, platform selector)
3. Tracking module
4. Stereo rendering module + URP feature
5. Hands module (MediaPipe bridge + gesture detector + rig)
6. MR module (passthrough, planes, depth, light estimation)
7. Input module (gaze, trigger, gamepad, haptics)
8. WebXR module (jslib + manager + HTML template)
9. UI module (curved canvas, XRButton, screens, reticle, TMP sizing)
10. Editor (settings provider, build validator, setup wizard, prefab builder)
11. Samples (01_HelloVR, 03_HandInteraction, 04_UIShowcase) — as scene descriptions + bootstrap scripts
12. Tests (EditMode + key PlayMode)
13. Documentation
