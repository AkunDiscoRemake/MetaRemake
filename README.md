# MetaPort (fanmade)

**Realidade mista no celular.** Um runtime 3D que abre em qualquer navegador, vira
**óculos VR Box** (estéreo side-by-side com lentes corrigidas), enxerga o mundo pela
câmera, desenha um **contorno luminoso em volta das suas mãos** e deixa você clicar
em tudo **juntando polegar e indicador**. Tem loja de apps, navegador, configurações,
ports web em janelas 3D — e uma **API de programação própria** para você publicar o
seu app dentro dela.

> Projeto de fã, sem vínculo com Meta, Oculus, VR Box ou MediaPipe. "VR Box" aqui é o
> estilo de óculos de encaixar o celular, não um produto homologado.

---

## Rodar em 30 segundos

```bash
npm install
npm run dev            # http://localhost:5173  → escolha "Realidade Mista" ou "VR Box"
```

Quer o app completo (com o modelo de mão embutido, offline):

```bash
npm run assets         # baixa MediaPipe WASM + hand_landmarker.task para public/
npm run build
npm run preview        # serve dist/ em http://localhost:4173
```

Fora de `localhost`, `getUserMedia` exige **https** (ou o APK, que já é secure context
por dentro do WebView).

## Virar APK pelo GitHub (recomendado)

O workflow **`.github/workflows/build-apk.yml`** faz o bundle web, baixa os assets,
sincroniza na pasta `assets/www` do projeto Android e compila o APK com Gradle.

1. Push na sua branch / tag `v*`.
2. *Actions → Build APK → Run workflow* (escolha `debug`, `release` ou `both`).
3. Baixe **MetaPort-APK-debug** do artefato do run (ou o `.apk` da release, se veio de tag).
4. No celular: instalar APK de fonte desconhecida → abrir → **permitir a câmera**.

Release assinada de verdade (Play Store) é opcional: crie os secrets
`METAPORT_KEYSTORE_B64`, `METAPORT_KEYSTORE_PASSWORD`, `METAPORT_KEY_ALIAS`,
`METAPORT_KEY_PASSWORD`. Sem eles, o `release` sai assinado com a debug key (sideload ok).

Compilar localmente (precisa de JDK 17 + Android SDK 34):

```bash
npm run android:debug      # build + sync + ./gradlew assembleDebug
# ou: npm run build && npm run android:sync && cd android && ./gradlew assembleRelease
```

---

## Como usar

| quero… | como |
|---|---|
| ver em modo óculos | botão **VR Box** na tela de entrada (ou tecla `V`) → encaixe o celular no óculos |
| ajustar ao meu rosto | *Configurações → Óculos*: IPD, separação das lentes, distorção, FOV, máscara de olhos |
| usar as mãos | *Configurações → Mãos* → ativar; mostre a mão para a câmera, **pinch** = clique |
| voltar / ir ao início | ✌️ = voltar, palma aberta = home, polegar para cima = menu de janelas |
| abrir um site | **Browser** (portas web abrem como janela 3D; no óculos vira Reader3D) |
| criar um app | **Studio** → `MetaPort.ui.panel(...)`, `MetaPort.scene.add(...)` → 💾 Salvar & Instalar |
| instalar um `.js` de alguém | **Store → ⭳ instalar por arquivo** (modo portátil) |
| tudo sem tocar | *Configurações → Mãos → dwell* (olhar parado = clique) e gamepad |

Teclado (útil no desktop): `Tab` início · `Esc` voltar · `V` trocar de modo ·
`R` recentrar olhar · `P` passthrough · `F` mãos · `1..5` apps diretos · `F1` tela de entrada.

---

## Arquitetura

```
src/
  core/      util (Emitter, toast) · storage (localStorage namespaceado) · settings (schema → Settings app)
             audio (WebAudio sintetizado + pan 3D) · api (SDK window.MetaPort) · shell (janelas, arcos, gestos)
  engine/    camera (getUserMedia único: passthrough + MediaPipe) · head (WebXR→giroscópio→arrasto)
             view (mono/SBS com barrel+chromatic/WebXR) · world (tema, parede de vídeo na frente da cabeça,
             grade, poeira, pilares) · pointer (raio do dedo → hit em painel/objeto)
  hands/     tracker (HandLandmarker, suavização, 21 pontos) · gestures (pinch/open/peace/thumbUp + histerese)
             aura (o CONTORNO em volta da mão: casca tubular aditiva + fresnel + faíscas nas pontas)
  ui/        kit (widgets desenhados em canvas) · panel (HoloPanel de vidro curvo com hit-test em px de design)
             window (HoloWindow: arrastar, profundidade, maximizar, minimizar) · domlayer (iframe projetado em 3D)
  apps/      launcher · store · settingsApp · browser · reader (Reader3D) · port (ports web) · studio
             player360 · files · paint3d · piano · runner · clock · docs · systembar
  main.js    boot por etapas, `enterMode()`, laço principal (cabeça → mãos → aura → ponteiro → painéis → render)
```

