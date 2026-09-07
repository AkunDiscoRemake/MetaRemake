import * as THREE from 'three';
import { HoloPanel } from './panel.js';
import { PALETTE, hexA } from './kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { clamp } from '../core/util.js';

const CHROME_H = 54;

/**
 * A window in MetaPort is not a rectangle on a screen — it is a slab of glass that
 * you can grab by its title bar, pull toward your face, rotate around the room and
 * push back. Depth, tilt and curvature are all real scene properties.
 */
export class HoloWindow {
  constructor(os, app, opts = {}) {
    this.os = os;
    this.app = app;
    this.id = opts.id || `${app.id}#${Math.random().toString(36).slice(2, 6)}`;
    this.minimized = false;
    this.maximized = false;
    this.dragging = false;
    this.focusK = 0;
    this.pinned = !!opts.pinned;
    const wide = app.window?.width ?? 1.55;
    const tall = app.window?.height ?? 0.98;
    this.base = { w: wide, h: tall };

    this.panel = new HoloPanel({
      id: this.id,
      name: app.id,
      width: wide,
      height: tall,
      designW: Math.round(wide * 640),
      designH: Math.round(tall * 640),
      accent: app.color || PALETTE.accent,
      radius: 20,
      live: true,
      chrome: (kit, panel, t) => this.drawChrome(kit, panel, t),
      draw: (kit, panel, t) => this.drawContent(kit, panel, t),
      onClick: (region, loc, panel) => this.handleClick(region, loc, panel),
      onDrag: (value, region, panel) => this.handleDrag(value, region, panel)
    });

    this.chromeH = opts.hideChrome ? 0 : CHROME_H;
    this.panel.contentTop = this.chromeH;
    this.content = { x: 14, y: this.chromeH + 12, w: this.panel.designW - 28, h: this.panel.designH - this.chromeH - 26 };
    this.panel.maxScroll = 0;

    this.pos = new THREE.Vector3(0, 0.05, -1.85);
    if (opts.position) this.pos.copy(opts.position);
    this.rot = new THREE.Euler(0, 0, 0, 'YXZ');
    this.tilt = 0;
    this.panel.group.position.copy(this.pos);
    this.panel.group.rotation.copy(this.rot);
    this.panel.baseScale = 1;
    this._scale = 1;
    this._grab = null;
    this._plane = new THREE.Plane();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.controller = null;
  }

  get mesh() { return this.panel.face; }
  get worldPos() { return this.panel.worldPos; }

  attach(controller) {
    this.controller = controller;
    controller.window = this;
    controller.panel = this.panel;
    if (controller.scroll) this.setScrollLimit();
  }

  setScrollLimit() {
    const c = this.controller;
    this.panel.contentH = Math.max(this.content.h, c.contentHeight || this.content.h);
    this.panel.maxScroll = Math.max(0, this.panel.contentH - this.content.h);
    this.panel.scroll = clamp(this.panel.scroll, 0, this.panel.maxScroll);
  }

  setTitle(title, sub = '') { this.title = title ?? this.app.name; this.subTitle = sub; this.panel.markDirty(); }

