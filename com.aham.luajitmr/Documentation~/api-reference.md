# LuaJITMR API Reference

> Version: 0.1.x · Namespace: `LuaJITMR`

## Static Facade — `LuaJITMR`

All members are static. Initialize once at startup, after `Awake()` on your startup GameObject.

### Lifecycle
| Member | Description |
|---|---|
| `Initialize(LuaJITMRSettings config = null, Transform head = null, Camera headCamera = null)` | Starts tracking, stereo, hands, input. Creates cameras if not provided. |
| `Shutdown()` | Tears down all subsystems. Called automatically when `LuaJITMRPlayer` is destroyed. |
| `bool IsInitialized { get; }` | |

### Mode switching
| Member | Description |
|---|---|
| `XRMode CurrentMode { get; }` | `VR` (black/skybox, stereo) or `MR` (passthrough). |
| `void SetMode(XRMode mode)` | Runtime switch; raises `OnModeChanged`. |

### Tracking
| Member | Description |
|---|---|
| `bool IsTracking { get; }` | True when quality is at least `RotationOnly`. |
| `TrackingQuality TrackingQuality { get; }` | `None`, `RotationOnly`, `Limited`, `Full6DoF`. |
| `Pose HeadPose { get; }` | Current predicted head pose in world space. |
| `void Recenter()` | Re-anchors yaw forward. |
| `float WorldScale { get; set; }` | Global scale (1.0 = meters). |

### Hands
| Member | Description |
|---|---|
| `IHand Hands_Left { get; }` | Never null; check `IsTracked`. |
| `IHand Hands_Right { get; }` | Never null. |
| `bool HandsAreTracked { get; }` | True if either hand is detected. |

#### `IHand`
```csharp
Handedness Handedness { get; }
HandFrame Current { get; }          // snapshot with NativeArray<Pose> Joints[21]
bool IsTracked { get; }
bool IsPinching { get; }            // PinchStrength > 0.8
bool IsGrabbing { get; }            // GrabStrength > 0.7
float PinchStrength { get; }        // 0..1, thumb-tip to index-tip distance
float GrabStrength { get; }         // 0..1, finger-curl heuristic
Pose GetJoint(int mediapipeIndex);  // 0..20 — see HandJoint constants
event Action<Gesture> OnGestureStart;
event Action<Gesture> OnGestureEnd;
```

### Input
| Member | Description |
|---|---|
| `Ray GazeRay { get; }` | World ray from head center (or dominant hand pointer when hands are active). |
| `bool TriggerDown { get; }` | Edge-detected primary trigger (screen tap, controller A, volume key, pinch). |
| `bool TriggerHeld { get; }` | True while trigger is down. |
| `bool PrimaryButton { get; }` | Edge-detected menu/back button. |
| `void HapticPulse(float amplitude, float durationSec)` | Vibration. |

### MR (Passthrough)
| Member | Description |
|---|---|
| `bool PassthroughSupported { get; }` | ARCore or WebXR AR available. |
| `bool DepthOcclusionSupported { get; }` | Depth API present. |
| `bool PlaceAnchor(Pose pose, out MRAnchor anchor)` | Spawns a GameObject anchored at `pose`. |
| `bool RaycastAgainstPlanes(Ray, out Pose hit)` | Hits against detected planes (or fallback y=0 floor). |

### WebXR
| Member | Description |
|---|---|
| `bool IsWebXR { get; }` | True on WebGL builds. |
| `bool IsWebXRSessionActive { get; }` | |
| `Task<bool> EnterWebXRAsync(XRMode)` | Request immersive-vr/ar session. |
| `void ExitWebXR()` | |

### Events
```csharp
event Action<XRMode>  OnModeChanged;
event Action          OnTrackingLost;
event Action          OnTrackingRegained;
event Action<Handedness, Gesture> OnGesture;
event Action<PermissionState>     OnCameraPermissionChanged;
event Action<XRMode>  OnModeChangeFailed;  // e.g. MR requested but ARCore unavailable
```

---

## Components

### `LuaJITMRPlayer` — `MonoBehaviour`
Drop on a GameObject. Handles everything. Properties:

- `LuaJITMRSettings settings` — optional asset; defaults used if null.
- `XRMode startMode` — VR or MR.
- `Camera targetCamera` — if null, uses Camera.main.
- `UnityEvent onPreRender`, `onPostRender` — per-frame hooks.

### `MRAnchor` — `MonoBehaviour`
- `void Place()`, `void Place(Pose worldPose)`
- `void Release()`
- `AnchorTrackingState TrackingState` — `Unplaced/Localizing/Tracking/Lost`
- `event Action OnAnchorFound`, `OnAnchorLost`

### `LuaJITMRSettings` — `ScriptableObject`
Create via `Create → LuaJITMR → Settings`, or edit in **Project Settings → LuaJITMR**.
Fields grouped in inspector: Tracking, Stereo, Mixed Reality, Hand Tracking, UI, Performance.

---

## Enums
- `XRMode` — `VR`, `MR`
- `TrackingQuality` — `None`, `RotationOnly`, `Limited`, `Full6DoF`
- `Gesture` — `None`, `Pinch`, `Grab`, `Point`, `OpenPalm`, `ThumbsUp`
- `Handedness` — `Left`, `Right`
- `PermissionState` — `NotDetermined`, `UserPrompting`, `Granted`, `Denied`, `Restricted`
- `PerformanceTier` — `Low`, `Medium`, `High` (flags)

---

## Hand Joint Indices (`HandJoint` constants)
| Index | Name | | Index | Name |
|---|---|---|---|---|
| 0 | Wrist | | 11 | Middle DIP |
| 1 | Thumb CMC | | 12 | Middle Tip |
| 2 | Thumb MCP | | 13 | Ring MCP |
| 3 | Thumb IP | | 14 | Ring PIP |
| 4 | Thumb Tip | | 15 | Ring DIP |
| 5 | Index MCP | | 16 | Ring Tip |
| 6 | Index PIP | | 17 | Pinky MCP |
| 7 | Index DIP | | 18 | Pinky PIP |
| 8 | Index Tip | | 19 | Pinky DIP |
| 9 | Middle MCP | | 20 | Pinky Tip |
| 10 | Middle PIP | | | |