Cinco ideias sustentam tudo:

1. **Uma única captura de câmera** alimenta a parede de passthrough *e* o MediaPipe.
   Por isso o contorno bate pixel a pixel com a mão real, em qualquer modo.
2. **Nenhuma UI é 2D.** Painéis são geometria curva com textura de canvas; o ponteiro
   é um raio atirado pelo dedo; o clique é um gesto, não um `click` de DOM.
3. **VR Box = dois render targets + lente.** Cada olho renderiza em sua própria câmera
   deslocada por `ipd`, e a composição final aplica distorção/barrel, aberração
   cromática e a máscara de olhos em SVG — sem shader de óculos externo.
4. **O shell cuida do espaço**: janelas num arco na sua frente, com snap suave,
   empilhamento por foco, gesto de duas mãos para escalar, `PROFUNDIDADE` 0,9–5 m.
5. **Apps são cidadãos de primeira classe**: nativos, ports web e scripts da API entram
   no mesmo catálogo/loja e obedecem ao mesmo contrato (`make(env)` → `{ draw, onClick, tick, … }`).

## API própria

`window.MetaPort` (apelido `MP`) — painéis holográficos, cena 3D, mãos, áudio
espacial, shell, storage isolado, tempo, gestos. Um app é um arquivo `.js`:

```js
export const meta = { id: 'user.ola', name: 'Olá', icon: '✦', color: '#7ef9ff', size: [820, 520] };
export function make(env) {
  const MP = env.MetaPort;              // o SDK também chega por env.api
  return {
    draw(kit, t) {
      kit.bg(); kit.header('Olá, MR'); kit.text(`${MP.hands.count} mão(s)`, 30, 130, { size: 30 });
      kit.button('ola:boom', 30, 300, 240, 56, { label: 'explodir ✨', variant: 'primary' });
    },
    onClick(id) {
      if (id !== 'ola:boom') return;
      for (let i = 0; i < 120; i++) {
        MP.scene.add({
          type: 'sphere', size: 0.03 + Math.random() * 0.05,
          color: MP.math.hsv(Math.random()), glow: 1.4,
          pos: [(Math.random() - .5) * 1.2, (Math.random() - .5) * .8, -1.4 - Math.random()],
          spin: [0, .6, 0]
        });
      }
      MP.audio.chord(60, 1.1, 'minor');
      MP.ui.hud('✨');
    }
  };
}
```

Referência completa (14 seções, exemplos prontos): **dentro do app em
*Docs → API***, e no arquivo [`public/web/API.md`](public/web/API.md) (que o Studio e o
Browser também abrem em `web/docs.html`).

## Checar sem abrir o navegador

```bash
npm run check     # eslint + smoke headless + vite build
```

`scripts/smoke.mjs` monta um DOM/canvas falsos e **roda** os 12 apps nativos, os
ports, a barra do sistema, os 5 exemplos da API e o pipeline de mãos — clicando em
*todas* as regiões de *todos* os painéis, verificando NaN na malha do contorno,
histerese do pinch, geometria do painel curvo e a superfície documentada do SDK.
São 39 módulos verificados; qualquer exceção falha o job (e o CI roda isso antes de
compilar o APK).

## Limitações honestas

- HTML de terceiros **não** é estereo-visual no modo SBS: no óculos, ports e
  navegador usam o Reader3D (texto/imagem projetados em painel curvo) em vez de
  iframe; iframe real só no portátil e no WebXR.
- Hand tracking roda em CPU/GPU WebGL dentro do navegador: em aparelhos fracos o
  *quality* cai sozinho (adaptativo) e o `dwell` entra em cena como fallback.
- Sites com `X-Frame-Options`/CSP rígida não abrem em iframe — o navegador cai no
  Reader3D via proxy configurável (*Configurações → Rede*) ou em "abrir fora".
- Sem `SharedArrayBuffer`/thread extra: nada de worker por app de terceiros.

## Licença

MIT (código deste remake). Modelos e runtimes de terceiros mantêm suas próprias
licenças: three.js (MIT), MediaPipe Tasks (Apache-2.0), o modelo
`hand_landmarker` (Apache-2.0, Google). Conteúdo de sites abertos pertence a eles.
