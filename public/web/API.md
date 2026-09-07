# MetaPort API — SDK v1.0

Escreva apps para o MetaPort em JavaScript puro. Sem build, sem servidor, sem
iframe: seu código roda **dentro** do runtime, tem a cena 3D, as mãos, o áudio,
o storage e o shell nas mãos.

Abrangência: **Studio** (editar/rodar/publicar), **Store** (instalar apps da
comunidade), **Launcher** (o tile do seu app).

---

## 1. Duas formas de escrever

| | script simples | módulo `.js` |
|---|---|---|
| onde | Studio → Executar | arquivo `meu-app.js` → Store → instalar por arquivo |
| contexto | `MetaPort` global | `make(env)` com `panel`, `hands`… |
| UI | `MetaPort.ui.setContentDraw(fn)` | `return { draw(kit) {} }` |
| melhor para | protótipos, demos, 1 painel | apps com várias regiões, janelas, estado |

Os dois têm o **mesmo objeto `MetaPort`** (`MP`) a um clique de distância — no
módulo, via `env.MetaPort` / `env.api`.

### 1.1 Script simples (colar no Studio e apertar ▶)

```js
const p = MetaPort.ui.panel({ width: 0.9, curve: 0.3, title: 'Meu primeiro app' });
let n = 0;
p.draw((kit) => {
  kit.bg();
  kit.header('Contador de mãos', `${n} cliques`);
  kit.text(`Mãos visíveis: ${MetaPort.hands.count}`, 30, 130, { size: 34, weight: 800 });
  kit.button('meu:mais', 30, 220, 240, 58, { label: '+1 (pinch!)', icon: 'plus', variant: 'primary' });
  kit.button('meu:zera', 290, 220, 140, 58, { label: 'zerar', variant: 'ghost' });
});
p.onClick((e) => {
  const id = e.region?.id;
  if (id === 'meu:mais') { n++; MetaPort.audio.click(); }
  if (id === 'meu:zera') { n = 0; MetaPort.audio.error(); }
});
MetaPort.on('tick', () => { if (MetaPort.hands.count) MetaPort.ui.contentHeight(420); });
```

### 1.2 Módulo (arquivo `.js` com manifesto)

```js
// meu-app.js
export const meta = {
  id: 'user.contrario',
  name: 'Contrário',
  icon: '◑',
  color: '#a67bff',
  category: 'user',
  tagline: 'espelha o movimento das suas mãos em 3D',
  desc: 'Um cubo que rejeita o que a mão pede. Feito em 30 linhas.',
  version: '1.0.0',
  author: 'você',
  size: [900, 560]        // px de design do painel
};

export function make(env) {
  const { THREE, scene, hands, audio, store, settings, panel, shell } = env;
  const kit = panel.kit;

  let cube = null;
  let score = store.get('score', 0);

  function build() {
    cube = env.MetaPort.scene.add({
      type: 'box', size: 0.16, color: meta.color, glow: 0.7,
      pos: [0.34, 0.04, -1.25], spin: [0.2, 0.5, 0]
    });
  }
  build();

  return {
    draw(kit, t) {
      kit.bg();
      kit.header('Contrário', `pontos ${score}`);
      const h = MetaPort.hands.primary();
      kit.text(h ? `pinch: ${Math.round((1 - h.pinchAmount) * 100)}%` : 'mostre a mão', 30, 150, { size: 26 });
      kit.button('cv:save', 30, 470, 200, 52, { label: 'salvar', variant: 'primary' });
      kit.slider('cv:glow', 250, 496, 300, { label: 'brilho', value: settings.get('auraGlow'), min: 0, max: 2, step: 0.05 });
    },

    onClick(id) {
      if (id === 'cv:save') { store.set('score', score); audio.ok(); env.toast(`salvo: ${score}`); }
    },

    onDrag(value, region) {
      if (region?.id === 'cv:glow') settings.set('auraGlow', value);
    },

    tick(dt, t) {
      const h = MetaPort.hands.primary();
      if (!cube) return;
      // o cubo foge da mão — o "contrário"
      const want = h ? -h.pointer.x * 0.4 : 0;
      cube.position.x += (want - cube.position.x) * Math.min(1, dt * 6);
      cube.position.y = 0.04 + Math.sin(t * 1.4) * 0.02;
      score = Math.round(t * 10) % 1000;
    },

    destroy() { env.MetaPort.scene.clear(); }
  };
}
```

---

## 2. Ciclo de vida (módulo)

