import * as THREE from 'three';
import { HoloPanel } from '../ui/panel.js';
import { Kit, PALETTE, hexA } from '../ui/kit.js';
import { drawIcon } from '../ui/icons.js';
import { settings } from './settings.js';
import { store, scopedStore } from './storage.js';
import { audio } from './audio.js';
import { clamp, lerp, toast, uid } from './util.js';

/**
 * MetaPort Script API — a programação própria da plataforma.
 *
 * Um script é um módulo JS com acesso a `MetaPort`: painéis holográficos, objetos 3D,
 * mãos/gestos, áudio espacial, entrada, armazenamento, janela da Store e ciclo de vida.
 * Recursos criados pelo script são rastreados pelo contexto e destruídos ao parar —
 * por isso um app de terceiros nunca vaza geometrias ou listeners.
 */
export const API_VERSION = '1.0';

export function createContext(app, env) {
  const ctx = {
    app: app || { id: 'scratch', name: 'Scratch' },
    env,
    panels: [],
    objects: [],
    disposers: [],
    listeners: new Map(),
    logs: [],
    startedAt: performance.now(),
    running: true,
    drawHooks: [],
    tickHooks: [],
    onClickHooks: [],
    contentDraw: null,
    contentHeight: 0
  };
  const log = (kind, args) => {
    const line = args.map((a) => (typeof a === 'object' ? safeJson(a) : String(a))).join(' ');
    ctx.logs.push({ kind, line, t: Math.round(performance.now() - ctx.startedAt) });
    if (ctx.logs.length > 200) ctx.logs.shift();
    ctx.env.bus?.emit('script:log', { app: ctx.app.id, kind, line });
  };

  const track = {
    panel(p) { ctx.panels.push(p); ctx.disposers.push(() => p.dispose()); return p; },
    obj(o) { ctx.objects.push(o); ctx.disposers.push(() => { o.parent?.remove(o); o.traverse?.((n) => { n.geometry?.dispose?.(); n.material?.dispose?.(); }); }); return o; },
    on(type, fn) {
      const off = ctx.env.bus.on(type, fn);
      ctx.disposers.push(off);
      (ctx.listeners.get(type) || ctx.listeners.set(type, []).get(type)).push(fn);
      return off;
    }
  };

  const API = {
    version: API_VERSION,
    id: ctx.app.id,
    name: ctx.app.name,

    // ------------------------------------------------ lifecycle & events
    on(type, fn) {
      if (type === 'draw') { ctx.drawHooks.push(fn); ctx.disposers.push(() => remove(ctx.drawHooks, fn)); return () => remove(ctx.drawHooks, fn); }
      if (type === 'tick') { ctx.tickHooks.push(fn); ctx.disposers.push(() => remove(ctx.tickHooks, fn)); return () => remove(ctx.tickHooks, fn); }
      if (type === 'click') { ctx.onClickHooks.push(fn); return () => remove(ctx.onClickHooks, fn); }
      if (type === 'pinch') return track.on('hand:pinch', (h) => fn(h));
      if (type === 'hand') return track.on('hand', (h) => fn(h));
      if (type === 'window') return track.on(type, fn);
      return track.on(type, fn);
    },
    off() { /* contexts use the returned unsubscribe */ },
    emit: (type, data) => ctx.env.bus.emit(`script:${ctx.app.id}:${type}`, data),
    log: (...a) => log('log', a),
    warn: (...a) => log('warn', a),
    error: (...a) => { log('err', a); },

    // ------------------------------------------------ holographic UI
    ui: {
      panel(opts = {}) {
        const p = new HoloPanel({
          width: opts.width ?? 0.9,
          height: opts.height ?? (opts.width ?? 0.9) * (opts.ratio ?? 0.66),
          designW: Math.round((opts.width ?? 0.9) * 640),
          accent: opts.color || PALETTE.accent,
          live: opts.live !== false,
          curve: opts.curve ?? settings.get('curve'),
          draw: (kit, panel, t) => {
            opts.draw?.(kit, panel, t);
            for (const fn of ctx.drawHooks) { try { fn(kit, panel, t); } catch (e) { log('err', [e.message]); } }
          },
          onClick: (region, loc, panel) => {
            opts.onClick?.(region, loc, panel);
            for (const fn of ctx.onClickHooks) fn({ region, loc });
          },
          onDrag: opts.onDrag
        });
        track.panel(p);
        ctx.env.scene.add(p.group);
        p.group.position.set(opts.x ?? 0, opts.y ?? 0.1, opts.z ?? -1.25);
        if (opts.yaw) p.group.rotation.y = opts.yaw;
        ctx.disposers.push(() => ctx.env.pointer.removePanel(p));
        ctx.env.pointer.addPanel(p);
        if (opts.title) {
          p.chromeFn = (kit) => { kit.text(opts.title, 18, 24, { size: 14, weight: 800 }); };
        }
        p.show(true);
        if (opts.text != null) p.setDraw((kit) => { kit.bg(); kit.text(String(opts.text), 20, 40, { size: opts.size || 22, maxWidth: p.designW - 40 }); });
        return {
          handle: p,
          set: (o) => Object.assign(p, o),
          draw: (fn) => { p.setDraw(fn); ctx.disposers.push(() => p.markDirty()); },
          text: (str, style) => p.setDraw((kit) => { kit.bg(); kit.text(String(str), 22, 34, { size: style?.size || 22, maxWidth: p.designW - 44, color: style?.color, weight: style?.weight || 600 }); }),
          onClick: (fn) => { p.onClick = (r, l, pan) => { fn({ region: r, loc: l, panel: pan }); for (const h of ctx.onClickHooks) h({ region: r, loc: l }); }; },
          onDrag: (fn) => { p.onDrag = fn; },
          scroll: (v) => { p.scroll = v; p.markDirty(); },
          setContent: (h) => { p.contentH = h; p.maxScroll = Math.max(0, h - p.designH + 10); },
          place: (x, y, z, yaw = 0) => { p.group.position.set(x, y, z); p.group.rotation.set(0, yaw, 0); },
          lookAtHead: () => { const v = new THREE.Vector3().copy(ctx.env.view.rig.position); p.group.lookAt(v); },
          lookAt: (v) => { p.group.lookAt(v.isVector3 ? v : new THREE.Vector3(...(v || [0, 0, 0]))); },
          moveTo: (x, y, z) => { p.group.position.set(x ?? 0, y ?? p.group.position.y, z ?? p.group.position.z); },
          setDepth: (metres) => { p.group.position.z = -clamp(metres ?? 1.3, 0.6, 6); },
          show: (v = true) => p.show(v),
          hide: () => p.show(false),
          close: () => p.dispose(),
          dispose: () => p.dispose(),
          kit: p.kit,
          get w() { return p.designW; },
          get h() { return p.designH }
        };
      },
      /** Draw inside the app's own window (used when running as an installed app). */
      setContentDraw: (fn) => { ctx.contentDraw = fn; ctx.env.window?.panel?.markDirty(); },
      contentHeight: (h) => { ctx.contentHeight = h; if (ctx.env.window) { ctx.env.window.setScrollLimit?.(); } },
      hud: (text, ms = 2400) => toast(text, 'info', ms),
      icon: (name, x, y, s, color) => ({ name, x, y, s, color }),
      kit: Kit,
      palette: PALETTE
    },

    // ------------------------------------------------ 3D scene
    scene: {
      three: THREE,
      get group() { return ctx.env.scene; },
      add(spec = {}) {
        const o = build(spec, ctx);
        ctx.env.scene.add(o);
        track.obj(o);
        return o;
      },
      spawn(spec = {}) { return this.add(spec); },
      /** Move/turn/resize an object the API created. pos/rot = [x,y,z], scale = number | [x,y,z]. */
      place(o, { pos, rot, scale } = {}) {
        if (!o) return o;
        if (pos) o.position.set(pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? -1.25);
        if (rot) o.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
        if (scale != null) (Array.isArray(scale) ? o.scale.set(...scale) : o.scale.setScalar(scale));
        return o;
      },
      /** Tween to a target: animate(obj, { pos:[0,0,-1], scale:1.4 }, { ms: 320, ease:'out' }) */
      animate(o, to, opts = {}) { addTween(o, to, opts, ctx); return o; },
      tween(o, to, opts = {}) { return this.animate(o, to, opts); },
      spin(o, rate = {}) { const r = typeof rate === 'number' ? { y: rate } : rate; o.spin?.(r.x ?? 0, r.y ?? 0, r.z ?? 0); return o; },
      lookAt(o, target) {
        if (!o) return o;
        const v = target && target.isVector3 ? target : new THREE.Vector3(...(target || [0, 0, 0]));
        o.lookAt(v);
        return o;
      },
      /** Keep an object glued to the app's own panel (moves with the window). */
      attachToPanel(o, { x = 0, y = 0, z = 0.03 } = {}) {
        const host = ctx.env.window?.panel?.group || ctx.panels[0]?.handle?.group;
        if (!o || !host) return o;
        o.position.set(x, y, z);
        host.add(o);
        return o;
      },
      remove(o) { o?.parent?.remove(o); return o; },
      clear() { for (const o of [...ctx.objects]) { o.parent?.remove(o); } ctx.objects.length = 0; },
      get objects() { return ctx.objects.slice(); }
    },
    world: {
      get theme() { return settings.get('theme'); },
      setTheme(name) { settings.set('theme', name); },
      ping: (s = 1) => ctx.env.world.ping(s),
      floorY: -1.52,
      setExposure(v) { ctx.env.view.renderer.toneMappingExposure = v; },
      fog: (v) => { ctx.env.scene.fog = v ? new THREE.FogExp2(0x040814, v) : null; }
    },

    // ------------------------------------------------ hands
    hands: {
      get count() { return ctx.env.hands.hands.length; },
      get list() { return ctx.env.hands.hands.map(slimHand); },
      get all() { return ctx.env.hands.hands; },
      get(label = 'Right') { return slimHand(ctx.env.hands.hands.find((h) => h.label === label) ?? ctx.env.hands.hands[0]); },
      /** 'hands' (every tracker frame), 'pinch', 'release' */
      on(type, fn) {
        if (type === 'hands') {
          const off = ctx.env.hands.on?.('hands', (list) => fn((list || []).map(slimHand)));
          if (typeof off === 'function') ctx.disposers.push(off);
          return off ?? (() => {});
        }
        return API.on(type === 'pinch' ? 'pinch' : 'click', fn);
      },
      worldLandmark(h, idx = 8, out) {
        const raw = h?._raw ?? ctx.env.hands.hands[0];
        return raw ? ctx.env.hands.worldLandmark(raw, idx, out || new THREE.Vector3()) : (out || new THREE.Vector3());
      },
      list: () => ctx.env.hands.hands.map(slimHand),
      primary: () => slimHand(ctx.env.hands.hands[0]),
      available: () => ctx.env.hands.status,
      /** Convert a landmark index of a detected hand into a world point you can attach 3D objects to. */
      point: (hand, idx = 8) => {
        const h = typeof hand === 'number' ? ctx.env.hands.hands[hand] : hand?._raw ?? ctx.env.hands.hands[0];
        if (!h) return new THREE.Vector3();
        return ctx.env.hands.worldLandmark(h, idx, new THREE.Vector3());
      }
    },

    // ------------------------------------------------ input
    input: {
      get mode() { return ctx.env.pointer.mode; },
      ray: () => ({ origin: ctx.env.pointer.ray.origin.toArray(), dir: ctx.env.pointer.ray.dir.toArray() }),
      onTap: (fn) => API.on('click', fn),
      key: (fn) => track.on('key', fn)
    },

    // ------------------------------------------------ audio
    audio: {
      tone: (f, d, o) => audio.tone(f, d, o),
      note: (midi = 60, dur = 0.4, o = {}) => {
        const f = 440 * Math.pow(2, (midi - 69) / 12);
        audio.tone(f, dur, { type: 'triangle', gain: 0.14, ...o });
      },
      chord: (root = 60, dur = 0.9, type = 'major') => {
        const steps = { major: [0, 4, 7], minor: [0, 3, 7], sus: [0, 5, 7], maj7: [0, 4, 7, 11] }[type] || [0, 4, 7];
        steps.forEach((s, i) => setTimeout(() => audio.tone(440 * Math.pow(2, (root + s - 69) / 12), dur, { type: 'triangle', gain: 0.09, detune: i * 3 }), i * 18));
      },
      noise: (d, o) => audio.noise(d, o),
      click: (pos) => audio.press(pos),
      press: (pos) => audio.press(pos),
      hover: (pos) => audio.hover(pos),
      release: (pos) => audio.release(pos),
      toggle: (on, pos) => audio.toggle(on, pos),
      swoosh: (pos) => audio.swoosh(pos),
      ok: (pos) => audio.ok(pos),
      error: (pos) => audio.error(pos),
      open: (pos) => audio.open(pos),
      close: (pos) => audio.close(pos),
      pinch: (pos) => audio.pinch(pos),
      ui: (kind = 'hover', pos) => audio[kind]?.(pos),
      volume: (v) => settings.set('volume', clamp(v, 0, 1)),
      ambient: (on) => settings.set('ambient', !!on)
    },
    haptic: (ms = 16) => audio.haptic(ms),
    vibrate: (ms = 16) => audio.haptic(ms),

    // ------------------------------------------------ platform
    storage: {
      get: (k, fb = null) => scopedStore(ctx.app.id).get(k, fb),
      set: (k, v) => scopedStore(ctx.app.id).set(k, v),
      keys: () => scopedStore(ctx.app.id).keys(),
      clear: () => scopedStore(ctx.app.id).clear()
    },
    settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, v) },
    apps: {
      list: () => ctx.env.shell.allCatalog().map((a) => ({ id: a.id, name: a.name, category: a.category, installed: ctx.env.shell.installed.has(a.id) })),
      open: (id, opts) => ctx.env.shell.openApp(id, opts),
      close: () => ctx.env.window && ctx.env.shell.close(ctx.env.window),
      home: () => ctx.env.shell.home(),
      publish: (meta) => publishApp({ ...meta, code: meta.code ?? ctx.source }, ctx.env),
      register: (meta) => publishApp(meta, ctx.env),
      uninstall: (id) => ctx.env.shell.unregister(id)
    },
    xr: {
      get mode() { return settings.get('mode'); },
      get stereo() { return settings.get('stereo'); },
      enterVRBox: () => { settings.set('stereo', true); ctx.env.view.setMode('stereo'); settings.set('mode', 'vrbox'); },
      enterMR: () => { settings.set('stereo', false); ctx.env.view.setMode('mono'); settings.set('mode', 'handheld'); },
      async enterWebXR() { try { await ctx.env.view.enterXR(); } catch (e) { toast(`WebXR: ${e.message}`, 'warn'); } },
      is: (m) => ctx.env.view.mode === m || settings.get('mode') === m,
      toggleStereo: () => { const on = !settings.get('stereo'); settings.set('stereo', on); ctx.env.view.setMode(on ? 'stereo' : 'mono'); },
      recenter: () => ctx.env.head.doRecenter(),
      info: () => ({ fps: ctx.env.view.stats.fps, res: ctx.env.view.stats.res, mode: ctx.env.view.mode, draws: ctx.env.view.stats.draws })
    },
    time: {
      now: () => (performance.now() - ctx.startedAt) / 1000,
      frame: (fn) => { ctx.tickHooks.push(fn); return () => remove(ctx.tickHooks, fn); },
      after: (ms, fn) => { const id = setTimeout(fn, ms); ctx.disposers.push(() => clearTimeout(id)); return id; },
      every: (ms, fn) => { const id = setInterval(fn, ms); ctx.disposers.push(() => clearInterval(id)); return id; }
    },
    math: {
      clamp, lerp, map: (v, a, b, c, d) => c + ((v - a) / (b - a || 1)) * (d - c),
      rand: (a = 0, b = 1) => a + Math.random() * (b - a),
      noise: (x) => Math.sin(x * 12.9898) * 43758.5453 % 1,
      hsv: (h, s = 1, v = 1) => new THREE.Color().setHSL(h, s, v).getStyle(),
      V3: (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
    },
    util: { uid: () => uid(ctx.app.id), formatBytes: (n) => formatBytes(n) },
    after: (ms, fn) => API.time.after(ms, fn),
    every: (ms, fn) => API.time.every(ms, fn),
    interval: (ms, fn) => API.time.every(ms, fn),
    tween: (o, to, opts = {}) => addTween(o, to, opts, ctx),
    get store() { return API.storage; },
    get mode() { return settings.get('mode'); },
    get stereo() { return !!settings.get('stereo'); },
    shell: {
      get apps() { return ctx.env.shell.allCatalog().map((a) => ({ id: a.id, name: a.name, category: a.category, isPort: !!a.isPort })); },
      get installed() { return [...ctx.env.shell.installed]; },
      get windows() { return ctx.env.shell.windows.map((w) => ({ id: w.appId, title: w.meta?.name ?? w.appId, focused: w.focused })); },
      get front() { return ctx.env.shell.front?.appId ?? null; },
      open: (id, opts) => ctx.env.shell.openApp(id, opts),
      close: (id) => ctx.env.shell.closeApp(id),
      home: () => ctx.env.shell.home(),
      focus: (id) => ctx.env.shell.focus(id),
      on: (type, fn) => track.on(type, fn)
    },
    _ctx: ctx
  };

  ctx.api = API;
  ctx.dispose = () => {
    ctx.running = false;
    try { ctx.env.bus?.emit('script:dispose', { app: ctx.app.id }); } catch { /* ignore */ }
    for (const d of ctx.disposers.splice(0).reverse()) { try { d(); } catch { /* ignore */ } }
    ctx.env.scene.dispatchEvent?.({ type: 'script:stop', app: ctx.app.id });
  };
  return ctx;
}

