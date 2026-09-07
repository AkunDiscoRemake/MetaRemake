import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { THEMES } from '../engine/world.js';
import { BONES, convexHull, smoothClosedLoop } from './gestures.js';

const LOOP = 76;      // outline samples
const RING = 7;       // tube cross-section facets
const TUBE_VERTS = LOOP * RING;

const TUBE_VERT = /* glsl */`
attribute float aArc;
attribute float aRing;
varying float vArc; varying float vRing; varying vec3 vN; varying vec3 vV;
void main() {
  vArc = aArc; vRing = aRing;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;
const TUBE_FRAG = /* glsl */`
uniform vec3 uColA; uniform vec3 uColB; uniform float uTime; uniform float uGlow;
uniform float uPress; uniform float uAlpha; uniform float uDash;
varying float vArc; varying float vRing; varying vec3 vN; varying vec3 vV;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
  vec3 col = mix(uColA, uColB, 0.5 + 0.5 * sin(vArc * 6.2831 + uTime * 0.7));
  float dash = mix(1.0, 0.45 + 0.55 * pow(0.5 + 0.5 * sin(vArc * 46.0 - uTime * 3.4), 2.0), uDash);
  float hot = mix(0.65, 1.0, vRing);
  float a = uAlpha * (0.22 + fres * 0.85) * dash * uGlow;
  col += vec3(1.0, 0.96, 0.9) * uPress * (0.5 + 0.5 * fres);
  gl_FragColor = vec4(col * (0.9 + 0.7 * fres) * hot, a);
}
`;

const FILL_FRAG = /* glsl */`
uniform vec3 uColA; uniform float uTime; uniform float uGlow; uniform float uAlpha; uniform float uPress;
varying float vR; varying vec3 vN; varying vec3 vV;
void main() {
  float edge = smoothstep(0.45, 1.0, vR);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float breathe = 0.82 + 0.18 * sin(uTime * 1.7 + vR * 5.0);
  float a = uAlpha * edge * (0.5 + fres * 0.5) * breathe * uGlow * (1.0 + uPress * 1.4);
  gl_FragColor = vec4(mix(uColA, vec3(1.0), uPress * 0.5 + fres * 0.25), a * 0.5);
}
`;
const FILL_VERT = /* glsl */`
attribute float aR;
varying float vR; varying vec3 vN; varying vec3 vV;
void main() {
  vR = aR;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Hand "contour" renderer — a glowing tube that wraps *around* the silhouette of
 * the hand (not a skeleton overlay), computed by ray-casting a capsule SDF built
 * from the finger bones so it hugs the fingers, thumb and webbing.
 */
export class HandAura {
  constructor(scene, tracker) {
    this.scene = scene;
    this.tracker = tracker;
    this.group = new THREE.Group();
    this.group.renderOrder = 20;
    scene.add(this.group);
    this.instances = new Map();
    this.enabled = true;
    this._tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
  }

  theme() { return THEMES[settings.get('theme')] || THEMES.aurora; }

  update(dt, t, hands) {
    const seen = new Set();
    const style = settings.get('auraStyle');
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i];
      const key = h.label || `h${i}`;
      seen.add(key);
      let inst = this.instances.get(key);
      if (!inst) { inst = this.makeInstance(key, h); this.instances.set(key, inst); }
      inst.targetAlpha = this.enabled && style !== 'off' ? 1 : 0;
      this.buildContour(inst, h);
      inst.draw(dt, t, style);
    }
    for (const [key, inst] of this.instances) {
      if (seen.has(key)) { inst.out = 0; continue; }
      // hand left the frame: fade the contour out, then free the meshes
      inst.targetAlpha = 0;
      inst.out += dt;
      inst.draw(dt, t, style);
      if (inst.out > 0.55) { inst.dispose(); this.instances.delete(key); }
    }
  }

  makeInstance(key, h) {
    const theme = this.theme();
    const colA = new THREE.Color(key === 'Left' ? theme.accent2 : theme.accent);
    const colB = new THREE.Color(key === 'Left' ? theme.accent : theme.accent2);

    // ---- tube around the outline ----
    const tubePos = new Float32Array(TUBE_VERTS * 3);
    const tubeNor = new Float32Array(TUBE_VERTS * 3);
    const arc = new Float32Array(TUBE_VERTS);
    const ring = new Float32Array(TUBE_VERTS);
    const idx = [];
    for (let i = 0; i < LOOP; i++) {
      for (let j = 0; j < RING; j++) {
        const a = ((i + 1) % LOOP) * RING + j;
        const b = i * RING + ((j + 1) % RING);
        const c = ((i + 1) % LOOP) * RING + ((j + 1) % RING);
        idx.push(i * RING + j, b, a, i * RING + j, c, b);
      }
    }
    const tubeGeo = new THREE.BufferGeometry();
    tubeGeo.setAttribute('position', new THREE.BufferAttribute(tubePos, 3));
    tubeGeo.setAttribute('normal', new THREE.BufferAttribute(tubeNor, 3));
    tubeGeo.setAttribute('aArc', new THREE.BufferAttribute(arc, 1));
    tubeGeo.setAttribute('aRing', new THREE.BufferAttribute(ring, 1));
    for (let i = 0; i < LOOP; i++) for (let j = 0; j < RING; j++) { arc[i * RING + j] = i / LOOP; ring[i * RING + j] = j / (RING - 1); }
    tubeGeo.setIndex(idx);
    const tubeMat = new THREE.ShaderMaterial({
      vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uColA: { value: colA }, uColB: { value: colB }, uTime: { value: 0 }, uGlow: { value: 1 },
        uPress: { value: 0 }, uAlpha: { value: 0 }, uDash: { value: 0.7 }
      }
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.frustumCulled = false;

    // ---- soft fill so the loop reads as an aura, not a wire ----
    const fillPos = new Float32Array((LOOP + 2) * 3);
    const fillR = new Float32Array(LOOP + 2);
    const fillIdx = [];
    for (let i = 0; i < LOOP; i++) fillIdx.push(0, i + 1, i + 2);
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
    fillGeo.setAttribute('aR', new THREE.BufferAttribute(fillR, 1));
    fillGeo.setIndex(fillIdx);
    const fillMat = new THREE.ShaderMaterial({
      vertexShader: FILL_VERT, fragmentShader: FILL_FRAG, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColA: { value: colA }, uTime: { value: 0 }, uGlow: { value: 1 }, uAlpha: { value: 0 }, uPress: { value: 0 } }
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.frustumCulled = false;
    fill.renderOrder = 19;

    // ---- skeleton (opt-in style) ----
    const skGeo = new THREE.BufferGeometry();
    skGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BONES.length * 2 * 3), 3));
    const skMat = new THREE.LineBasicMaterial({ color: colA.clone(), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const skeleton = new THREE.LineSegments(skGeo, skMat);
    skeleton.frustumCulled = false;
    skeleton.visible = false;

    // ---- fingertip sparks ----
    const tips = [4, 8, 12, 16, 20];
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tips.length * 3), 3));
    const spark = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
      size: 0.05, color: colB.clone(), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    spark.visible = settings.get('showFingertips');
    spark.frustumCulled = false;

    const group = new THREE.Group();
    group.add(tube, fill, skeleton, spark);
    this.group.add(group);

    return {
      key, group, tube, tubeGeo, tubeMat, fill, fillGeo, fillMat, skeleton, skGeo, spark, sparkGeo,
      tips, colA, colB, alpha: 0, targetAlpha: 1, life: 0, out: 0, press: 0,
      pts: new Float32Array(LOOP * 3), prevPts: null,
      local: new Array(LOOP).fill(0).map(() => [0, 0]),
      center: new THREE.Vector3(), basis: { u: new THREE.Vector3(), v: new THREE.Vector3(), n: new THREE.Vector3() },
      radius: 0.1,
      buildContour: null,
      dispose() {
        this.group.removeFromParent();
        this.tubeGeo.dispose(); this.tubeMat.dispose();
        this.fillGeo.dispose(); this.fillMat.dispose();
        this.skGeo.dispose(); skMat.dispose();
        this.sparkGeo.dispose(); this.spark.material.dispose();
      },
      draw(dt, time, style) {
        this.life += dt;
        this.alpha += (this.targetAlpha - this.alpha) * (1 - Math.exp(-9 * dt));
        const a = this.alpha;
        this.tube.visible = a > 0.01 && style !== 'skeleton';
        this.fill.visible = a > 0.01 && (style === 'contour' || style === 'aura' || style === 'ribbon');
        this.skeleton.visible = style === 'skeleton';
        this.spark.visible = settings.get('showFingertips') && a > 0.02;
        this.tubeMat.uniforms.uAlpha.value = a;
        this.fillMat.uniforms.uAlpha.value = a * (style === 'aura' ? 1.8 : 0.85);
        this.tubeMat.uniforms.uTime.value = time;
        this.fillMat.uniforms.uTime.value = time;
        this.tubeMat.uniforms.uGlow.value = settings.get('auraGlow');
        this.fillMat.uniforms.uGlow.value = settings.get('auraGlow');
        this.tubeMat.uniforms.uDash.value = style === 'ribbon' ? 1 : 0.6;
        this.tubeMat.uniforms.uPress.value = this.press;
        this.fillMat.uniforms.uPress.value = this.press;
        this.tube.scale.setScalar(style === 'aura' ? 1.06 : style === 'ribbon' ? 1.0 : 1);
        this.group.visible = a > 0.005;
        skMat.opacity = 0.75 * a;
        this.spark.material.opacity = 0.9 * a;
      }
    };
  }

  /**
   * Build the outline: project landmarks on the palm plane, cast rays around the
   * palm against a capsule field of the finger bones, then smooth + temporally
   * blend. Result is a closed 3D loop that follows the real silhouette.
   */
  buildContour(inst, h) {
    const T = this._tmp;
    const lm = h.lm;
    const V = THREE.Vector3;
    // palm frame
    const wrist = inst.center.set(0, 0, 0);
    const p = (i, out) => this.tracker.worldLandmark(h, i, out || new V());
    p(0, T.a); p(5, T.b); p(17, T.c); p(9, T.d);
    wrist.copy(T.a).add(T.b).add(T.c).add(T.d).multiplyScalar(0.25);
    const u = new V().subVectors(T.b, T.c);
    if (u.lengthSq() < 1e-8) u.set(1, 0, 0);
    u.normalize();
    const n = new V().crossVectors(u, new V().subVectors(T.d, T.a));
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    n.normalize();
    const v = new V().crossVectors(n, u).normalize();
    // face the palm normal toward the viewer so the fill never flips
    const eye = this.tracker.view.camera.getWorldPosition(new V());
    if (n.dot(new V().subVectors(eye, wrist)) < 0) n.multiplyScalar(-1);
    inst.basis.u.copy(u); inst.basis.v.copy(v); inst.basis.n.copy(n);

    // local 2D coords of every landmark + bone segments for the SDF
    const pts2 = [];
    const segs = [];
    const lp = new V();
    const locOf = (i) => {
      p(i, lp);
      const d = lp.clone().sub(wrist);
      return [d.dot(u), d.dot(v)];
    };
    const all = [];
    for (let i = 0; i < 21; i++) all.push(locOf(i));
    for (let i = 0; i < 21; i++) pts2.push(all[i]);
    for (const [a, b] of BONES) segs.push([all[a][0], all[a][1], all[b][0], all[b][1]]);

    let radius = 0;
    for (const q of all) radius = Math.max(radius, Math.hypot(q[0], q[1]));
    radius = Math.max(0.045, radius * 1.18);
    inst.radius += (radius - inst.radius) * 0.4;
    const R = inst.radius;

    const sdf = (x, y) => {
      let best = 1e9;
      for (let s = 0; s < segs.length; s++) {
        const [x1, y1, x2, y2] = segs[s];
        const minx = Math.min(x1, x2) - R, maxx = Math.max(x1, x2) + R;
        if (x < minx || x > maxx) continue;
        const miny = Math.min(y1, y2) - R, maxy = Math.max(y1, y2) + R;
        if (y < miny || y > maxy) continue;
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy || 1e-6;
        let tt = ((x - x1) * dx + (y - y1) * dy) / len2;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const px = x1 + dx * tt - x, py = y1 + dy * tt - y;
        const dd = px * px + py * py;
        if (dd < best) best = dd;
      }
      return Math.sqrt(best) - R * 0.34;   // fatten the hand a little → contour floats around skin
    };

    // radial cast with bisection refine
    const out = inst.local;
    const pad = R * (0.05 + 0.02 * Math.sin(inst.life * 2.2));
    for (let i = 0; i < LOOP; i++) {
      const ang = (i / LOOP) * Math.PI * 2;
      const cx = Math.cos(ang), cy = Math.sin(ang);
      let last = null;
      const steps = 30;
      const maxR = R * 1.9;
      for (let s = 1; s <= steps; s++) {
        const r = (s / steps) * maxR;
        const inside = sdf(cx * r, cy * r) <= 0;
        if (inside) last = r;
        else if (last !== null) {
          let lo = last, hi = r;
          for (let k = 0; k < 4; k++) {
            const m = (lo + hi) / 2;
            if (sdf(cx * m, cy * m) <= 0) lo = m; else hi = m;
          }
          last = lo;
          break;
        }
      }
      const rr = (last ?? R * 0.55) + pad;
      out[i] = [cx * rr, cy * rr];
    }
    // spatial smoothing (two passes) + temporal blend
    for (let pass = 0; pass < 2; pass++) {
      const src = out.slice();
      for (let i = 0; i < LOOP; i++) {
        const a = src[(i - 1 + LOOP) % LOOP], b = src[i], c = src[(i + 1) % LOOP];
        out[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
      }
    }
    if (!inst.prevPts) inst.prevPts = out.map((q) => [q[0], q[1]]);
    const k = h.pinch ? 0.55 : 0.32;
    for (let i = 0; i < LOOP; i++) {
      inst.prevPts[i][0] += (out[i][0] - inst.prevPts[i][0]) * k;
      inst.prevPts[i][1] += (out[i][1] - inst.prevPts[i][1]) * k;
    }

    // back to 3D + tube cross-section
    const loop = inst.prevPts;
    const pos = inst.tubeGeo.attributes.position.array;
    const nor = inst.tubeGeo.attributes.normal.array;
    const thickness = THREE.MathUtils.clamp(R * 0.055, 0.006, 0.05) * (1 + (h.pinch ? 0.5 : 0));
    const tan = new V(), b1 = new V(), b2 = new V();
    for (let i = 0; i < LOOP; i++) {
      const [x0, y0] = loop[i];
      const [x1, y1] = loop[(i + 1) % LOOP];
      const [xm, ym] = loop[(i - 1 + LOOP) % LOOP];
      // world-space point on the palm plane, pushed toward the eye when pinching
      const push = (h.pinch ? 0.02 : 0) + (settings.get('auraStyle') === 'aura' ? 0.03 : 0);
      const P = new V().copy(wrist)
        .addScaledVector(u, x0).addScaledVector(v, y0)
        .addScaledVector(n, push * R * 6);
      const Pn = new V().copy(wrist).addScaledVector(u, x1).addScaledVector(v, y1);
      const Pm = new V().copy(wrist).addScaledVector(u, xm).addScaledVector(v, ym);
      tan.subVectors(Pn, Pm).normalize();
      b1.crossVectors(tan, n).normalize();
      b2.crossVectors(b1, tan).normalize();
      // fill fan vertex
      const fi = (i + 1);
      inst.fillGeo.attributes.position.array[fi * 3] = P.x;
      inst.fillGeo.attributes.position.array[fi * 3 + 1] = P.y;
      inst.fillGeo.attributes.position.array[fi * 3 + 2] = P.z;
      if (i === 0) {
        const dup = (LOOP + 1) * 3;
        inst.fillGeo.attributes.position.array[dup] = P.x;
        inst.fillGeo.attributes.position.array[dup + 1] = P.y;
        inst.fillGeo.attributes.position.array[dup + 2] = P.z;
      }
      inst.fillGeo.attributes.aR.array[fi] = 1;
      if (i === 0) {
        inst.fillGeo.attributes.aR.array[LOOP + 1] = 1;
      }
      for (let j = 0; j < RING; j++) {
        const a = (j / RING) * Math.PI * 2;
        const ox = Math.cos(a), oy = Math.sin(a);
        const nx = b1.x * ox + b2.x * oy, ny = b1.y * ox + b2.y * oy, nz = b1.z * ox + b2.z * oy;
        const o = (i * RING + j) * 3;
        pos[o] = P.x + nx * thickness; pos[o + 1] = P.y + ny * thickness; pos[o + 2] = P.z + nz * thickness;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
      }
    }
    // fan centre
    inst.fillGeo.attributes.position.array[0] = wrist.x;
    inst.fillGeo.attributes.position.array[1] = wrist.y;
    inst.fillGeo.attributes.position.array[2] = wrist.z;
    inst.fillGeo.attributes.aR.array[0] = 0;
    inst.fillGeo.attributes.position.needsUpdate = true;
    inst.fillGeo.attributes.aR.needsUpdate = true;
    inst.tubeGeo.attributes.position.needsUpdate = true;
    inst.tubeGeo.attributes.normal.needsUpdate = true;

    if (settings.get('auraStyle') === 'skeleton') {
      const sp = inst.skGeo.attributes.position.array;
      let o = 0;
      for (const [a, b] of BONES) {
        const A = p(a), B = p(b);
        sp[o++] = A.x; sp[o++] = A.y; sp[o++] = A.z;
        sp[o++] = B.x; sp[o++] = B.y; sp[o++] = B.z;
      }
      inst.skGeo.attributes.position.needsUpdate = true;
    }
    if (settings.get('showFingertips')) {
      const sp = inst.sparkGeo.attributes.position.array;
      inst.tips.forEach((tipIdx, i) => {
        const q = p(tipIdx);
        sp[i * 3] = q.x; sp[i * 3 + 1] = q.y; sp[i * 3 + 2] = q.z;
      });
      inst.sparkGeo.attributes.position.needsUpdate = true;
      inst.spark.material.size = THREE.MathUtils.clamp(R * 0.55, 0.02, 0.12) * (h.pinch ? 1.6 : 1);
    }
    inst.press += ((h.pinch ? 1 : 0) - inst.press) * (h.pinch ? 0.5 : 0.12);
    inst.colA.copy(new THREE.Color(h.label === 'Left' ? this.theme().accent2 : this.theme().accent));
    inst.colB.copy(new THREE.Color(h.label === 'Left' ? this.theme().accent : this.theme().accent2));
  }
}

export { convexHull, smoothClosedLoop };
