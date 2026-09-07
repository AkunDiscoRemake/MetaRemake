/**
 * Headless smoke test — no browser needed.
 *
 * Every app module is imported and driven against a recording 2D canvas: draw(),
 * tick(), onClick() for each region the draw registered, onDrag(), onBack(),
 * destroy(). Unknown DOM/ctx members throw, so typos and missing APIs surface here
 * instead of inside the headset.
 *
 *   node scripts/smoke.mjs
 */
const load = (p) => (p.startsWith('.') ? import(new URL(p, import.meta.url).href) : import(p));

const CALLS = new Map();
const CTX_KEYS = new Set([
  'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'clip', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'translate', 'rotate', 'scale', 'setTransform', 'resetTransform', 'transform', 'drawImage', 'putImageData', 'createLinearGradient', 'createRadialGradient', 'createPattern', 'measureText', 'getImageData', 'createImageData', 'setLineDash', 'getLineDash'
]);
const CTX_PROPS = new Set([
  'canvas', 'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'font', 'textAlign', 'textBaseline', 'globalAlpha', 'globalCompositeOperation', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'imageSmoothingEnabled', 'letterSpacing', 'direction', 'filter'
]);

function makeCtx(canvas) {
  const state = { canvas };
  for (const p of CTX_PROPS) state[p] = p === 'globalAlpha' ? 1 : p === 'lineWidth' ? 1 : '';
  const rec = (name) => CALLS.set(name, (CALLS.get(name) || 0) + 1);
  const grad = () => ({ addColorStop() {} });
  const impl = {
    save: () => rec('save'), restore: () => rec('restore'),
    measureText: (t) => ({ width: String(t).length * 7.2 }),
    createLinearGradient: grad, createRadialGradient: grad, createPattern: () => null,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getLineDash: () => []
  };
  for (const k of CTX_KEYS) if (!impl[k]) impl[k] = (...a) => { rec(`ctx.${k}`); return undefined; };
  return new Proxy(state, {
    get(t, k) {
      if (typeof k === 'symbol') return t[k];
      if (k in t) return t[k];
      if (k in impl) return impl[k];
      if (CTX_PROPS.has(k)) return t[k];
      throw new Error(`canvas ctx: membro desconhecido "${String(k)}"`);
    },
    set(t, k, v) {
      if (!CTX_PROPS.has(k)) throw new Error(`canvas ctx: propiedade desconhecida "${String(k)}"`);
      t[k] = v; return true;
    }
  });
}

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.style = new Proxy({}, { get: () => '', set: () => true });
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.dataset = {};
    this._listeners = {};
    this.width = 300; this.height = 150;
    this.textContent = '';
    this.hidden = false;
    this.value = '';
    this.files = null;
    this.readyState = 4;
    this.videoWidth = 1280; this.videoHeight = 720;
    this.volume = 1; this.paused = true; this.currentTime = 0; this.duration = 10;
  }
  getContext() { this._ctx ||= makeCtx(this); return this._ctx; }
  addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); }
  removeEventListener() {}
  dispatch(t, ev = {}) { (this._listeners[t] || []).forEach((f) => f({ preventDefault() {}, stopPropagation() {}, ...ev })); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  remove() { this.parentNode?.removeChild?.(this); }
  get firstChild() { return this.children[0] ?? null; }
  get lastChild() { return this.children.at(-1) ?? null; }
  setAttribute() {} getAttribute() { return null; }
  click() { this.dispatch('click'); }
  focus() {} blur() {}
  play() { return Promise.resolve(); } pause() {} load() {}
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; }
  get parentElement() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const els = new Map();
