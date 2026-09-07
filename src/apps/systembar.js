import * as THREE from 'three';
import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { clamp, toast } from '../core/util.js';

/**
 * Persistent system rail: a slim curved slab hovering under whatever is open, so you
 * can always get home, recenter, flip modes or check hand tracking without a menu.
 */
export function makeSystemBar(env) {
  const { scene, view, shell, hands, head, HoloPanel } = env;
  const bar = new HoloPanel({
    width: 1.72,
    height: 0.185,
    designW: 1180,
    accent: '#8fd6ff',
    radius: 40,
    live: true,
    name: 'systembar',
    draw: (kit, panel, t) => draw(kit, panel, t),
    onClick: (region) => onClick(region)
  });
  bar.baseScale = 1;
  scene.add(bar.group);
  env.pointer.addPanel(bar);
  let acc = 0;

  function place() {
    const stereo = settings.get('stereo');
    bar.group.position.set(0, stereo ? -1.02 : -0.88, stereo ? -2.05 : -1.72);
    bar.group.rotation.set(stereo ? 0.14 : 0.05, 0, 0);
  }
  place();
  settings.on('change', ({ key }) => { if (key === 'stereo' || key === 'fov') place(); });

  function draw(kit, panel) {
    const c = kit.ctx;
    const W = panel.designW, H = panel.designH;
    c.clearRect(0, 0, W, H);
    // rail body
    kit.fillRR(0, 0, W, H, 26, kit.gradient(0, 0, W, 0, [[0, 'rgba(8,14,26,.86)'], [0.5, 'rgba(12,22,40,.8)'], [1, 'rgba(8,14,26,.86)']]), 'rgba(150,205,255,.2)', 1.4);
    c.save();
    c.globalCompositeOperation = 'lighter';
    kit.fillRR(0, 0, W, 3, 2, hexA(PALETTE.accent, 0.5));
    c.restore();

    const items = [
      { id: 'sb:home', label: 'Início', icon: 'home', variant: 'primary' },
      { id: 'sb:back', label: 'Voltar', icon: 'back' },
      { id: 'sb:snap', label: 'Janelas', icon: 'layers' },
      { id: 'sb:recent', label: 'Recentrar', icon: 'refresh' },
      { id: 'sb:mode', label: settings.get('stereo') ? 'Sair do VR' : 'VR Box', icon: settings.get('stereo') ? 'exit' : 'vr' },
      { id: 'sb:hands', label: hands.active ? `${hands.hands.length} mão${hands.hands.length === 1 ? '' : 's'}` : 'Mãos off', icon: 'hand', variant: hands.active ? 'primary' : 'ghost' }
    ];
    let x = 12;
    const bw = 132, bh = 40, by = H / 2 - bh / 2;
    items.forEach((it) => {
      kit.button(it.id, x, by, bw, bh, { label: it.label, icon: it.icon, variant: it.variant || 'ghost', size: 12.5 });
      x += bw + 8;
    });
    // status cluster on the right
    const rx = W - 16;
    kit.text(`${view.stats.fps}fps`, rx, H / 2 - 8, { size: 12, weight: 700, align: 'right', color: view.stats.fps > 45 ? PALETTE.ok : PALETTE.warn, font: MONO });
    kit.text(`${settings.get('stereo') ? 'SBS' : 'MONO'} · ${settings.get('ipd')}mm · ${hands.fps}hz`, rx, H / 2 + 9, { size: 10, align: 'right', color: PALETTE.ink3, font: MONO });
    const pinch = hands.hands.find((h) => h.pinch);
    if (pinch) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      kit.glow(rx - 210, H / 2, 26, PALETTE.accent, 0.5);
      c.restore();
      kit.icon('pinch', rx - 210, H / 2, 16, '#eafffb');
    }
  }

  function onClick(region) {
    const id = region.id;
    if (id === 'sb:home') return shell.home();
    if (id === 'sb:back') return shell.back();
    if (id === 'sb:snap') return toast(shell.windows.filter((w) => w !== shell.launcher).map((w) => w.app.name).join(' · ') || 'nenhuma janela aberta');
    if (id === 'sb:recent') { head.doRecenter(); audio.ok(); return toast('vista recentrada'); }
    if (id === 'sb:mode') return env.toggleMode();
    if (id === 'sb:hands') { settings.toggle('handsEnabled'); if (settings.get('handsEnabled')) hands.enable(); return; }
  }

  return {
    panel: bar,
    update(dt) {
      acc += dt;
      if (acc > 0.2) { acc = 0; bar.markDirty(); }
      bar.group.visible = !document.body.classList.contains('hidden-hud');
    },
    place,
    dispose() { bar.dispose(); }
  };
}
