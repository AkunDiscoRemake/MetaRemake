import * as THREE from 'three';
import { Kit, PALETTE, hexA } from './kit.js';
import { settings } from '../core/settings.js';
import { clamp, uid } from '../core/util.js';
import { audio } from '../core/audio.js';

const sharedGlowTex = /* lazily built */ { tex: null };
function glowTexture() {
  if (sharedGlowTex.tex) return sharedGlowTex.tex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.85)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  sharedGlowTex.tex = t;
  return t;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * A HoloPanel is the primitive the whole OS is built from: a volumetric slab of
 * glass in the world whose surface is a live canvas. It has real thickness, edge
 * lighting, curvature and it spills light onto the room behind it.
 */
export class HoloPanel {
  constructor(opts = {}) {
    this.id = opts.id || uid('panel');
    this.designW = opts.designW ?? 1000;
    this.designH = opts.designH ?? Math.round((this.designW * (opts.height / opts.width)) || 640);
    this.physW = opts.width ?? 1.6;
    this.physH = opts.height ?? (this.physW * this.designH / this.designW);
    this.radius = opts.radius ?? 18;
    this.accent = opts.accent || PALETTE.accent;
    this.scroll = 0;
    this.maxScroll = 0;
    this.contentH = this.designH;
    this.regions = [];
    this.state = { hover: null, down: null, focus: 0, pressed: null };
    this.ripples = [];
    this.kit = new Kit(this);
    this.drawFn = opts.draw || null;
    this.onClick = opts.onClick || null;
    this.onDown = opts.onDown || null;
    this.onUp = opts.onUp || null;
    this.onDrag = opts.onDrag || null;
    this.onScroll = opts.onScroll || null;
    this.interactive = opts.interactive !== false;
    this.live = opts.live !== false;
    this.alpha = 0;
    this.pulse = 0;
    this.chromeFn = opts.chrome || null;
    this.target = 1;
    this.time = 0;
    this._dirty = true;
    this._renderAcc = 0;
    this.userData = opts.userData || {};

    this.group = new THREE.Group();
    this.group.name = `panel:${opts.name || this.id}`;
    const curve = opts.curve ?? settings.get('curve') ?? 0;
    const w = this.physW, h = this.physH, r = (this.radius / this.designW) * this.physW;

    // --- glass slab ---
    const shape = roundedRectShape(w, h, r);
    const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 8 });
    slabGeo.translate(0, 0, -0.026);
    slabGeo.userData.base = slabGeo.attributes.position.array.slice();
    if (curve) bendGeometry(slabGeo, w, curve);
    this.slab = new THREE.Mesh(slabGeo, new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x0a1424), metalness: 0.55, roughness: 0.32,
      transparent: true, opacity: 0.72, clearcoat: 1, clearcoatRoughness: 0.18,
      envMapIntensity: 1.1, side: THREE.DoubleSide
    }));
    this.group.add(this.slab);

    // --- edge light ---
    const pts = shape.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0.001));
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(pts.concat([pts[0]]));
    edgeGeo.userData.base = edgeGeo.attributes.position.array.slice();
    if (curve) bendGeometry(edgeGeo, w, curve);
    this.edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.accent), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.edge = new THREE.Line(edgeGeo, this.edgeMat);
    this.group.add(this.edge);

    // --- content face ---
    this.canvas = document.createElement('canvas');
    const scale = clamp((opts.scale ?? (window.devicePixelRatio || 1)) * 1.15, 1, 2);
    this.canvas.width = Math.round(this.designW * scale);
    this.canvas.height = Math.round(this.designH * scale);
    this.px = this.canvas.width / this.designW;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.px, this.px);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = Math.min(8, this.canvas.width > 1024 ? 8 : 4);
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    const faceGeo = new THREE.PlaneGeometry(w, h, curve ? 48 : 1, 2);
    faceGeo.userData.base = faceGeo.attributes.position.array.slice();
    if (curve) bendGeometry(faceGeo, w, curve);
    this.face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.face.position.z = 0.0015;
    this.face.userData.panel = this;
    this.group.add(this.face);

    // --- room light spill (behind) ---
    this.spill = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: new THREE.Color(this.accent), transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }));
    this.spill.scale.set(w * 2.1, h * 2.2, 1);
    this.spill.position.z = -0.06;
    this.spill.renderOrder = -1;
    this.group.add(this.spill);

    settings.on('change', ({ key, value }) => {
      if (key === 'curve') { bendGeometry(faceGeo, w, value); bendGeometry(slabGeo, w, value); bendGeometry(edgeGeo, w, value); }
      if (key === 'theme') { this.accent = opts.accent || PALETTE.accent; this.edgeMat.color.set(this.accent); this.spill.material.color.set(this.accent); }
    });
  }

  setDraw(fn) { this.drawFn = fn; this._dirty = true; }
  setPos(x, y, z) { this.group.position.set(x, y, z); return this; }
  setRot(x = 0, y = 0, z = 0) { this.group.rotation.set(x, y, z); return this; }
  setScale(s) { this.group.scale.setScalar(s); return this; }
  show(v = true) { this.target = v ? 1 : 0; }
  focus(v = 1) { this.state.focus = v; }
  get worldPos() { return this.group.getWorldPosition(new THREE.Vector3()); }
  get boundingSize() { return { w: this.physW * this.group.scale.x, h: this.physH * this.group.scale.y }; }
  get mesh() { return this.face; }

  markDirty() { this._dirty = true; }

  /** Raycast helper: returns design-space coords + region for a hit on this face. */
  locate(intersect) {
    const uv = intersect.uv;
    if (!uv) return null;
    const x = uv.x * this.designW;
    const y = (1 - uv.y) * this.designH + this.scroll;
    const region = this.hitTest(x, y - this.scroll);
    return { x, y, local: { x: uv.x * this.designW, y: (1 - uv.y) * this.designH }, region };
  }

  hitTest(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // ---- input, driven by the global pointer manager ----
  enter(loc) {
    const id = loc?.region?.id ?? null;
    if (id !== this.state.hover) {
      this.state.hover = id;
      if (id) audio.hover(this.worldPos);
      this._dirty = true;
    }
  }
  press(loc) {
    if (!loc) return false;
    this.state.down = loc.region?.id ?? null;
    this.state.pressed = loc.region ?? null;
    if (loc.region?.kind === 'button') audio.press(this.worldPos);
    else if (loc.region) audio.tap?.(this.worldPos);
    else audio.swoosh(this.worldPos);
    this.addRipple(loc.x, loc.y);
    this._dirty = true;
    if (loc.region?.kind === 'slider' && this.onDrag) this.onDrag(this.sliderValue(loc.region, loc.x), loc.region, this);
    return true;
  }
  release(loc) {
    const r = this.state.pressed;
    this.state.down = null;
    this._dirty = true;
    if (!r || !loc) return null;
    if (r.kind === 'slider') { this.state.pressed = null; return null; }
    const same = loc.region && loc.region.id === r.id;
    this.state.pressed = null;
    if (!same) return null;
    return r;
  }
  drag(loc) {
    const r = this.state.pressed;
    if (r?.kind === 'slider' && this.onDrag) this.onDrag(this.sliderValue(r, loc.x), r, this);
  }
  sliderValue(region, x) { return Kit.sliderValue(region, x); }

  scrollBy(dy) {
    if (!this.maxScroll) return false;
    const before = this.scroll;
    this.scroll = clamp(this.scroll + dy, 0, this.maxScroll);
    if (before !== this.scroll) this._dirty = true;
    return before !== this.scroll;
  }

  addRipple(x, y) {
    this.ripples.push({ x, y, t: 0 });
    if (this.ripples.length > 6) this.ripples.shift();
  }

  update(dt) {
    this.time += dt;
    const a = this.alpha + (this.target - this.alpha) * (1 - Math.exp(-9 * dt));
    this.alpha = a;
    const s = clamp(a, 0.001, 1);
    this.group.scale.setScalar(s * (this.baseScale || 1));
    this.face.material.opacity = a;
    this.slab.material.opacity = 0.72 * a;
    this.edgeMat.opacity = (0.35 + this.state.focus * 0.45) * a;
    this.spill.material.opacity = (0.1 + this.state.focus * 0.13 + this.pulse * 0.2) * a;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += dt;
      if (this.ripples[i].t > 0.55) this.ripples.splice(i, 1);
    }
    this.pulse = Math.max(0, (this.pulse || 0) - dt * 2.4);
    if (this.target < 0.5 && a < 0.02) this.group.visible = false;
    else this.group.visible = true;

    // redraw cadence: live panels at ~45fps, static only when dirty
    this._renderAcc += dt;
    const cadence = this.live ? 1 / 45 : 1e9;
    if (this._dirty || this._renderAcc >= cadence || this.ripples.length) {
      this._renderAcc = 0;
      this._dirty = false;
      this.renderContent(dt);
    }
  }

  renderContent() {
    if (!this.drawFn && !this.chromeFn) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.designW, this.designH);
    const kit = this.kit;
    kit.begin(ctx, this.designW, this.designH, this.state, this.time);
    ctx.save();
    ctx.translate(0, -this.scroll);
    try {
      this.drawFn?.(kit, this, this.time);
    } catch (e) {
      console.error('[panel draw]', e);
      kit.text(`erro de render: ${e.message}`, 24, 24, { size: 13, color: PALETTE.err });
    }
    ctx.restore();
    // fixed chrome (window title bars) painted last, above scrolling content
    if (this.chromeFn) {
      kit.chromeOffset = this.scroll;
      try { this.chromeFn(kit, this, this.time); } catch (e) { console.error('[chrome]', e); }
      kit.chromeOffset = 0;
    }
    if (this.maxScroll > 0) {
      kit.scrollbar(70, this.designH - 86, { t: this.scroll / this.maxScroll, thumb: this.designH / this.contentH });
    }
    for (const rp of this.ripples) {
      const k = rp.t / 0.55;
      kit.ripple(rp.x, rp.y - this.scroll, 8 + k * 46, this.accent, (1 - k) * 0.5);
    }
    kit.end();
    ctx.restore();
    this.regions = kit.regions.slice();
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.face.geometry.dispose(); this.face.material.dispose();
    this.slab.geometry.dispose(); this.slab.material.dispose();
    this.edge.geometry.dispose(); this.edgeMat.dispose();
    this.tex.dispose();
  }
}

/** Re-bends from the stored original vertices, so changing curvature never compounds. */
export function bendGeometry(geo, width, amount) {
  const base = geo.userData.base;
  const pos = geo.attributes.position;
  if (base) {
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    }
  }
  if (!amount) { pos.needsUpdate = true; geo.computeVertexNormals(); return; }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = x / (width / 2);
    pos.setZ(i, pos.getZ(i) - amount * t * t * width * 0.22);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  if (geo.attributes.uv) { /* uv untouched → hit mapping stays exact */ }
}

export { glowTexture };
