# Changelog

All notable changes to **LuaJITMR** (`com.aham.luajitmr`) will be documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow SemVer.

## [0.2.0] - 2026-09-15

### Added
- **Vulkan-first graphics on Android.** Setup wizard now sets Vulkan as the primary graphics API with GLES3 fallback; tier detector rewards Vulkan by +2 points.
- **OpenXR runtime support (Monado).** New `OpenXRTrackingProvider` uses Unity's generic InputDevice API so it works with any OpenXR loader (Monado on Android, Quest Link, SteamVR) without a hard dependency on `com.unity.xr.openxr`. Selected automatically over ARCore when a Head device is present.
- **6DoF OpenXR hand tracking.** New `OpenXRHandProvider` uses XR_EXT_hand_tracking to deliver true 6DoF 21-joint poses (position+rotation) when an OpenXR runtime exposes hand data. Falls back to MediaPipe otherwise.
- **Depth Lab** (`MR.DepthLabManager`): async-GPU depth readback from ARCore environment depth texture, screen-point → world projection, plane raycast fallback, temporal smoothing on projected points. Used by hands for proper 3D landmark lifting.
- **Pinch → XRInput integration.** Hand pinch is now forwarded into the `XRInputRouter` so pinch selects UI / triggers actions uniformly with gaze-and-dwell and controllers.
- **Android haptics fully guarded.** AndroidJavaObject disposal fixed, SDK-version check, proper using-blocks to prevent JNI leaks.
- **Sample 06 — Gorilla Tag clone.** Gorilla-style arm-swimming locomotion, pinch-to-climb, jump-on-release, procedural obstacle course.
- **Sample 07 — Beat Saber clone.** Rhythm game with two colored sabers, per-beat note spawning, velocity-based slice detection, score/combo UI, slash effects, haptic feedback.
- **Memory-leak fixes in WebXRHandProvider** (NativeArray reuse instead of per-frame alloc).
- **Version bump workflow** on CI: increments patch version on push to arena branch.

### Fixed
- `KeyCode.VolumeUp/VolumeDown` removed from hot path (they don't exist on all Unity versions); trigger detection now relies on screen tap + gamepad + pinch + JNI-side volume-key bridge (planned).
- AndroidJavaObject disposal bug in `AndroidHaptics` — all `using` blocks correctly scoped to prevent JNI local-ref leaks.
- `ARSession.CheckAvailability` wrapped in try/catch and uses the synchronous `CheckAvailability()` API for broader Unity-version compatibility.
- NativeArray ownership clarified in `WebXRHandProvider` (no longer allocates new arrays per frame).
- `XRInputRouter` correctly tracks previous trigger state to avoid double-fires.

## [0.1.1] - 2026-09-15

### Added
- Initial package scaffolding, asmdefs, folder layout, Editor menu entries.
- Core public facade `LuaJITMR` static class with lifecycle, mode switching, tracking, hands, input, MR, and WebXR surfaces.
- `LuaJITMRPlayer` MonoBehaviour (zero-code drag-and-drop rig).
- `LuaJITMRSettings` ScriptableObject with Project Settings provider.
- Platform abstraction layer (`IXRTrackingProvider`, `IStereoRenderer`, `IHandTrackingProvider`, `IMRPassthrough`, `IXRInput`, `IWebXRBridge`) with compile-time platform selection.
- 3DoF gyro fallback tracking provider (`Gyro3DoFProvider`) with editor mouse-look.
- ARCore 6DoF tracking provider with automatic 3DoF fallback when ARCore is unsupported (and async install check).
- One Euro filter (Burst-compiled) and velocity-based pose predictor.
- Barrel-distortion stereo renderer scaffold (viewport split; warp mesh & chromatic aberration coming in v0.2.x).
- WebXR bridge via `luajitmr_webxr.jslib` (session request, viewer pose, hands, input, haptics).
- Null/Mono stubs for hand tracking, passthrough, and stereo for unsupported targets.
- MediaPipe hand provider stub (native AAR loaded on demand; gaze fallback when unavailable).
- XR input router fusing gaze, screen tap, gamepad, WebXR controller, and volume-key trigger.
- Android haptics via `VibrationEffect` on Android 8+; WebXR haptics via gamepad actuators.
- Android manifest merging in `Plugins/Android/AndroidManifest.xml` (CAMERA, VIBRATE, WAKE_LOCK, ARCore optional).
- WebGL HTML template with "Enter XR" button and magic-window fallback.
- Android & WebGL build validators (pre-build checks: IL2CPP, ARM64, minSdk 26, URP assigned).
- Setup wizard window (Window → LuaJITMR → Setup Wizard).
- GitHub Actions CI: version bump (patch), JSON validation, EditMode+PlayMode tests, Android IL2CPP/ARM64 build, WebGL build, GitHub Pages deploy.
- Android `ARCorePassthrough` provider (scaffold — ARCameraBackground + AROcclusionManager wired up when ARFoundations 5 is present).
- WebXR passthrough and stereo providers (browser handles rendering).
- `MRAnchor` MonoBehaviour for placing content in real-world space.
- `CardboardProfileQR` URI parser (protobuf-free decode of the viewer QR parameters).
- `LensProfile` ScriptableObject with distortion/FOV parameters and Newton inverse solver.
- Initial documentation (README, api-reference, LICENSE).

### Known limitations (0.1.x)
- MediaPipe Hands native AAR is not bundled; hand tracking falls back to gaze+dwell until v0.3.x.
- Barrel distortion warp mesh / URP Renderer Feature are scaffolded; stereo is split-screen only.
- Chromatic aberration, vignette, depth occlusion shaders not yet active.
- UI system (curved glassmorphism, reticle, screens) is queued for v0.2.x.
- Samples 02, 03, 04 are bootstrap scripts (functioning scenes coming in next minor bumps).

## [0.1.0] - 2026-09-15

- Initial repository scaffold and architecture document.