| hook | quando | assinatura |
|------|--------|------------|
| `make(env)` | janela criada | `function make(env)` → objeto de controle |
| `draw` | painel sujo / ~30 fps | `(kit, t)` — desenhe aqui |
| `chrome` | barra de título | `(kit)` — 64 px de altura no topo |
| `onClick` | pinch/toque/click numa região | `(id, region, panel)` |
| `onDrag` | slider/toggle arrastado | `(value, region, panel)` |
| `tick` | todo frame | `(dt, t)` |
| `onFocus` | virou a janela da frente | `()` |
| `onBack` | gesto ✌️ / Esc / botão voltar | retorne `false` para não fechar |
| `contentHeight` | mede o scroll | `get contentHeight() { return px }` |
| `destroy` | janela fechada | `()` — nada é obrigatório limpar via `MetaPort`, mas geometrias suas, sim |

O painel é curvo e vive no espaço: **nunca** use DOM para UI. `env.window` dá
`setTitle()`, `toggleMax()`, `minimize()`, `restore()`, `worldPos`.

---

## 3. `env`

`bus, THREE, settings, store, audio, scene, view, world, head, hands, aura,
pointer, domlayer, shell, camera, HoloPanel, PALETTE, hexA, clamp`, mais:
`app` / `meta` (a definição do app), `window` (HoloWindow), `panel`
(HoloPanel), `kit` (atalho para `panel.kit`), `toast(msg, kind)`, e o próprio
`MetaPort` como `env.MetaPort` / `env.api`.

Ferramentas de runtime: `env.createScriptContext(app)`, `env.runScript(code, ctx)`,
`env.animateObjects(dt, t)`, `env.publishApp(meta)`, `env.toggleMode()`,
`env.openExternal(url)`, `env.screenshot()` → dataURL PNG.

---

## 4. `MetaPort` — referência

### eventos
```
MP.on(type, fn) -> unsubscribe     type: 'draw' | 'tick' | 'frame' | 'click' | 'pinch' | 'hand' | 'window' | qualquer bus
MP.off()                           (use a função devolvida por on)
MP.emit(type, data)                → 'script:<appId>:<type>' no bus
MP.log/warn/error(...args)         vão para o console do Studio
```

### UI holográfica
```
MP.ui.panel({ width, height, designW, curve, color, title, text, x, y, z, yaw, draw, onClick, onDrag })
  → { handle, set(), draw(fn), text(str, style), onClick(fn), onDrag(fn), scroll(v),
      setContent(px), place(x,y,z,yaw), lookAt(v), lookAtHead(), setDepth(m), moveTo(x,y,z),
      show(bool), hide(), close(), dispose(), kit, w, h }
MP.ui.setContentDraw((kit, t) => {})   desenha dentro da janela do próprio app
MP.ui.contentHeight(px)                habilita scroll no conteúdo
MP.ui.hud('mensagem', ms)              toast espacial
MP.ui.icon('bolt', x, y, size, color)  nome de ícone do kit
MP.ui.kit / MP.ui.palette              a classe Kit e as cores do sistema
```

### widgets (`kit`, tudo em px de design; origem no canto superior esquerdo)
```
kit.bg(kind)                         kit.header(título, sub, {icon, right})
kit.text(str, x, y, { size, weight, color, align, baseline, maxWidth, lh, letterSpacing, glow, opacity })
kit.measure(str, size, weight)       kit.rr(x,y,w,h,r) / kit.fillRR(x,y,w,h,r,fill,stroke,lw)
kit.button(id,x,y,w,h,{ label, icon, variant:'primary'|'ghost'|'danger'|'ok'|'default', disabled, size, align, hint })
kit.iconButton(id,x,y,s,{ icon, variant, label })
kit.toggle(id,x,y,{ label, value, sub, w })
kit.slider(id,x,w,{ label, value, min, max, step, format, sub })
kit.tabs(id,x,w,{ items, current, size, h })
kit.card(id,x,y,w,h,{ title, sub, icon, accent, badge, right, selected, hoverable, footer, draw, rounded })
kit.list(id,x,y,w,rows,{ rowH, draw })
kit.stat(id,x,y,w,h,{ label, value, unit, icon, color, sub })
kit.progress(x,y,w,{ value, label, h, color })
kit.chip(x,y,label,{ color, size, pad, active, id })
kit.field(id,x,y,w,h,{ label, value, placeholder, focused, icon })
kit.keys(id,x,y,w,{ rows, size })     teclado holográfico (pinch nas teclas)
kit.spark(x,y,w,h,values,{ color, fill, min, max })
kit.divider(x,y,w,{ label })          kit.scrollbar(y,h,{ t, thumb })
kit.gradient(x0,y0,x1,y1,stops)       kit.radial(x,y,r0,r1,stops)      kit.glow(x,y,r,color,alpha)
kit.ripple(x,y,r,color,alpha)         kit.footer(texto, { icon })
kit.region({ id, x, y, w, h, data, draw(kit,x,y,w,h,{hot,active,…}), onClick })
```
Regiões são **o que o pinch encontra**: só o que tem `id` e foi registrado dentro
do `draw` é clicável. `kit.state.hover`, `kit.state.active` e `kit.value(id)`
ajudam a pintar o estado.

