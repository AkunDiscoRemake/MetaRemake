import * as THREE from 'three';
import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { clamp, formatBytes } from '../core/util.js';
import { store } from '../core/storage.js';

/** Relógio orbital: ponteiros volumétricos no mundo + telemetria do runtime no painel. */
export function make(env, meta) {
  const { scene, panel, view, hands, head, camera: camService } = env;
  const group = new THREE.Group();
  scene.add(group);
  let hArm, mArm, sArm;
  build();

  function build() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.012, 10, 96),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#0c1a2c'), emissive: new THREE.Color('#46f0d0'), emissiveIntensity: 0.85, metalness: 0.85, roughness: 0.25 })
    );
    group.add(ring);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.33, 64), new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#050b16'), roughness: 0.15, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.72 }));
    face.position.z = -0.004;
    group.add(face);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 3 === 0 ? 0.012 : 0.006, i % 3 === 0 ? 0.05 : 0.028, 0.008), new THREE.MeshStandardMaterial({ color: new THREE.Color('#cfe9ff'), emissive: new THREE.Color('#7ab8ff'), emissiveIntensity: 0.6 }));
      tick.position.set(Math.sin(a) * 0.285, Math.cos(a) * 0.285, 0.006);
      tick.rotation.z = -a;
      group.add(tick);
    }
    const mk = (len, w, col) => {
      const geo = new THREE.BoxGeometry(w, len, 0.01);
      geo.translate(0, len / 2 - 0.03, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(col), emissive: new THREE.Color(col), emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 }));
      m.position.z = 0.012;
      group.add(m);
      return m;
    };
    hArm = mk(0.16, 0.02, '#eafffb');
    mArm = mk(0.24, 0.014, '#46f0d0');
    sArm = mk(0.29, 0.006, '#ff3ea5');
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color('#46f0d0'), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(1.3, 1.3, 1);
    group.add(halo);
    group.position.set(0.86, 0.62, -1.5);
    group.rotation.y = -0.5;
  }

  const state = { lap: 0, laps: [], running: false, t0: 0, fmt24: true };

  function draw(kit) {
    const r = env.window.content;
    kit.bg('default');
    const now = new Date();
    const W = r.w;
    let y = r.y + 10;
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');
    kit.text(`${hh}:${mm}`, r.x + 6, y + 34, { size: 62, weight: 200, font: MONO, color: '#eafffb' });
    kit.text(`:${ss}`, r.x + 6 + kit.measure(`${hh}:${mm}`, 62, 200, MONO), y + 44, { size: 26, weight: 300, font: MONO, color: PALETTE.accent });
    kit.text(now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), r.x + W - 6, y + 26, { size: 13, align: 'right', color: PALETTE.ink2 });
    kit.text(`fuso ${Intl.DateTimeFormat().resolvedOptions().timeZone}`, r.x + W - 6, y + 46, { size: 11, align: 'right', color: PALETTE.ink3, font: MONO });
    y += 92;
    kit.divider(r.x, y, W, { label: 'CRONÔMETRO' });
    y += 22;
    const el = state.running ? (performance.now() - state.t0) / 1000 : state.lap;
    kit.text(`${tstr(el)}`, r.x + 6, y + 22, { size: 34, weight: 400, font: MONO, color: state.running ? PALETTE.accent : PALETTE.ink });
    kit.button('cl:start', r.x + W - 260, y + 2, 122, 36, { label: state.running ? 'parar' : 'iniciar', icon: state.running ? 'stop' : 'play', variant: 'primary', size: 12 });
    kit.button('cl:lap', r.x + W - 130, y + 2, 118, 36, { label: 'volta', icon: 'layers', variant: 'ghost', size: 12 });
    y += 50;
    state.laps.slice(-4).reverse().forEach((l, i) => {
      kit.text(`V${state.laps.length - i}`, r.x + 8, y + 12 + i * 22, { size: 11, color: PALETTE.ink3, font: MONO });
      kit.text(tstr(l), r.x + 60, y + 12 + i * 22, { size: 12, font: MONO, color: PALETTE.ink2 });
    });
    y += Math.max(0, state.laps.length ? 4 * 22 + 12 : 0);
    kit.divider(r.x, y, W, { label: 'TELEMETRIA DO HEADSET' });
    y += 18;
    const rows = [
      ['fps', `${view.stats.fps}`, PALETTE.accent],
      ['resolução', view.stats.res, PALETTE.ink2],
      ['draws / tris', `${view.stats.draws} / ${(view.stats.tris / 1000).toFixed(1)}k`, PALETTE.ink2],
      ['mãos', `${hands.hands.length} · ${hands.status}`, hands.hands.length ? PALETTE.ok : PALETTE.warn],
      ['gyro', head.hasGyro ? 'ativo' : 'ausente', head.hasGyro ? PALETTE.ok : PALETTE.ink3],
      ['yaw / pitch', `${rad2deg(euler(head.quat).y).toFixed(0)}° / ${rad2deg(euler(head.quat).x).toFixed(0)}°`, PALETTE.ink2],
      ['câmera', camService.ready ? `${camService.width}×${camService.height}` : 'off', camService.ready ? PALETTE.accent : PALETTE.warn],
      ['luma sala', `${Math.round((camService.luma || 0) * 100)}%`, PALETTE.ink2],
      ['IPD / sep.', `${settings.get('ipd')} mm · ${settings.get('lensSeparation').toFixed(2)}`, PALETTE.ink2],
      ['storage', `${formatBytes(store.usage())}`, PALETTE.ink2]
    ];
    rows.forEach(([k, v, col], i) => {
      const yy = y + Math.floor(i / 2) * 30;
      const xx = r.x + (i % 2) * (W / 2);
      kit.fillRR(xx, yy - 11, W / 2 - 8, 26, 7, 'rgba(255,255,255,.03)');
      kit.text(k, xx + 12, yy + 2, { size: 11, color: PALETTE.ink3 });
      kit.text(String(v), xx + W / 2 - 20, yy + 2, { size: 11.5, weight: 600, color: col, align: 'right', font: MONO });
    });
    y += Math.ceil(rows.length / 2) * 30 + 10;
    kit.text('Os ponteiros no mundo 3D giram em tempo real — olhe ao redor para vê-los.', r.x + 6, y, { size: 11.5, color: PALETTE.ink3, maxWidth: W - 12 });
    panel.contentH = y + 44;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  const tstr = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 100)).padStart(2, '0')}`;
  const rad2deg = (r) => (r * 180) / Math.PI;
  const euler = (q) => new THREE.Euler().setFromQuaternion(q, 'YXZ');

  function onClick(region) {
    const id = region.id;
    if (id === 'cl:start') {
      if (state.running) { state.lap += (performance.now() - state.t0) / 1000; state.running = false; }
      else { state.t0 = performance.now(); state.running = true; }
      audio.toggle(state.running, panel.worldPos);
      return panel.markDirty();
    }
    if (id === 'cl:lap') {
      const el = state.running ? (performance.now() - state.t0) / 1000 : state.lap;
      state.laps.push(el);
      state.lap = 0;
      state.t0 = performance.now();
      state.running = true;
      audio.press(panel.worldPos);
      return panel.markDirty();
    }
  }

  function tick(dt, t) {
    const n = new Date();
    const sec = n.getSeconds() + n.getMilliseconds() / 1000;
    const min = n.getMinutes() + sec / 60;
    const hr = (n.getHours() % 12) + min / 60;
    sArm.rotation.z = -(sec / 60) * Math.PI * 2;
    mArm.rotation.z = -(min / 60) * Math.PI * 2;
    hArm.rotation.z = -(hr / 12) * Math.PI * 2;
    group.rotation.y += Math.sin(t * 0.4) * 0.0004;
    panel.markDirty();
  }

  function destroy() { group.children.slice().forEach((c) => { c.geometry?.dispose?.(); c.material?.dispose?.(); }); group.removeFromParent(); }

  return { draw, onClick, tick, destroy };
}