globalThis.document = {
  createElement: (t) => new FakeEl(t),
  createElementNS: (ns, t) => new FakeEl(t),
  getElementById: (id) => { if (!els.has(id)) els.set(id, new FakeEl('div')); return els.get(id); },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  body: new FakeEl('body'),
  documentElement: new FakeEl('html'),
  activeElement: null,
  exitFullscreen: () => Promise.resolve(),
  fullscreenElement: null
};
globalThis.Path2D = class Path2D { constructor(d) { this.d = d; } };
globalThis.Image = class Image { constructor() { this.width = 8; this.height = 8; } set src(v) { this._src = v; setTimeout(() => this.onload?.(), 0); } get src() { return this._src; } addEventListener() {} };
globalThis.self = globalThis;
const mem = new Map();
globalThis.localStorage = {
  get length() { return mem.size; },
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  clear: () => mem.clear()
};
const navStub = { vibrate: () => true, mediaDevices: undefined, userAgent: 'node', getGamepads: () => [], wakeLock: { request: async () => ({ release: async () => {} }) }, xr: undefined };
Object.defineProperty(globalThis, 'navigator', { value: navStub, writable: true, configurable: true });
const winProxy = new Proxy({
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  prompt: () => 'App de teste',
  AudioContext: undefined,
  location: { href: 'https://local.test/index.html', origin: 'https://local.test', pathname: '/index.html' },
  navigator: { vibrate: () => true, mediaDevices: undefined, userAgent: 'node' }
}, { get: (t, k) => (k in t ? t[k] : globalThis[k]), set: (t, k, v) => { t[k] = v; return true; } });
Object.defineProperty(globalThis, 'window', { value: winProxy, writable: true, configurable: true });
globalThis.location = window.location;
Object.defineProperty(globalThis, 'navigator', { value: navStub, writable: true, configurable: true });
globalThis.requestAnimationFrame = () => 1;
globalThis.addEventListener = () => {};
globalThis.setTimeout = globalThis.setTimeout || ((f) => { f(); return 1; });
globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => '', json: async () => ({}) });
globalThis.DOMParser = class { parseFromString() { return { body: { children: [] }, querySelector: () => null }; } };
globalThis.createImageBitmap = async () => ({ width: 320, height: 200, close() {} });
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.Blob = class Blob { constructor(p) { this.parts = p; } };

// ---------------------------------------------------------------------------
const { Emitter } = await load('../src/core/util.js');
const { Kit } = await load('../src/ui/kit.js');
const THREE = await load('three');
const settingsMod = await load('../src/core/settings.js');
const settings = { settings: settingsMod.settings, schema: settingsMod.schema };
const catalog = await load('../src/apps/catalog.js');
const api = await load('../src/core/api.js');

function mockPanel({ w = 1.5, h = 0.95 } = {}) {
  const designW = Math.round(w * 640), designH = Math.round(h * 640);
  const panel = {
    designW, designH, physW: w, physH: h, scroll: 0, contentH: designH, maxScroll: 0,
    state: { hover: null, down: null, focus: 0 }, regions: [], dirty: 0,
    markDirty() { this.dirty++; }, setDraw() {}, show() {}, focus() {},
    worldPos: new THREE.Vector3(0, 0, -1.8),
    group: new THREE.Group(), kit: null, dispose() {},
    locate() { return { x: 40, y: 40, local: { x: 40, y: 40 }, region: null }; }
  };
  panel.kit = new Kit(panel);
  return panel;
}