// ------------------------------------------------------------------ helpers
function remove(arr, fn) { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); }
function safeJson(o) { try { return JSON.stringify(o, null, 0).slice(0, 200); } catch { return String(o); } }
function slimHand(h) {
  if (!h) return null;
  return {
    label: h.label, pinch: h.pinch, pinchAmount: h.pinchAmount, grab: h.grab, point: h.point,
    open: h.open, peace: h.peace, thumbUp: h.thumbUp, gap: h.gap, span: h.span, score: h.score,
    pointer: h.pointer, center: h.center,
    landmarks: h.lm?.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    _raw: h
  };
}

function build(spec, ctx) {
  const s = typeof spec === 'string' ? { type: spec } : spec || {};
  const color = new THREE.Color(s.color ?? '#46f0d0');
  const size = s.size ?? 0.2;
  let geo;
  switch (s.type) {
    case 'sphere': geo = new THREE.SphereGeometry(size * 0.5, s.detail ?? 32, s.detail ?? 24); break;
    case 'torus': geo = new THREE.TorusGeometry(size * 0.5, size * 0.14, 12, 60); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(size * 0.4, size * 0.4, size, 24); break;
    case 'cone': geo = new THREE.ConeGeometry(size * 0.45, size, 24); break;
    case 'prism': geo = new THREE.CylinderGeometry(size * 0.4, size * 0.4, size, s.sides ?? 3); break;
    case 'ring': geo = new THREE.RingGeometry(size * 0.4, size * 0.5, 48); break;
    case 'plane': geo = new THREE.PlaneGeometry(size, size * (s.ratio ?? 0.62)); break;
    case 'line': geo = new THREE.BufferGeometry().setFromPoints((s.points || [[0, 0, 0], [1, 1, 0]]).map((p) => new THREE.Vector3(...p))); break;
    case 'points': geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array((s.points || []).flat()), 3)); break;
    case 'beam': geo = new THREE.CylinderGeometry(size * 0.02, size * 0.1, s.length ?? 1.2, 10, 1, true); break;
    case 'icon': {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      drawIcon(g, s.icon || 'star', 64, 64, 96, s.color || '#dff', { lw: 2 });
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
      return finish(new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat), s, ctx, mat);
    }
    default: geo = new THREE.BoxGeometry(size, size, size);
  }
  let mat;
  if (s.type === 'line' || s.type === 'points') {
    mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: s.opacity ?? 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  } else if (s.glass) {
    mat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.1, roughness: 0.08, transmission: 0, transparent: true, opacity: s.opacity ?? 0.5, clearcoat: 1, envMapIntensity: 2 });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color, emissive: new THREE.Color(s.emissive ?? color).multiplyScalar(s.glow ?? 0.45),
      metalness: s.metal ?? 0.35, roughness: s.rough ?? 0.35, transparent: s.opacity != null, opacity: s.opacity ?? 1,
      side: s.type === 'ring' || s.type === 'plane' ? THREE.DoubleSide : THREE.FrontSide
    });
  }
  const mesh = new THREE.Mesh(geo, mat);
  return finish(mesh, s, ctx, mat);
}

