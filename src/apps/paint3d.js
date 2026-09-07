import * as THREE from 'three';
import { PALETTE, hexA } from '../ui/kit.js';
import { scopedStore } from '../core/storage.js';
import { audio } from '../core/audio.js';
import { clamp, toast } from '../core/util.js';

const SWATCH = ['#46f0d0', '#ff3ea5', '#ffd166', '#7ab8ff', '#69f0a5', '#c39bff', '#ffffff', '#ff6b4a'];

/**
 * Pintura volumétrica: cada traço é um tubo 3D no espaço, desenhado segurando o
 * pinch (ou o botão do mouse) e movendo a mão. Seus quadros ficam na sala.
 */
export function make(env, meta) {
  const { scene, pointer, panel, hands } = env;
  const db = scopedStore('paint3d');
  const state = {
    color: SWATCH[0], size: 0.014, mode: 'ray', depth: 2.0, drawing: false,
    strokes: db.get('strokes') || [], cur: null, cursor3d: true
  };
  const strokeGroup = new THREE.Group();
  scene.add(strokeGroup);
  const guide = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#46f0d0'), wireframe: true, transparent: true, opacity: 0.05 })
  );
  guide.scale.setScalar(state.depth);
  scene.add(guide);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#eafffb'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(tip);

  function rebuild() {
    for (const c of [...strokeGroup.children]) { strokeGroup.remove(c); c.geometry?.dispose(); c.material?.dispose?.(); }
    for (const s of state.strokes) strokeGroup.add(strokeMesh(s));
    panel.markDirty();
  }

  function strokeMesh(s) {
    if (s.points.length < 2) return new THREE.Object3D();
    const pts = s.points.map((p) => new THREE.Vector3(...p));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    const geo = new THREE.TubeGeometry(curve, Math.min(400, pts.length * 4), s.size, 7, false);
    const col = new THREE.Color(s.color);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.75), roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.95 });
    const m = new THREE.Mesh(geo, mat);
    m.userData.stroke = s;
    return m;
  }

  function begin() {
    state.cur = { points: [], color: state.color, size: state.size };
    state.drawing = true;
    audio.swoosh(panel.worldPos);
  }
  function addPoint(p) {
    if (!state.cur) return;
    const last = state.cur.points[state.cur.points.length - 1];
    if (last && Math.hypot(last[0] - p.x, last[1] - p.y, last[2] - p.z) < 0.022) return;
    state.cur.points.push([+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]);
    if (state.cur.points.length % 3 === 0) liveUpdate();
  }
  let live = null;
  function liveUpdate() {
    if (!state.cur || state.cur.points.length < 2) return;
    if (live) { strokeGroup.remove(live); live.geometry.dispose(); live = null; }
    live = strokeMesh(state.cur);
    strokeGroup.add(live);
  }
  function end() {
    if (state.cur && state.cur.points.length > 1) {
      state.strokes.push(state.cur);
      if (live) { strokeGroup.remove(live); live.geometry.dispose(); live = null; }
      rebuild();
      db.set('strokes', state.strokes.slice(-70));
      audio.tap?.(panel.worldPos);
    } else if (live) { strokeGroup.remove(live); live.geometry.dispose(); live = null; }
    state.cur = null;
    state.drawing = false;
  }

  pointer.on('update', () => {
    if (pointer.pressed && !state.drawing && !pointer.hover?.panel) begin();
    if (!pointer.pressed && state.drawing) end();
    if (state.drawing) {
      const ray = pointer.raycaster.ray;
      const d = state.mode === 'hand' && hands.hands[0] ? hands.handDepth(hands.hands[0]) : state.depth;
      const p = ray.at(clamp(d, 0.6, 8), new THREE.Vector3());
      tip.position.copy(p);
      addPoint(p);
    } else if (pointer.hitPoint) tip.position.lerp(pointer.hitPoint, 0.3);
  });

  function draw(kit) {
    const r = env.window.content;
    kit.bg('default');
    let y = r.y + 6;
    kit.text('PAINT VOLUMÉTRICO', r.x + 6, y + 8, { size: 12, weight: 800, letterSpacing: 1.6, color: PALETTE.ink2 });
    kit.text(`${state.strokes.length} traços · ${state.strokes.reduce((a, s) => a + s.points.length, 0)} pontos`, r.x + r.w - 6, y + 8, { size: 11, color: PALETTE.ink3, align: 'right' });
    y += 28;
    SWATCH.forEach((col, i) => {
      const bw = (r.w - 7 * 6) / 8;
      const on = state.color === col;
      kit.fillRR(r.x + i * (bw + 6), y, bw, 34, 9, hexA(col, on ? 1 : 0.45), on ? '#ffffff' : 'transparent', 2);
      kit.region({ id: `pa:col:${i}`, kind: 'swatch', x: r.x + i * (bw + 6), y, w: bw, h: 34, data: { color: col } });
      if (on) kit.icon('check', r.x + i * (bw + 6) + bw / 2, y + 17, 14, '#04121a');
    });
    y += 44;
    kit.slider('pa:size', r.x, y + 16, r.w * 0.46, { label: 'Pincel', value: state.size, min: 0.004, max: 0.06, step: 0.001, format: (v) => `${(v * 1000).toFixed(0)} mm` });
    kit.slider('pa:depth', r.x + r.w * 0.54, y + 16, r.w * 0.46, { label: 'Distância do plano', value: state.depth, min: 0.8, max: 5, step: 0.05, format: (v) => `${v.toFixed(2)} m` });
    y += 62;
    kit.toggle('pa:hand', r.x + 8, y, { label: 'Profundidade pela mão (auto)', value: state.mode === 'hand', w: 320 });
    kit.button('pa:undo', r.x + 340, y - 4, 120, 30, { label: 'desfazer', icon: 'back', variant: 'ghost', size: 11.5 });
    kit.button('pa:clear', r.x + 468, y - 4, 118, 30, { label: 'limpar', icon: 'trash', variant: 'danger', size: 11.5 });
    kit.button('pa:export', r.x + 594, y - 4, 148, 30, { label: 'exportar .json', icon: 'download', variant: 'ghost', size: 11.5 });
    y += 42;
    kit.divider(r.x, y, r.w, { label: 'COMO PINTAR' });
    const help = [
      ['pinch', 'Belisque o ar e arraste a mão: o tubo é gerado no espaço à sua frente.'],
      ['cast', 'Sem mãos? Segure o botão do mouse (ou toque na tela) e mova — funciona igual.'],
      ['layers', 'Pinte em profundidades diferentes para criar volume real entre as camadas.']
    ];
    help.forEach(([ic, txt], i) => {
      const yy = y + 22 + i * 34;
      kit.icon(ic, r.x + 16, yy, 15, PALETTE.accent);
      kit.text(txt, r.x + 34, yy, { size: 12, color: PALETTE.ink2, maxWidth: r.w - 60 });
    });
    panel.contentH = y + help.length * 34 + 40;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function onClick(region) {
    const id = region.id;
    if (id.startsWith('pa:col:')) { state.color = SWATCH[+id.split(':')[2]]; audio.toggle(true, panel.worldPos); return panel.markDirty(); }
    if (id === 'pa:undo') { state.strokes.pop(); rebuild(); db.set('strokes', state.strokes); return; }
    if (id === 'pa:clear') { state.strokes = []; rebuild(); db.set('strokes', []); toast('tudo limpo'); return; }
    if (id === 'pa:export') {
      const blob = new Blob([JSON.stringify({ app: 'paint3d', strokes: state.strokes })], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'metaport-paint.json';
      a.click();
      toast('exportado');
      return;
    }
    if (id === 'pa:hand') { state.mode = state.mode === 'hand' ? 'ray' : 'hand'; return panel.markDirty(); }
  }

  function onDrag(value, region) {
    if (region.id === 'pa:size') state.size = value;
    if (region.id === 'pa:depth') { state.depth = value; guide.scale.setScalar(value); }
    panel.markDirty();
  }

  function tick(dt, t) {
    guide.material.opacity = state.drawing ? 0.1 : 0.04;
    guide.visible = state.drawing || state.cursor3d;
    tip.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 4));
  }

  function destroy() {
    rebuild();
    strokeGroup.children.slice().forEach((c) => { strokeGroup.remove(c); c.geometry?.dispose?.(); });
    strokeGroup.removeFromParent();
    guide.removeFromParent();
    tip.removeFromParent();
    guide.geometry.dispose(); guide.material.dispose();
  }

  rebuild();
  return { draw, onClick, onDrag, tick, destroy };
}
