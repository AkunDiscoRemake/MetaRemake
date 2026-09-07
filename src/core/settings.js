import { Emitter } from './util.js';
import { store } from './storage.js';

/**
 * Central settings. Everything here has a visible effect in the 3D world, so the
 * Settings app is written against the same bus the runtime listens to.
 */
export const DEFAULTS = {
  // ---- modo de exibição ----
  mode: 'handheld',            // handheld | vrbox | xr
  stereo: false,               // SBS (side-by-side) para VR Box / cardboards
  ipd: 63,                     // mm, distância interpupilar
  lensSeparation: 1.0,         // multiplicador de separação das lentes (overscan VR Box)
  distortion: 1.0,             // força da correção de barril (pincushion)
  chromatic: 0.35,             // aberração cromática compensatória
  fov: 96,                     // FOV simulado do headset (graus)
  eyeCanvas: true,             // máscara de olho (vinheta do cardboard)
  quality: 1.0,                // resolução interna por olho
  curve: 0.25,                 // curvatura dos painéis (0..0.6)

  // ---- cabeça / conforto ----
  headSource: 'auto',          // auto | gyro | xr | mouse
  yawOffset: 0,
  invertYaw: false,
  invertPitch: false,
  sensitivity: 1.0,
  comfortVignette: 'auto',     // auto | on | off
  bobbing: 0.0,

  // ---- passagem de câmera (mixed reality real) ----
  passthrough: true,
  cameraFacing: 'environment', // environment (traseira) | user (frontal)
  passthroughDim: 0.45,
  passthroughSat: 1.05,
  autoExposureTint: true,

  // ---- mãos ----
  handsEnabled: true,
  numHands: 2,
  pinchThreshold: 0.30,        // fração do vão da mão
  pinchRelease: 0.46,
  auraStyle: 'contour',        // contour | ribbon | aura | skeleton
  auraGlow: 1.0,
  showFingertips: true,
  handScale: 1.0,
  rayMode: 'finger',           // finger | wrist | gaze
  dwellMs: 850,                // clique por olhar (fallback sem mãos)
  handFallback: true,

  // ---- áudio ----
  sfx: true,
  volume: 0.7,
  spatialAudio: true,
  ambient: true,

  // ---- apps / launcher ----
  theme: 'aurora',             // aurora | void | sunset | grid
  showClock: true,
  launcherLayout: 'arc',       // arc | ring | grid
  autoHideBoot: true,
  keepAwake: true,
  haptics: true,
  developer: true,
  reducedMotion: false,

  // ---- navegador ----
  homeUrl: 'web/start.html',
  searchEngine: 'duckduckgo',  // duckduckgo | google | bing
  ua: 'desktop',               // desktop | mobile
  allowedHosts: [],
  history: [],
  bookmarks: [
    { title: 'MetaPort Docs', url: 'web/docs.html', icon: 'book' },
    { title: 'MDN', url: 'https://developer.mozilla.org', icon: 'code' },
    { title: 'Wikipedia', url: 'https://pt.wikipedia.org', icon: 'globe' },
    { title: 'GitHub', url: 'https://github.com', icon: 'git' }
  ],

  // ---- store ----
  installed: [],
  userApps: [],
  updates: true,

  // ---- advanced ----
  modelBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  modelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  fps: true
};

const KEY = 'settings:v1';

class Settings extends Emitter {
  constructor() {
    super();
    const saved = store.get(KEY, {}) || {};
    this.v = Object.assign({}, DEFAULTS, saved);
    this.saved = 0;
  }

  get all() { return this.v; }
  get(key) { return this.v[key]; }
  set(key, value, silent = false) {
    if (this.v[key] === value) return;
    this.v[key] = value;
    this.persist();
    if (!silent) this.emit('change', { key, value, all: this.v });
  }
  patch(obj, silent = false) {
    let changed = false;
    for (const [k, val] of Object.entries(obj)) {
      if (this.v[k] !== val) { this.v[k] = val; changed = true; if (!silent) this.emit('change', { key: k, value: val, all: this.v }); }
    }
    if (changed) this.persist();
  }
  toggle(key) { this.set(key, !this.v[key]); }
  reset() { this.v = Object.assign({}, DEFAULTS); this.persist(); this.emit('reset'); }
  persist() {
    this.saved = Date.now();
    store.set(KEY, this.v);
  }
}

export const settings = new Settings();

