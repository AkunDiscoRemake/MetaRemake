# MetaRemake — LuaJITMR `com.aham.luajitmr`

> **Android Cardboard VR/MR toolkit for Unity 2022.3 LTS+ (URP)**  
> 6DoF (ARCore) + 3DoF fallback, passthrough MR, MediaPipe hand tracking, WebXR export.

The Unity package lives at [`com.aham.luajitmr/`](./com.aham.luajitmr). Start there.

## Install

Add to your project's `Packages/manifest.json`:

```json
"com.aham.luajitmr": "https://github.com/AkunDiscoRemake/MetaRemake.git?path=com.aham.luajitmr#arena/01a0a7e7-metaremake"
```

Then open **Window → LuaJITMR → Setup Wizard** and run the fixes.

## 5-line Quickstart

```csharp
using LuaJITMR;

LuaJITMR.Initialize();           // or just add LuaJITMRPlayer to your scene
LuaJITMR.SetMode(XRMode.MR);     // passthrough
LuaJITMR.Recenter();
Ray r = LuaJITMR.GazeRay;
if (LuaJITMR.TriggerDown) { /* select */ }
```

See [`com.aham.luajitmr/Documentation~/README.md`](./com.aham.luajitmr/Documentation~/README.md) for full docs and [ARCHITECTURE.md](./ARCHITECTURE.md) for module design.

## CI

GitHub Actions (`.github/workflows/ci.yml`) handles:
- Automatic **patch version bump** on every push.
- JSON validation of package manifests.
- Unity test runner (EditMode + PlayMode) via `game-ci/unity-test-runner`.
- Android IL2CPP/ARM64 build (APK artifact).
- WebGL build (artifact + GitHub Pages deploy from `main`).

Secrets required: `UNITY_LICENSE` (from game-ci's activation).

## License

MIT — see `com.aham.luajitmr/Documentation~/LICENSE.md`.