function finish(mesh, s, ctx, mat) {
  if (s.pos) mesh.position.set(...s.pos);
  if (s.rot) mesh.rotation.set(...s.rot);
  if (s.scale) mesh.scale.setScalar(s.scale);
  mesh.userData.spec = s;
  mesh.set = (o) => { Object.assign(mesh.userData.spec, o); if (o.pos) mesh.position.set(...o.pos); if (o.color) { mat.color.set(o.color); mat.emissive?.set?.(new THREE.Color(o.emissive ?? o.color).multiplyScalar(o.glow ?? 0.45)); } return mesh; };
  mesh.spin = (x = 0, y = 1, z = 0) => { spinners.set(mesh, { x, y, z }); ctx.disposers.push(() => spinners.delete(mesh)); return mesh; };
  mesh.float = (amp = 0.03, speed = 1) => { floaters.set(mesh, { amp, speed, base: mesh.position.y }); ctx.disposers.push(() => floaters.delete(mesh)); return mesh; };
  mesh.onClick = (fn) => { const off = ctx.env.pointer.register(mesh, { onClick: () => fn(mesh) }); ctx.disposers.push(off); return mesh; };
  mesh.remove = () => { mesh.parent?.remove(mesh); mat.dispose?.(); mesh.geometry.dispose?.(); return mesh; };
  if (s.spin) mesh.spin(...(Array.isArray(s.spin) ? s.spin : [0, 1, 0]));
  if (s.float) mesh.float(...(Array.isArray(s.float) ? s.float : [0.03, 1]));
  return mesh;
}

