# MetaRemake

**Aplicativo Android nativo de Realidade Virtual estereoscópica para Google
Cardboard** — Kotlin (camada Android) + JavaScript (lógica da experiência VR).

A tela final é verdadeiramente estereoscópica: duas câmeras virtuais
independentes (olho esquerdo + olho direito), cada uma com sua própria projeção
*off-axis*, renderizadas lado a lado (Side-by-Side) com correção de distorção de
lente opcional. **Não** é um app 2D com câmera, nem duas cópias da mesma imagem
fingindo ser estereoscopia.

```
┌───────────────────────┬───────────────────────┐
│     OLHO ESQUERDO     │      OLHO DIREITO     │
│       VIEWPORT        │        VIEWPORT       │
│   câmera virtual L    │    câmera virtual R   │
│  projeção off-axis −  │   projeção off-axis + │
└───────────────────────┴───────────────────────┘
```

---

## Arquitetura

| Responsabilidade | Tecnologia | Onde fica |
|---|---|---|
| Renderização estereoscópica, câmeras, lentes | Kotlin (OpenGL ES 2.0) | `render/` |
| Head tracking (sensores + fusão + filtros) | Kotlin | `tracking/HeadTracker.kt` |
| Hand tracking (MediaPipe Hand Landmarker) | Kotlin | `tracking/HandTrackingEngine.kt` |
| Input unificado (mãos/toque/botão/teclas) | Kotlin | `input/` |
| Câmera (MR passthrough + hand tracking) | Kotlin | `camera/` |
| Apps Android dentro do VR | Kotlin | `apps/` |
| Janela / overlays | Kotlin | `overlay/` |
| Ponte Kotlin ↔ JavaScript | Kotlin | `bridge/NativeBridge.kt` |
| Lógica da experiência VR, cenas, UI, menus, estado, interação, matemática de posicionamento, aplicativos/experiências | **JavaScript** | `assets/js/` |

A separação é modular: a lógica VR vive em JavaScript e conversa com o Android
apenas através de `NativeBridge` (JSON). Mudanças de UI/experiência podem ser
feitas quase inteiramente em JS.

**Threads (isoladas):** Camera Thread · Tracking Thread · JS Logic (WebView) ·
VR Render Thread (GLSurfaceView) · Android Input. O thread de renderização nunca
é bloqueado.

---

## Renderização Cardboard

- Câmera virtual **esquerda** e **direita** (`StereoCamera`).
- Projeções *off-axis* assimétricas (eixos paralelos, sem *toe-in*).
- Renderização **Side-by-Side** com viewport independente por olho.
- FOV, IPD, aspect ratio, resolução e FPS **configuráveis** em runtime (JS → `VR.config`).
- Correção de distorção de lente (barrel) com render target por olho.
- Orientação guiada pelo head tracking, com baixa latência.
- Orientação **landscape** forçada (`AndroidManifest`).

---

## Head tracking

Prioridade: *rotation vector* → *game rotation vector* → giroscópio (integração,
fallback). Fusão + remapeamento para o referencial Cardboard, filtro **One Euro**
(anti-jitter, baixa latência), yaw/pitch/roll + quaternion + matriz de rotação,
**recenter** e atualização em alta frequência num thread dedicado.

## Hand tracking

**MediaPipe Hand Landmarker** (`hand_landmarker.task`), rastreamento **contínuo**
(não é só reconhecimento de gesto): 21 landmarks por mão, mão esquerda/direita,
confiança, pinça, velocidade, filtros **One Euro + Kalman**. A camada de
interação converte landmarks em eventos abstratos (apontar = ponteiro, pinça =
clique/drag, palma aberta = menu, onda = voltar, duas mãos = recenter).

## Input unificado

```
Hand Tracking ─┐
Touchscreen ───┤
Cardboard Button┤──► VR Input System ──► pointerMove / pointerDown / pointerUp
Bluetooth / keys┘                          / click / drag / scroll / back /
                                           select / recenter / trigger / menu
```

## Ambiente VR / Launcher / Experiências

O launcher é uma interface estereoscópica com elementos posicionados no espaço
(arco de painéis ao redor do usuário). Experiências inclusas: **Sala VR**,
**Visualizador 3D**, **Navegador VR**, **Galeria de imagens**, **Modo MR**,
**Demo de hand tracking**, **Demo de head tracking**, **Demo de ponteiro** e
**Painel de apps Android**.

## Apps Android dentro do VR

Pipeline (somente APIs públicas e autorizadas pelo usuário):

