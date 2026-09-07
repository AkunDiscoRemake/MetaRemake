import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { Emitter, clamp } from '../core/util.js';
import { audio } from '../core/audio.js';
import { PALETTE } from '../ui/kit.js';

/**
 * One input path for every device: hand pinch, head gaze (dwell), mouse, touch and
 * gamepad. Sources are resolved to a ray, the ray is tested against panel faces and
 * against 3D objects apps registered, and the resulting press/release/drag/scroll
 * events are dispatched identically — so app code never branches per device.
 */
export class PointerManager extends Emitter {
  constructor(view, tracker) {
    super();
    this.view = view;
    this.tracker = tracker;
    this.panels = [];
    this.objects = [];
    this.raycaster = new THREE.Raycaster();
    this.ray = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), source: 'none' };
    this.ndc = new THREE.Vector2(0, 0);
    this.hover = null;           // { panel, loc } or { object, data }
    this.active = null;
    this.pressed = false;
    this.dwell = 0;
    this.dwellTarget = null;
    this.mode = 'mouse';         // mouse | hand | gaze | touch | pad
    this.dragLast = null;
    this.pad = { x: 0, y: 0 };
    this.padPressed = false;
    this.mouseNdc = new THREE.Vector2(0, 0);
    this.hasPad = false;
    this._hp = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.scrollAcc = 0;
    this.attachDom();
  }

  addPanel(panel) { if (!this.panels.includes(panel)) this.panels.push(panel); }
  removePanel(panel) { this.panels = this.panels.filter((p) => p !== panel); }
  /** Register a raw Object3D (launcher tiles, 3D widgets) as clickable. */
  register(object, data = {}) {
    this.objects.push({ object, ...data });
    return () => { this.objects = this.objects.filter((o) => o.object !== object); };
  }
  clearObjects() { this.objects.length = 0; }

  attachDom() {
    const el = this.view.renderer.domElement;
    const toNdc = (e) => {
      const r = el.getBoundingClientRect();
      const stereo = this.view.stereo;
      let x = (e.clientX - r.left) / r.width;
      if (stereo) x = (x < 0.5 ? x * 2 : (x - 0.5) * 2);   // map the touched eye back to [0..1]
      return new THREE.Vector2(x * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.ndc.copy(toNdc(e));
      this.mode = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      this.mouseNdc = this.ndc.clone();
      this.beginPress();
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && !this.pressed) return;
      this.mouseNdc = toNdc(e);
      if (!this.pressed) this.mode = 'mouse';
    });
    el.addEventListener('pointerup', (e) => { this.endPress(); });
    el.addEventListener('pointercancel', () => { this.endPress(); });
    el.addEventListener('wheel', (e) => { this.scroll(e.deltaY * 0.6); e.preventDefault(); }, { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', () => { this.hasPad = true; });
  }

  get camera() { return this.view.stereo ? this.view.camera : this.view.camera; }

  /** Frame update: resolve ray, hover, press. */
  update(dt, hands = []) {
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    let source = 'mouse';
    let ndc = this.mouseNdc || new THREE.Vector2(0, 0);
    let rayFrom = null;
    const handsOn = settings.get('handsEnabled') && this.tracker.active;

    if (handsOn && hands.length) {
      const h = this.pickHand(hands);
      if (h) {
        source = 'hand';
        const use = settings.get('rayMode');
        const pt = use === 'gaze' ? null : (use === 'wrist' ? h.palmPointer : { x: h.pointer.x, y: h.pointer.y });
        if (pt) { ndc = new THREE.Vector2(pt.x, -pt.y); rayFrom = h; }
      }
    }
    if (source !== 'hand' && settings.get('handFallback')) {
      // no hands: gaze in stereo/headset, mouse on desktop
      if (this.view.stereo || settings.get('headSource') === 'gyro') { source = 'gaze'; ndc = new THREE.Vector2(0, 0); }
    }
    if (this.hasPad && navigator.getGamepads) {
      const gp = [...navigator.getGamepads()].find(Boolean);
      if (gp) {
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.16) { source = 'pad'; ndc = new THREE.Vector2(this.pad.x + ax * 0.06, this.pad.y - ay * 0.06); this.pad = { x: clamp(ndc.x, -1, 1), y: clamp(ndc.y, -1, 1) }; }
        else this.pad = this.pad || { x: 0, y: 0 };
        if (!this.padPressed && gp.buttons[0]?.pressed) { this.padPressed = true; this.ndc.copy(ndc); this.beginPress(); }
        if (this.padPressed && !gp.buttons[0]?.pressed) { this.padPressed = false; this.ndc.copy(ndc); this.endPress(); }
      }
    }
    if (!this.pad) this.pad = { x: 0, y: 0 };
    this.mode = source;
    this.ndc.copy(ndc);

    // build ray: from the eye through the NDC point
    this.raycaster.setFromCamera(ndc, cam);
    this.ray.origin.copy(this.raycaster.ray.origin);
    this.ray.dir.copy(this.raycaster.ray.direction);
    this.ray.source = source;
    this.ray.hand = rayFrom;

    // ---- hit test ----
    const faces = this.panels.filter((p) => p.interactive && p.group.visible && p.alpha > 0.4).map((p) => p.face);
    let best = null;
    if (faces.length) {
      const hits = this.raycaster.intersectObjects(faces, false);
      if (hits.length) {
        const h0 = hits[0];
        const panel = h0.object.userData.panel;
        const loc = panel.locate(h0);
        if (loc) best = { panel, loc, dist: h0.distance };
      }
    }
    let objBest = null;
    if (this.objects.length) {
      const list = this.objects.map((o) => o.object);
      const hits = this.raycaster.intersectObjects(list, true);
      if (hits.length) {
        const h0 = hits[0];
        let node = h0.object;
        while (node && !this.objects.find((o) => o.object === node)) node = node.parent;
        const rec = node ? this.objects.find((o) => o.object === node) : null;
        if (rec) objBest = { rec, hit: h0, dist: h0.distance };
      }
    }
    const target = best && (!objBest || best.dist <= objBest.dist) ? best : objBest;

    // ---- hover transitions ----
    const prev = this.hover;
    this.hover = target;
    if (prev?.panel && prev !== target) prev.panel.enter(null);
    if (target?.panel) target.panel.enter(target.loc);
    if (target?.rec) {
      if (!prev?.rec || prev.rec !== target.rec) { target.rec.onHover?.(true, target); this.emit('hover3d', target.rec); }
    }
    if (prev?.rec && prev.rec !== target?.rec) prev.rec.onHover?.(false, prev);
    for (const p of this.panels) if (p !== target?.panel && p.state.hover) p.enter(null);

    // ---- dwell (gaze click) ----
    if (source === 'gaze' && target) {
      if (this.dwellTarget !== target) { this.dwellTarget = target; this.dwell = 0; }
      this.dwell += dt * 1000;
      if (this.dwell >= settings.get('dwellMs') && !this.pressed) {
        this.beginPress(true);
        setTimeout(() => this.endPress(), 60);
        this.dwell = -600;
      }
    } else { this.dwell = 0; this.dwellTarget = null; }

    // press → drag widgets, or drag the empty area to scroll the panel
    if (this.pressed && this.active?.panel) {
      const p2 = this.active.panel;
      const loc = target?.panel === p2 ? target.loc : this.active.loc;
      const onSlider = this.active.loc?.region?.kind === 'slider' || this.active.loc?.region?.kind === 'field';
      if (loc) p2.drag(loc);
      if (!onSlider && loc && this._lastY !== undefined) {
        const dy = (this._lastY - ndc.y) * p2.designH * 1.15;
        if (Math.abs(dy) > 0.4) {
          if (p2.scrollBy(dy)) { this.emit('scroll', { panel: p2, dy }); p2.markDirty(); }
        }
      }
    }
    this._lastY = ndc.y;
    let hp = null;
    if (best) hp = this._v.copy(this.ray.origin).addScaledVector(this.ray.dir, best.dist);
    else if (objBest) hp = this._v.copy(objBest.hit.point);
    this.hitPoint = hp;
    this.hitNdc = ndc;
    this.emit('update', { target, source, ndc });
  }

  pickHand(hands) {
    // prefer the hand pointing at something (extended index), else the largest
    const pointing = hands.find((h) => h.point && !h.pinch);
    const withPinch = hands.find((h) => h.pinch);
    return withPinch || pointing || hands[0];
  }

  beginPress(from = 'auto') {
    if (this.pressed) return;
    this.pressed = true;
    const t = this.hover;
    if (t?.panel) {
      this.active = { panel: t.panel, loc: t.loc };
      t.panel.press(t.loc);
    } else if (t?.rec) {
      this.active = { rec: t.rec };
      t.rec.onDown?.(t);
      audio.press(this._v.copy(t.hit.point));
      settings.get('haptics') && audio.haptic(14);
    } else {
      this.active = null;
      this.emit('backgroundDown');
    }
  }

  endPress() {
    if (!this.pressed) return;
    this.pressed = false;
    const t = this.hover;
    const a = this.active;
    if (a?.panel) {
      const region = a.panel.release(t?.panel === a.panel ? t.loc : null);
      if (region) {
        this.emit('click', { panel: a.panel, region, loc: t?.loc });
        a.panel.onClick?.(region, t?.loc, a.panel);
        audio.haptic(10);
      }
      a.panel.state.pressed = null;
      a.panel.state.down = null;
    } else if (a?.rec) {
      if (t?.rec === a.rec) { a.rec.onClick?.(a.rec, t); this.emit('click3d', a.rec); }
      a.rec.onUp?.(a.rec);
    } else {
      this.emit('backgroundUp');
    }
    this.active = null;
  }

  /** dy in px; routed to the hovered panel, else to the front-most scrollable. */
  scroll(dy) {
    const panel = this.hover?.panel || this.frontPanel;
    if (panel?.scrollBy(dy)) { audio.swoosh(panel.worldPos); this.emit('scroll', { panel, dy }); return; }
    this.emit('scroll', { panel: null, dy });
  }

  set frontPanel(p) { this._front = p; }
  get frontPanel() { return this._front || this.panels[this.panels.length - 1]; }
}