const spinners = new Map();
const tweens = new Set();

const EASES = {
  linear: (k) => k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  in: (k) => k * k * k,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  'out-quint': (k) => 1 - Math.pow(1 - k, 5),
  back: (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2)
};

/**
 * Minimal tween runner for script objects. `to` accepts pos / rot / scale /
 * opacity / color, exactly like the spawn spec.
 */
function addTween(obj, to = {}, { ms = 400, ease = 'out', onDone } = {}, ctx) {
  if (!obj) return null;
  const easeFn = EASES[ease] || EASES.out;
  const from = {};
  const to_ = {};
  const V = (a) => (Array.isArray(a) ? a.slice() : a);
  if (to.pos || to.position) { from.pos = V([obj.position.x, obj.position.y, obj.position.z]); to_.pos = V(to.pos ?? to.position); }
  if (to.rot || to.rotation) { from.rot = V([obj.rotation.x, obj.rotation.y, obj.rotation.z]); to_.rot = V(to.rot ?? to.rotation); }
  if (to.scale != null) {
    from.scale = Array.isArray(to.scale) ? V([obj.scale.x, obj.scale.y, obj.scale.z]) : obj.scale.x;
    to_.scale = V(to.scale);
  }
  if (to.opacity != null && obj.material) { from.opacity = obj.material.opacity; to_.opacity = to.opacity; obj.material.transparent = true; }
  if (to.color && obj.material?.color) {
    from.color = obj.material.color.toArray();
    to_.color = new THREE.Color(to.color).toArray();
  }
  const tw = { obj, from, to: to_, t: 0, ms: Math.max(16, ms), easeFn, onDone, ctx };
  for (const old of tweens) if (old.obj === obj) tweens.delete(old);
  tweens.add(tw);
  if (ctx) ctx.disposers.push(() => tweens.delete(tw));
  return tw;
}