  drawChrome(kit, panel, t) {
    const c = kit.ctx;
    const w = panel.designW;
    const accent = this.app.color || PALETTE.accent;
    const foc = this.focusK;
    c.save();
    // title bar plate
    const g = kit.gradient(0, 0, w, 0, [
      [0, hexA(accent, 0.2 + foc * 0.16)],
      [0.45, 'rgba(9,15,28,.78)'],
      [1, hexA(PALETTE.accent2, 0.12 + foc * 0.08)]
    ]);
    kit.fillRR(6, 6, w - 12, CHROME_H - 6, 16, g, hexA(accent, 0.35 + foc * 0.3), 1.2);
    // app chip
    kit.fillRR(18, 15, 34, 34, 11, hexA(accent, 0.22), hexA(accent, 0.5), 1);
    kit.icon(this.app.icon || 'grid', 35, 32, 19, accent);
    kit.text(this.title || this.app.name, 62, 26, { size: 15.5, weight: 700, maxWidth: w - 260 });
    if (this.subTitle) kit.text(this.subTitle, 62, 41, { size: 10.5, color: PALETTE.ink3, letterSpacing: 0.6, maxWidth: w - 260 });
    // grip affordance
    c.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) kit.fillRR(w / 2 - 16 + i * 12, 26, 6, 6, 3, 'rgba(190,225,255,.5)');
    c.globalAlpha = 1;
    // buttons
    const bx = w - 18;
    const btns = [
      { id: `${this.id}:max`, icon: this.maximized ? 'exit' : 'cast', label: '' },
      { id: `${this.id}:min`, icon: 'minus' },
      { id: `${this.id}:close`, icon: 'close', danger: true }
    ];
    btns.reduceRight((x, b, i) => {
      const s = 30;
      const px = x - s;
      const hot = panel.state.hover === b.id, down = panel.state.down === b.id;
      kit.fillRR(px, 18, s, s, 9, b.danger && hot ? hexA(PALETTE.err, 0.4) : hot ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)', hot ? 'rgba(190,225,255,.4)' : 'rgba(150,205,255,.14)', 1);
      kit.icon(b.icon, px + s / 2, 18 + s / 2, 15, b.danger && hot ? '#ffd8e0' : PALETTE.ink2);
      kit.region({ id: b.id, kind: 'button', x: px, y: 18, w: s, h: s, data: { action: b.id.split(':')[1] } });
      return px - 6;
    }, bx);
    // depth rail (drag to push the slab nearer/farther)
    const railY = panel.designH - 26;
    kit.text('PROFUNDIDADE', 20, railY, { size: 9.5, weight: 700, color: PALETTE.ink3, letterSpacing: 1.2 });
    const d01 = clamp((Math.abs(this.pos.z) - 0.9) / 4.1, 0, 1);
    const rw = w - 190;
    kit.fillRR(120, railY - 9, rw, 18, 9, 'rgba(255,255,255,.05)', 'rgba(150,205,255,.14)', 1);
    kit.fillRR(120, railY - 9, Math.max(18, rw * d01), 18, 9, hexA(accent, 0.3));
    c.save();
    c.shadowColor = accent; c.shadowBlur = 10;
    c.beginPath(); c.arc(120 + rw * d01, railY, 7, 0, 6.2832);
    c.fillStyle = '#eafffb'; c.fill(); c.restore();
    kit.region({ id: `${this.id}:depth`, kind: 'slider', x: 120, y: railY - 12, w: rw, h: 24, data: { min: 0.9, max: 5, step: 0.01, value: Math.abs(this.pos.z) }, value: Math.abs(this.pos.z) });
    kit.text(`${Math.abs(this.pos.z).toFixed(2)} m`, w - 18, railY, { size: 11, color: PALETTE.ink2, align: 'right' });
    // move grip region (whole bar, minus buttons)
    kit.region({ id: `${this.id}:move`, kind: 'drag', x: 6, y: 6, w: w - 190, h: CHROME_H - 8, data: { action: 'move' } });
    c.restore();
    // app-provided fixed strip (browser toolbar, desktop menu bar…)
    if (this.controller?.chrome && !this.minimized) { try { this.controller.chrome(kit); } catch (e) { console.error('[chrome strip]', e); } }
    panel.markDirty();
  }

  drawContent(kit, panel, t) {
    const c = kit.ctx;
    const { x, y, w, h } = this.content;
    c.save();
    // body plate
    const ch = this.chromeH;
    kit.fillRR(6, ch, panel.designW - 12, panel.designH - ch - 6, 14, kit.gradient(x, y, x, y + h, [[0, 'rgba(7,12,24,.86)'], [1, 'rgba(4,8,17,.93)']]));
    c.beginPath();
    c.rect(6, ch + 2, panel.designW - 12, panel.designH - ch - 8);
    c.clip();
    if (this.controller?.draw) {
      try { this.controller.draw(kit, t); } catch (e) {
        console.error(`[app ${this.app.id}]`, e);
        kit.text(`⚠ ${e.message}`, x + 10, y + 30, { size: 14, color: PALETTE.err });
        this.os.lastError = String(e?.message || e);
      }
    }
    c.restore();
    if (panel.maxScroll > 0) {
      const th = Math.max(40, h * (h / Math.max(1, panel.contentH)));
      const ty = y + (h - th) * (panel.scroll / (panel.maxScroll || 1));
      kit.fillRR(panel.designW - 12, ty, 3, th, 2, 'rgba(150,220,255,.4)');
    }
  }

  handleClick(region, loc, panel) {
    const act = region.data?.action;
    if (region.id.startsWith(this.id)) {
      if (act === 'close') { this.os.close(this); return; }
      if (act === 'min') { this.os.minimize(this); return; }
      if (act === 'max') { this.toggleMax(); return; }
      if (act === 'move') { this.startDrag(loc); return; }
    }
    this.controller?.onClick?.(region, loc, panel);
  }

  handleDrag(value, region, panel) {
    if (region.id === `${this.id}:depth`) {
      const dir = Math.sign(this.pos.z) || -1;
      this.pos.z = dir * clamp(value, 0.9, 5);
      this.panel.group.position.copy(this.pos);
      this.os.emit('window:depth', { win: this, depth: value });
      return;
    }
    this.controller?.onDrag?.(value, region, panel);
  }

  /** Grab by title bar: the slab follows the pointer in the plane it lives in. */
  startDrag(loc) {
    const cam = this.os.view.camera;
    this.os.view.rig.updateWorldMatrix(true, false);
    const n = cam.getWorldDirection(new THREE.Vector3());
    this._plane.setFromNormalAndCoplanarPoint(n, this.panel.group.position);
    const ray = this.os.pointer.raycaster.ray;
    const p = new THREE.Vector3();
    ray.intersectPlane(this._plane, p);
    this._grab = { offset: p.sub(this.panel.group.position) };
    this.dragging = true;
    audio.swoosh(this.worldPos);
  }

  updateDrag() {
    if (!this.dragging) return;
    const ray = this.os.pointer.raycaster.ray;
    const p = this._v.set(0, 0, 0);
    if (ray.intersectPlane(this._plane, p)) {
      p.sub(this._grab.offset);
      p.x = clamp(p.x, -2.6, 2.6);
      p.y = clamp(p.y, -1.1, 1.9);
      this.panel.group.position.lerp(p, 0.55);
      this.pos.copy(this.panel.group.position);
      // gentle spatial tilt while dragging
      this.tilt = clamp(-p.x * 0.1, -0.16, 0.16);
    }
  }

  endDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    this.os.emit('window:moved', { win: this });
    audio.release(this.worldPos);
    this.os.snaps?.(this);
  }

  toggleMax() {
    this.maximized = !this.maximized;
    if (this.maximized) {
      this.prev = { pos: this.pos.clone(), w: this.base.w, h: this.base.h };
      const target = this.os.frontTarget.clone();
      target.multiplyScalar(1.28);
      this.panel.group.position.copy(target);
      this.pos.copy(target);
      this._scale = 1.35;
    } else if (this.prev) {
      this.panel.group.position.copy(this.prev.pos);
      this.pos.copy(this.prev.pos);
      this._scale = 1;
    }
    audio.open(this.worldPos);
    this.panel.markDirty();
  }

  minimize() {
    this.minimized = true;
    this.panel.show(false);
    this.os.emit('window:min', { win: this });
  }
  restore() {
    this.minimized = false;
    this.panel.show(true);
    this.os.emit('window:open', { win: this });
  }

  update(dt, t) {
    this.focusK += ((this.os.focused === this ? 1 : 0) - this.focusK) * (1 - Math.exp(-8 * dt));
    this.panel.baseScale = this._scale;
    this.panel.group.rotation.x = THREE.MathUtils.lerp(this.panel.group.rotation.x, this.tilt + (settings.get('stereo') ? 0.02 : 0), 0.1);
    this.panel.group.rotation.y = THREE.MathUtils.lerp(this.panel.group.rotation.y, this.faceHead ? this.headYaw() : -this.tilt * 0.4, 0.1);
    if (this.dragging) this.updateDrag();
    else if (this.targetPos) {
      const g = this.panel.group;
      g.position.lerp(this.targetPos, 1 - Math.exp(-7 * dt));
      g.rotation.y += (this.targetRotY - g.rotation.y) * (1 - Math.exp(-7 * dt));
      if (g.position.distanceTo(this.targetPos) < 0.004) { this.targetPos = null; this.pos.copy(g.position); this.rot.copy(g.rotation); }
    }
    if (this.panel.state.pressed?.id === `${this.id}:move` && !this.os.pointer.pressed) this.endDrag();
    if (!this.os.pointer.pressed && this.dragging) this.endDrag();
    this.panel.update(dt);
    this.controller?.tick?.(dt, t);
  }

  headYaw() {
    const p = this.panel.group.position;
    return Math.atan2(-p.x, -p.z);
  }

  dispose() {
    try { this.controller?.destroy?.(); } catch { /* ignore */ }
    this.panel.dispose();
  }
}