function mockEnv(extra = {}) {
  const bus = new Emitter();
  const scene = new THREE.Scene();
  const panel = extra.panel || mockPanel();
  const window_ = { content: { x: 14, y: 66, w: panel.designW - 28, h: panel.designH - 92 }, setTitle() {}, panel, id: 'w1', app: { id: 'x', name: 'X' }, tilt: 0, pos: new THREE.Vector3(0, 0, -1.8), _scale: 1, setScrollLimit() {} };
  const hands = {
    hands: [], active: false, status: 'idle', detail: '', fps: 0, delegate: 'CPU',
    update() {}, enable: async () => true, restart() {}, on: () => () => {},
    worldLandmark: (g, i, out) => (out || new THREE.Vector3()).set(Math.random(), Math.random(), -1),
    landmarkDepth: () => 2, handDepth: () => 2, twoHand: () => null
  };
  const view = { onEye: null, stereo: false, width: 1200, height: 800, stats: { fps: 60, res: '1200x800', draws: 12, tris: 5000 }, renderer: { capabilities: { isWebGL2: true }, domElement: new FakeEl('canvas') }, camera: new THREE.PerspectiveCamera(), rig: new THREE.Group(), setMode() {}, resize() {}, enterXR: async () => {} };
  const pointer = Object.assign(new Emitter(), {
    mode: 'mouse', pressed: false, hover: null, active: null, hitPoint: new THREE.Vector3(),
    raycaster: { ray: { origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), at: (d, o) => (o || new THREE.Vector3()).set(0, 0, -d) } },
    ray: { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) },
    addPanel() {}, removePanel() {}, register: () => () => {}, beginPress() {}, endPress() {}, scroll() {}, frontPanel: panel
  });
  const shell = {
    apps: new Map(), installed: new Set(), userApps: [], windows: [], focused: null, launcher: null,
    appList: [], frontTarget: new THREE.Vector3(0, 0, -1.85), makeScriptController: () => ({}),
    allCatalog: () => [...shell.apps.values()], register() {}, unregister() {}, openApp: async () => null,
    close() {}, minimize() {}, focus() {}, home() {}, back() {}, relayout() {}, layoutLauncher() {},
    setLauncherPresence() {}, snaps() {}, emit() {}, on: () => () => {}, off() {}
  };
  const world = { ping() {}, gridMat: { uniforms: { uTime: { value: 0 } } }, updateWall() {}, wall: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()) };
  const head = { quat: new THREE.Quaternion(), hasGyro: false, motion: 0, source: 'none', forward: (o = new THREE.Vector3()) => o.set(0, 0, -1), doRecenter() {} };
  const camFeed = { ready: false, width: 0, height: 0, aspect: 16 / 9, luma: 0.4, mirror: false, start: async () => false, stop() {}, video: new FakeEl('video') };
  const env = {
    bus, THREE, settings: settings.settings, store: { get: () => null, set: () => true, keys: () => [] }, audio: { ctx: null, tone() {}, haptic() {}, press() {}, ok() {}, error() {}, toggle() {}, swoosh() {}, open() {}, close() {}, hover() {}, release() {}, tap() {}, noise() {}, setListeningLevel() {} },
    scene, panel, window: window_, view, world, hands, pointer, shell, head, camera: camFeed,
    aura: { update() {} }, domlayer: null, HoloPanel: function () { return mockPanel(); },
    createScriptContext: (app) => api.createContext(app, env),
    runScript: (code, ctx) => api.runScript(code, ctx),
    animateObjects: (dt, t) => api.animateScriptObjects(dt, t),
    publishApp: (m) => api.publishApp(m, env),
    toggleMode: async () => {}, openExternal: () => true, screenshot: () => '',
    systembar: { update() {}, place() {}, panel: mockPanel() },
    ...extra
  };
  return env;
}

async function runApp(label, make, env, meta) {
  const errs = [];
  let ctrl = null;
  try {
    ctrl = await make(env, meta);
    if (!ctrl) throw new Error('make não retornou controller');
    ctrl.attach?.({});
    const panel = env.panel;
    const kit = panel.kit;
    for (let f = 0; f < 4; f++) {
      const ctx = panel.group && null;
      kit.begin(new FakeEl('canvas').getContext('2d'), panel.designW, panel.designH, panel.state, f * 0.3);
      kit.chromeOffset = panel.scroll;
      try {
        if (ctrl.chrome) ctrl.chrome(kit);
        panel.chromeFn = null;
        if (ctrl.draw) ctrl.draw(kit, f * 0.3);
      } catch (e) { errs.push(`draw#${f}: ${e.stack?.split('\n').slice(0,3).join(' <- ')}`); break; }
      const regions = kit.regions.slice();
      for (const r of regions) {
        try { ctrl.onClick?.(r, { x: r.x + 4, y: r.y + 4, region: r }); } catch (e) { errs.push(`click ${r.id}: ${e.stack?.split('\n')[0]}`); }
        try { ctrl.onDrag?.((r.data?.min ?? 0) + ((r.data?.max ?? 1) - (r.data?.min ?? 0)) * 0.5, r, panel); } catch (e) { errs.push(`drag ${r.id}: ${e.stack?.split('\n')[0]}`); }
        try { ctrl.onScroll?.(24); } catch (e) { errs.push(`scroll: ${e.stack?.split('\n')[0]}`); }
      }
      try { ctrl.tick?.(0.016, f * 0.3); } catch (e) { errs.push(`tick#${f}: ${e.stack?.split('\n').slice(0,3).join(' <- ')}`); break; }
      try { kit.ripple(10, 10, 4, '#fff', 0.4); kit.footer('ok'); kit.divider(0, 0, 100, {}); kit.list('l', 0, 0, 100, [{ a: 1 }], {}); kit.spark(0, 0, 100, 40, [0, 1, 0.5]); kit.keys('k', 0, 0, 300); } catch (e) { errs.push(`kit extras: ${e.stack?.split('\n')[0]}`); }
    }
    try { ctrl.onBack?.(); ctrl.onFocus?.(); ctrl.nav?.({ url: 'https://example.com' }); ctrl.wake?.(); } catch (e) { errs.push(`nav/back: ${e.stack?.split('\n')[0]}`); }
    try { ctrl.onDepth?.(0.6); ctrl.onHover?.('st:x'); ctrl.onMode?.('vrbox'); } catch (e) { errs.push(`extras: ${e.stack?.split('\n')[0]}`); }
    try { ctrl.destroy?.(); } catch (e) { errs.push(`destroy: ${e.stack?.split('\n')[0]}`); }
    return { label, regions: kit.regions.length, errs, ctrl, kit, panel };
  } catch (e) {
    return { label, regions: 0, errs: [`make: ${e.stack?.split('\n').slice(0, 2).join(' | ')}`] };
  }
}