const lerpArr = (a, b, k) => (Array.isArray(a) ? a.map((v, i) => v + ((b[i] ?? v) - v) * k) : a + (b - a) * k);
const floaters = new Map();
export function animateScriptObjects(dt, t) {
  for (const [m, s] of spinners) { if (m.parent) m.rotation.set(m.rotation.x + s.x * dt, m.rotation.y + s.y * dt, m.rotation.z + s.z * dt); }
  for (const [m, f] of floaters) { if (m.parent) m.position.y = f.base + Math.sin(t * f.speed) * f.amp; }
  if (!tweens.size) return;
  for (const tw of tweens) {
    if (!tw.obj.parent) { tweens.delete(tw); continue; }
    tw.t = Math.min(1, tw.t + (dt * 1000) / tw.ms);
    const k = tw.easeFn(tw.t);
    if (tw.to.pos) tw.obj.position.set(...lerpArr(tw.from.pos, tw.to.pos, k));
    if (tw.to.rot) tw.obj.rotation.set(...lerpArr(tw.from.rot, tw.to.rot, k));
    if (tw.to.scale != null) {
      const sc = lerpArr(tw.from.scale, tw.to.scale, k);
      if (Array.isArray(sc)) tw.obj.scale.set(sc[0], sc[1] ?? sc[0], sc[2] ?? sc[0]); else tw.obj.scale.setScalar(sc);
    }
    if (tw.to.opacity != null && tw.obj.material) tw.obj.material.opacity = lerpArr(tw.from.opacity, tw.to.opacity, k);
    if (tw.to.color && tw.obj.material?.color) {
      const c = lerpArr(tw.from.color, tw.to.color, k);
      tw.obj.material.color.setRGB(c[0], c[1], c[2]);
      tw.obj.material.emissive?.setRGB?.(c[0] * 0.45, c[1] * 0.45, c[2] * 0.45);
    }
    if (tw.t >= 1) { tweens.delete(tw); tw.onDone?.(tw.obj); }
  }
}

