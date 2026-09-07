import * as THREE from 'three';
import { PALETTE, hexA } from '../ui/kit.js';
import { audio } from '../core/audio.js';
import { settings } from '../core/settings.js';
import { clamp, toast } from '../core/util.js';

const NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];

/**
 * Piano XR — teclas 3D numa bancada curva. As cinco pontas dos dedos são "palhetas":
 * quando um fingertip desce sobre uma tecla, a nota soa; o pinch sustenta.
 */
export function make(env, meta) {
  const { scene, panel, hands, view } = env;
  const state = { octave: 4, wave: 'triangle', reverb: 0.35, keys: [], pressed: {}, viz: 0, sustain: false };

  const group = new THREE.Group();
  scene.add(group);
  const KEY_W = 0.1, KEY_D = 0.34, KEY_H = 0.05;
  let built = false;

  function build() {
    while (group.children.length) { const c = group.children.pop(); c.geometry?.dispose(); c.material?.dispose?.(); group.remove(c); }
    state.keys = [];
    const n = 17;
    const radius = 1.55;
    const spread = 0.052;
    for (let i = 0; i < n; i++) {
      const semis = (i % 12);
      const midi = (state.octave + Math.floor(i / 12)) * 12 + semis;
      const black = [1, 3, 6, 8, 10].includes(semis);
      const a = (i - (n - 1) / 2) * spread;
      const geo = new THREE.BoxGeometry(KEY_W * (black ? 0.6 : 0.96), black ? KEY_H * 0.7 : KEY_H, KEY_D * (black ? 0.62 : 1));
      const col = new THREE.Color(black ? '#0a1424' : '#e9f4ff');
      const mat = new THREE.MeshPhysicalMaterial({
        color: col, roughness: black ? 0.35 : 0.22, metalness: black ? 0.4 : 0.05,
        clearcoat: 1, emissive: new THREE.Color(black ? '#0a2038' : '#26506a'), emissiveIntensity: 0.18
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.sin(a) * radius, -1.05 + (black ? KEY_H * 0.35 : 0), -Math.cos(a) * radius + (black ? -KEY_D * 0.16 : 0));
      mesh.rotation.y = -a;
      group.add(mesh);
      const key = { mesh, midi, black, a, hit: 0, glow: null };
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(black ? '#ff3ea5' : '#46f0d0'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(0.24, 0.24, 1);
      glow.position.copy(mesh.position).add(new THREE.Vector3(0, 0.1, 0));
      group.add(glow);
      key.glow = glow;
      state.keys.push(key);
      env.pointer.register(mesh, {
        id: `key:${midi}`,
        onHover: (on) => { key.hover = on ? 1 : 0; if (on) key.press = true; },
        onClick: () => play(key)
      });
    }
    const bench = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.02, 8, 80, spread * n),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1a2c'), emissive: new THREE.Color('#123048'), emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.7 })
    );
    bench.rotation.x = Math.PI / 2;
    bench.position.set(0, -1.08, -radius);
    group.add(bench);
    built = true;
  }

  function play(key) {
    const freq = 440 * Math.pow(2, (key.midi - 69) / 12);
    const pos = key.mesh.getWorldPosition(new THREE.Vector3());
    audio.tone(freq, state.sustain ? 1.6 : 0.55, { type: state.wave, gain: 0.16, pos });
    audio.tone(freq * 2, 0.3, { type: 'sine', gain: 0.05, pos });
    key.hit = 1;
    state.pressed[key.midi] = performance.now();
    audio.haptic(8);
    env.world.ping(0.35, pos);
    panel.markDirty();
  }

  // fingertip → key proximity (works in 3D, so you play by reaching into the scene)
  function handsInput(dt) {
    if (!settings.get('handsEnabled') || !hands.active) return;
    for (const h of hands.hands) {
      for (const idx of [8, 12, 16, 20]) {
        const p = hands.worldLandmark(h, idx, new THREE.Vector3());
        let best = null, bd = 0.075;
        for (const key of state.keys) {
          const kp = key.mesh.getWorldPosition(_v);
          const d = kp.distanceTo(p);
          if (d < bd) { bd = d; best = key; }
        }
        if (best && !best._fingerLock?.has(idx)) {
          (best._fingerLock ||= new Set()).add(idx);
          play(best);
        }
        if (best) best.hit = Math.max(best.hit, 0.8);
        for (const key of state.keys) if (key._fingerLock?.has(idx) && key !== best) key._fingerLock.delete(idx);
      }
    }
  }
  const _v = new THREE.Vector3();

  function draw(kit) {
    const r = env.window.content;
    kit.bg('default');
    let y = r.y + 4;
    kit.text('OITAVA', r.x + 6, y + 6, { size: 10, weight: 700, color: PALETTE.ink3, letterSpacing: 1.6 });
    [2, 3, 4, 5, 6].forEach((o, i) => kit.button(`pi:oct:${o}`, r.x + 74 + i * 62, y - 6, 56, 26, { label: `C${o}`, variant: state.octave === o ? 'primary' : 'ghost', size: 11.5 }));
    kit.button('pi:scale', r.x + 74 + 5 * 62 + 8, y - 6, 150, 26, { label: 'tocar escala', icon: 'play', variant: 'ghost', size: 11.5 });
    y += 34;
    ['sine', 'triangle', 'square', 'sawtooth'].forEach((w, i) => {
      kit.button(`pi:wave:${w}`, r.x + i * 118, y, 110, 28, { label: w, variant: state.wave === w ? 'accent2' : 'ghost', size: 11 });
    });
    kit.toggle('pi:sustain', r.x + 4 * 118 + 10, y - 2, { label: 'sustentado', value: state.sustain, w: 200 });
    y += 42;
    // last played
    const recent = Object.entries(state.pressed).sort((a, b) => b[1] - a[1]).slice(0, 8);
    kit.divider(r.x, y, r.w, { label: 'ÚLTIMAS NOTAS' });
    y += 20;
    let x = r.x + 6;
    recent.forEach(([midi]) => {
      const n = NAMES[+midi % 12] + (Math.floor(+midi / 12) - 1);
      const w = kit.measure(n, 13, 700) + 22;
      kit.fillRR(x, y - 12, w, 26, 13, 'rgba(70,240,208,.16)', 'rgba(70,240,208,.5)', 1);
      kit.text(n, x + w / 2, y + 1, { size: 13, weight: 700, align: 'center', color: '#c9fff2' });
      x += w + 8;
      if (x > r.x + r.w - 60) { x = r.x + 6; y += 34; }
    });
    if (!recent.length) kit.text('pinche uma tecla no mundo 3D — ou passe os dedos por cima delas', r.x + 6, y, { size: 12, color: PALETTE.ink3 });
    y += 40;
    kit.divider(r.x, y, r.w, { label: 'AJUDAS' });
    y += 20;
    ['Toque com a ponta dos dedos: a tecla mais próxima do seu fingertip soa.',
      'Pinche e segure para sustentar a nota atual.',
      'Incline a cabeça para olhar o piano de cima — as 17 teclas ficam em arco.'].forEach((t, i) => {
      kit.icon('check', r.x + 14, y + 8 + i * 26, 13, PALETTE.accent);
      kit.text(t, r.x + 32, y + 8 + i * 26, { size: 12, color: PALETTE.ink2, maxWidth: r.w - 60 });
    });
    panel.contentH = y + 96;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function onClick(region) {
    const id = region.id;
    if (id.startsWith('pi:oct:')) { state.octave = +id.split(':')[2]; build(); return panel.markDirty(); }
    if (id.startsWith('pi:wave:')) { state.wave = id.slice(8); return panel.markDirty(); }
    if (id === 'pi:sustain') { state.sustain = !state.sustain; return panel.markDirty(); }
    if (id === 'pi:scale') {
      const scale = [0, 2, 4, 5, 7, 9, 11, 12];
      scale.forEach((s, i) => setTimeout(() => { const k = state.keys.find((x) => x.midi % 12 === s % 12) || state.keys[i]; if (k) play(k); }, i * 190));
      toast('🎼 escala maior');
      return;
    }
  }

  function tick(dt, t) {
    if (!built) build();
    handsInput(dt);
    for (const key of state.keys) {
      key.hit = Math.max(0, key.hit - dt * 3.2);
      key.hover = Math.max(0, (key.hover || 0) - dt * 3);
      const drop = key.hit * 0.028 + key.hover * 0.006;
      key.mesh.position.y = (-1.05 + (key.black ? KEY_H * 0.35 : 0)) - drop;
      key.mesh.rotation.x = drop * 1.4;
      key.mesh.material.emissiveIntensity = 0.18 + key.hit * 2.4;
      key.glow.material.opacity = key.hit * 0.8;
      key.glow.scale.setScalar(0.22 + key.hit * 0.16);
    }
    state.viz = THREE.MathUtils.damp(state.viz, 0, 3, dt);
  }

  function destroy() { while (group.children.length) { const c = group.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); } group.removeFromParent(); }

  build();
  return { draw, onClick, tick, destroy };
}

let _g;
function glowTex() {
  if (_g) return _g;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.2)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _g = new THREE.CanvasTexture(c);
  return _g;
}