const results = [];
// native apps (dynamic imports inside the catalog are resolved through vite normally)
const natives = {
  store: '../src/apps/store.js',
  browser: '../src/apps/browser.js',
  settings: '../src/apps/settingsApp.js',
  studio: '../src/apps/studio.js',
  player360: '../src/apps/player360.js',
  files: '../src/apps/files.js',
  paint3d: '../src/apps/paint3d.js',
  piano: '../src/apps/piano.js',
  runner: '../src/apps/runner.js',
  clock: '../src/apps/clock.js',
  docs: '../src/apps/docs.js',
  launcher: '../src/apps/launcher.js'
};
for (const [name, path] of Object.entries(natives)) {
  const mod = await load(path);
  const meta = catalog.APPS.find((a) => a.id === name) || { id: name, name, icon: 'grid', color: '#46f0d0', window: { width: 1.5, height: 0.95 } };
  const env = mockEnv();
  if (name === 'launcher') { env.shell.windows.push(env.window); env.shell.launcher = env.window; }
  results.push(await runApp(name, mod.make, env, meta));
}

// one port (web app in desktop form)
{
  const mod = await load('../src/apps/port.js');
  const meta = catalog.PORT_APPS[0];
  const env = mockEnv();
  env.shell.apps.set(meta.id, meta);
  results.push(await runApp(`port:${meta.name}`, (e) => mod.makePortController(meta, e), env, meta));
}

// system bar
{
  const mod = await load('../src/apps/systembar.js');
  const env = mockEnv();
  const bar = mod.makeSystemBar(env);
  const kit = bar.panel.kit;
  kit.begin(new FakeEl('canvas').getContext('2d'), bar.panel.designW, bar.panel.designH, bar.panel.state, 1);
  let errs = [];
  try { bar.panel.group.userData; const drawFn = bar.panel.constructor ? null : null; } catch (e) { errs.push(String(e)); }
  results.push({ label: 'systembar', regions: 0, errs });
}

// Script API: run every sample, then draw its panel
{
  const { SAMPLES } = await load('../src/apps/samples.js');
  SAMPLES.forEach((s, i) => {
    const env = mockEnv();
    const ctx = api.createContext({ id: `sample${i}`, name: s.name }, env);
    const ok = api.runScript(s.code, ctx);
    const errs = [];
    if (!ok) errs.push(`run: ${ctx.logs[ctx.logs.length - 1]?.line}`);
    for (const p of ctx.panels) {
      const kit = p.kit;
      kit.begin(new FakeEl('canvas').getContext('2d'), p.designW, p.designH, p.state, 0.5);
      try { p.drawFn?.(kit, p, 0.5); } catch (e) { errs.push(`draw: ${e.stack?.split('\n')[0]}`); }
      for (const r of kit.regions) { try { p.onClick?.(r, { x: 1, y: 1 }); } catch (e) { errs.push(`click ${r.id}: ${e.stack?.split('\n')[0]}`); } }
    }
    try { for (const fn of ctx.tickHooks) fn(0.016, 0.5); } catch (e) { errs.push(`tick: ${e.stack?.split('\n')[0]}`); }
    api.animateScriptObjects(0.016, 0.5);
    try { ctx.dispose(); } catch (e) { errs.push(`dispose: ${e.stack?.split('\n')[0]}`); }
    results.push({ label: `api:${s.name}`, regions: ctx.panels.length, errs });
  });
}