```
App Android → Captura autorizada (MediaProjection) → Frame → Textura OES
            → Superfície VR → Renderização estéreo (olho E + olho D)

Hand Tracking → Ponteiro VR → Coordenada na superfície → Coordenada Android
              → AccessibilityService (gestos autorizados)
```

Nenhum app de terceiros é modificado, injetado, descriptografado ou quebrado.
A interação usa exclusivamente `AccessibilityService` (gestos/taps autorizados).

> **Limitação real da plataforma (documentada):** o Android não oferece API
> pública para renderizar um app de terceiros *em segundo plano* dentro do seu
> contexto GL. O fluxo suportado captura a tela que o usuário autorizar via
> MediaProjection (ex.: o navegador aberto pelo app, ou apps que o usuário
> trouxer para frente) e a exibe como superfície VR, com interação via
> acessibilidade. Em dispositivos com Android 12L+ é possível estender para
> lançar atividades em um *virtual display* público (não incluído neste
> scaffold por ser dependente de dispositivo/OEM).

## Navegador VR / Modo MR

- **Navegador:** superfície VR + barra de endereço + voltar/avançar + favoritos
  + abas + cursor VR + teclado virtual + zoom por distância.
- **MR:** câmera traseira como fundo, objetos virtuais ancorados, hand tracking
  sobre a câmera, arrastar com pinça, opacidade configurável, recenter.

---

## Estrutura

```
app/src/main/
├── java/com/metaremake/vr/
│   ├── MainActivity.kt            (Activity/GLSurfaceView/WebView/pacer)
│   ├── runtime/VRRuntime.kt       (wiring)
│   ├── bridge/NativeBridge.kt     (ponte Kotlin ↔ JS, JSON)
│   ├── tracking/                  (HeadTracker, HandTrackingEngine, filtros)
│   ├── input/                     (InputHub, HandInputMapper, eventos, botão)
│   ├── render/                    (VRRenderer, StereoCamera, SceneGraph, GL)
│   ├── camera/                    (CameraManager, YuvToRgb)
│   ├── apps/                      (AccessibilityBridge, ScreenCapture*, launcher)
│   ├── overlay/                   (OverlayManager)
│   └── util/                      (Math3d, MLog)
├── assets/js/
│   ├── index.html                 (ordem de carga dos módulos)
│   ├── vr/        (namespace, config, scene, loop, entry)
│   ├── tracking/  (head-pose, hand-state)
│   ├── input/     (input-system, pointer, gestures)
│   ├── ui/        (widgets, keyboard, menus)
│   ├── apps/      (app-launcher)
│   ├── browser/   (browser)
│   ├── mr/        (mr)
│   └── experiences/ (launcher + demos)
├── assets/ml/hand_landmarker.task   (modelo MediaPipe — ver abaixo)
├── AndroidManifest.xml
└── res/
```

---

## Como compilar

1. **Modelo de mão (`hand_landmarker.task`)** — obrigatório para o hand
   tracking. O Gradle baixa/valida automaticamente, ou renomeia uma cópia
   `.txt` para `.task`:

   ```bash
   ./gradlew downloadHandLandmarker
   ```

   O arquivo **deve** se chamar `app/src/main/assets/ml/hand_landmarker.task`
   (extensão `.task`, **não** `.txt`). Veja `app/src/main/assets/ml/README.md`.

2. Build:

   ```bash
   ./gradlew assembleDebug
   ```

3. Após instalar: abra o app, coloque o celular num headset Cardboard. Dê as
   permissões quando solicitado (câmera para MR/hand tracking, captura de tela
   para "apps Android", serviço de acessibilidade para interagir com apps).

**Requisitos:** Android 8.0+ (minSdk 26), compile/target SDK 34, JDK 17, Gradle
8.7, Android Gradle Plugin 8.5.2.

## Observações de design

- A cena é **propriedade do JS**: o JS empurra nós (painéis/caixas/esferas/
  texto) num schema JSON e o renderer nativo desenha estereoscopicamente.
- O renderer mantém FBOs e buffers pré-alocados (zero alocação no loop quente),
  e o `HeadTracker` reutiliza buffers por evento de sensor (sem GC no caminho
  crítico).
- O `HeadTracker.recenter()` re-ancora o "para frente" do usuário; o cursor VR
  desenha ao longo do raio calculado no JS.
- `ScreenCaptureService` é um *foreground service* obrigatório no Android 14+
  para segurar a MediaProjection.
