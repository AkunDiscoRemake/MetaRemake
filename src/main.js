import * as THREE from 'three';
import { Emitter, toast, clamp } from './core/util.js';
import { settings } from './core/settings.js';
import { store } from './core/storage.js';
import { audio } from './core/audio.js';
import { View } from './engine/view.js';
import { World, THEMES } from './engine/world.js';
import { HeadTracker } from './engine/head.js';
import { camera as camFeed } from './engine/camera.js';
import { PointerManager, CursorFX } from './engine/pointer.js';
import { HandTracker } from './hands/tracker.js';
import { HandAura } from './hands/aura.js';
import { DomLayer } from './ui/domlayer.js';
import { HoloPanel } from './ui/panel.js';
import { Shell } from './core/shell.js';
import { DEFAULT_INSTALLED } from './apps/catalog.js';
import { makeSystemBar } from './apps/systembar.js';
import { createContext, runScript, animateScriptObjects, publishApp, normalizeUserApp, API_VERSION } from './core/api.js';

/** Global runtime handle (also what the Script API sees through MetaPortDev). */
const bus = new Emitter();
const META = {
  version: '1.0.0',
  api: API_VERSION,
  bus,
  ready: false,
  t: 0,
  frames: 0
};
globalThis.META = META;

const boot = {
  el: document.getElementById('boot'),
  status: document.getElementById('boot-status'),
  bar: document.getElementById('boot-progress'),
  error: document.getElementById('boot-error')
};
const say = (msg, p = 0) => {
  if (boot.status) boot.status.textContent = msg;
  if (boot.bar && p) boot.bar.style.width = `${Math.round(p * 100)}%`;
};
const fail = (e) => {
  console.error(e);
  if (boot.error) {
    boot.error.hidden = false;
    boot.error.textContent = `${e?.name || 'Erro'}: ${e?.message || e}\n\nSe aparecer "Failed to fetch module", o MetaPort precisa ser aberto por um servidor local (ou pelo APK).`;
  }
};

let view, world, head, hands, aura, pointer, cursor, domlayer, shell, systembar;
let scene, rig, last = performance.now(), dt = 0, acc = 0;
let lowFps = 0, running = false, xrSupported = false;

async function bootup() {
  try {
    say('criando cena e pipeline estéreo…', 0.12);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040814, 0.012);
    view = new View(document.getElementById('gl-root'), scene);
    world = new World(scene, view);
    head = new HeadTracker();
    head.attach(view.renderer.domElement);

    say('configurando rastreamento de mãos…', 0.32);
    hands = new HandTracker(view, world);
    aura = new HandAura(scene, hands);
    pointer = new PointerManager(view, hands);
    cursor = new CursorFX(scene, pointer, world);
    domlayer = new DomLayer(view, world);

    say('montando shell e launcher…', 0.52);
    if (!settings.get('installed')?.length) settings.set('installed', DEFAULT_INSTALLED);
    const env = buildEnv();
    shell = new Shell(env);
    META.env = env;
    META.shell = shell;
    env.shell = shell;
    const mod = await import('./apps/launcher.js');
    await shell.mountLauncher(mod.make);
    systembar = makeSystemBar(env);
    env.systembar = systembar;

    // user-published script apps get re-registered on every boot
    for (const ua of settings.get('userApps') || []) shell.register(normalizeUserApp(ua), false);

    say('pronto', 1);
    META.ready = true;
    running = true;
    requestAnimationFrame(loop);
    wireUi(env);
    if (navigator.xr?.isSessionSupported) {
      xrSupported = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
      const b = document.getElementById('boot-xr');
      if (b) b.hidden = !xrSupported;
    }
    if (settings.get('autoHideBoot') && sessionStorage.getItem('metaport:entered')) autoEnter();
  } catch (e) {
    fail(e);
  }
}

function buildEnv() {
  const env = {
    bus, THREE, settings, store, audio, scene,
    get view() { return view; },
    get world() { return world; },
    get head() { return head; },
    get hands() { return hands; },
    get aura() { return aura; },
    get pointer() { return pointer; },
    get domlayer() { return domlayer; },
    get shell() { return shell; },
    camera: camFeed,
    HoloPanel,
    createScriptContext: (app) => createContext(app, env),
    runScript: (code, ctx) => runScript(code, ctx),
    animateObjects: (dt2, t) => animateScriptObjects(dt2, t),
    publishApp: (meta) => publishApp(meta, env),
    toggleMode: () => toggleMode(env),
    openExternal: (url) => {
      const n = window.MetaPortAndroid;
      if (n?.openUrl) { n.openUrl(url); return true; }
      window.open(url, '_blank', 'noopener');
      return true;
    },
    screenshot
  };
  return env;
}

/** handheld → VR Box(SBS) → WebXR → handheld */
async function toggleMode(env) {
  const order = ['handheld', 'vrbox', ...(xrSupported ? ['xr'] : [])];
  const cur = settings.get('mode');
  const next = order[(order.indexOf(cur) + 1) % order.length];
  await enterMode(next, env);
}