// renderer-agnostic math modules
{
  const gest = await load('../src/hands/gestures.js');
  const lm = Array.from({ length: 21 }, (_, i) => ({ x: 0.3 + (i % 5) * 0.05, y: 0.3 + Math.floor(i / 5) * 0.06, z: (i % 3) * 0.01 }));
  const errs = [];
  try {
    const g = gest.classify({ tipX: 0.3, tipY: 0.3, t: 0, pinch: false }, lm, null, { pinchThreshold: 0.3, pinchRelease: 0.46 });
    if (typeof g.pinch !== 'boolean') errs.push('pinch não booleano');
    const hull = gest.convexHull(lm.map((p) => [p.x, p.y]));
    if (hull.length < 3) errs.push('hull degenerado');
    const sm = gest.smoothClosedLoop(hull, 40);
    if (sm.length !== 40) errs.push(`smooth len ${sm.length}`);
    gest.offsetLoop(sm, 0.01, [0.4, 0.4]);
  } catch (e) { errs.push(e.stack?.split('\n')[0]); }
  results.push({ label: 'gestures', regions: 0, errs });
}

// engine modules: import-time sanity (no WebGL needed)
for (const m of ['../src/engine/view.js', '../src/engine/world.js', '../src/engine/pointer.js', '../src/engine/head.js', '../src/engine/camera.js', '../src/hands/tracker.js', '../src/hands/aura.js', '../src/ui/panel.js', '../src/ui/window.js', '../src/ui/domlayer.js', '../src/core/shell.js', '../src/core/audio.js']) {
  try { await load(m); results.push({ label: `import:${m.split('/').pop()}`, regions: 0, errs: [] }); }
  catch (e) { results.push({ label: `import:${m.split('/').pop()}`, regions: 0, errs: [e.stack?.split('\n').slice(0, 3).join(' <- ')] }); }
}