### cena 3D
```
MP.scene.add(spec) -> obj          spec = {
  type: 'box'|'sphere'|'torus'|'cylinder'|'cone'|'prism'|'ring'|'plane'|'line'|'points'|'beam'|'icon',
  size, color, emissive, glow, metal, rough, opacity, glass,
  pos:[x,y,z], rot:[x,y,z], scale, spin:[x,y,z], float:[amp,speed],
  points:[[x,y,z],…], icon:'star', length, sides, detail, ratio
}
MP.scene.spawn(spec)               apelido de add()
MP.scene.place(obj, { pos, rot, scale })
MP.scene.animate(obj, to, { ms, ease, onDone })   to = { pos, rot, scale, opacity, color }
MP.scene.spin(obj, { x, y, z })    MP.scene.lookAt(obj, [x,y,z] | Vector3)
MP.scene.attachToPanel(obj, { x, y, z })
MP.scene.remove(obj) / clear() / objects / group / three
obj.set({…})  obj.spin(x,y,z)  obj.float(amp,speed)  obj.onClick(fn)  obj.remove()
```

### mundo
```
MP.world.theme / setTheme('grid'|'void'|'sunset'|'ice'|'ember')
MP.world.ping(strength, pos?)      pulso na grade do chão
MP.world.floorY                    -1.52
MP.world.setExposure(v)            tonemapping
MP.world.fog(0.04 | null)
```

### mãos & entrada
```
MP.hands.count / list / all / primary() / get('Left') / available()
MP.hands.point(hand, 8) -> Vector3        ponto real no espaço (world landmarks)
MP.hands.worldLandmark(h, idx, out?)
MP.hands.on('hands', list => …)           1x por frame do tracker
MP.hands.on('pinch'|'click', fn)
MP.input.mode ('hand'|'touch'|'mouse'|'dwell'|'pad')
MP.input.ray() -> { origin:[x,y,z], dir:[x,y,z] }
MP.input.onTap(fn) / key(fn)
```
Cada mão (`list[i]`) traz `label, pinch, pinchAmount, gap, span, score, grab,
point, open, peace, thumbUp, pointer{u,v,x,y}, center, landmarks[21], _raw`.
`_raw.lm` / `_raw.disp` / `_raw.gestures` dão o resto se você precisar.

### som
```
MP.audio.tone(freq, dur, { type, gain, pos, detune, glide })
MP.audio.note(midi, dur, opts)      MP.audio.chord(root, dur, 'minor')
MP.audio.noise(dur, { gain, hp, pos })
MP.audio.click/press/hover/release/ok/error/open/close/pinch/swoosh/toggle(on,pos)
MP.audio.ui('hover', pos)           MP.audio.volume(0..1)   MP.audio.ambient(bool)
MP.haptic(ms) / MP.vibrate(ms)
```
`pos` é um `Vector3`-like **do mundo** → o som é panado/ateuado de verdade
(HRTF quando o navegador permite). Passe `obj.position` e o áudio segue o objeto.

### shell, apps, janela
```
MP.apps.list() / open(id, opts) / close() / home()
MP.apps.publish({ name, code, … })       publica na Store a partir do código atual
MP.apps.register(meta) / uninstall(id)
MP.shell.apps / installed / windows / front
MP.shell.open(id) / close(id) / home() / focus(id) / on(type, fn)
MP.xr.mode / stereo / is('vrbox') / info()
MP.xr.enterVRBox() / enterMR() / enterWebXR() / toggleStereo() / recenter()
MP.mode / MP.stereo                      leitura rápida
MP.on('mode'|'visibility'|…, fn)
```

### tempo, matemática, storage
```
MP.time.now()  frame(fn)  after(ms, fn)  every(ms, fn)
MP.after / MP.every / MP.interval / MP.tween(obj, to, {ms, ease})
MP.math.clamp/lerp/map/rand/noise/hsv/V3          MP.util.uid() / formatBytes(n)
MP.storage.get(k, fallback) / set(k, v) / keys() / clear()
MP.store  (apelido)
```
Tudo é guardado em `metaport:app:<seuId>` (um único JSON) — isolado por app, com
cota do `localStorage` do WebView (~5 MB por origin). Não guarde `blob:` URL nem
data URL grande: `blob:` morre no reload e `data:` estoura a cota — para mídia,
use os apps de arquivo (a galeria guarda metadados, não o conteúdo).

---

## 5. Publish e instalação

1. **Studio** → escreva o módulo → `💾 Salvar & Instalar`. O app entra no
   catálogo como `user`, ganha tile no Launcher e card na Store.
2. **Store → “⭳ instalar por arquivo .js”** (chip no rodapé das categorias; só no
   modo portátil, porque usa o seletor de arquivos do sistema): escolha `meu-app.js`.
   O manifesto (`export const meta`) é lido **sem executar** seu código — o `make`
   só roda quando a janela abre. Máximo 400 kB.
