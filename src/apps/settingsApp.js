import { settings, schema, DEFAULTS } from '../core/settings.js';
import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { audio } from '../core/audio.js';
import { store } from '../core/storage.js';
import { clamp, formatBytes, toast } from '../core/util.js';
import { THEMES } from '../engine/world.js';

export const HEADSET_PRESETS = {
  'VR Box 1ª geração': { fov: 96, ipd: 63, lensSeparation: 1.0, distortion: 1.0, chromatic: 0.35, quality: 0.85, curve: 0.25 },
  'Cardboard (DIY)': { fov: 75, ipd: 63, lensSeparation: 0.86, distortion: 0.55, chromatic: 0.18, quality: 1.0, curve: 0.1 },
  'ZyberVR / lentes asféricas': { fov: 110, ipd: 64, lensSeparation: 1.15, distortion: 1.35, chromatic: 0.5, quality: 0.8, curve: 0.35 },
  'FREEJOY / BOBO': { fov: 105, ipd: 62, lensSeparation: 1.05, distortion: 1.15, chromatic: 0.42, quality: 0.9, curve: 0.3 },
  'Quest Browser (WebXR)': { fov: 100, ipd: 64, lensSeparation: 1.0, distortion: 0, chromatic: 0, quality: 1.0, curve: 0.15 },
  'Mono (sem headset)': { fov: 78, ipd: 63, lensSeparation: 1.0, distortion: 0, chromatic: 0, quality: 1.0, curve: 0 }
};

