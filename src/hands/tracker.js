import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { Emitter, clamp, toast } from '../core/util.js';
import { camera as camFeed } from '../engine/camera.js';
import { classify, pinchGap } from './gestures.js';

/**
 * MediaPipe Hands (Tasks Vision) driver.
 *
 * Runs on the same <video> element used for MR passthrough, so the aura, the
 * passthrough and the tracking always agree. Produces, per hand:
 *   .lm        — 21 landmarks in image space (x,y in 0..1, z relative)
 *   .world     — 21 landmarks in metres (real scale, used for the 3D contour)
 *   .gestures  — pinch / grab / point / open / peace / thumbUp …
 *   .pointer   — normalised screen NDC the ray is cast through
 */
export class HandTracker extends Emitter {
  constructor(view, world) {
    super();
    this.view = view;
    this.world = world;
    this.status = 'idle';      // idle | loading | ok | error | denied
    this.detail = '';
    this.hands = [];
    this.prev = new Map();
    this.enabled = settings.get('handsEnabled');
    this.lastTs = 0;
    this.fps = 0;
    this._frames = 0; this._acc = 0;
    this.model = null;
    this.fallbackTimer = 0;
    settings.on('change', ({ key, value }) => {
      if (key === 'handsEnabled') { this.enabled = value; if (!value) this.hands = []; }
      if (key === 'numHands' && this.model) this.model.setOptions({ numHands: value }).catch(() => {});
      if (key === 'cameraFacing') this.restart();
    });
  }