// -------------------------------------------------- hand contour geometry (NaN hunt)
{
  const { HandAura } = await load('../src/hands/aura.js');
  const { settings: S } = await load('../src/core/settings.js');
  const scene = new THREE.Scene();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  wall.scale.set(8, 4.5, 1);
  const camera = new THREE.PerspectiveCamera(78, 1.5, 0.02, 400);
  camera.position.set(0, 0, 0);
  const mkHand = (label, pinch) => {
    const lm = [];
    const palm = { x: 0.5, y: 0.6 };
    for (let i = 0; i < 21; i++) {
      const finger = Math.floor((i - 1) / 4);
      const step = (i - 1) % 4;
      const ang = (-0.5 + finger * 0.28) + (pinch && finger > 0 ? 0.1 : 0);
      const len = finger === 0 ? 0.1 : 0.06 + step * 0.028;
      lm.push({ x: palm.x + Math.sin(ang) * len + (pinch && finger === 1 ? 0.05 : 0), y: palm.y - Math.cos(ang) * len, z: (step - 1.5) * 0.01 });
    }
    if (pinch) { lm[4].x = lm[8].x - 0.004; lm[4].y = lm[8].y - 0.004; }
    return {
      label, lm, span: 0.16, pinch, pinchAmount: pinch ? 0.9 : 0.1, gap: pinch ? 0.1 : 0.7,
      center: { x: 0.5, y: 0.6, z: 0 }, pointer: { x: 0, y: 0, u: 0.5, v: 0.5 }, palmPointer: { x: 0.5, y: 0.6 },
      tip: lm[8], tipX: lm[8].x, tipY: lm[8].y, point: !pinch, open: false, grab: false, peace: false, thumbUp: false,
      fingers: [], extended: [], score: 0.9, normal: [0, 0, 1], velocity: { x: 0, y: 0, t: 0.016 }, speed: 0,
      disp: lm.map((p) => p.x)
    };
  };
  const tracker = {
    view: { camera, width: 1200, height: 800 },
    world: { wall },
    imageToWorld(u, v, depth = 0, out = new THREE.Vector3()) { return out.set((u - 0.5) * wall.scale.x, -(v - 0.5) * wall.scale.y, -6 + depth); },
    landmarkDepth: () => 0,
    worldLandmark(g, i, out) { return this.imageToWorld(g.disp[i], g.lm[i].y, this.landmarkDepth(g, g.lm[i]), out || new THREE.Vector3()); }
  };
  const errs = [];
  try {
    const aura = new HandAura(scene, tracker);
    for (let f = 0; f < 6; f++) aura.update(0.016, f * 0.016, [mkHand('Right', f > 2), mkHand('Left', false)]);
    const inst = [...aura.instances.values()];
    if (inst.length !== 2) errs.push(`esperava 2 instâncias, veio ${inst.length}`);
    for (const i of inst) {
      const pos = i.tubeGeo.attributes.position.array;
      let bad = 0, moved = 0;
      for (let k = 0; k < pos.length; k++) { if (!Number.isFinite(pos[k])) bad++; }
      for (let k = 0; k < pos.length; k += 3) { if (Math.abs(pos[k]) > 1e-4) moved++; }
      if (bad) errs.push(`${i.key}: ${bad} NaN/Inf na geometria do contorno`);
      if (moved < 100) errs.push(`${i.key}: contorno quase vazio (${moved} verts)`);
      const fp = i.fillGeo.attributes.position.array;
      for (let k = 0; k < fp.length; k++) if (!Number.isFinite(fp[k])) { errs.push(`${i.key}: NaN no fill`); break; }
      if (!(i.press >= 0)) errs.push(`${i.key}: press inválido`);
    }
    // style variants must not break
    for (const st of ['contour', 'ribbon', 'aura', 'skeleton']) {
      S.set('auraStyle', st);
      aura.update(0.016, 1, [mkHand('Right', true)]);
    }
    S.set('auraStyle', 'contour');
    // hands leaving the frame must fade out and dispose
    aura.update(0.016, 1.2, []);
    for (let f = 0; f < 80; f++) aura.update(0.016, 2 + f * 0.02, []);
    if (aura.instances.size) errs.push(`instâncias não liberadas: ${aura.instances.size}`);
  } catch (e) { errs.push(String(e.stack || e)); }
  results.push({ label: 'hands:contorno 3D', regions: 0, errs });
}

// -------------------------------------------------- pinch detection + gate hysteresis
{
  const gest = await load('../src/hands/gestures.js');
  const errs = [];
  const base = Array.from({ length: 21 }, (_, i) => ({ x: 0.4 + (i % 5) * 0.04, y: 0.4 + Math.floor(i / 5) * 0.05, z: 0 }));
  const far = base.map((p) => ({ ...p }));
  far[4].x = far[8].x + 0.35; far[4].y = far[8].y + 0.3;
  const near = base.map((p) => ({ ...p }));
  near[4].x = near[8].x + 0.005; near[4].y = near[8].y + 0.004;
  const cfg = { pinchThreshold: 0.3, pinchRelease: 0.46 };
  const gOpen = gest.classify(null, far, null, cfg);
  const gPinch = gest.classify({ tipX: 0.5, tipY: 0.5, t: 0, pinch: false }, near, null, cfg);
  if (gPinch.pinch !== true) errs.push('pinch fechado não detectado');
  if (gOpen.pinch === true) errs.push('mão aberta detectada como pinch');
  const held = gest.classify({ tipX: 0.5, tipY: 0.5, t: 0, pinch: true }, far.map((p, i) => (i === 4 ? { ...far[4], x: far[8].x + 0.2, y: far[8].y + 0.2 } : p)), null, cfg);
  if (held.pinch !== false) errs.push('histerese: pinch não soltou');
  if (!(gOpen.span > 0)) errs.push('span inválido');
  if (!gOpen.normal.every(Number.isFinite)) errs.push('normal da palma com NaN');
  results.push({ label: 'hands:pinch', regions: 0, errs });
}

