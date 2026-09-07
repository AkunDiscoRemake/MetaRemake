import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { clamp } from '../core/util.js';

const DISTORT_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Per-eye composite: pre-distorts the render so the plastic lenses of a VR Box
 * produce a rectified image (and adds inverse chromatic aberration so colour
 * fringes cancel out). Pixels pushed outside the source are replaced by the
 * eye-canvas colour, matching what real headsets do.
 */
const DISTORT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap;
uniform float uAspect;    // half-viewport aspect (w/2 / h)
uniform float uWarp;      // barrel pre-compensation strength
uniform float uCA;        // chromatic aberration compensation
uniform float uOverscan;  // >1 zooms in to hide corners
uniform vec3  uBg;
uniform float uVignette;
uniform float uTime;

vec2 warp(vec2 p, float k) {
  float r2 = dot(p, p);
  return p * (1.0 + k * r2 * 0.35);
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0);
  p /= max(0.0001, uOverscan);
  vec2 ap = vec2(p.x * uAspect, p.y);

  vec2 uvR = warp(ap, uWarp * (1.0 + uCA)) / vec2(uAspect, 1.0);
  vec2 uvG = warp(ap, uWarp) / vec2(uAspect, 1.0);
  vec2 uvB = warp(ap, uWarp * (1.0 - uCA)) / vec2(uAspect, 1.0);

  vec3 col = uBg;
  bool ok = abs(uvG.x) <= 1.0 && abs(uvG.y) <= 1.0;
  if (ok) {
    float r = texture2D(tMap, uvG * 0.5 + 0.5).r;
    float g = texture2D(tMap, uvG * 0.5 + 0.5).g;
    float b = texture2D(tMap, uvG * 0.5 + 0.5).b;
    vec2 uvr = uvR * 0.5 + 0.5, uvb = uvB * 0.5 + 0.5;
    if (uCA > 0.0001) {
      r = texture2D(tMap, clamp(uvr, vec2(0.0), vec2(1.0))).r;
      b = texture2D(tMap, clamp(uvb, vec2(0.0), vec2(1.0))).b;
    }
    col = vec3(r, g, b);
    float rr = length(p);
    col *= 1.0 - uVignette * pow(clamp(rr, 0.0, 1.0), 2.2);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * The display pipeline: one canvas, three output paths.
 *  - mono    : direct render (handheld MR, desktop)
 *  - stereo  : two off-screen eye targets + lens distortion (VR Box / cardboards)
 *  - xr      : native WebXR (Quest Browser, Vision Pro, Pico…) — no distortion needed
 */
export class View {
  constructor(mount, scene) {
    this.mount = mount;
    this.scene = scene;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false,
      depth: true
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000308, 1);
    this.renderer.xr.enabled = false;
    mount.appendChild(this.renderer.domElement);

    // rig = the head. Everything head-locked hangs off it.
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.02, 400);
    this.rig.add(this.camera);
    this.leftCam = new THREE.PerspectiveCamera(75, 1, 0.02, 400);
    this.rightCam = new THREE.PerspectiveCamera(75, 1, 0.02, 400);
    this.rig.add(this.leftCam, this.rightCam);
    this.leftCam.layers.enableAll(); this.rightCam.layers.enableAll();

    this.compositeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.compositeScene = new THREE.Scene();
    this.compositeScene.add(this.quad);
    this.materials = [
      new THREE.ShaderMaterial({ vertexShader: DISTORT_VERT, fragmentShader: DISTORT_FRAG, uniforms: {
        tMap: { value: null }, uAspect: { value: 1 }, uWarp: { value: 0.35 }, uCA: { value: 0.004 },
        uOverscan: { value: 1.06 }, uBg: { value: new THREE.Color(0x000000) }, uVignette: { value: 0.18 }, uTime: { value: 0 }
      }, depthTest: false, depthWrite: false }),
      new THREE.ShaderMaterial({ vertexShader: DISTORT_VERT, fragmentShader: DISTORT_FRAG, uniforms: {
        tMap: { value: null }, uAspect: { value: 1 }, uWarp: { value: 0.35 }, uCA: { value: 0.004 },
        uOverscan: { value: 1.06 }, uBg: { value: new THREE.Color(0x000000) }, uVignette: { value: 0.18 }, uTime: { value: 0 }
      }, depthTest: false, depthWrite: false })
    ];

    this.targets = [this.makeTarget(), this.makeTarget()];
    this.mode = 'mono';
    this.time = 0;
    this.stats = { fps: 0, ms: 0, draws: 0, tris: 0, hands: 0, res: '—' };
    this._frames = 0; this._acc = 0;
    this.onBeforeRender = null;

    settings.on('change', ({ key, value }) => this.onSetting(key, value));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 260));
    this.resize();
  }

  makeTarget() {
    const rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
      colorSpace: THREE.SRGBColorSpace
    });
    return rt;
  }

  get stereo() { return this.mode === 'stereo'; }

  onSetting(key, value) {
    if (['stereo', 'fov', 'quality', 'ipd', 'lensSeparation', 'distortion', 'chromatic'].includes(key)) {
      this.resize();
    }
    if (key === 'distortion' || key === 'chromatic' || key === 'eyeCanvas') this.updateUniforms();
    if (key === 'fov' && this.mode === 'xr') this.camera.fov = value;
  }

  updateUniforms() {
    const warp = settings.get('distortion');
    const ca = settings.get('chromatic') * 0.02;
    const vig = settings.get('eyeCanvas') ? 0.2 : 0.0;
    for (const m of this.materials) {
      m.uniforms.uWarp.value = warp;
      m.uniforms.uCA.value = ca;
      m.uniforms.uVignette.value = vig;
      m.uniforms.uOverscan.value = clamp(1 + warp * 0.045, 1.0, 1.3);
    }
  }

  resize() {
    const w = Math.max(2, this.mount.clientWidth || innerWidth);
    const h = Math.max(2, this.mount.clientHeight || innerHeight);
    const q = clamp(settings.get('quality'), 0.4, 2);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, true);
    this.width = w; this.height = h;

    if (this.stereo) {
      const dpr = this.renderer.getPixelRatio();
      const ew = Math.max(2, Math.floor((w * dpr * q) / 2));
      const eh = Math.max(2, Math.floor(h * dpr * q));
      for (const t of this.targets) t.setSize(ew, eh);
      this.aspect = (w / 2) / h;
      this.stats.res = `${ew}x${eh}/olho`;
      const fov = settings.get('fov');
      for (const c of [this.leftCam, this.rightCam]) {
        c.fov = fov; c.aspect = (w / 2) / h; c.updateProjectionMatrix();
      }
      this.camera.fov = fov; this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.quad.material = this.materials[0];
    } else {
      this.aspect = w / h;
      this.camera.aspect = w / h;
      const fov = this.mode === 'mono' ? 78 : settings.get('fov');
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.stats.res = `${Math.floor(w * this.renderer.getPixelRatio())}x${Math.floor(h * this.renderer.getPixelRatio())}`;
    }
    this.updateUniforms();
    for (const m of this.materials) m.uniforms.uAspect.value = this.aspect;
    this.emitSize();
  }

  emitSize() { this.sizeListeners?.forEach((fn) => fn(this.width, this.height, this.stereo)); }
  onSize(fn) { (this.sizeListeners ||= []).push(fn); }

  setMode(mode) {
    this.mode = mode;
    this.renderer.xr.enabled = mode === 'xr';
    document.body.classList.toggle('stereo', mode === 'stereo');
    document.body.classList.toggle('xr', mode === 'xr');
    this.resize();
  }

  async enterXR() {
    if (!navigator.xr) throw new Error('WebXR indisponível');
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
    });
    this.renderer.xr.setReferenceSpaceType('local-floor');
    await this.renderer.xr.setSession(session);
    this.setMode('xr');
    return session;
  }

  eyeOffset(out = new THREE.Vector3()) {
    const ipd = settings.get('ipd') / 1000 * settings.get('lensSeparation');
    return out.set(ipd / 2, 0, 0);
  }

  /** Active camera for raycasting / label placement (average of both eyes in stereo). */
  get activeCamera() { return this.stereo ? this.camera : this.camera; }

  render(dt) {
    this.time += dt;
    this.materials[0].uniforms.uTime.value = this.time;
    this.materials[1].uniforms.uTime.value = this.time;
    const t0 = performance.now();
    this.onBeforeRender?.(dt, this);

    if (this.renderer.xr.isPresenting) {
      this.renderer.render(this.scene, this.camera);
    } else if (this.stereo) {
      const ipd = settings.get('ipd') / 1000 * settings.get('lensSeparation');
      this.leftCam.position.set(-ipd / 2, 0, 0);
      this.rightCam.position.set(ipd / 2, 0, 0);
      this.camera.position.set(0, 0, 0);
      const db = this.renderer.getClearAlpha();
      this.renderer.setClearAlpha(0);
      this.onEye?.(0);
      this.renderer.setRenderTarget(this.targets[0]);
      this.renderer.render(this.scene, this.leftCam);
      this.onEye?.(1);
      this.renderer.setRenderTarget(this.targets[1]);
      this.renderer.render(this.scene, this.rightCam);
      this.onEye?.(-1);
      this.renderer.setRenderTarget(null);
      this.renderer.setClearAlpha(db);
      const w = this.width, h = this.height;   // three multiplies by pixelRatio internally
      this.quad.material = this.materials[0];
      this.materials[0].uniforms.tMap.value = this.targets[0].texture;
      this.renderer.setViewport(0, 0, w / 2, h);
      this.renderer.setScissor(0, 0, w / 2, h);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.compositeScene, this.compositeCam);
      this.quad.material = this.materials[1];
      this.materials[1].uniforms.tMap.value = this.targets[1].texture;
      this.renderer.setViewport(w / 2, 0, w / 2, h);
      this.renderer.setScissor(w / 2, 0, w / 2, h);
      this.renderer.render(this.compositeScene, this.compositeCam);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
    } else {
      this.camera.position.set(0, 0, 0);
      this.onEye?.(0);
      this.renderer.render(this.scene, this.camera);
      this.onEye?.(-1);
    }

    const ms = performance.now() - t0;
    this.stats.ms = this.stats.ms ? this.stats.ms * 0.9 + ms * 0.1 : ms;
    this._frames++; this._acc += dt;
    if (this._acc > 0.5) {
      this.stats.fps = Math.round(this._frames / this._acc);
      this._frames = 0; this._acc = 0;
      const info = this.renderer.info;
      this.stats.draws = info.render.calls;
      this.stats.tris = info.render.triangles;
    }
  }
}