async function enterMode(mode, env = META.env) {
  settings.set('mode', mode);
  // every mode change must come from a gesture so audio/sensors are allowed
  audio.ensure();
  await head.requestPermission();
  if (settings.get('passthrough') || settings.get('handsEnabled')) {
    if (!camFeed.ready) await camFeed.start();
    if (settings.get('handsEnabled')) hands.enable();
  }
  if (mode === 'xr') {
    try { await view.enterXR(); toast('WebXR imersivo'); } catch (e) { toast(`WebXR indisponível (${e.message}) — usando SBS`, 'warn'); mode = 'vrbox'; }
  }
  if (mode === 'vrbox') {
    settings.set('stereo', true);
    view.setMode('stereo');
    goFullscreen();
    await wakeLock();
    toast('VR Box: encaixe o celular, ajuste IPD e recentre com R');
  } else if (mode === 'handheld') {
    settings.set('stereo', false);
    view.setMode(scene && xrActive() ? 'xr' : 'mono');
    document.exitFullscreen?.().catch(() => {});
    toast('Modo Realidade Mista (mono)');
  }
  settings.set('mode', mode);          // pode ter caído de 'xr' para 'vrbox'
  try { window.MetaPortAndroid?.setMode?.(mode); } catch { /* ignore */ }
  shell?.layoutLauncher?.();
  shell?.relayout?.();
  systembar?.place?.();
  world.updateWall();
  sessionStorage.setItem('metaport:entered', '1');
}
const xrActive = () => view?.renderer.xr?.isPresenting;

function autoEnter() {
  enterMode(settings.get('mode') || 'handheld');
}

function goFullscreen() {
  const el = document.documentElement;
  const rq = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
  if (rq) rq.call(el).catch(() => {});
  try { screen.orientation?.lock?.('landscape').catch?.(() => {}); } catch { /* ignore */ }
  try { window.MetaPortAndroid?.setImmersive?.(1); } catch { /* ignore */ }
}

let wake = null;
async function wakeLock() {
  if (!settings.get('keepAwake')) return;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
}
document.addEventListener('visibilitychange', () => {
  bus.emit('visibility', { hidden: document.hidden });
  if (!document.hidden && settings.get('stereo')) wakeLock();
});

function wireUi(env) {
  const bH = document.getElementById('boot-handheld');
  const bV = document.getElementById('boot-vrbox');
  bH?.addEventListener('click', async () => { boot.el.hidden = true; await enterMode('handheld', env); });
  bV?.addEventListener('click', async () => { boot.el.hidden = true; await enterMode('vrbox', env); });
  const bX = document.getElementById('boot-xr');
  bX?.addEventListener('click', async () => { boot.el.hidden = true; await enterMode('xr', env); });

  // native (Android) → JS
  window.__metaport = {
    /** Botão "voltar" do telefone: janela em foco → volta; VR Box → portátil; senão deixa o Android fechar. */
    onBack() {
      if (shell.windows.length > 1) { shell.back(); return true; }
      if (shell.windows.length === 1) { shell.close(shell.windows[0]); return true; }
      if (settings.get('stereo') || settings.get('mode') !== 'handheld') { enterMode('handheld', env); return true; }
      return false;
    },
    openLink: (url) => { shell.openApp('browser', { nav: { url } }); },
    env
  };
  window.MetaPortNative = {
    toast: (msg, kind) => toast(msg, kind || 'info'),
    mode: (m) => enterMode(m, env),
    recenter: () => head.doRecenter(),
    toggleStereo: () => { settings.toggle('stereo'); view.setMode(settings.get('stereo') ? 'stereo' : 'mono'); },
    resume: () => { running = true; audio.ensure(); },
    pause: () => { audio.ctx?.suspend?.(); },
    info: () => ({ fps: view.stats.fps, stereo: settings.get('stereo'), hands: hands.hands.length, status: hands.status }),
    gyro: (on) => { if (on) head.requestPermission(); },
    share: (url) => { try { window.MetaPortAndroid?.share?.(url); } catch { /* ignore */ } },
    openLink: (url) => shell.openApp('browser', { nav: { url } }),
    device: () => { try { return JSON.parse(window.MetaPortAndroid?.deviceInfo?.() || '{}'); } catch { return {}; } }
  };
  // deep link `metaport://open?url=…` que chegou antes da página existir
  try {
    const pend = window.MetaPortAndroid?.consumePending?.();
    if (pend) setTimeout(() => shell.openApp('browser', { nav: { url: pend } }), 900);
  } catch { /* ignore */ }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { shell.home(); e.preventDefault(); }
    if (e.key === 'F1') { boot.el.hidden = false; }
    bus.emit('key', e);
    shell?.onKey(e);
  });

  // pinch edge → real click
  let pinchWas = false;
  hands.on('hands', (list) => {
    const any = list.some((h) => h.pinch);
    if (any && !pinchWas) { bus.emit('hand:pinch', list.find((h) => h.pinch)); }
    if (!any && pinchWas) bus.emit('hand:release', null);
    pinchWas = any;
  });

  window.addEventListener('error', (e) => {
    if (/ResizeObserver/.test(e.message)) return;
    toast(`erro: ${e.message.slice(0, 70)}`, 'err', 3600);
  });

  if (settings.get('fps')) installPerfHud(env);
}

