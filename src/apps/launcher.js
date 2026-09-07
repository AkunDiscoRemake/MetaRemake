import * as THREE from 'three';
import { Kit, PALETTE, hexA, MONO, FONT } from '../ui/kit.js';
import { drawIcon } from '../ui/icons.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { clamp, toast } from '../core/util.js';

const TILE = 0.155;
const iconCache = new Map();

function squircle(w, h, r) {
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

function iconTexture(app) {
  if (iconCache.has(app.id)) return iconCache.get(app.id);
  const S = 160;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, hexA(app.color, 0.95));
  grd.addColorStop(1, hexA(app.color, 0.35));
  g.fillStyle = grd;
  g.beginPath();
  g.roundRect(6, 6, S - 12, S - 12, 34);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.86;
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(16, 16, S - 32, S - 32, 26);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  drawIcon(g, app.icon || 'grid', S / 2, S / 2, S * 0.52, '#ffffff', { lw: 2.2 });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  iconCache.set(app.id, t);
  return t;
}

function labelTexture(text, color = PALETTE.ink) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 72;
  const g = c.getContext('2d');
  g.font = `600 30px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.85)';
  g.shadowBlur = 12;
  g.fillText(text, 160, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The home space: volumetric app tiles floating on an arc in front of a curved HUD
 * slab. Tiles are real objects (thickness, bevel, glass, floor beam), clickable from
 * any angle with a pinch — nothing here is a flat menu.
 */
export function make(env) {
  const { scene, shell, pointer, hands, view, world } = env;
  const root = new THREE.Group();
  root.name = 'launcher';
  scene.add(root);
  const tileRoot = new THREE.Group();
  root.add(tileRoot);
  const panel = env.panel;
  panel.maxScroll = 0;
  panel.interactive = true;

  let tiles = [];
  let hoverTile = null;
  let clockAcc = 0;
  let opened = [];

  const disposers = [];

  function layout() {
    const apps = shell.appList.filter((a) => a.id !== 'launcher');
    if (apps.length === tiles.length && apps.every((a, i) => tiles[i]?.app.id === a.id)) return;
    for (const t of tiles) { t.dispose?.(); t.off?.(); }
    tileRoot.clear();
    tiles = apps.map((app, i) => makeTile(app, i, apps.length));
  }

  function makeTile(app, i, n) {
    const group = new THREE.Group();
    const col = new THREE.Color(app.color || PALETTE.accent);
    const bodyGeo = new THREE.ExtrudeGeometry(squircle(TILE, TILE * 0.94, TILE * 0.3), {
      depth: TILE * 0.26, bevelEnabled: true, bevelThickness: TILE * 0.06, bevelSize: TILE * 0.06, bevelSegments: 3, curveSegments: 12
    });
    bodyGeo.translate(0, 0, -TILE * 0.13);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: col.clone().multiplyScalar(0.22), metalness: 0.62, roughness: 0.26,
      clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.5,
      emissive: col.clone().multiplyScalar(0.12), transparent: true, opacity: 0.96
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 0.78, TILE * 0.78),
      new THREE.MeshBasicMaterial({ map: iconTexture(app), transparent: true, toneMapped: false, depthWrite: false })
    );
    face.position.z = TILE * 0.15;
    group.add(face);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      color: col.clone(), map: tileGlow(), transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(TILE * 3.1, TILE * 3.1, 1);
    halo.position.z = -TILE * 0.2;
    group.add(halo);

    const ringGeo = new THREE.TorusGeometry(TILE * 0.72, TILE * 0.012, 6, 60);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -TILE * 0.1;
    group.add(ring);

    const lbl = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 1.5, TILE * 0.34),
      new THREE.MeshBasicMaterial({ map: labelTexture(app.name.slice(0, 18)), transparent: true, depthWrite: false, toneMapped: false })
    );
    lbl.position.set(0, -TILE * 0.78, TILE * 0.05);
    group.add(lbl);

    // floor pedestal + light beam: anchors the tile in the room
    const ped = new THREE.Mesh(
      new THREE.RingGeometry(TILE * 0.5, TILE * 0.72, 40),
      new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ped.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(TILE * 0.34, TILE * 0.62, 1, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.055, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    root.add(group, ped, beam);

    const tile = {
      app, group, body, face, halo, ring, lbl, ped, beam, col,
      hover: 0, press: 0, phase: Math.random() * 6.28, index: i,
      dispose() {
        group.removeFromParent(); ped.removeFromParent(); beam.removeFromParent();
        bodyGeo.dispose(); bodyMat.dispose(); ringGeo.dispose(); ring.material.dispose();
        face.material.dispose(); lbl.material.dispose(); halo.material.dispose(); ped.material.dispose(); beam.material.dispose();
      }
    };

    tile.off = pointer.register(body, {
      id: app.id,
      tile,
      onHover: (on) => { tile.hoverTarget = on ? 1 : 0; if (on) { audio.hover(tile.group.getWorldPosition(new THREE.Vector3())); hoverTile = tile; } },
      onClick: () => {
        tile.press = 1;
        audio.press(tile.group.getWorldPosition(new THREE.Vector3()));
        world.ping(1.1, tile.group.getWorldPosition(new THREE.Vector3()));
        opened.unshift(app.id);
        opened = [...new Set(opened)].slice(0, 5);
        shell.openApp(app.id);
        panel.markDirty();
      }
    });
    return tile;
  }

  function arcPlace(tile, i, n, t) {
    const stereo = settings.get('stereo');
    const perRow = Math.min(n, stereo ? 5 : 6);
    const row = Math.floor(i / perRow);
    const col2 = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    const spread = stereo ? 0.34 : 0.30;
    const a = (col2 - (inRow - 1) / 2) * spread;
    const radius = (stereo ? 1.62 : 1.5) + row * 0.06;
    const x = Math.sin(a) * radius;
    const z = -Math.cos(a) * radius;
    const y = -0.02 - row * 0.33 + Math.sin(t * 0.7 + tile.phase) * 0.012;
    tile.group.position.set(x, y, z);
    tile.group.rotation.set(0.06, -a, 0);
    tile.ped.position.set(x, -1.5, z);
    tile.beam.position.set(x, -1.5 + (y + 1.5) / 2, z);
    tile.beam.scale.set(1, (y + 1.5) * 0.98, 1);
    return { x, y, z, a };
  }

  // ------------------------------------------------------------------ drawing
  function draw(kit, t) {
    const c = kit.ctx;
    const W = panel.designW, H = panel.designH;
    kit.bg('default');
    // top title block
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = kit.gradient(0, 0, W, 0, [[0, 'rgba(70,240,208,.16)'], [0.55, 'rgba(255,62,165,.05)'], [1, 'rgba(70,240,208,.11)']]);
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(18, 16, W - 36, 104, 26);
    c.fill();
    c.restore();
    kit.fillRR(18, 16, W - 36, 104, 26, null, 'rgba(150,205,255,.18)', 1.2);

    kit.icon('bolt', 66, 68, 30, PALETTE.accent);
    kit.text('MetaPort', 96, 50, { size: 30, weight: 800, letterSpacing: -0.6 });
    kit.text('RUNTIME MR FANMADE · VR BOX · SBS · HAND TRACKING', 97, 78, { size: 11, weight: 700, color: PALETTE.ink3, letterSpacing: 2.4 });
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    kit.text(`${hh}:${mm}`, W - 46, 48, { size: 40, weight: 300, align: 'right', font: MONO, color: '#dff6ff' });
    kit.text(now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase(), W - 46, 84, { size: 10.5, weight: 700, color: PALETTE.ink3, align: 'right', letterSpacing: 1.4 });

    // status strip
    const sy = 138;
    const st = statusChips(env, hands, view);
    let sx = 30;
    for (const chip of st) {
      const w = kit.measure(chip.label, 11.5, 700) + 46;
      kit.fillRR(sx, sy - 14, w, 28, 14, hexA(chip.color, 0.13), hexA(chip.color, 0.42), 1);
      kit.icon(chip.icon, sx + 15, sy, 15, chip.color);
      kit.text(chip.label, sx + 28, sy + 0.5, { size: 11.5, weight: 700, color: chip.color });
      sx += w + 10;
    }

    // toggles
    const ty = H - 176;
    kit.text('AJUSTES RÁPIDOS', 32, ty - 26, { size: 10.5, weight: 700, color: PALETTE.ink3, letterSpacing: 1.8 });
    kit.toggle('mp:stereo', 30, ty, { label: 'Estéreo VR Box (SBS)', value: settings.get('stereo'), w: 268 });
    kit.toggle('mp:pass', 30, ty + 44, { label: 'Passagem de câmera', value: settings.get('passthrough'), w: 268 });
    kit.toggle('mp:hands', 30, ty + 88, { label: 'Hand tracking + contorno', value: settings.get('handsEnabled'), w: 268 });
    kit.button('mp:recenter', 322, ty + 40, 150, 52, { label: 'Recentrar vista', icon: 'refresh', variant: 'default', size: 13 });
    kit.button('mp:mode', 322, ty + 96 - 56, 150, 34, { label: 'Trocar modo', icon: 'cast', variant: 'ghost', size: 12 });

    // gesture legend
    const gy = ty - 26;
    kit.divider(W - 470, gy + 12, 440, { label: 'COMO CONTROLAR' });
    const legend = [
      ['pinch', 'Pinchar', 'clicar / segurar p/ arrastar'],
      ['hand', 'Mão aberta', 'segurar → Início'],
      ['next', 'Dois dedos', 'segurar → Voltar'],
      ['layers', 'Duas mãos', 'abrir → redimensionar janela']
    ];
    legend.forEach(([ic, name, desc], i) => {
      const y = gy + 40 + i * 30;
      kit.icon(ic, W - 452, y, 15, PALETTE.accent);
      kit.text(name, W - 434, y, { size: 12.5, weight: 700 });
      kit.text(desc, W - 434 + kit.measure(name, 12.5, 700) + 12, y, { size: 11.5, color: PALETTE.ink3 });
    });

    // dock: recent windows
    const dy = H - 52;
    kit.text('JANELAS', 32, dy - 22, { size: 10, weight: 700, color: PALETTE.ink3, letterSpacing: 1.6 });
    let dx = 108;
    const wins = shell.windows.filter((w) => w !== shell.launcher);
    if (!wins.length) kit.text('nenhuma — pinche um tile acima', 108, dy + 4, { size: 12, color: PALETTE.ink3 });
    for (const w of wins) {
      const label = w.app.name.slice(0, 16);
      const bw = kit.measure(label, 12, 600) + 46;
      kit.button(`mp:win:${w.id}`, dx, dy - 13, bw, 30, {
        label, icon: w.app.icon, variant: shell.focused === w ? 'primary' : 'ghost', size: 12
      });
      dx += bw + 8;
      if (dx > W - 200) break;
    }
    kit.button('mp:closeall', dx + 6, dy - 13, 132, 30, { label: 'Fechar tudo', icon: 'close', variant: 'ghost', size: 12 });

    // diagnostics column
    kit.footer(`WebGL${view.renderer.capabilities.isWebGL2 ? '2' : '1'} · ${view.stats.fps} fps · modo ${settings.get('stereo') ? 'VR BOX/SBS' : 'MR'}`, { icon: 'shield' });
    panel.markDirty();
  }

  function onClick(region) {
    const id = region.id;
    if (id.startsWith('mp:win:')) {
      const w = shell.windows.find((x) => x.id === id.slice(7));
      if (w) { w.restore(); shell.focus(w); }
      return;
    }
    switch (id) {
      case 'mp:stereo': settings.toggle('stereo'); view.setMode(settings.get('stereo') ? 'stereo' : 'mono'); audio.toggle(!settings.get('stereo')); toast(settings.get('stereo') ? 'VR Box: estéreo SBS ligado' : 'Modo Realidade Mista'); break;
      case 'mp:pass': settings.toggle('passthrough'); break;
      case 'mp:hands': settings.toggle('handsEnabled'); if (settings.get('handsEnabled')) hands.enable(); break;
      case 'mp:recenter': env.head.doRecenter(); toast('Vista recentrada'); audio.ok(); break;
      case 'mp:mode': env.toggleMode(); break;
      case 'mp:closeall': [...shell.windows].filter((w) => w !== shell.launcher).forEach((w) => shell.close(w)); break;
      default: break;
    }
    panel.markDirty();
  }

  function tick(dt, t) {
    clockAcc += dt;
    layout();
    const n = tiles.length;
    for (const tile of tiles) {
      const i = tile.index;
      const p = arcPlace(tile, i, n, t);
      tile.hoverTarget = tile.hoverTarget || 0;
      tile.hover = THREE.MathUtils.damp(tile.hover, tile.hoverTarget, 12, dt);
      tile.press = Math.max(0, tile.press - dt * 3);
      const s = 1 + tile.hover * 0.16 + tile.press * 0.1;
      tile.group.scale.setScalar(s);
      tile.group.position.z = p.z + tile.hover * 0.09;
      tile.group.rotation.y = -p.a + Math.sin(t * 0.5 + tile.phase) * 0.02 + tile.hover * 0.06;
      tile.group.rotation.x = 0.06 + tile.hover * -0.08;
      tile.ring.rotation.z += dt * (0.25 + tile.hover * 1.6);
      tile.ring.material.opacity = 0.25 + tile.hover * 0.6;
      tile.halo.material.opacity = 0.14 + tile.hover * 0.34 + tile.press * 0.4;
      tile.ped.material.opacity = 0.12 + tile.hover * 0.28;
      tile.body.material.emissiveIntensity = 0.12 + tile.hover * 0.55;
      tile.lbl.material.opacity = 0.75 + tile.hover * 0.25;
    }
    if (clockAcc > 0.4) { clockAcc = 0; panel.markDirty(); }
  }

  function destroy() {
    for (const tile of tiles) tile.dispose();
    disposers.forEach((d) => d());
    root.removeFromParent();
  }

  shell.on?.('app:registered', () => panel.markDirty());

  return { draw, tick, destroy, onClick, title: 'MetaPort', wake() { panel.markDirty(); }, contentHeight: panel.designH };
}

function statusChips(env, hands, view) {
  const out = [];
  const hActive = hands.active && hands.hands.length;
  out.push({ icon: 'cast', label: settings.get('stereo') ? `VR BOX · IPD ${settings.get('ipd')}mm` : 'REALIDADE MISTA', color: settings.get('stereo') ? PALETTE.accent : '#7ab8ff' });
  out.push({ icon: 'hand', label: hands.status === 'ok' ? `${hands.hands.length}/2 mãos · ${hands.fps}fps` : hands.status === 'loading' ? 'MediaPipe…' : 'mãos off', color: hands.status === 'ok' ? (hActive ? PALETTE.ok : PALETTE.warn) : PALETTE.ink3 });
  out.push({ icon: 'camera', label: env.camera.ready ? `passthrough ${env.camera.width}p` : 'sem câmera', color: env.camera.ready ? PALETTE.accent : PALETTE.warn });
  out.push({ icon: 'wave', label: env.head.hasGyro ? 'giroscópio' : 'mouse/olhar', color: env.head.hasGyro ? PALETTE.accent : PALETTE.ink3 });
  out.push({ icon: 'bolt', label: `${view.stats.fps} fps`, color: view.stats.fps > 50 ? PALETTE.ok : view.stats.fps > 30 ? PALETTE.warn : PALETTE.err });
  return out;
}

let _glow;
function tileGlow() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.75)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.16)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

export { TILE };