3. Desinstalar: Store → detalhes do app → Desinstalar. O storage do app continua lá;
   chame `MP.storage.clear()` no `destroy()` se quiser ser gentil.

Um app que lança `Error` no boot não abre: o MetaPort mostra o motivo no log do
Studio. Valide cedo com `export function validate(env)`.

---

## 6. Boas práticas (e limites honestos)

- **Pinch é pequeno.** Alvos ≥ 48×48 px de design, 14 px de fonte no mínimo.
- O painel é curvo e a lente distorce: nada importante a menos de 24 px da borda.
- `tick` roda no frame do render: mantenha < ~2 ms, sem alocar objeto novo a
  cada frame (reaproveite `Vector3`).
- Nada de `while`, `requestAnimationFrame` próprio ou `setInterval` de 1 ms —
  use `MP.time.every`/`on('tick')`; o contexto pausa quando a janela fecha.
- Você não tem acesso ao DOM no modo VR Box (nem aos outros apps, nem às
  variáveis globais além de `MetaPort`). `fetch` é permitido, mas o proxy do
  navegador pode falhar em sites com `X-Frame-Options`.
- Geometria/materiais criados à mão em `MP.scene.group` precisam de `dispose()`.
- O contexto do script é `'use strict'` e sem `with`; `import` dinâmico só no
  formato módulo.

---

## 7. Ponte nativa (Android)

Dois objetos, dois papéis:

**`window.MetaPortNative`** — fachada JS do sistema (existe sempre, dentro e fora do
APK; `MP.xr`, `MP.mode` e `MP.ui.hud` cobrem o mesmo chão de forma mais estável):
```js
MetaPortNative.info()               // { fps, stereo, hands, status }
MetaPortNative.mode('vrbox')        // troca de modo
MetaPortNative.recenter()           // re-centro do olhar
MetaPortNative.toggleStereo()
MetaPortNative.toast('oi', 'ok')    // toast 3D
MetaPortNative.resume() / pause()   // chamado pelo Android no ciclo de vida
MetaPortNative.openLink(url)        // abre no Browser do MetaPort (deep link)
MetaPortNative.share(url)           // share sheet
MetaPortNative.device()             // deviceInfo() do Android, já parseado
```

**`window.MetaPortAndroid`** — o `@JavascriptInterface` do APK (só existe lá):
`vibrate(ms)`, `keepAwake(bool)`, `setImmersive(0|1)`,
`setMode('handheld'|'vrbox'|'xr')`, `openUrl(url)`, `share(text)`, `toast(msg)`,
`deviceInfo()` (JSON), `hapticPulse(0..1)`, `consumePending()`, `relaunch()`.

O runtime usa isso sozinho (`env.openExternal`, imersiva no VR Box, deep link
`metaport://open?url=…`). Se for chamar direto, sempre com `?.` — fora do APK nada
disso existe:

```js
MP.on('click', () => window.MetaPortAndroid?.vibrate(24));
window.MetaPortAndroid?.keepAwake(true);
const info = JSON.parse(window.MetaPortAndroid?.deviceInfo?.() || '{}');   // { model, sdk, webView… }
```

---

## 8. Amostra completa: anel que segue a mão

```js
export const meta = { id: 'user.anel', name: 'Anel da Mão', icon: '◎', color: '#7ef9ff',
  category: 'user', tagline: 'contorno luminoso na sua mão', size: [640, 420] };

export function make(env) {
  const MP = env.MetaPort;
  let ring = null, hue = 0.52;
  return {
    draw(kit) {
      kit.bg();
      kit.header('Anel da Mão', MP.hands.count ? 'rastreando' : 'mostre a mão');
      kit.slider('anel:hue', 30, 300, 420, { label: 'matiz', value: hue, min: 0, max: 1, step: 0.01 });
      kit.text('o anel vive no mundo real, na sua mão', 30, 360, { size: 14, color: '#9fb8d0' });
    },
    onClick(id, region, panel) { panel.markDirty(); },
    onDrag(value, region) { if (region.id === 'anel:hue') hue = value; },
    tick(dt) {
      const h = MP.hands.primary();
      if (!h?._raw) return;
      const p = MP.hands.point(h, 9);
      if (!ring) ring = MP.scene.add({ type: 'torus', size: 0.12, color: MP.math.hsv(hue), glow: 1.2 });
      ring.position.lerp(p, Math.min(1, dt * 12));
      ring.scale.setScalar(1 + (h._raw.pinchAmount ?? 0) * 0.6);
      MP.audio.tone(200 + hue * 900, 0.04, { gain: 0.05, pos: p });
    },
    destroy() { MP.scene.clear(); }
  };
}
```