/** Small always-on telemetry slab (3D), not a DOM overlay. */
let perfPanel = null;
function installPerfHud(env) {
  perfPanel = new HoloPanel({
    width: 0.44, height: 0.11, designW: 300, accent: '#8fd6ff', radius: 12, name: 'perf',
    interactive: false, live: true,
    draw: (kit, panel) => {
      const s = view.stats;
      kit.ctx.clearRect(0, 0, panel.designW, panel.designH);
      kit.fillRR(0, 0, panel.designW, panel.designH, 10, 'rgba(4,8,16,.72)', 'rgba(150,205,255,.16)', 1);
      kit.text(`${s.fps} fps · ${s.res}`, 12, 18, { size: 13, weight: 700, color: s.fps > 45 ? '#69f0a5' : '#ffc45e' });
      kit.text(`draw ${s.draws} · tri ${(s.tris / 1000).toFixed(0)}k · mãos ${hands.hands.length}`, 12, 40, { size: 10.5, color: '#7f9cb8' });
      kit.progress(12, 54, panel.designW - 24, { value: clamp(s.fps / 72, 0.02, 1), h: 4, color: s.fps > 45 ? '#69f0a5' : '#ff9d5c' });
    }
  });
  perfPanel.baseScale = 1;
  scene.add(perfPanel.group);
  const place = () => {
    const stereo = settings.get('stereo');
    perfPanel.group.position.set(stereo ? -0.62 : 0.62, stereo ? 0.66 : 0.6, -1.42);
    perfPanel.group.rotation.set(0, stereo ? 0.55 : -0.35, 0);
  };
  place();
  settings.on('change', ({ key }) => { if (key === 'stereo') place(); });
  setInterval(() => { if (settings.get('fps')) { perfPanel.show(true); perfPanel.markDirty(); } else perfPanel.show(false); }, 400);
}

function screenshot() {
  try {
    const url = view.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `metaport-${Date.now()}.png`;
    a.click();
    toast('captura salva');
    return url;
  } catch (e) { toast(`captura falhou: ${e.message}`, 'warn'); }
}

// ------------------------------------------------------------------ main loop
function loop(now) {
  if (!running) return;
  requestAnimationFrame(loop);
  dt = Math.min(0.1, (now - last) / 1000) || 0.016;
  last = now;
  META.t += dt;
  META.frames++;

  // 1) sensors → head pose
  const xrCam = view.renderer.xr.isPresenting ? view.renderer.xr.getCamera() : null;
  const q = xrCam ? xrCam.quaternion : head.update(dt, null, null);
  if (!xrCam) {
    view.rig.quaternion.copy(q);
    view.rig.position.set(0, Math.sin(META.t * 1.4) * 0.012 * settings.get('bobbing'), 0);
  }
  view.camera.quaternion.identity();

  // 2) hands + contour
  hands.update(dt);
  aura.update(dt, META.t, settings.get('handsEnabled') ? hands.hands : []);

  // 3) input: ray, hover, then the pinch → press/release edge
  pointer.update(dt, hands.hands);
  if (settings.get('handsEnabled')) {
    const h = hands.hands.find((x) => x.pinch) || null;
    if (h && !pointer.pressed) { pointer.mode = 'hand'; pointer.beginPress('hand'); audio.haptic(12); }
    else if (!h && pointer.pressed && pointer.mode === 'hand') pointer.endPress();
  } else if (pointer.pressed && pointer.mode === 'hand') pointer.endPress();
  cursor.update(dt, META.t);
  shell.update(dt, META.t);
  domlayer.update();
  world.update(dt, META.t);
  systembar?.update?.(dt);
  animateScriptObjects(dt, META.t);
  bus.emit('frame', { dt, t: META.t });

  // 4) draw (mono | SBS | XR)
  view.render(dt);

  // 5) comfort + adaptive resolution
  acc += dt;
  if (acc > 1) {
    acc = 0;
    const m = head.motion;
    const want = settings.get('comfortVignette') === 'on' || (settings.get('comfortVignette') === 'auto' && m > 0.42);
    document.body.classList.toggle('comfort', want);
    if (view.stats.fps && view.stats.fps < 27 && settings.get('quality') > 0.6) {
      lowFps++;
      if (lowFps > 2) {
        lowFps = 0;
        settings.set('quality', Math.max(0.6, settings.get('quality') - 0.15));
        toast('fps baixo — resolução interna reduzida');
      }
    } else lowFps = 0;
    audio.setListeningLevel(hands.hands.length > 0);
  }
}

bootup();
export { META, bus };