/** Numeric/boolean helpers used by the settings UI widgets. */
export const schema = [
  { group: 'Imagem & VR Box', items: [
    { key: 'stereo', label: 'Estéreo SBS (VR Box)', type: 'bool', hint: 'Divide a tela em dois olhos com correção de lente.' },
    { key: 'ipd', label: 'IPD', type: 'range', min: 52, max: 76, step: 1, unit: 'mm' },
    { key: 'lensSeparation', label: 'Separação das lentes', type: 'range', min: 0.7, max: 1.6, step: 0.01 },
    { key: 'distortion', label: 'Distorção de barril', type: 'range', min: 0, max: 2, step: 0.01 },
    { key: 'chromatic', label: 'Aberração cromática', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'fov', label: 'Campo de visão', type: 'range', min: 60, max: 130, step: 1, unit: '°' },
    { key: 'curve', label: 'Curvatura dos painéis', type: 'range', min: 0, max: 0.6, step: 0.01 },
    { key: 'eyeCanvas', label: 'Máscara de olho', type: 'bool' },
    { key: 'quality', label: 'Resolução interna', type: 'range', min: 0.5, max: 1.5, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'comfortVignette', label: 'Vinheta de conforto', type: 'enum', options: ['auto', 'on', 'off'] }
  ] },
  { group: 'Cabeça & Movimento', items: [
    { key: 'headSource', label: 'Fonte de rotação', type: 'enum', options: ['auto', 'gyro', 'xr', 'mouse'] },
    { key: 'sensitivity', label: 'Sensibilidade', type: 'range', min: 0.4, max: 2.4, step: 0.05 },
    { key: 'invertYaw', label: 'Inverter Yaw', type: 'bool' },
    { key: 'invertPitch', label: 'Inverter Pitch', type: 'bool' },
    { key: 'bobbing', label: 'Bobbing ao andar', type: 'range', min: 0, max: 1, step: 0.05 }
  ] },
  { group: 'Realidade Mista', items: [
    { key: 'passthrough', label: 'Passagem de câmera', type: 'bool', hint: 'Componha o mundo 3D sobre a cena real.' },
    { key: 'cameraFacing', label: 'Câmera', type: 'enum', options: ['environment', 'user'] },
    { key: 'passthroughDim', label: 'Escurecer cena real', type: 'range', min: 0, max: 0.9, step: 0.01 },
    { key: 'passthroughSat', label: 'Saturação', type: 'range', min: 0, max: 2, step: 0.01 },
    { key: 'autoExposureTint', label: 'Tint auto pela luz da sala', type: 'bool' }
  ] },
  { group: 'Mãos & Gestos', items: [
    { key: 'handsEnabled', label: 'Hand tracking (MediaPipe)', type: 'bool' },
    { key: 'numHands', label: 'Mãos', type: 'enum', options: [1, 2], labels: ['1', '2'] },
    { key: 'auraStyle', label: 'Estilo do contorno', type: 'enum', options: ['contour', 'ribbon', 'aura', 'skeleton'], labels: ['Contorno (em volta da mão)', 'Fita', 'Aura', 'Esqueleto'] },
    { key: 'auraGlow', label: 'Brilho do contorno', type: 'range', min: 0, max: 2, step: 0.01 },
    { key: 'showFingertips', label: 'Pontos nas pontas dos dedos', type: 'bool' },
    { key: 'pinchThreshold', label: 'Sensibilidade do pinch', type: 'range', min: 0.12, max: 0.55, step: 0.01 },
    { key: 'rayMode', label: 'Origem do raio', type: 'enum', options: ['finger', 'wrist', 'gaze'] },
    { key: 'dwellMs', label: 'Dwell (sem mãos)', type: 'range', min: 200, max: 2000, step: 50, unit: 'ms' }
  ] },
  { group: 'Som', items: [
    { key: 'sfx', label: 'Efeitos sonoros', type: 'bool' },
    { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'spatialAudio', label: 'Áudio espacial (HRTF)', type: 'bool' },
    { key: 'ambient', label: 'Ambiente sonoro', type: 'bool' }
  ] },
  { group: 'Sistema', items: [
    { key: 'theme', label: 'Tema do mundo', type: 'enum', options: ['aurora', 'void', 'sunset', 'grid'] },
    { key: 'launcherLayout', label: 'Layout do launcher', type: 'enum', options: ['arc', 'ring', 'grid'] },
    { key: 'showClock', label: 'Relógio espacial', type: 'bool' },
    { key: 'keepAwake', label: 'Manter tela ativa', type: 'bool' },
    { key: 'haptics', label: 'Vibração ao clicar', type: 'bool' },
    { key: 'fps', label: 'HUD de performance', type: 'bool' },
    { key: 'developer', label: 'Apps de desenvolvedor', type: 'bool' }
  ] }
];