/**
 * The visual half of the input system: a light beam from the fingertip and a
 * reticle on the surface it hits, with dwell progress + pinch flash.
 */
export class CursorFX {
  constructor(scene, pointer, world) {
    this.scene = scene;
    this.pointer = pointer;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.rayMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ray = new THREE.Line(this.rayGeo, this.rayMat);
    this.ray.frustumCulled = false;
    this.group.add(this.ray);

    this.tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#eafffb'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.group.add(this.tip);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.026, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.group.add(this.ring);

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.scale.set(0.16, 0.16, 1);
    this.group.add(this.halo);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.0006, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.beam.visible = false;
    this.group.add(this.beam);
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  update(dt, t) {
    const p = this.pointer;
    const has = !!p.hover;
    const hand = p.ray.hand;
    // beam from the fingertip (or the head for gaze) to the hit point
    const start = this._a;
    if (hand && p.mode === 'hand') {
      const idx = 8;
      p.tracker.imageToWorld(hand.disp?.[idx] ?? (hand.pointer.u), hand.pointer.v, p.tracker.landmarkDepth(hand, hand.lm[idx]), start);
    } else start.copy(p.ray.origin).addScaledVector(p.ray.dir, 0.25);

    const end = this._b.copy(p.hitPoint || start.clone().addScaledVector(p.ray.dir, 5));
    if (!p.hitPoint) end.copy(start).addScaledVector(p.ray.dir, 5);
    const arr = this.rayGeo.attributes.position.array;
    arr[0] = start.x; arr[1] = start.y; arr[2] = start.z;
    arr[3] = end.x; arr[4] = end.y; arr[5] = end.z;
    this.rayGeo.attributes.position.needsUpdate = true;
    this.rayMat.opacity = (has ? 0.5 : 0.18) * (p.pressed ? 1.8 : 1) * (p.mode === 'hand' ? 1 : 0.5);
    this.tip.position.copy(end);
    this.tip.material.opacity = has ? 0.95 : 0.25;
    this.tip.scale.setScalar((p.pressed ? 1.7 : 1) + (has ? 0.2 * Math.sin(t * 8) : 0));
    this.ring.position.copy(end);
    this.halo.position.copy(end);
    this.halo.material.opacity = has ? 0.35 + (p.pressed ? 0.4 : 0) : 0.08;
    this.halo.scale.setScalar(0.13 + (p.pressed ? 0.09 : 0) + (has ? 0.02 * Math.sin(t * 6) : 0));
    const dwell = p.mode === 'gaze' ? clamp(p.dwell / Math.max(1, settings.get('dwellMs')), 0, 1) : 0;
    this.ring.visible = dwell > 0.01 || has;
    this.ring.material.opacity = dwell > 0.01 ? 0.9 : 0.35;
    this.ring.scale.setScalar(1 + (1 - dwell) * 1.6);
    this.ring.lookAt(p.ray.origin);
    this.ring.rotation.z = -Math.PI / 2;
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.RingGeometry(0.02, 0.028, 24, 1, Math.PI / 2, Math.max(0.001, dwell * Math.PI * 2));
    if (dwell > 0 && this.dwellRingPrev !== dwell) this.emitProgress?.(dwell);
    this.beam.visible = false;
  }
}

let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,.9)');
  grd.addColorStop(0.4, 'rgba(255,255,255,.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
