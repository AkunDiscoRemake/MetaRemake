import * as THREE from 'three';
import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { scopedStore } from '../core/storage.js';
import { audio } from '../core/audio.js';
import { settings } from '../core/settings.js';
import { clamp, toast } from '../core/util.js';

/**
 * Synth Runner — corrida neon dentro do próprio mundo: os prismas vêm até você e a
 * desvia se faz com a cabeça (giroscópio) ou com a posição da mão. HUD num painel
 * curvo, trilha sintetizada e recorde salvo.
 */
export function make(env, meta) {
  const { scene, view, head, hands, panel } = env;
  const db = scopedStore('runner');
  const state = {
    on: false, over: false, speed: 8, score: 0, best: db.get('best') || 0, lives: 3,
    steer: 0, x: 0, control: 'head', spawnT: 0, hitFlash: 0, combo: 0
  };
  const track = new THREE.Group();
  scene.add(track);
  const obstacles = [];
  const lane = { w: 2.6 };

  const railMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0b1424'), emissive: new THREE.Color('#1b3b5a'), emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.8 });
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 90), railMat);
    rail.position.set(s * lane.w, -1.45, -42);
    track.add(rail);
  }
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 4), new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d2233'), emissive: new THREE.Color('#46f0d0'), emissiveIntensity: 1.3, metalness: 0.8, roughness: 0.2 }));
  hull.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: new THREE.Color('#101c2e'), emissive: new THREE.Color('#ff3ea5'), emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.3 }));
  ship.add(hull, wing);
  ship.position.set(0, -1.1, -1.6);
  track.add(ship);
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#46f0d0'), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(0, -1.35, 1.4);
  ship.add(trail);

  function spawn() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const g = new THREE.Group();
    const kind = Math.random();
    const col = new THREE.Color().setHSL(kind * 0.28 + 0.5, 0.9, 0.55);
    const geo = kind < 0.4 ? new THREE.BoxGeometry(0.5, 1.6, 0.3) : kind < 0.75 ? new THREE.IcosahedronGeometry(0.34, 0) : new THREE.TorusGeometry(0.36, 0.09, 8, 20);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.25), emissive: col, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.3 }));
    g.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: col.clone(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.6, 1.6, 1);
    g.add(glow);
    g.position.set((Math.random() - 0.5) * lane.w * 2, -1.15 + (kind < 0.4 ? 0.5 : 0), -55);
    track.add(g);
    obstacles.push({ g, m, glow, spin: (Math.random() - 0.5) * 2, passed: false });
  }

  function reset() {
    state.score = 0; state.lives = 3; state.speed = 8; state.over = false; state.combo = 0;
    for (const o of obstacles) { track.remove(o.g); o.m.geometry.dispose(); o.m.material.dispose(); }
    obstacles.length = 0;
  }

  function start() { reset(); state.on = true; audio.ok(panel.worldPos); env.shell.launcher?.panel.show(false); toast('prepare-se…'); }
  function stop() { state.on = false; env.shell.setLauncherPresence(); }

  function endGame() {
    state.over = true; state.on = false;
    if (state.score > state.best) { state.best = state.score; db.set('best', state.best); toast(`🏆 novo recorde: ${state.score}`); audio.ok(); }
    else audio.error();
    env.shell.setLauncherPresence();
    panel.markDirty();
  }

  function tick(dt) {
    if (state.on) {
      // steering
      let target = 0;
      if (state.control === 'head') target = clamp(head.forward(new THREE.Vector3()).x * 3.2, -1, 1);
      else if (hands.hands[0]) target = clamp((hands.hands[0].pointer.x) * 1.6, -1, 1);
      state.steer += (target - state.steer) * Math.min(1, dt * 8);
      state.x = state.steer * lane.w;
      ship.position.x += (state.x - ship.position.x) * Math.min(1, dt * 11);
      ship.rotation.z += (-state.steer * 0.55 - ship.rotation.z) * Math.min(1, dt * 7);
      ship.rotation.y += (state.steer * 0.2 - ship.rotation.y) * Math.min(1, dt * 7);
      trail.position.x = -state.steer * 0.2;
      state.speed = Math.min(40, state.speed + dt * 0.34);
      state.score += dt * state.speed * 1.4;
      state.spawnT -= dt;
      if (state.spawnT <= 0) { spawn(); state.spawnT = clamp(1.5 - state.speed * 0.028, 0.42, 1.5); }
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.g.position.z += state.speed * dt * 3;
        o.g.rotation.z += o.spin * dt;
        o.m.rotation.x += dt * 1.2;
        if (o.g.position.z > -1.9 && o.g.position.z < -1.2 && !o.passed) {
          if (Math.abs(o.g.position.x - ship.position.x) < 0.42) {
            o.passed = true;
            state.lives--; state.hitFlash = 1; state.combo = 0;
            env.world.ping(1.6);
            audio.noise(0.25, { gain: 0.16, hp: 300 });
            audio.haptic(60);
            track.remove(o.g); o.m.geometry.dispose(); o.m.material.dispose(); obstacles.splice(i, 1);
            if (state.lives <= 0) { endGame(); break; }
            continue;
          }
        }
        if (o.g.position.z > 2) {
          if (!o.passed) { o.passed = true; state.score += 25; state.combo++; audio.tone(660 + Math.min(12, state.combo) * 42, 0.06, { gain: 0.05 }); }
          track.remove(o.g); o.m.geometry.dispose(); o.m.material.dispose(); obstacles.splice(i, 1);
        }
      }
      state.hitFlash = Math.max(0, state.hitFlash - dt * 2.4);
      // world reacts
      env.world.gridMat.uniforms.uTime.value += dt * (state.speed / 8);
      panel.markDirty();
      // beat
      state.beatT = (state.beatT || 0) - dt;
      if (state.beatT <= 0) { state.beatT = 60 / (104 + state.speed) ; audio.tone(55, 0.12, { type: 'sine', gain: 0.1 }); }
    }
  }

  function draw(kit) {
    const r = env.window.content;
    kit.bg('void');
    const W = r.w;
    let y = r.y + 8;
    kit.text(state.on ? 'CORRIDA EM ANDAMENTO' : state.over ? 'FIM DE JOGO' : 'PRONTO PARA CORRER', r.x + 6, y, { size: 11, weight: 800, letterSpacing: 2, color: state.on ? PALETTE.accent : PALETTE.ink3 });
    y += 22;
    kit.stat('sc', r.x, y, W * 0.34, 82, { label: 'pontos', value: Math.floor(state.score), icon: 'bolt', color: PALETTE.accent });
    kit.stat('st', r.x + W * 0.36, y, W * 0.34, 82, { label: 'velocidade', value: state.speed.toFixed(1), unit: 'u/s', icon: 'wave', color: '#7ab8ff' });
    kit.stat('bs', r.x + W * 0.72, y, W * 0.28, 82, { label: 'recorde', value: state.best, icon: 'star', color: PALETTE.warn });
    y += 94;
    kit.text('VIDAS', r.x + 6, y, { size: 10, weight: 700, color: PALETTE.ink3, letterSpacing: 1.4 });
    for (let i = 0; i < 3; i++) kit.fillRR(r.x + 62 + i * 24, y - 8, 18, 12, 4, i < state.lives ? hexA(PALETTE.err, 0.9) : 'rgba(255,255,255,.07)');
    kit.text(`combo x${state.combo}`, r.x + W - 6, y, { size: 11, color: state.combo > 2 ? PALETTE.warn : PALETTE.ink3, align: 'right' });
    y += 24;
    kit.button(state.on ? 'ru:pause' : 'ru:start', r.x, y, W * 0.46, 38, { label: state.on ? 'pausar' : state.over ? 'correr de novo' : 'começar corrida', icon: state.on ? 'pause' : 'play', variant: 'primary', size: 12.5 });
    kit.button('ru:control', r.x + W * 0.5, y, W * 0.5, 38, { label: `controle: ${state.control === 'head' ? 'cabeça (giro)' : 'mão'}`, icon: state.control === 'head' ? 'vr' : 'hand', variant: 'ghost', size: 12 });
    y += 50;
    kit.text('COMO JOGAR', r.x + 6, y, { size: 10, weight: 700, color: PALETTE.ink3, letterSpacing: 1.6 });
    y += 18;
    ['Incline a cabeça para os lados (ou use a mão) para desviar dos prismas.',
      'Cada obstáculo desviado vale combo; bater custa uma vida.',
      'No VR Box o controle por cabeça é o mais confortável — a navegação é estérea.'].forEach((t, i) => {
      kit.text(`· ${t}`, r.x + 10, y + 12 + i * 24, { size: 12, color: PALETTE.ink2, maxWidth: W - 24 });
    });
    y += 3 * 24 + 16;
    // mini radar
    kit.divider(r.x, y, W, { label: 'RADAR' });
    y += 14;
    const rh = 78;
    kit.fillRR(r.x, y, W, rh, 8, 'rgba(0,0,0,.45)', 'rgba(150,205,255,.14)', 1);
    kit.ctx.save();
    kit.ctx.beginPath(); kit.ctx.rect(r.x, y, W, rh); kit.ctx.clip();
    for (const o of obstacles) {
      const t = clamp((o.g.position.z + 55) / 55, 0, 1);
      const px = r.x + W * (0.5 + (o.g.position.x / (lane.w * 2)) * 0.92);
      kit.ctx.fillStyle = hexA(new THREE.Color(o.m.material.emissive.getHex()).getStyle(), 0.9);
      kit.ctx.beginPath(); kit.ctx.arc(px, y + 10 + (rh - 22) * t, 4, 0, 6.2832); kit.ctx.fill();
    }
    kit.ctx.fillStyle = '#46f0d0';
    kit.ctx.beginPath();
    kit.ctx.moveTo(r.x + W * (0.5 + (state.x / (lane.w * 2)) * 0.42), y + rh - 8);
    kit.ctx.lineTo(r.x + W * (0.5 + (state.x / (lane.w * 2)) * 0.42) - 7, y + rh - 1);
    kit.ctx.lineTo(r.x + W * (0.5 + (state.x / (lane.w * 2)) * 0.42) + 7, y + rh - 1);
    kit.ctx.fill();
    kit.ctx.restore();
    panel.contentH = y + rh + 40;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function onClick(region) {
    const id = region.id;
    if (id === 'ru:start' || id === 'ru:pause') { state.on ? stop() : start(); return panel.markDirty(); }
    if (id === 'ru:control') { state.control = state.control === 'head' ? 'hand' : 'head'; return panel.markDirty(); }
  }

  function destroy() {
    state.on = false;
    track.children.slice().forEach((c) => { c.geometry?.dispose?.(); c.material?.dispose?.(); track.remove(c); });
    track.removeFromParent();
  }

  return { draw, onClick, tick, destroy, pause: stop };
}
