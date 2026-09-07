import * as THREE from 'three';
import { HoloWindow } from '../ui/window.js';
import { HoloPanel } from '../ui/panel.js';
import { settings } from './settings.js';
import { store } from './storage.js';
import { audio } from './audio.js';
import { PALETTE, hexA } from '../ui/kit.js';
import { clamp, toast, uid } from './util.js';
import { APPS, PORT_APPS } from '../apps/catalog.js';

/**
 * MetaPort shell: app registry + a *spatial* window manager. Windows live on an arc
 * around the user, snap to it when released, follow head yaw when "facing you" is on,
 * and are grabbed/moved with a pinch instead of a mouse.
 */
export class Shell {
  constructor(env) {
    this.env = env;
    this.view = env.view;
    this.world = env.world;
    this.hands = env.hands;
    this.pointer = env.pointer;
    this.scene = env.scene;
    this.windows = [];
    this.focused = null;
    this.apps = new Map();
    this.installed = new Set(settings.get('installed') || []);
    this.userApps = settings.get('userApps') || [];
    this.bus = env.bus;
    this._winSeq = 0;
    this.windowGroup = new THREE.Group();
    this.scene.add(this.windowGroup);
    this.arc = new THREE.Group();
    this.scene.add(this.arc);
    this.launcher = null;
    this.taskbar = null;
    this.frontTarget = new THREE.Vector3(0, 0.02, -1.9);
    this.history = [];
    this._v = new THREE.Vector3();
    this.gestureHold = { home: 0, back: 0, snap: 0 };
    this.snapOpen = false;

    // the catalog is *registered* (definitions) but only DEFAULT_INSTALLED is *installed*
    for (const a of [...APPS, ...PORT_APPS]) this.register(a, false);
    for (const ua of this.userApps) this.register(normalizeUserApp(ua), false);
    settings.on('change', ({ key, value }) => { if (key === 'stereo') this.relayout(); });
    this.hands.on('hands', (list) => this.onHands(list));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ------------------------------------------------------------ registry
  register(app, persist = true) {
    if (!app?.id) return;
    this.apps.set(app.id, app);
    if (persist) {
      const list = [...this.installed];
      if (!list.includes(app.id)) { list.push(app.id); this.installed.add(app.id); settings.set('installed', list); }
    }
    this.emit('app:registered', app);
    return app;
  }
  /** Uninstall: drops it from the launcher, keeps the definition so the Store can reinstall it. */
  unregister(id) {
    const app = this.apps.get(id);
    if (app?.user) this.apps.delete(id);
    this.installed.delete(id);
    settings.set('installed', [...this.installed]);
    settings.set('userApps', this.userApps.filter((a) => a.id !== id));
    this.userApps = this.userApps.filter((a) => a.id !== id);
    this.emit('app:removed', id);
  }
  /** Apps the launcher shows: everything installed (user apps included). */
  get appList() {
    return [...this.apps.values()].filter((a) => a && this.installed.has(a.id) && a.hidden !== true);
  }
  allCatalog() { return [...this.apps.values()]; }

  emit(type, data) { this.bus?.emit(type, data); }
  on(type, fn) { return this.bus?.on(type, fn); }
  off(type, fn) { return this.bus?.off(type, fn); }

  // ------------------------------------------------------------ windows
  get front() { return this.windows.filter((w) => !w.minimized).at(-1) || null; }

  async openApp(appId, opts = {}) {
    const app = this.apps.get(appId);
    if (!app) { toast(`App desconhecido: ${appId}`, 'err'); return null; }
    if (!this.installed.has(appId)) {
      const ok = await this.install(appId);
      if (!ok) return null;
    }
    const existing = opts.singleton !== false && this.windows.find((w) => w.app.id === appId);
    if (existing) {
      if (existing.minimized) existing.restore();
      this.focus(existing);
      if (opts.nav) existing.controller?.nav?.(opts.nav);
      return existing;
    }
    const win = new HoloWindow(this, app, opts);
    this.windows.push(win);
    this.windowGroup.add(win.panel.group);
    this.pointer.addPanel(win.panel);
    this.focus(win);
    this.placeOnArc(win, opts.slot);
    let controller = null;
    try {
      controller = await app.make({ ...this.env, app, meta: app, shell: this, window: win, panel: win.panel, kit: win.panel.kit, settings, audio, store, THREE, PALETTE, hexA, clamp });
    } catch (e) {
      console.error('app make failed', e);
      toast(`${app.name}: ${e.message}`, 'err');
      controller = { draw: (kit) => kit.text(`Falha ao iniciar: ${e.message}`, 30, 60, { size: 16, color: PALETTE.err }) };
    }
    win.attach(controller || {});
    win.setTitle(opts.title || app.name, opts.subtitle || app.tagline);
    win.panel.markDirty();
    if (this.launcher) this.launcher.panel.show(!opts.hideLauncher ? true : false);
    audio.open(win.worldPos);
    this.world.ping(0.8, win.worldPos);
    this.emit('app:open', { app, win });
    this.setLauncherPresence();
    return win;
  }

  close(win) {
    if (win === this.launcher) { this.home(); return; }
    const i = this.windows.indexOf(win);
    if (i < 0) return;
    this.windows.splice(i, 1);
    this.pointer.removePanel(win.panel);
    win.panel.show(false);
    win.dispose();
    audio.close(win.worldPos);
    this.focused = this.front;
    this.focus(this.focused);
    this.setLauncherPresence();
    this.emit('app:close', { app: win.app, win });
  }

  minimize(win) {
    win.minimize();
    this.focused = this.front;
    this.focus(this.focused);
    this.setLauncherPresence();
  }

  focus(win) {
    if (!win) { this.focused = null; return; }
    if (win.minimized) win.restore();
    if (this.focused === win) return;
    this.focused = win;
    for (const w of this.windows) w.panel.focus(w === win ? 1 : 0);
    this.windows.splice(this.windows.indexOf(win), 1);
    this.windows.push(win);
    this.windowGroup.attach(win.panel.group);
    this.pointer.frontPanel = win.panel;
    win.controller?.onFocus?.();
    this.emit('focus', win);
  }

  back() {
    const win = this.front;
    if (!win) { this.home(); return; }
    if (win.controller?.onBack?.() === false) { return; }
    if (this.history.length) { const prev = this.history.pop(); this.focus(this.windows.find((w) => w.id === prev) || win); }
    else this.close(win);
    audio.swoosh(win.worldPos);
  }

  home() {
    for (const w of this.windows) { if (w !== this.launcher && !w.minimized) w.minimize(); }
    this.focused = null;
    if (this.launcher) { this.launcher.panel.show(true); this.launcher.controller?.wake?.(); }
    this.setLauncherPresence();
    audio.swoosh();
    this.emit('home');
  }

  /** Only show the launcher when nothing is in front of it. */
  setLauncherPresence() {
    if (!this.launcher) return;
    const anyVisible = this.windows.some((w) => !w.minimized && w !== this.launcher);
    this.launcher.panel.show(!anyVisible && !this.snapOpen);
  }

  /** Slot windows on an arc around the head so the layout never goes flat. */
  placeOnArc(win, slot, instant = false) {
    const list = this.windows.filter((w) => !w.minimized && w !== this.launcher);
    const n = Math.max(1, list.length);
    const idx = slot ?? (list.length - 1);
    const stereo = settings.get('stereo');
    const spread = stereo ? 0.62 : 0.86;
    const a = clamp((idx - (n - 1) / 2) * spread, -1.25, 1.25);
    const radius = (stereo ? 2.0 : 1.85) + idx * 0.02;
    const x = Math.sin(a) * radius;
    const z = -Math.cos(a) * radius;
    const y = 0.02 + (idx % 2 ? 0.05 : -0.02);
    win.pos.set(x, y, z);
    win.targetPos = (win.targetPos || new THREE.Vector3()).set(x, y, z);
    win.targetRotY = -a;
    win.targetScale = 1;
    if (instant) {
      win.panel.group.position.set(x, y, z);
      win.panel.group.rotation.set(0, -a, 0);
      win.rot.set(0, -a, 0);
      win.tilt = 0;
      win.targetPos = null;
    }
  }

  relayout() {
    const vis = this.windows.filter((w) => !w.minimized);
    vis.forEach((w, i) => { if (!w.dragging) this.placeOnArc(w, i); });
    this.layoutLauncher();
  }

  /** Soft magnetism toward the arc slot: keeps the room tidy inside a headset. */
  snaps(win) {
    const i = this.windows.filter((w) => !w.minimized).indexOf(win);
    if (i >= 0) this.placeOnArc(win, i);
  }

  // ------------------------------------------------------------ launcher + taskbar
  async mountLauncher(appModule) {
    this.launcher = new HoloWindow(this, { id: 'launcher', name: 'Início', icon: 'home', color: PALETTE.accent, window: { width: 3.2, height: 1.55 } }, { hideChrome: true });
    this.launcher.panel.chromeFn = () => {};
    this.launcher.panel.contentTop = 0;
    this.launcher.content = { x: 0, y: 0, w: this.launcher.panel.designW, h: this.launcher.panel.designH };
    this.launcher.faceHead = true;
    this.windows.unshift(this.launcher);
    this.windowGroup.add(this.launcher.panel.group);
    this.pointer.addPanel(this.launcher.panel);
    const controller = await appModule({ ...this.env, shell: this, window: this.launcher, panel: this.launcher.panel, settings, audio, store, THREE, PALETTE, hexA, clamp });
    this.launcher.attach(controller);
    this.layoutLauncher();
    this.launcher.panel.show(true);
    return this.launcher;
  }

  layoutLauncher() {
    if (!this.launcher) return;
    const stereo = settings.get('stereo');
    const p = this.launcher.panel;
    p.baseScale = stereo ? 1.06 : 1;
    p.group.position.set(0, -0.02, stereo ? -2.35 : -2.15);
    p.group.rotation.set(0, 0, 0);
  }

  // ------------------------------------------------------------ gestures / keys
  onHands(list) {
    const both = list.length >= 2;
    const one = list[0];
    // palm hold → home, peace → back, pinch+grab windows, two-hand spread → snap ring
    for (const h of list) {
      if (h.open) this.gestureHold.home += 1 / 60; else this.gestureHold.home = 0;
      if (h.peace) this.gestureHold.back += 1 / 60; else this.gestureHold.back = 0;
      if (h.thumbUp) this.gestureHold.snap += 1 / 60; else this.gestureHold.snap = 0;
    }
    if (this.gestureHold.home > 0.55) { this.gestureHold.home = -1; this.home(); toast('🖐 Início'); }
    if (this.gestureHold.back > 0.4) { this.gestureHold.back = -1; this.back(); toast('✌️ Voltar'); }
    if (this.gestureHold.snap > 0.4) { this.gestureHold.snap = -1; this.toggleSnapRing(); }
    // two-hand spread scales the focused window
    const two = both ? this.hands.twoHand() : null;
    if (two && this.front && list.every((h) => h.grab)) {
      const k = clamp(two.dist / (two.spread * 6), 0.6, 1.6);
      this.front._scale = THREE.MathUtils.lerp(this.front._scale, k, 0.25);
      this.front.panel.markDirty();
    }
  }

  toggleSnapRing(force) {
    this.snapOpen = force ?? !this.snapOpen;
    this.setLauncherPresence();
    this.emit('snapring', this.snapOpen);
  }

  onKey(e) {
    if (document.activeElement?.classList?.contains('mp-input')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { this.back(); e.preventDefault(); }
    else if (k === 'h') this.home();
    else if (k === 'v') this.env.toggleMode();
    else if (k === 'r') this.env.head.doRecenter();
    else if (k === 'p') settings.toggle('passthrough');
    else if (k === 'f') settings.toggle('handsEnabled');
    else if (k === 'l') this.openApp('launcher');
    else if (k === '1') this.openApp('store');
    else if (k === '2') this.openApp('browser');
    else if (k === '3') this.openApp('settings');
    else if (k === '4') this.openApp('studio');
    else if (k === '5') this.openApp('player360');
  }

  update(dt, t) {
    for (const w of [...this.windows]) w.update(dt, t);
    if (this.focused?.dragging) this.focused.updateDrag();
    if (this.windows.length > 9) {
      const extra = this.windows.filter((w) => w !== this.launcher);
      while (extra.length > 8) { const w = extra.shift(); this.close(w); }
    }
  }
}

function normalizeUserApp(ua) {
  return {
    id: ua.id, name: ua.name, icon: ua.icon || 'bolt', color: ua.color || '#9be7ff',
    category: 'user', tagline: ua.tagline || 'App MetaPort API',
    size: ua.size || 40_000, version: ua.version || '1.0.0', author: ua.author || 'você',
    desc: ua.desc || 'App criado com a MetaPort Script API.',
    user: true,
    window: ua.window || { width: 1.25, height: 0.85 },
    make: (env) => env.shell.makeScriptController(ua, env)
  };
}

export { normalizeUserApp };