function formatBytes(n) { return `${(n / 1024).toFixed(0)} KB`; }

export function runScript(code, ctx) {
  ctx.source = code;
  try {
    const Fn = new Function('MetaPort', 'THREE', '"use strict";\n' + code);
    const ret = Fn(ctx.api, THREE);
    if (ret && typeof ret.then === 'function') {
      ret.catch((e) => { ctx.logs.push({ kind: 'err', line: `promise: ${e.message}`, t: 0 }); ctx.env.bus.emit('script:error', { app: ctx.app.id, error: e }); });
    }
    return true;
  } catch (e) {
    ctx.logs.push({ kind: 'err', line: String(e?.stack || e?.message || e), t: 0 });
    ctx.env.bus.emit('script:error', { app: ctx.app.id, error: e });
    return false;
  }
}

/** Save a script into the Store so it installs like a native app. */
export function publishApp(meta, env) {
  const id = (meta.id || `user.${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).replace(/^user\./, 'user.');
  const entry = {
    id, name: meta.name || 'App sem nome', icon: meta.icon || 'bolt', color: meta.color || '#9be7ff',
    category: 'user', tagline: meta.tagline || 'App MetaPort API', desc: meta.desc || '',
    version: meta.version || '1.0.0', author: meta.author || 'você', size: (meta.code || '').length * 3,
    code: meta.code || '', window: meta.window, at: Date.now()
  };
  const list = settings.get('userApps') || [];
  const next = [entry, ...list.filter((a) => a.id !== id)];
  settings.set('userApps', next);
  env.shell.userApps = next;
  env.shell.register(normalizeUserApp(entry), false);
  toast(`${entry.name} publicado na Store`, 'ok');
  env.bus.emit('app:registered', entry);
  return entry;
}

/**
 * A script can be written in two shapes:
 *   • **flat**   — a body executed with `MetaPort` in scope (Studio, samples)
 *   • **module** — `export const meta = {…}` + `export function make(env) {…}`
 * Modules are loaded through a blob URL so the author can use real ESM
 * (`import`/`export`, top-level await) and still ship one `.js` file.
 */
/** Balanced-brace extraction that tolerates strings and any formatting. */
function objectLiteral(code, after) {
  const b = code.indexOf('{', after);
  if (b < 0) return null;
  let depth = 0, inStr = null, esc = false;
  for (let j = b; j < code.length; j++) {
    const ch = code[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return code.slice(b, j + 1);
  }
  return null;
}

/**
 * Read an app's `export const meta = {…}` without executing the module (so the
 * Store can show a card, pick an icon and size the window before `make` ever runs).
 * The literal is evaluated in a sandbox with no globals — it must be plain data.
 */
export function parseScriptMeta(code = '') {
  const module = /export\s+(const|function|async\s+function|default)/.test(code);
  let raw = {};
  const at = /export\s+(?:const|let|var)\s+meta\s*=/.exec(code);
  const lit = at ? objectLiteral(code, at.index + at[0].length - 1) : null;
  if (lit) {
    try { raw = new Function(`'use strict';return (${lit});`)() || {}; } catch { raw = {}; }
  }
  const str = (v, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : (typeof v === 'number' ? String(v) : d));
  const out = {
    module,
    id: str(raw.id),
    name: str(raw.name),
    icon: str(raw.icon, 'star'),
    color: str(raw.color, '#9be7ff'),
    category: str(raw.category, 'user'),
    tagline: str(raw.tagline),
    desc: str(raw.desc),
    author: str(raw.author, 'autor anônimo'),
    version: str(raw.version, '1.0.0')
  };
  if (Array.isArray(raw.size) && raw.size.length === 2) {
    out.window = { width: clamp(+raw.size[0] / 640, 0.5, 3.4), height: clamp(+raw.size[1] / 640, 0.34, 2.6) };
  } else if (raw.window && raw.window.width) {
    out.window = { width: clamp(+raw.window.width, 0.5, 3.4), height: clamp(+raw.window.height || 0.8, 0.34, 2.6) };
  }
  if (raw.curve != null && Number.isFinite(+raw.curve)) out.curve = +raw.curve;
  for (const k of Object.keys(out)) if (out[k] === '' ) delete out[k];
  return out;
}

export async function loadScriptModule(code) {
  const loaderErr = (e) => /scheme in|Unknown file extension|ERR_UNKNOWN|default ESM loader/.test(String(e?.message || e));
  const toB64 = (str) => {
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
    const B = globalThis.Buffer;
    if (B) return B.from(str, 'utf8').toString('base64');
    return str;
  };
  if (typeof Blob === 'function' && typeof URL !== 'undefined' && URL.createObjectURL) {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try {
      return await import(/* @vite-ignore */ url);
    } catch (e) {
      if (!loaderErr(e)) throw e;
    } finally {
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 8000);
    }
  }
  return import(`data:text/javascript;base64,${toB64(code)}`);
}

/** Environment handed to `make(env)` of a module app. */
function scriptEnv(env, ctx) {
  return new Proxy({}, {
    get(_, k) {
      if (k === 'toast') return (m) => toast(String(m));
      if (k === 'api') return ctx.api;
      if (k === 'MetaPort') return ctx.api;
      if (k === 'MP') return ctx.api;
      if (k === 'THREE') return THREE;
      if (k in env) return env[k];
      return undefined;
    },
    has: () => true
  });
}

export function normalizeUserApp(ua) {
  return {
    id: ua.id, name: ua.name, icon: ua.icon, color: ua.color, category: 'user', tagline: ua.tagline,
    desc: ua.desc, size: ua.size, version: ua.version, author: ua.author, user: true, code: ua.code,
    window: ua.window || { width: 1.35, height: 0.9 },
    async make(env) {
      const ctx = createContext(ua, env);
      const code = ua.code || 'MetaPort.log("sem código")';
      if (/export\s+(const|function|async)/.test(code)) {
        const mod = await loadScriptModule(code);
        const userEnv = scriptEnv(env, ctx);
        const meta = mod.meta || {};
        if (typeof mod.validate === 'function') {
          const verdict = await mod.validate(userEnv);
          if (verdict !== undefined && verdict !== true && !verdict) throw new Error(typeof verdict === 'string' ? verdict : 'validate() recusou o app');
        }
        const ctrl = (mod.make ?? mod.default?.make)?.(userEnv) || mod.default || {};
        const fail = (e) => { ctx.logs.push({ kind: 'err', line: String(e?.message || e), t: 0 }); ctx.env.bus?.emit('script:error', { app: ua.id, error: e }); };
        return {
          meta,
          draw: (kit, t) => {
            if (ctrl.draw) { try { ctrl.draw(kit, t); } catch (e) { fail(e); } }
            for (const fn of ctx.drawHooks) { try { fn(kit, env.panel, t); } catch { /* logged */ } }
          },
          chrome: ctrl.chrome ? (kit) => { try { ctrl.chrome(kit); } catch (e) { fail(e); } } : undefined,
          onClick: (region, loc, panel) => {
            try { ctrl.onClick?.(region?.id ?? region, region, panel); } catch (e) { fail(e); }
            for (const fn of ctx.onClickHooks) { try { fn({ region, loc }); } catch { /* ignore */ } }
          },
          onDrag: ctrl.onDrag ? (value, region, panel) => { try { ctrl.onDrag(value, region, panel); } catch (e) { fail(e); } } : undefined,
          onBack: ctrl.onBack,
          onKey: ctrl.onKey,
          onFocus: ctrl.onFocus,
          tick: (dt, t) => {
            animateScriptObjects(dt, t);
            try { ctrl.tick?.(dt, t); } catch (e) { fail(e); }
            for (const fn of ctx.tickHooks) { try { fn(dt, t); } catch { /* ignore */ } }
          },
          destroy: () => { try { ctrl.destroy?.(); } catch { /* ignore */ } ctx.dispose(); },
          get contentHeight() { return ctrl.contentHeight ?? ctx.contentHeight ?? 0; },
          meta,
          _ctx: ctx
        };
      }
      runScript(code, ctx);
      return {
        draw: (kit, t) => {
          kit.bg();
          if (ctx.contentDraw) ctx.contentDraw(kit, t);
          else kit.text(`${ua.name} — use MetaPort.ui.setContentDraw(fn) ou MetaPort.on(\'draw\')`, 20, 30, { size: 13, color: '#9fb8d0' });
          for (const fn of ctx.drawHooks) { try { fn(kit, ctx.env.panel, t); } catch (e) { /* logged */ } }
        },
        onClick: (region, loc) => { for (const fn of ctx.onClickHooks) { try { fn({ region, loc }); } catch { /* ignore */ } } },
        tick: (dt, t) => { animateScriptObjects(dt, t); for (const fn of ctx.tickHooks) { try { fn(dt, t); } catch (e) { console.error(e); } } },
        destroy: () => ctx.dispose(),
        get contentHeight() { return ctx.contentHeight || 0; },
        _ctx: ctx
      };
    }
  };
}

/** Global SDK surface (DevTools/console share the same object). */
export function installGlobalAPI(env) {
  const root = createContext({ id: 'console', name: 'Console' }, env);
  globalThis.MetaPort = root.api;
  globalThis.MetaPortDev = { env, root, store, settings, THREE, audio };
  env.bus.on('script:log', () => {});
  return root;
}