  async init() {
    this.setStatus('loading', 'carregando MediaPipe…');
    try {
      const [{ HandLandmarker, FilesetResolver }] = await Promise.all([import('@mediapipe/tasks-vision')]);
      const wasmBase = await firstBase([
        new URL('./wasm', location.href).href,
        'node_modules/@mediapipe/tasks-vision/wasm/',
        `${settings.get('modelBase')}/wasm`
      ]);
      const fileset = await FilesetResolver.forVisionTasks(wasmBase);
      const modelPath = await firstExisting([
        new URL('./models/hand_landmarker.task', location.href).href,
        settings.get('modelUrl')
      ]);
      const opts = {
        baseOptions: { modelAssetPath: modelPath },
        runningMode: 'VIDEO',
        numHands: settings.get('numHands'),
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      };
      let model = null;
      for (const delegate of ['GPU', 'CPU']) {
        try {
          model = await HandLandmarker.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate } });
          this.delegate = delegate;
          break;
        } catch (e) { this.detail = `${delegate} falhou: ${e?.message || e}`; }
      }
      if (!model) throw new Error('não foi possível iniciar o HandLandmarker');
      this.model = model;
      this.setStatus('ok', `MediaPipe HandLandmarker (${this.delegate})`);
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      this.setStatus('error', msg);
      toast(`Hand tracking: ${msg.slice(0, 90)}`, 'warn', 4200);
      return false;
    }
  }

  async restart() {
    if (!this.model) return;
    const ok = await camFeed.start();
    if (ok) this.lastTs = 0;
  }

  setStatus(status, detail = '') {
    this.status = status; this.detail = detail;
    this.emit('status', { status, detail });
  }

  /** Request camera + build model. Called after the first user gesture. */
  async enable() {
    if (!settings.get('handsEnabled')) return false;
    if (camFeed.error && !camFeed.ready) {
      const ok = await camFeed.start();
      if (!ok) { this.setStatus('denied', camFeed.error || 'sem câmera'); return false; }
    }
    if (!this.model) return this.init();
    return true;
  }

  get active() { return this.enabled && this.model && camFeed.ready; }

  update(dt) {
    this._acc += dt; this._frames++;
    if (this._acc > 0.5) { this.fps = Math.round(this._frames / this._acc); this._frames = 0; this._acc = 0; }
    if (!this.active) {
      if (this.hands.length) { this.hands = []; this.emit('hands', this.hands); }
      return;
    }
    const v = camFeed.video;
    if (v.readyState < 2) return;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    let res;
    try { res = this.model.detectForVideo(v, ts); } catch (e) {
      this.setStatus('error', e?.message || String(e));
      this.model = null;
      return;
    }
    this.lastTs = ts;

    const lmArr = res?.landmarks || [];
    const worldArr = res?.worldLandmarks || [];
    const hands = [];
    const cfg = { pinchThreshold: settings.get('pinchThreshold'), pinchRelease: settings.get('pinchRelease') };
    for (let i = 0; i < lmArr.length; i++) {
      const lm = lmArr[i];
      if (!lm || lm.length < 21) continue;
      const label = res.handedness?.[i]?.[0]?.categoryName || (i === 0 ? 'Right' : 'Left');
      const mirrored = camFeed.mirror;
      const score = res.handedness?.[i]?.[0]?.score ?? 0.9;
      const key = `${label}-${i}`;
      const prev = this.prev.get(key);
      const g = classify(prev, lm, worldArr[i], cfg);
      g.label = mirrored ? (label === 'Left' ? 'Right' : 'Left') : label;
      g.score = score;
      const ux = mirrored ? 1 - g.tipX : g.tipX;
      const uy = g.tipY;
      g.pointer = { x: ux * 2 - 1, y: -(uy * 2 - 1), u: ux, v: uy };
      g.palmPointer = { x: (mirrored ? 1 - g.center.x : g.center.x), y: g.center.y };
      g.gap = pinchGap(lm);
      g.disp = lm.map((q) => (mirrored ? 1 - q.x : q.x));
      this.prev.set(key, { tipX: g.tipX, tipY: g.tipY, t: g.t, pinch: g.pinch });
      g.imageToWorld = (u, vv, depth) => this.imageToWorld(u, vv, depth);
      g.lm = lm;
      hands.push(g);
    }
    hands.sort((a, b) => b.span - a.span);
    this.hands = hands;
    this.emit('hands', hands);
  }

  /**
   * Project a point of the camera image into the world on/around the passthrough
   * wall. `depth` (metres toward the viewer) yields real parallax in stereo, which
   * is what sells "the contour is around your hand" instead of a sticker.
   */
  imageToWorld(u, v, depth = 0, out = new THREE.Vector3()) {
    const wall = this.world.wall;
    const cover = this._cover();
    const lx = (u - 0.5) * wall.scale.x * cover.sx + wall.scale.x * cover.ox;
    const ly = -(v - 0.5) * wall.scale.y * cover.sy + wall.scale.y * cover.oy;
    out.set(lx, ly, depth);
    wall.updateWorldMatrix(true, false);
    return out.applyMatrix4(wall.matrixWorld);
  }

  /** Depth for one landmark: base stage depth, pulled toward the eye when closer. */
  landmarkDepth(g, p) {
    const t = clamp((g.span - 0.08) / 0.28, 0, 1);
    const base = 6 - t * 4.0;
    const zz = clamp(p.z ?? 0, -1.2, 1.2);
    const rel = clamp(g.span * 3.4, 0.12, 1.1);
    return base + zz * rel;
  }

  worldLandmark(g, idx, out) {
    const p = g.lm[idx];
    const u = camFeed.mirror ? 1 - p.x : p.x;
    return this.imageToWorld(u, p.y, this.landmarkDepth(g, p), out);
  }

  get primary() { return this.hands[0] || null; }
  get left() { return this.hands.find((h) => h.label === 'Left') || null; }
  get right() { return this.hands.find((h) => h.label === 'Right') || null; }

  /** Two-hand distance, used by global gestures (zoom/scale). */
  twoHand() {
    if (this.hands.length < 2) return null;
    const [a, b] = this.hands;
    const dx = (a.center.x - b.center.x), dy = (a.center.y - b.center.y);
    return { dist: Math.hypot(dx, dy), spread: (a.span + b.span) / 2, a, b, mx: (a.center.x + b.center.x) / 2, my: (a.center.y + b.center.y) / 2 };
  }
}

async function firstBase(paths) {
  for (const p of paths) {
    try {
      const r = await fetch(new URL('vision_wasm_internal.js', p), { method: 'HEAD' });
      if (r.ok) return p.endsWith('/') ? p : p + '/';
    } catch { /* try next */ }
  }
  return paths[paths.length - 1];
}

async function firstExisting(paths) {
  for (const p of paths) {
    try {
      const r = await fetch(p, { method: 'HEAD' });
      if (r.ok) return p;
    } catch { /* offline: still attempt the last one */ }
  }
  return paths[paths.length - 1];
}