// -------------------------------------------------- stereo pipeline contract
{
  const { View } = await load('../src/engine/view.js');
  const errs = [];
  try {
    // View needs a real WebGL context, so only the pure shader/geometry helpers are checked
    const { HeadTracker } = await load('../src/engine/head.js');
    const h = new HeadTracker();
    for (let i = 0; i < 30; i++) h.update(0.016);
    if (!Number.isFinite(h.quat.x + h.quat.y + h.quat.z + h.quat.w)) errs.push('quaternion do giroscópio com NaN');
    const f = h.forward(new THREE.Vector3());
    if (Math.abs(f.length() - 1) > 1e-3) errs.push('forward não unitário');
    h.doRecenter();
    const { PointerManager } = await load('../src/engine/pointer.js');
    results.push({ label: 'engine:head', regions: 0, errs });
  } catch (e) { results.push({ label: 'engine:head', regions: 0, errs: [e.stack?.split('\n').slice(0, 3).join(' <- ')] }); }
}

// -------------------------------------------------- API: toda a superfície documentada existe
{
  const errs = [];
  const env = mockEnv();
  const ctx = api.createContext({ id: 'user.doc', name: 'Doc' }, env);
  const MP = ctx.api;
  const paths = `version id name on off emit log warn error
ui.panel ui.setContentDraw ui.contentHeight ui.hud ui.icon ui.kit ui.palette
scene.add scene.spawn scene.place scene.animate scene.spin scene.lookAt scene.attachToPanel scene.remove scene.clear scene.objects scene.group scene.three
world.theme world.setTheme world.ping world.floorY world.setExposure world.fog
hands.count hands.list hands.all hands.get hands.on hands.worldLandmark hands.primary hands.available hands.point
input.mode input.ray input.onTap input.key
audio.tone audio.note audio.chord audio.noise audio.click audio.press audio.hover audio.release audio.ok audio.error audio.open audio.close audio.pinch audio.swoosh audio.toggle audio.ui audio.volume audio.ambient
haptic vibrate store storage.get storage.set storage.keys storage.clear
apps.list apps.open apps.close apps.home apps.publish apps.register apps.uninstall
shell.apps shell.installed shell.windows shell.front shell.open shell.close shell.home shell.focus shell.on
xr.mode xr.stereo xr.is xr.info xr.enterVRBox xr.enterMR xr.enterWebXR xr.toggleStereo xr.recenter
time.now time.frame time.after time.every after every interval tween
math.clamp math.lerp math.map math.rand math.noise math.hsv math.V3
util.uid util.formatBytes mode stereo`.split('\n').flatMap((l) => l.trim().split(/\s+/));
  for (const dotted of paths) {
    let cur = MP, ok = true;
    for (const part of dotted.split('.')) {
      if (cur == null || !(part in Object(cur))) { ok = false; break; }
      try { cur = cur[part]; } catch { ok = false; break; }
    }
    if (!ok) errs.push(`MP.${dotted} ausente`);
  }
  const kitMethods = `bg header text measure rr fillRR button iconButton toggle slider tabs card list stat progress chip field keys spark divider scrollbar gradient radial glow ripple footer region value values`.split(' ');
  for (const m of kitMethods) if (typeof Kit.prototype[m] !== 'function') errs.push(`kit.${m} ausente`);
  results.push({ label: 'api:superfície', regions: paths.length + kitMethods.length, errs });
}

