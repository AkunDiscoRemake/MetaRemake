import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { settings } from '../core/settings.js';
import { camera as camFeed } from './camera.js';
import { clamp, lerp, mulberry, uid } from '../core/util.js';

export const THEMES = {
  aurora: { sky: ['#040a14', '#0b2a3a', '#0a1030'], grid: '#39f2d8', accent: '#46f0d0', accent2: '#ff3ea5', fog: 0.055, dust: '#8ff6ff' },
  void:   { sky: ['#02030a', '#0a0a18', '#000006'], grid: '#5f7bff', accent: '#7aa2ff', accent2: '#c04bff', fog: 0.075, dust: '#9fb4ff' },
  sunset: { sky: ['#14060f', '#3a1330', '#1b0a24'], grid: '#ff8a4c', accent: '#ffbf6b', accent2: '#ff3ea5', fog: 0.06, dust: '#ffd9a8' },
  grid:   { sky: ['#000000', '#04121a', '#000814'], grid: '#00ff9d', accent: '#00ffc8', accent2: '#00a2ff', fog: 0.09, dust: '#7dffd0' }
};

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform float uSat; uniform float uMix;
void main() {
  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(uBot, uMid, smoothstep(0.0, 0.5, h));
  c = mix(c, uTop, smoothstep(0.45, 1.0, h));
  c += uTop * 0.25 * pow(max(0.0, 1.0 - abs(vDir.y) * 3.0), 3.0);
  gl_FragColor = vec4(mix(vec3(0.0), c, uMix), 1.0);
}
`;

const GRID_VERT = /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const GRID_FRAG = /* glsl */`
varying vec3 vW;
uniform vec3 uColor; uniform float uTime; uniform vec3 uEye; uniform float uFade; uniform float uPulse;
float gridLine(vec2 p, float s) {
  vec2 g = abs(fract(p / s - 0.5) - 0.5) / fwidth(p / s);
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main() {
  vec2 p = vW.xz;
  float fine = gridLine(p, 0.5) * 0.35;
  float major = gridLine(p, 2.5);
  float d = distance(p, uEye.xz);
  float fade = 1.0 - smoothstep(6.0, 46.0, d);
  float rings = 0.5 + 0.5 * sin(d * 1.4 - uTime * 1.6 + uPulse * 6.28);
  float a = (major * 0.9 + fine) * fade * uFade;
  a *= 0.75 + 0.25 * rings;
  gl_FragColor = vec4(uColor * (1.2 + 0.8 * rings), a);
}
`;

/**
 * The persistent MR stage: sky (or camera passthrough wall), reactive floor, dust,
 * light rig and reflections. This is what makes MetaPort a *place* rather than a
 * menu: every app panel is a volumetric object anchored inside it.
 */
export class World {
  constructor(scene, view) {
    this.scene = scene;
    this.view = view;
    this.group = new THREE.Group();
    scene.add(this.group);
    const t = THEMES[settings.get('theme')] || THEMES.aurora;
    this.theme = t;

    // --- environment reflections for glass + metal ---
    const pmrem = new THREE.PMREMGenerator(view.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.6;

    // --- sky dome (visible when passthrough is off) ---
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(t.sky[0]) }, uMid: { value: new THREE.Color(t.sky[1]) },
        uBot: { value: new THREE.Color(t.sky[2]) }, uSat: { value: 1 }, uMix: { value: 1 }
      }
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    this.group.add(this.sky);

    // --- passthrough wall: live camera composited behind the holograms ---
    this.videoTex = new THREE.Texture(camFeed.video);
    this.videoTex.colorSpace = THREE.SRGBColorSpace;
    this.videoTex.minFilter = THREE.LinearFilter;
    this.videoTex.generateMipmaps = false;
    this.wallMat = new THREE.MeshBasicMaterial({ map: this.videoTex, toneMapped: false, depthWrite: false });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.wallMat);
    this.wall.frustumCulled = false;
    this.wall.renderOrder = -90;
    this.wall.visible = false;
    view.rig.add(this.wall);

    // --- reactive floor grid ---
    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, extensions: { derivatives: true },
      uniforms: {
        uColor: { value: new THREE.Color(t.grid) }, uTime: { value: 0 }, uEye: { value: new THREE.Vector3() },
        uFade: { value: 0.8 }, uPulse: { value: 0 }
      }
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 1, 1), this.gridMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -1.52;
    this.group.add(this.floor);

    // --- floor sheen so holograms get a grounded reflection ---
    this.sheen = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(t.accent), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.sheen.rotation.x = -Math.PI / 2;
    this.sheen.position.y = -1.515;
    this.group.add(this.sheen);

    // --- dust motes ---
    const N = 1400;
    const rnd = mulberry(7);
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 4 + rnd() * 26;
      const a = rnd() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -1.5 + rnd() * 9;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(t.dust) }, uSize: { value: 46 }, uOpacity: { value: 0.85 } },
      vertexShader: /* glsl */`
        attribute float aSeed; uniform float uTime; uniform float uSize; varying float vA;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.25 + aSeed * 6.28) * 0.55;
          p.x += cos(uTime * 0.17 + aSeed * 12.0) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (0.4 + aSeed) / max(0.4, -mv.z);
          vA = 0.25 + 0.75 * abs(sin(uTime * 0.6 + aSeed * 20.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float m = smoothstep(0.5, 0.0, length(c));
          gl_FragColor = vec4(uColor, m * vA * uOpacity);
        }`
    });
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    // --- horizon light pillars (gives the void depth cues for stereo) ---
    this.pillars = new THREE.Group();
    this.group.add(this.pillars);
    const pillarRnd = mulberry(99);
    for (let i = 0; i < 26; i++) {
      const h = 4 + pillarRnd() * 16;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 + pillarRnd() * 0.9, h, 0.12),
        new THREE.MeshStandardMaterial({
          color: 0x0a1424, emissive: new THREE.Color(i % 2 ? t.accent : t.accent2),
          emissiveIntensity: 0.35 + pillarRnd() * 0.5, roughness: 0.35, metalness: 0.7,
          transparent: true, opacity: 0.85
        })
      );
      const a = (i / 26) * Math.PI * 2 + pillarRnd() * 0.2;
      const r = 34 + pillarRnd() * 22;
      m.position.set(Math.cos(a) * r, -1.5 + h / 2, Math.sin(a) * r);
      m.lookAt(0, m.position.y, 0);
      this.pillars.add(m);
    }

    // --- lights ---
    this.hemi = new THREE.HemisphereLight(0x9fd8ff, 0x0a1020, 0.55);
    this.key = new THREE.DirectionalLight(0xffffff, 1.1);
    this.key.position.set(2.2, 4.5, 2.4);
    this.rim = new THREE.PointLight(new THREE.Color(t.accent), 12, 14, 2);
    this.rim.position.set(0, 1.4, -2.2);
    scene.add(this.hemi, this.key, this.rim);

    this.wallAspect = 16 / 9;
    this.pulse = 0;
    this.tint = new THREE.Color(0xffffff);
    this._v = new THREE.Vector3();
    this._focus = 0;

    settings.on('change', ({ key, value }) => this.onSetting(key, value));
    this.onSetting('theme', settings.get('theme'));
    view.onSize?.(() => this.sizeWall());
    this.sizeWall();
  }

  onSetting(key, value) {
    if (key === 'theme') {
      const t = THEMES[value] || THEMES.aurora;
      this.theme = t;
      this.skyMat.uniforms.uTop.value.set(t.sky[0]);
      this.skyMat.uniforms.uMid.value.set(t.sky[1]);
      this.skyMat.uniforms.uBot.value.set(t.sky[2]);
      this.gridMat.uniforms.uColor.value.set(t.grid);
      this.dustMat.uniforms.uColor.value.set(t.dust);
      this.sheen.material.color.set(t.accent);
      this.rim.color.set(t.accent);
      this.scene.emit('theme', t);
      this.scene.dispatchEvent({ type: 'theme', theme: t });
    }
    if (key === 'passthrough') this.updateWall();
    if (key === 'passthroughDim') this.wallMat.color.setScalar(1 - value * 0.8);
    if (key === 'reducedMotion') {
      this.dustMat.uniforms.uOpacity.value = value ? 0.35 : 0.85;
    }
  }

  updateWall() {
    const on = settings.get('passthrough') && camFeed.ready;
    this.wall.visible = on;
    this.skyMat.uniforms.uMix.value = on ? 0.12 : 1;
    // always sized: hand projection maps image→wall even when the feed is hidden
    this.sizeWall();
  }

  /** Cover-fit the camera frame onto a plane hung just in front of the eyes. */
  sizeWall() {
    const dist = 6;
    const w = this.view.width, h = this.view.height;
    const perEye = this.view.stereo ? 0.5 : 1;
    const fov = THREE.MathUtils.degToRad(this.view.stereo ? settings.get('fov') : 78);
    const ph = 2 * Math.tan(fov / 2) * dist;
    const pw = ph * ((w * perEye) / h);
    this.wallAspect = (w * perEye) / h;
    const va = camFeed.aspect || 16 / 9;
    const scale = Math.max(pw / (ph * va), ph / dist) * 1.02;
    const planeH = ph * scale * 0.5 + ph * 0.5;
    this.wall.scale.set(planeH * va, planeH, 1);
    this.wall.position.set(0, 0, -dist);
    this.wallMat.map = camFeed.mirror ? this.videoTex : this.videoTex;
    this.videoTex.repeat.set(camFeed.mirror ? -1 : 1, 1);
    this.videoTex.offset.set(camFeed.mirror ? 1 : 0, 0);
    this.videoTex.needsUpdate = true;
    this.onWallResize?.();
  }

  ping(strength = 1, worldPos = null) {
    this.pulse = Math.min(1.6, this.pulse + strength);
    if (worldPos) this._focus = 1;
  }

  update(dt, t) {
    this.gridMat.uniforms.uTime.value = t;
    this.dustMat.uniforms.uTime.value = t;
    this.pulse = lerp(this.pulse, 0, 1 - Math.exp(-3 * dt));
    this.gridMat.uniforms.uPulse.value = this.pulse;
    this.gridMat.uniforms.uFade.value = 0.55 + this.pulse * 0.3;
    this.view.rig.getWorldPosition(this._v);
    this.gridMat.uniforms.uEye.value.copy(this._v);
    this.sky.position.copy(this._v);
    this.sheen.position.x = this._v.x; this.sheen.position.z = this._v.z;
    this.sheen.material.opacity = 0.04 + this.pulse * 0.05;

    if (settings.get('passthrough') && camFeed.ready) {
      this.videoTex.needsUpdate = true;
      if (!this.wall.visible) this.updateWall();
      if (settings.get('autoExposureTint')) {
        const l = clamp(camFeed.luma, 0.02, 1);
        const k = lerp(1.35, 0.72, clamp((l - 0.15) / 0.6, 0, 1));
        this.tint.setScalar(lerp(this.tint.r, k, 0.06));
        this.scene.environmentIntensity = 0.35 + l * 0.75;
        this.key.intensity = 0.75 + l * 0.9;
      } else {
        this.tint.setScalar(1);
        this.scene.environmentIntensity = 0.6;
        this.key.intensity = 1.1;
      }
      this.hemi.color.multiplyScalar(1);
    } else if (this.wall.visible) this.updateWall();
  }
}

export { clamp, uid };
