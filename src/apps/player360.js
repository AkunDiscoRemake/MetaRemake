import * as THREE from 'three';
import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { clamp, formatBytes, toast } from '../core/util.js';

const FORMATS = ['360° mono', '360° SBS', '360° top-bottom', '180° SBS', '180° mono', 'plano 2D (tela curva)'];

/**
 * Vídeo imersivo — o app que faz sentido dentro de um VR Box: texturas de vídeo em
 * esfera/hemisfério com recorte por olho, ou tela curva gigante.
 */
export function make(env, meta) {
  const { scene, view, panel } = env;
  const state = {
    fmt: 1, radius: 12, flip: false, playing: false, url: '', name: '', size: 0,
    volume: 0.9, loading: false, error: null, loop: false
  };

  const video = document.createElement('video');
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.controls = false;
  video.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px;opacity:0';
  document.body.appendChild(video);
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false });
  let mesh = null;
  let screen = null;

  function buildMesh() {
    if (mesh) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); }
    if (screen) { screen.parent?.remove(screen); screen.geometry.dispose(); }
    const flat = state.fmt === 5;
    if (flat) {
      const geo = new THREE.PlaneGeometry(16, 9, 40, 4);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, pos.getZ(i) - 0.11 * (x / 8) ** 2 * 16);
      }
      geo.computeVertexNormals();
      screen = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
      screen.position.set(0, 0.1, -6.2);
      scene.add(screen);
    } else {
      const hemi = FORMATS[state.fmt].startsWith('180');
      const geo = new THREE.SphereGeometry(state.radius, 64, 40, hemi ? -Math.PI / 2 : 0, Math.PI * 2, 0, hemi ? Math.PI * 0.62 : Math.PI);
      mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
    }
  }
  buildMesh();

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'video/*,audio/*';
  fileInput.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    state.url = URL.createObjectURL(f);
    state.name = f.name;
    state.size = f.size;
    load(state.url);
  });

  function load(url) {
    state.loading = true;
    state.error = null;
    video.src = url;
    video.load();
    video.play().then(() => { state.playing = true; state.loading = false; }).catch((e) => { state.playing = false; state.loading = false; state.error = e.message; });
    panel.markDirty();
  }

  video.addEventListener('timeupdate', () => panel.markDirty());
  video.addEventListener('ended', () => { if (state.loop) { video.currentTime = 0; video.play(); } else state.playing = false; panel.markDirty(); });

  // per-eye texture crop for stereoscopic layouts
  view.onEye = (eye) => {
    const f = FORMATS[state.fmt];
    const sbs = f.includes('SBS'), tb = f.includes('top-bottom');
    if (!view.stereo) {
      tex.repeat.set(1, 1);
      tex.offset.set(0, sbs || tb ? 0 : 0);
      if (sbs) { tex.repeat.set(0.5, 1); tex.offset.set(state.flip ? 0.5 : 0, 0); }
      if (tb) { tex.repeat.set(1, 0.5); tex.offset.set(0, 0.5); }
      return;
    }
    if (sbs) {
      tex.repeat.set(0.5, 1);
      tex.offset.set((eye === 0 ? 0 : 0.5) + (state.flip ? 0.5 : 0) % 1, 0);
      if (state.flip && eye === 0) tex.offset.set(0.5, 0);
    } else if (tb) {
      tex.repeat.set(1, 0.5);
      tex.offset.set(0, eye === 0 ? 0.5 : 0);
    } else { tex.repeat.set(1, 1); tex.offset.set(0, 0); }
  };

  function draw(kit) {
    const r = env.window.content;
    kit.bg('default');
    let y = r.y + 4;
    const W = r.w;
    kit.card('p3:src', r.x, y, W, 86, {
      title: state.name || (state.url ? 'stream externo' : 'nenhum vídeo carregado'),
      sub: state.name ? `${state.name} · ${formatBytes(state.size || 0)} · ${fmtTime(video.duration)}` : 'escolha um arquivo do aparelho ou cole uma URL (.mp4/.webm/.mkv não, use mp4/webm)',
      icon: 'video', accent: PALETTE.accent2,
      draw: (k, x, yy, w, h) => {
        k.button('p3:file', x + w - 260, yy + h / 2 - 16, 122, 32, { label: 'arquivo…', icon: 'folder', variant: 'ghost', size: 11.5 });
        k.button('p3:url', x + w - 130, yy + h / 2 - 16, 112, 32, { label: 'URL…', icon: 'link', variant: 'primary', size: 11.5 });
      }
    });
    y += 100;

    // transport
    kit.fillRR(r.x, y, W, 64, 12, 'rgba(255,255,255,.04)', 'rgba(150,205,255,.14)', 1);
    kit.button('p3:play', r.x + 12, y + 16, 60, 32, { icon: state.playing ? 'pause' : 'play', variant: 'primary' });
    kit.button('p3:stop', r.x + 78, y + 16, 44, 32, { icon: 'stop', variant: 'ghost' });
    kit.button('p3:back', r.x + 128, y + 16, 44, 32, { icon: 'back', variant: 'ghost' });
    kit.button('p3:fwd', r.x + 178, y + 16, 44, 32, { icon: 'next', variant: 'ghost' });
    const dur = video.duration || 0, cur = video.currentTime || 0;
    kit.region({ id: 'p3:seek', kind: 'slider', x: r.x + 232, y: y + 16, w: W - 380, h: 32, data: { min: 0, max: Math.max(1, dur), step: 0.5, value: cur } });
    const t = dur ? cur / dur : 0;
    kit.fillRR(r.x + 232, y + 28, W - 380, 8, 4, 'rgba(255,255,255,.1)');
    kit.fillRR(r.x + 232, y + 28, (W - 380) * t, 8, 4, PALETTE.accent);
    kit.ctx.beginPath(); kit.ctx.arc(r.x + 232 + (W - 380) * t, y + 32, 7, 0, 6.2832); kit.ctx.fillStyle = '#eafffb'; kit.ctx.fill();
    kit.text(`${fmtTime(cur)} / ${fmtTime(dur)}`, r.x + W - 142, y + 32, { size: 12, font: MONO, color: PALETTE.ink2 });
    y += 78;

    kit.text('FORMATO', r.x + 4, y, { size: 10, weight: 700, color: PALETTE.ink3, letterSpacing: 1.6 });
    y += 14;
    const cw = (W - 8 * 2) / 3;
    FORMATS.forEach((f, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      kit.button(`p3:fmt:${i}`, r.x + col * (cw + 8), y + row * 36, cw, 30, { label: f, variant: state.fmt === i ? 'primary' : 'ghost', size: 10.5 });
    });
    y += 2 * 36 + 14;
    kit.slider('p3:radius', r.x, y + 16, (W - 20) * 0.48, { label: 'Distância da tela/esfera', value: state.radius, min: 4, max: 30, step: 0.5, format: (v) => `${v.toFixed(1)} m` });
    kit.slider('p3:vol', r.x + (W - 20) * 0.52, y + 16, (W - 20) * 0.48, { label: 'Volume', value: state.volume, min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` });
    y += 62;
    kit.toggle('p3:flip', r.x + 8, y, { label: 'Inverter olhos (SBS trocado)', value: state.flip, w: 260 });
    kit.toggle('p3:loop', r.x + 300, y, { label: 'Repetir', value: state.loop, w: 200 });
    kit.toggle('p3:audio3d', r.x + 540, y, { label: 'Som na posição do vídeo', value: settings.get('spatialAudio'), w: 280 });
    y += 40;
    kit.text(state.error ? `⚠ ${state.error}` : 'dica: no VR Box use 360° SBS; em handheld, “plano 2D” vira uma tela curva gigante no ambiente.', r.x + 4, y, { size: 11.5, color: state.error ? PALETTE.err : PALETTE.ink3, maxWidth: W });
    panel.contentH = y + 40;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function fmtTime(s = 0) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }

  function onClick(region) {
    const id = region.id;
    if (id === 'p3:file') { fileInput.click(); return; }
    if (id === 'p3:url') {
      env.domlayer?.openEditor({ panel, rect: { ...region, h: 30 }, value: '', placeholder: 'https://…/video.mp4', onDone: (v) => v && load(v) });
      return;
    }
    if (id === 'p3:play') { if (!video.src) { toast('carregue um vídeo primeiro', 'warn'); return; } video.paused ? video.play() : video.pause(); state.playing = !video.paused; return panel.markDirty(); }
    if (id === 'p3:stop') { video.pause(); video.currentTime = 0; state.playing = false; return panel.markDirty(); }
    if (id === 'p3:back') { video.currentTime = Math.max(0, video.currentTime - 10); return panel.markDirty(); }
    if (id === 'p3:fwd') { video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 10); return panel.markDirty(); }
    if (id.startsWith('p3:fmt:')) { state.fmt = +id.split(':')[2]; buildMesh(); panel.markDirty(); return; }
    if (id === 'p3:flip') { state.flip = !state.flip; return panel.markDirty(); }
    if (id === 'p3:loop') { state.loop = !state.loop; return panel.markDirty(); }
    if (id === 'p3:audio3d') { settings.toggle('spatialAudio'); return; }
  }

  function onDrag(value, region) {
    if (region.id === 'p3:radius') { state.radius = value; buildMesh(); }
    if (region.id === 'p3:vol') { state.volume = value; video.volume = value; }
    if (region.id === 'p3:seek') { video.currentTime = value; }
    panel.markDirty();
  }

  function tick(dt) {
    const f = FORMATS[state.fmt];
    if (mesh) { mesh.position.set(0, 0, 0); }
    panel.markDirty();
  }

  function destroy() {
    view.onEye = null;
    video.pause();
    video.remove();
    fileInput.remove();
    tex.dispose();
    mat.dispose();
    mesh?.geometry.dispose();
    screen?.geometry.dispose();
    mesh?.parent?.remove(mesh);
    screen?.parent?.remove(screen);
  }

  return { draw, onClick, onDrag, tick, destroy };
}
