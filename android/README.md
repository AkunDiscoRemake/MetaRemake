# Android shell do MetaPort

`MainActivity` abre um `WebView` que serve **todo o app** de `assets/www`
(`https://appassets.androidplatform.net/assets/www/index.html`) via
`WebViewAssetLoader`. Esse origin é *secure context*, então `getUserMedia`,
`localStorage`, WebGL2 e módulos ES funcionam sem servidor e **sem internet**.

O bundle em `app/src/main/assets/www/` é **gerado**, não versionado:

```bash
npm run build && npm run android:sync     # ou: npm run android:debug
cd android && ./gradlew assembleRelease
```

| pedaço | o que faz |
|---|---|
| `MainActivity.kt` | WebView + fullscreen imersivo, câmera liberada pro JS, volta = `shell.back()`, keepScreenOn, deep link `metaport://` |
| `MetaPortBridge.kt` | `window.MetaPortAndroid`: `vibrate`, `wakeLock`, `share`, `openUrl`, `setImmersive`, `screenshot`, `keepAwake`, `info` |
| `AndroidManifest.xml` | INTERNET, CAMERA, VIBRATE, WAKE_LOCK; `screenOrientation=fullSensor` (deixa o JS travar paisagem no VR Box) |

Sem Android SDK? Só o necessário: **JDK 17 + `ANDROID_HOME`**; o workflow
`.github/workflows/build-apk.yml` faz tudo isso na nuvem e sobe o `app-debug.apk`
como artefato (e release no tag).

## Coisas que só existem aqui
- `WebSettings.setMediaPlaybackRequiresUserGesture(false)` — áudio WebAudio liga sozinho.
- `onPermissionRequest` aceita `VIDEO_CAPTURE` (câmera = passthrough + MediaPipe) e
  `AUDIO_CAPTURE`, **sem** pedir permissão de runtime duplicada.
- `noCompress 'wasm','task'` no gradle — senão o MediaPipe tenta ler `.task` gzipado
  dentro do APK e quebra.
- Back físico: primeiro fecha a janela em foco (`MetaPortNative.back()`), depois sai.