// -------------------------------------------------- app módulo (formato publicado na Store)
{
  const errs = [];
  const SRC = `
export const meta = { id: 'user.doc', name: 'Contrário', icon: '\u25D1', color: '#a67bff', category: 'user', tagline: 'x', desc: 'y', version: '1.0.0', author: 'eu', size: [900, 560] };
export function validate(env) { return env.panel ? true : 'sem panel'; }
export function make(env) {
  const MP = env.MetaPort;
  let cube = null;
  return {
    draw(kit, t) {
      kit.bg(); kit.header('Contrário', 'ok'); kit.text('oi', 30, 150, { size: 26 });
      kit.button('cv:save', 30, 470, 200, 52, { label: 'salvar', variant: 'primary' });
      kit.slider('cv:glow', 250, 496, 300, { label: 'brilho', value: 0.5, min: 0, max: 2, step: 0.05 });
    },
    chrome(kit) { kit.text('chrome', 10, 10, {}); },
    onClick(id) { MP.store.set('last', id); MP.audio.click(); },
    onDrag(value, region) { MP.store.set('drag', [region.id, value]); },
    tick(dt, t) {
      if (!cube) cube = MP.scene.add({ type: 'box', size: 0.16, color: '#a67bff', glow: 0.7, pos: [0.34, 0.04, -1.25], spin: [0.2, 0.5, 0] });
      MP.store.set('probe', { objs: MP.scene.objects.length, sx: cube.scale.x, sz: cube.position.z, op: cube.material.opacity, spin: cube.rotation.y });
      MP.scene.animate(cube, { scale: 1.2, pos: [0, 0, -1.1], opacity: 0.8 }, { ms: 90, ease: 'back' });
      MP.scene.place(cube, { rot: [0.1, t, 0] });
      MP.scene.attachToPanel(cube, { z: 0.05 });
      MP.scene.spin(cube, { y: 0.4 });
      MP.scene.lookAt(cube, [0, 0, 0]);
    },
    onBack() { return false; },
    destroy() { MP.scene.clear(); }
  };
}`;
  const found = api.parseScriptMeta(SRC);
  if (found.id !== 'user.doc' || found.name !== 'Contrário' || found.icon !== '\u25D1') errs.push(`parseScriptMeta: ${JSON.stringify(found)}`);
  if (!found.module) errs.push('parseScriptMeta não marcou como módulo');
  if (!found.window || Math.round(found.window.width * 640) !== 900) errs.push(`size→window: ${JSON.stringify(found.window)}`);
  const ua = api.normalizeUserApp({ id: 'user.doc', name: 'Contrário', code: SRC, window: { width: 1.4, height: 0.875 } });
  const env = mockEnv();
  const res = await runApp('app:módulo publicado', (e) => ua.make(e), env, { id: 'user.doc' });
  errs.push(...res.errs);
  if (res.regions < 2) errs.push(`regiões: ${res.regions}`);
  const ctx = res.ctrl?._ctx;
  if (!ctx) errs.push('controller sem _ctx');
  else {
    const store = ctx.api.store;
    if (!['cv:save', 'cv:glow'].includes(store.get('last'))) errs.push(`storage.get: ${String(store.get('last'))}`);
    if (!Array.isArray(store.get('drag'))) errs.push('onDrag não gravou');
    else if (store.get('drag')[1] === undefined) errs.push('valor do drag ausente');
    const probe = store.get('probe');
    if (!probe || probe.objs < 1) errs.push(`scene.add/objects: ${JSON.stringify(probe)}`);
    if (probe && (!Number.isFinite(probe.sx) || !Number.isFinite(probe.sz) || !Number.isFinite(probe.op))) errs.push(`tween produziu não-finito: ${JSON.stringify(probe)}`);
    if (probe && !(probe.sx > 1 && probe.sx <= 1.2001)) errs.push(`tween de escala não andou: ${probe.sx}`);
    if (probe && !(Math.abs(probe.sz + 1.1) < 0.02)) errs.push(`tween de posição não andou: ${probe.sz}`);
    if (probe && !(probe.spin !== 0)) errs.push('spin() não girou o objeto');
    if (probe && !(probe.op <= 1.0001 && probe.op >= 0.799)) errs.push(`tween de opacity fora do alvo: ${probe.op}`);
    if (ctx.panels.length) errs.push(`painéis não liberados: ${ctx.panels.length}`);
    if (ctx.running) errs.push('ctx ainda rodando após destroy');
    if (ctx.objects.length) errs.push('scene.clear deixou objetos');
  }
  if (res.ctrl && res.ctrl.onBack?.() !== false) errs.push('onBack não consumiu o voltar');
  if (ctx) { try { animateCheck(); } catch (e) { errs.push(String(e.message)); } }
  function animateCheck() { /* tweens já rodaram dentro de tick */ }
  results.push({ label: 'app:módulo publicado', regions: res.regions, errs });
}

let fail = 0;
for (const r of results) {
  const bad = r.errs.filter(Boolean);
  if (bad.length) fail++;
  console.log(`${bad.length ? '✗' : '✓'} ${r.label.padEnd(26)} regiões:${String(r.regions).padStart(4)}  ${bad.length ? '' : 'ok'}`);
  for (const e of bad.slice(0, 4)) console.log(`    · ${e}`);
}
console.log(`\n${results.length - fail}/${results.length} módulos limpos · calls no ctx: ${[...CALLS.entries()].slice(0, 6).map(([k, v]) => `${k}=${v}`).join(' ')}`);
process.exit(fail ? 1 : 0);