/** Full system settings — every control is a 3D widget on the glass. */
export function make(env, meta) {
  const { panel, shell, hands, view, camera: camService, head } = env;
  const state = { tab: 0, log: [], testPinch: 0, testing: false };
  const groups = schema;

  function draw(kit) {
    const c = kit.ctx;
    const W = panel.designW, H = panel.designH;
    const rect = env.window.content;
    kit.bg('default');
    kit.header('Ajustes', 'SISTEMA · CALIBRAÇÃO · CONFORTO', { icon: 'gear', right: (k) => {
      k.button('se:reset', W - 132, 17, 104, 28, { label: 'Padrão', icon: 'refresh', variant: 'ghost', size: 11 });
    } });

    let y = rect.y;
    kit.tabs('se:tab', rect.x, y, rect.w, { items: groups.map((g) => g.group), current: state.tab, h: 30, size: 10.5 });
    y += 42;

    const g = groups[state.tab];
    if (g) {
      for (const item of g.items) y = drawItem(kit, item, y, rect);
      y += 12;
    }

    if (state.tab === 0) {
      kit.divider(rect.x, y, rect.w, { label: 'PRESETS DE HEADSET' });
      y += 20;
      const keys = Object.keys(HEADSET_PRESETS);
      keys.forEach((name, i) => {
        const cw = (rect.w - 8 * (keys.length > 4 ? 2 : 1)) / (keys.length > 4 ? 3 : keys.length);
        const col = i % 3, row = Math.floor(i / 3);
        kit.button(`se:preset:${name}`, rect.x + col * (cw + 8), y + row * 40, cw, 32, { label: name, variant: 'ghost', size: 10.5, align: 'left', icon: 'cast' });
      });
      y += Math.ceil(keys.length / 3) * 40 + 12;
      kit.button('se:recenter', rect.x, y, rect.w * 0.48, 34, { label: 'Recentrar vista (R)', icon: 'refresh', variant: 'primary', size: 12.5 });
      kit.button('se:vr', rect.x + rect.w * 0.52, y, rect.w * 0.48, 34, { label: settings.get('stereo') ? 'Sair do VR Box' : 'Entrar no VR Box', icon: 'vr', variant: 'accent2', size: 12.5 });
      y += 48;
    }

    if (state.tab === groups.length - 1) y = systemTab(kit, y, rect);
    if (state.tab === 3) y = handTab(kit, y, rect, c);

    panel.contentH = Math.max(H, y + 40);
    panel.maxScroll = Math.max(0, panel.contentH - H + 8);
  }

  function drawItem(kit, item, y, rect) {
    const val = settings.get(item.key);
    const x = rect.x, w = rect.w;
    switch (item.type) {
      case 'bool':
        kit.toggle(`se:${item.key}`, x + 10, y, { label: item.label, sub: item.hint || '', value: !!val, w });
        return y + (item.hint ? 54 : 36);
      case 'range':
        kit.slider(`se:${item.key}`, x + 10, y + 14, w - 20, { label: item.label, value: val, min: item.min, max: item.max, step: item.step, format: item.format || ((v) => `${item.step < 1 ? v.toFixed(2) : Math.round(v)}${item.unit || ''}`) });
        return y + 54;
      case 'enum': {
        kit.text(item.label, x + 10, y + 8, { size: 13, weight: 600 });
        const n = item.options.length;
        const bw = Math.min(200, (w - 20) / n);
        item.options.forEach((opt, i) => {
          const ox = x + 10 + i * (bw + 4);
          const label = item.labels ? item.labels[i] : String(opt);
          const short = label.length > 26 ? label.slice(0, 25) + '…' : label;
          kit.button(`se:${item.key}:${opt}`, ox, y + 22, bw, 28, { label: short, variant: val === opt ? 'primary' : 'ghost', size: 11 });
        });
        return y + 60;
      }
      default: return y + 30;
    }
  }

  function handTab(kit, y, rect, c) {
    kit.divider(rect.x, y, rect.w, { label: 'TESTE DE PINCH' });
    y += 22;
    kit.text('Aproxime polegar e indicador. O anel deve fechar e piscar — e a aura contornar sua mão.', rect.x, y, { size: 12, color: PALETTE.ink2, maxWidth: rect.w - 10 });
    y += 34;
    const h = hands.hands[0];
    const glow = clamp(state.testPinch, 0, 1);
    const cx = rect.x + 52, cy = y + 42;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const ring = 1 - clamp((h?.gap ?? 1) / (settings.get('pinchThreshold') * 2.2), 0, 1);
    c.strokeStyle = hexA(PALETTE.accent, 0.25 + ring * 0.75);
    c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + ring * 6.2832); c.stroke();
    c.fillStyle = hexA(PALETTE.accent, 0.14 + glow * 0.5);
    c.beginPath(); c.arc(cx, cy, 20 + glow * 6, 0, 6.2832); c.fill();
    c.restore();
    kit.text(h ? `vão ${(h.gap ?? 0).toFixed(2)} · limiar ${settings.get('pinchThreshold').toFixed(2)}` : 'nenhuma mão detectada', cx + 48, cy - 10, { size: 12, weight: 600 });
    kit.text(`status: ${hands.status} · ${hands.detail || 'pronto'} · ${hands.fps} fps det.`, cx + 48, cy + 10, { size: 11, color: PALETTE.ink3, font: MONO });
    y += 96;
    kit.button('se:testaura', rect.x, y, 210, 30, { label: 'Pulso no contorno', icon: 'hand', variant: 'ghost', size: 12 });
    kit.button('se:restartcam', rect.x + 220, y, 210, 30, { label: 'Reiniciar câmera', icon: 'camera', variant: 'ghost', size: 12 });
    y += 42;
    return y;
  }

  function systemTab(kit, y, rect) {
    const st = view.stats;
    kit.divider(rect.x, y, rect.w, { label: 'DIAGNÓSTICO' });
    y += 18;
    const rows = [
      ['Renderer', `${st.res} · ${st.draws} draws · ${(st.tris / 1000).toFixed(0)}k tris`, st.fps > 45 ? PALETTE.ok : PALETTE.warn],
      ['Modo', settings.get('stereo') ? `SBS estéreo (IPD ${settings.get('ipd')}mm)` : 'mono MR', PALETTE.accent],
      ['Câmera', camService.ready ? `${camService.width}×${camService.height} ${camFeedLabel(camService)}` : camService.error ? `erro: ${camService.error}` : 'parada', camService.ready ? PALETTE.ok : PALETTE.warn],
      ['Hand tracking', `${hands.status} (${hands.delegate || '-'}) ${hands.hands.length} mão(ãs)`, hands.status === 'ok' ? PALETTE.ok : PALETTE.warn],
      ['Giroscópio', head.hasGyro ? 'ativo' : 'indisponível (use mouse/toque)', head.hasGyro ? PALETTE.ok : PALETTE.ink3],
      ['Áudio', env.audio?.ctx?.state || 'suspenso', PALETTE.ink2],
      ['Armazenamento', `${formatBytes(store.usage())} em ${store.keys().length} chaves`, PALETTE.ink2],
      ['Apps instalados', `${shell.installed.size} · ${shell.windows.length - 1} janelas`, PALETTE.ink2]
    ];
    rows.forEach(([k, v, col], i) => {
      const ry = y + i * 26;
      if (i % 2) kit.fillRR(rect.x, ry - 11, rect.w, 24, 7, 'rgba(255,255,255,.03)');
      kit.text(k, rect.x + 10, ry, { size: 12, color: PALETTE.ink3 });
      kit.text(String(v), rect.x + rect.w - 10, ry, { size: 11.5, weight: 600, color: col, align: 'right', font: MONO });
    });
    y += rows.length * 26 + 14;
    kit.button('se:export', rect.x, y, 170, 30, { label: 'Exportar config', icon: 'download', variant: 'ghost', size: 11.5 });
    kit.button('se:wipe', rect.x + 180, y, 150, 30, { label: 'Limpar dados', icon: 'trash', variant: 'danger', size: 11.5 });
    y += 42;
    kit.text('MetaPort é um projeto fanmade, sem afiliação com Meta, Google, Samsung ou Discord. Nenhum dado sai do aparelho, exceto o tráfego dos sites que você abrir.', rect.x, y, { size: 10.5, color: PALETTE.ink3, maxWidth: rect.w, lh: 1.5 });
    y += 46;
    return y;
  }

  function camFeedLabel(cs) { return cs.mirror ? '(espelhada)' : '(traseira)'; }

  function onClick(region, loc) {
    const id = region.id;
    if (id.startsWith('se:tab:')) { state.tab = region.data.index; panel.markDirty(); return; }
    if (id.startsWith('se:preset:')) {
      const name = id.slice(10);
      const preset = HEADSET_PRESETS[name];
      if (preset) { settings.patch(preset); toast(`Preset ${name}`); audio.ok(panel.worldPos); env.world.ping(1.2); }
      return;
    }
    switch (id) {
      case 'se:recenter': head.doRecenter(); toast('Vista recentrada'); break;
      case 'se:vr': env.toggleMode(); break;
      case 'se:reset': settings.reset(); toast('Ajustes restaurados'); break;
      case 'se:testaura': env.world.ping(1.5); env.hands.hands[0] && (state.testPinch = 1); break;
      case 'se:restartcam': camService.stop(); camService.start().then(() => hands.restart()); toast('reiniciando câmera…'); break;
      case 'se:export': {
        const blob = JSON.stringify(settings.all, null, 2);
        console.log(blob);
        toast('config copiada para o console');
        break;
      }
      case 'se:wipe': store.wipe(); toast('dados limpos — recarregue', 'warn'); break;
      default: break;
    }
    if (id.startsWith('se:') && region.kind === 'toggle') {
      settings.set(id.slice(3), !region.data.value);
      audio.toggle(!region.data.value, panel.worldPos);
      if (id === 'se:stereo') view.setMode(settings.get('stereo') ? 'stereo' : 'mono');
      if (id === 'se:handsEnabled') settings.get('handsEnabled') ? hands.enable() : (hands.hands = []);
      if (id === 'se:passthrough') camService.ready || camService.start();
    }
    if (region.kind === 'button' && id.startsWith('se:')) {
      const parts = id.split(':');
      if (parts.length === 3 && parts[1] !== 'tab' && parts[1] !== 'preset' && parts[1] !== 'testaura') {
        const raw = parts[2];
        const value = raw === 'true' ? true : raw === 'false' ? false : (raw !== '' && !Number.isNaN(+raw) ? +raw : raw);
        settings.set(parts[1], value);
        audio.toggle(!!value, panel.worldPos);
      }
    }
    panel.markDirty();
  }

  function onDrag(value, region) {
    const key = region.id.slice(3);
    settings.set(key, value);
    panel.markDirty();
  }

  function tick(dt) {
    state.testPinch = Math.max(0, state.testPinch - dt * 2);
    const h = hands.hands[0];
    if (h?.pinch) state.testPinch = 1;
    panel.markDirty();
  }

  return { draw, onClick, onDrag, tick };
}
