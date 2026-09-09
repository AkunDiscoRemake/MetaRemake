# Zentra XR

**Plataforma Cardboard VR / VR Box para Android.** Aplicativo nativo em Kotlin que
transforma um smartphone comum em um mini sistema operacional VR: hub espacial,
navegador, web apps, apps de mídia, três jogos e hand tracking por câmera — tudo
renderizado em estéreo Side-by-Side, em tempo real, com 3DoF.

> Tecnologia: **Smartphone + Cardboard/VR Box + SBS + 3DoF + câmera (MediaPipe) +
> Direct Touch.** Sem OpenXR, sem 6DoF, sem SLAM, sem passthrough, sem APKs externos.

---

## Destaques

- **SBS estereoscópico real** — dois viewports, duas câmeras virtuais com projeção
  off-axis, IPD e FOV configuráveis, inversão L/R, distorção barrel de lente e
  aberração cromática opcional.
- **UI 3D espacial** — nada de tela 2D plana: painéis, cartões, dock e janelas
  flutuantes posicionados em arco ao redor do usuário, com profundidade, sombras,
  glow e transições espaciais. Toda a interface é desenhada por um shader de
  distância assinada (SDF), o que mantém bordas perfeitas em qualquer distância.
- **3DoF por sensores** — vetor de rotação fundido (giroscópio + acelerômetro +
  magnetômetro), com fallbacks para *game rotation vector* e giroscópio puro.
- **Hand tracking por câmera** — MediaPipe Hand Landmarker na câmera traseira.
  A câmera existe **exclusivamente** para localizar a ponta do dedo. Nenhuma imagem
  é exibida: não há passthrough, AR ou mapeamento de ambiente.
- **Direct Touch** — apontar → tocar → clicar. O dedo é um ponto real no mundo
  virtual; a profundidade é estimada pelo tamanho da mão, então empurrar a mão
  "atravessa" a superfície e dispara o clique.
- **Filtros One Euro + Kalman** — jitter removido sem lag perceptível, com todos os
  parâmetros ajustáveis e throttling térmico da detecção.
- **Navegador VR completo** — WebView real renderizado em textura, barra de
  endereço, histórico, favoritos, zoom, fullscreen e teclado virtual 3D.
- **Web Apps** — salve qualquer site pelo navegador e ele aparece como um app na
  biblioteca do hub (continua rodando no navegador interno, sem APK).
- **3 jogos** (VR Target, VR Space, VR Blocks) e **9 apps** (Browser, Gallery,
  Video Player, Theater, Music Player, 3D Viewer, Clock, Demo, Settings).
- **Temas Dark e Light** — preto + branco e branco + preto, aplicados de forma
  consistente em todo o sistema, com cross-fade.
- **Thermal + Performance Manager** — resolução dinâmica, limite de FPS, redução da
  frequência do hand tracking e degradação de qualidade conforme a temperatura.

---

## Arquitetura

```
com.zentra.xr
├── core/        GL: meshes procedurais, shaders, texturas, framebuffer, math
├── xr/          Engine, VrRenderer (SBS), HeadTracker (3DoF), DirectTouch, Screen
├── tracking/    HandTracker (MediaPipe), CameraX, One Euro + Kalman, modelo
├── ui/          Widgets 3D, tema, ícones vetoriais, logo
├── screens/     Hub (launcher), janela de apps, onboarding
├── apps/        Browser, Gallery, Video, Theater, Music, Viewer, Clock, Demo, Settings
├── games/       Target, Space, Blocks
├── browser/     VrBrowser (WebView -> textura), WebAppStore, ícones de Web App
└── system/      Settings, ThermalManager, PerformanceManager, JsRuntime, DeviceStatus
```

Cada sistema é independente e o loop de frame é sempre:

```
sensores → hand tracking → filtros → direct touch → UI → render estéreo
```

**Otimizações:** nenhuma alocação no caminho quente (pilha de matrizes e vetores
pré-alocados), cache LRU de texturas de texto, geometria procedural (nenhum asset
binário além dos modelos OBJ de exemplo), render em FBO com resolução dinâmica,
throttling do hand tracking e atualização de UI uma vez por frame (não uma vez por olho).

---

## Compilando

O APK é gerado pelo **GitHub Actions** (`.github/workflows/build.yml`):

1. Faça push (ou abra um PR).
2. O workflow instala JDK 17 + Android SDK 35 e roda
   `gradle :app:assembleDebug :app:assembleRelease`.
3. Os APKs ficam em **Artifacts**: `ZentraXR-debug` e `ZentraXR-release`.
4. Tags `v*` publicam automaticamente uma release com o APK.

Para compilar localmente (precisa de JDK 17 e Android SDK):

```bash
curl -sSL -o /tmp/gradle.zip https://services.gradle.org/distributions/gradle-8.9-bin.zip
sudo unzip -q /tmp/gradle.zip -d /opt
gradle :app:assembleDebug
```

> O repositório não contém o `gradle-wrapper.jar`: use o Gradle do sistema ou rode
> `gradle wrapper` uma vez para gerá-lo.

### Modelo do MediaPipe

O modelo `hand_landmarker.task` é baixado em tempo de build para
`app/src/main/assets/models/`. Se o build estiver offline, o app continua
funcionando e o modelo pode ser instalado depois em **Settings → System →
Instalar modelo de mãos**.

---

## Como usar

1. Instale o APK, coloque o smartphone em um Cardboard/VR Box.
2. Primeira execução: logo → checagem de sensores → permissão da câmera → modo VR →
   calibração (olhe para frente) → tutorial de Direct Touch → hub.
3. No hub, use a dock para alternar **Home / Games / Apps / Web Apps / Browser /
   Settings**.
4. Para interagir: **aponte o dedo indicador para o elemento e toque** (empurre
   levemente a mão em direção à superfície). Sem câmera ou permissão, o ponteiro de
   olhar com dwell é ativado automaticamente.
   > O hand tracking usa a **câmera traseira** (ela fica voltada para frente, na
   > direção das suas mãos): o VR Box precisa deixar a lente livre pela janela
   > frontal. Se o seu óculos cobre a câmera, desative o hand tracking em
   > Settings → Tracking e use o ponteiro de olhar.
5. Calibre a qualquer momento pelo botão de recentrar na barra de status.

---

## Escopo (o que **não** está aqui)

OpenXR, 6DoF, SLAM, tracking espacial/posicional, passthrough, MR por câmera,
execução ou instalação de APKs externos e launchers de apps Android. Nada disso é
necessário — e nada disso é implementado — para a experiência Zentra XR.

---

## Build e APK

O build roda no **GitHub Actions** (`.github/workflows/build.yml`) a cada push:

```bash
gradle :app:assembleDebug :app:assembleRelease --no-daemon --stacktrace
```

- Artefatos: **`ZentraXR-debug`** e **`ZentraXR-release`** (o release é assinado com a
  chave de debug para poder ser instalado direto; troque o `signingConfig` para loja).
- O log completo de cada build é publicado no branch **`build-out`**
  (`gradle-build.log` + os APKs gerados), útil para depurar sem abrir o Actions.
- Requisitos: JDK 17 + Android SDK 35 (instalados pelo workflow).

