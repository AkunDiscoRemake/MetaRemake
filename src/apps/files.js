import * as THREE from 'three';
import { PALETTE, hexA } from '../ui/kit.js';
import { scopedStore } from '../core/storage.js';
import { audio } from '../core/audio.js';
import { clamp, formatBytes, toast } from '../core/util.js';

/** Galeria espacial: quadros holográficos com suas fotos, dispostos ao seu redor. */
export function make(env, meta) {
  const { scene, panel, view } = env;
  const db = scopedStore('gallery');
  const state = { items: db.get('items') || [], sel: 0, radius: 2.1, layout: 'ring', h: 0.62 };
  const group = new THREE.Group();
  scene.add(group);
  const frames = [];

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.multiple = true;
  picker.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(picker);
  picker.addEventListener('change', async () => {
    const files = [...(picker.files || [])];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const bmp = await createImageBitmap(f).catch(() => null);
      if (!bmp) continue;
      state.items.push({ name: f.name, size: f.size, w: bmp.width, h: bmp.height, url });
      bmp.close?.();
    }
    if (files.length) { rebuild(); toast(`${files.length} imagem(ns) adicionada(s)`); }
  });

  function rebuild() {
    for (const f of frames) { f.root.removeFromParent(); f.mesh.geometry.dispose(); f.mesh.material.map?.dispose(); f.mesh.material.dispose(); }
    frames.length = 0;
    state.items.forEach((it, i) => {
      const root = new THREE.Group();
      const tex = new THREE.TextureLoader().load(it.url, () => panel.markDirty());
      tex.colorSpace = THREE.SRGBColorSpace;
      const ratio = (it.w || 4) / (it.h || 3);
      const h = state.h, w = h * clamp(ratio, 0.4, 2.4);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.02),
        new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0a1424'), emissive: new THREE.Color('#46f0d0'), emissiveIntensity: 0.25, metalness: 0.8, roughness: 0.3, transparent: true, opacity: 0.9 })
      );
      frame.position.z = -0.016;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color('#8fd6ff'), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(w * 2.1, h * 2.4, 1);
      glow.position.z = -0.05;
      root.add(frame, mesh, glow);
      root.userData.i = i;
      group.add(root);
      const rec = { root, mesh, frame, glow, w, h, tex, hover: 0 };
      frames.push(rec);
      env.pointer.register(mesh, {
        id: `gal:${i}`,
        onHover: (on) => { rec.hoverT = on ? 1 : 0; },
        onClick: () => { state.sel = i; audio.press(root.getWorldPosition(new THREE.Vector3())); panel.markDirty(); }
      });
    });
    layout();
    db.set('items', state.items.map((it) => ({ ...it, url: it.url.startsWith('blob:') ? '' : it.url })).filter((it) => it.url));
  }

  function layout() {
    const n = frames.length;
    frames.forEach((f, i) => {
      let x, y, z, ry;
      if (state.layout === 'ring') {
        const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI;
        x = Math.sin(a) * state.radius;
        z = -Math.cos(a) * state.radius;
        ry = -a;
        y = 0.05;
      } else if (state.layout === 'wall') {
        const cols = Math.ceil(Math.sqrt(n));
        const cx = i % cols, cy = Math.floor(i / cols);
        x = (cx - (cols - 1) / 2) * 0.95;
        y = 0.35 - cy * 0.78;
        z = -state.radius * 1.25;
        ry = -x * 0.12;
      } else {
        x = (i - (n - 1) / 2) * 0.95;
        y = 0.05;
        z = -state.radius;
        ry = -x * 0.1;
      }
      f.tx = x; f.ty = y; f.tz = z; f.ry = ry;
      if (!f.root.position.lengthSq()) f.root.position.set(x, y, z);
    });
  }

  function draw(kit) {
    const r = env.window.content;
    kit.bg('default');
    const W = r.w;
    let y = r.y + 6;
    if (!state.items.length) {
      kit.text('NENHUMA IMAGEM AINDA', r.x + W / 2, y + 84, { size: 20, weight: 700, align: 'center', color: PALETTE.ink3 });
      kit.text('Escolha fotos do aparelho. Cada uma vira um quadro holográfico posicionável na sua sala — clicável com o pinch.', r.x + W / 2, y + 124, { size: 13, align: 'center', color: PALETTE.ink2, maxWidth: W - 60 });
      kit.button('ga:pick', r.x + W / 2 - 110, y + 170, 220, 42, { label: 'escolher imagens', icon: 'plus', variant: 'primary', size: 13 });
      panel.maxScroll = 0;
      return;
    }
    kit.button('ga:pick', r.x, y, 176, 32, { label: 'adicionar', icon: 'plus', variant: 'ghost', size: 12 });
    const layouts = ['ring', 'wall', 'row'];
    layouts.forEach((l, i) => kit.button(`ga:l:${l}`, r.x + 186 + i * 104, y, 96, 32, { label: l === 'ring' ? 'círculo' : l === 'wall' ? 'parede' : 'fileira', variant: state.layout === l ? 'primary' : 'ghost', size: 11.5 }));
    kit.button('ga:drop', r.x + 186 + 3 * 104, y, 150, 32, { label: 'soltar na sala', icon: 'pin', variant: 'ghost', size: 11.5 });
    y += 44;
    kit.slider('ga:radius', r.x, y + 16, W * 0.48, { label: 'Raio da galeria', value: state.radius, min: 1.2, max: 4.5, step: 0.05, format: (v) => `${v.toFixed(2)} m` });
    kit.slider('ga:h', r.x + W * 0.52, y + 16, W * 0.48, { label: 'Altura dos quadros', value: state.h, min: 0.3, max: 1.3, step: 0.01, format: (v) => `${(v * 100).toFixed(0)} cm` });
    y += 62;
    kit.divider(r.x, y, W, { label: `${state.items.length} QUADRO(S)` });
    y += 16;
    state.items.forEach((it, i) => {
      const ry = y + i * 46;
      const sel = state.sel === i;
      kit.card(`ga:sel:${i}`, r.x, ry, W - 122, 40, {
        title: it.name, sub: `${it.w}×${it.h} · ${formatBytes(it.size || 0)}`, icon: 'eye', accent: sel ? PALETTE.accent : '#8fd6ff', selected: sel, hoverable: true,
        draw: (k, x, yy, w, h) => { k.icon(sel ? 'check' : 'eye', x + w - 26, yy + h / 2, 14, sel ? PALETTE.accent : PALETTE.ink3); }
      });
      kit.button(`ga:rm:${i}`, r.x + W - 112, ry + 6, 104, 28, { label: 'remover', icon: 'trash', variant: 'ghost', size: 11 });
    });
    y += state.items.length * 46 + 8;
    kit.button('ga:clear', r.x, y, 160, 30, { label: 'limpar tudo', icon: 'trash', variant: 'danger', size: 11.5 });
    panel.contentH = y + 60;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function onClick(region) {
    const id = region.id;
    if (id === 'ga:pick') return picker.click();
    if (id.startsWith('ga:l:')) { state.layout = id.slice(5); layout(); return panel.markDirty(); }
    if (id.startsWith('ga:sel:')) { state.sel = +id.split(':')[2]; return panel.markDirty(); }
    if (id.startsWith('ga:rm:')) { state.items.splice(+id.split(':')[2], 1); rebuild(); return panel.markDirty(); }
    if (id === 'ga:clear') { state.items = []; rebuild(); return panel.markDirty(); }
    if (id === 'ga:drop') { state.radius = 1.5; state.h = 0.5; rebuild(); toast('quadros reposicionados na sua volta'); return; }
  }

  function onDrag(v, region) {
    if (region.id === 'ga:radius') { state.radius = v; layout(); }
    if (region.id === 'ga:h') { state.h = v; rebuild(); }
    panel.markDirty();
  }

  function tick(dt, t) {
    frames.forEach((f, i) => {
      f.hover = THREE.MathUtils.damp(f.hover, f.hoverT || 0, 8, dt);
      const sel = i === state.sel;
      f.root.position.x += (f.tx - f.root.position.x) * 0.12;
      f.root.position.y += (f.ty + (sel ? 0.06 : 0) + Math.sin(t * 0.6 + i) * 0.008 - f.root.position.y) * 0.12;
      f.root.position.z += (f.tz + f.hover * 0.12 - f.root.position.z) * 0.12;
      f.root.rotation.y += (f.ry - f.root.rotation.y) * 0.12;
      f.glow.material.opacity = 0.1 + f.hover * 0.28 + (sel ? 0.16 : 0);
      f.frame.material.emissiveIntensity = 0.2 + f.hover * 0.9 + (sel ? 0.5 : 0);
    });
  }

  function destroy() { picker.remove(); frames.forEach((f) => { f.root.removeFromParent(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); f.tex.dispose(); }); group.removeFromParent(); }

  if (state.items.length) rebuild();
  return { draw, onClick, onDrag, tick, destroy };
}
