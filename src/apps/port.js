import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { toast, formatBytes } from '../core/util.js';
import { Reader3D, normalize } from './reader.js';

/**
 * PORT = web app portado para o "desktop" do MetaPort.
 *
 * Cada port abre como uma estação de trabalho holográfica: barra de menus, rail com
 * os outros ports (troca de janela como num dock), área de conteúdo que usa o site
 * real em handheld/WebXR e Reader3D nativo no VR Box, barra de status com sessão,
 * zoom e modo mesa (para Mapas) ou tela curva (para vídeo).
 */
export function makePortController(meta, env) {
  const { panel, shell, domlayer, view } = env;
  const HOST_W = 1500, HOST_H = 940;
  const state = {
    url: meta.url,
    reader: null,
    loading: false,
    mode: 'auto',
    started: performance.now(),
    reqs: 0,
    zoom: 1,
    table: !!meta.table,
    curved: !!meta.curved,
    menu: null
  };
  let host = null;
  const RAIL = 78, BAR = 46, MENU = 30;
  const topY = () => panel.contentTop + MENU + BAR;
  const area = () => ({ x: 12 + RAIL, y: topY() + 6, w: panel.designW - 24 - RAIL - 10, h: panel.designH - topY() - 32 - BAR });

  const allowDom = () => !!domlayer?.allowDom && settings.get('allowCrossDom') !== false;
  const usingWeb = () => state.mode === 'web' || (state.mode === 'auto' && allowDom());

  function ensureHost() {
    if (!domlayer) return null;
    if (!host) host = domlayer.host(`port:${meta.id}`, { w: HOST_W, h: HOST_H });
    return host;
  }

  async function go(raw) {
    const url = normalize(raw);
    state.url = url;
    state.reqs++;
    env.window.setTitle?.(meta.name, url.replace(/^https?:\/\//, '').slice(0, 44));
    if (usingWeb()) {
      const h = ensureHost();
      if (h) { h.setUrl(url); h.visible = true; }
      panel.maxScroll = 0;
    } else {
      if (host) host.visible = false;
      state.loading = true;
      panel.markDirty();
      state.reader = await Reader3D.load(url);
      state.loading = false;
      state.reader.measure(panel.kit, area().w - 24);
      panel.contentH = topY() + state.reader.contentH + 40;
      panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
    }
    audio.swoosh(panel.worldPos);
    panel.markDirty();
  }

  // ------------------------------------------------------------------ strips
  function chrome(kit) {
    const c = kit.ctx;
    const W = panel.designW;
    const y0 = panel.contentTop;
    // menu bar
    c.save();
    kit.fillRR(6, y0, W - 12, MENU, 8, 'rgba(4,8,17,.98)', 'rgba(150,205,255,.12)', 1);
    c.restore();
    kit.fillRR(14, y0 + 6, 18, 18, 6, hexA(meta.color, 0.9));
    kit.icon(meta.icon, 23, y0 + 15, 12, '#08111d');
    kit.text(meta.name, 40, y0 + 15, { size: 11.5, weight: 800 });
    let mx = 44 + kit.measure(meta.name, 11.5, 800);
    const menus = {
      arq: ['Recarregar', 'Abrir no sistema', 'Zoom −', 'Zoom +'],
      ver: ['Modo auto', 'Forçar WEB', 'Forçar READER', 'Mesa (deitado)'],
      ajd: ['Atalhos', 'Privacidade']
    };
    for (const [key, items] of Object.entries(menus)) {
      const lw = kit.measure(items.length + ' ' + key, 11, 600) + 20;
      const hot = state.menu === key;
      kit.button(`pt:menu:${key}`, mx, y0 + 4, lw + 14, MENU - 8, { label: key[0].toUpperCase() + key.slice(1), variant: hot ? 'primary' : 'ghost', size: 10.5 });
      mx += lw + 20;
    }
    if (state.menu) {
      const items = menus[state.menu];
      const mw = 210, mh = items.length * 26 + 10;
      const bx = mx - 200, by = y0 + MENU;
      kit.fillRR(bx, by, mw, mh, 10, 'rgba(8,13,26,.98)', 'rgba(150,205,255,.24)', 1);
      items.forEach((label, i) => {
        const yy = by + 8 + i * 26;
        const hot = kit.state.hover === `pt:item:${state.menu}:${i}`;
        if (hot) kit.fillRR(bx + 5, yy - 2, mw - 10, 24, 7, 'rgba(120,220,255,.14)');
        kit.text(label, bx + 16, yy + 10, { size: 12, weight: hot ? 700 : 500 });
        kit.region({ id: `pt:item:${state.menu}:${i}`, kind: 'button', x: bx + 4, y: yy - 3, w: mw - 8, h: 26, data: { menu: state.menu, index: i } });
      });
    }
    // session right side of menu bar
    const secs = Math.floor((performance.now() - state.started) / 1000);
    kit.text(`${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')} · ${state.reqs} req · zoom ${(state.zoom * 100) | 0}%`, W - 20, y0 + 15, { size: 10.5, color: PALETTE.ink3, align: 'right', font: MONO });

    // toolbar
    const ty = y0 + MENU + 2;
    c.save();
    kit.fillRR(6, ty + BAR - 40, W - 12, BAR - 2, 10, 'rgba(6,11,22,.96)');
    c.restore();
    kit.button('pt:back', 12 + RAIL, ty + 8, 76, 28, { label: 'voltar', icon: 'back', variant: 'ghost', size: 11 });
    kit.button('pt:reload', 12 + RAIL + 82, ty + 8, 106, 28, { label: 'recarregar', icon: 'refresh', variant: 'ghost', size: 11 });
    const fieldX = 12 + RAIL + 198;
    kit.field('pt:url', fieldX, ty + 8, panel.designW - fieldX - 250, 28, { value: state.url, icon: 'link', placeholder: 'ir para…' });
    kit.button('pt:mode', panel.designW - 244, ty + 8, 122, 28, {
      label: usingWeb() ? 'WEB REAL' : 'READER 3D', icon: usingWeb() ? 'desktop' : 'layers', variant: usingWeb() ? 'primary' : 'ghost', size: 11
    });
    kit.iconButton('pt:ext', panel.designW - 116, ty + 8, 28, { icon: 'cast' });
    kit.iconButton('pt:pin', panel.designW - 84, ty + 8, 28, { icon: state.table ? 'pin' : 'pin' });
    kit.iconButton('pt:curve', panel.designW - 52, ty + 8, 28, { icon: 'vr' });
    kit.text(usingWeb() ? 'DOM' : '3D', panel.designW - 24, ty + 22, { size: 9.5, weight: 700, color: usingWeb() ? PALETTE.ok : PALETTE.warn });

    // rail with the other ports (desktop switcher)
    const ports = shell.allCatalog().filter((a) => a.isPort && shell.installed.has(a.id));
    const rx = 12, ry0 = topY() + 4;
    c.save();
    kit.fillRR(rx - 2, ry0 - 6, RAIL - 6, ports.length * 62 + 12, 14, 'rgba(255,255,255,.035)', 'rgba(150,205,255,.12)', 1);
    c.restore();
    ports.forEach((p, i) => {
      const py = ry0 + i * 62;
      const on = p.id === meta.id;
      kit.button(`pt:go:${p.id}`, rx + 2, py, RAIL - 14, 54, { icon: p.icon, variant: on ? 'primary' : 'ghost', size: 12 });
      if (!on) kit.icon(p.icon, rx + RAIL / 2 - 4, py + 27, 20, PALETTE.ink3);
      else kit.icon(p.icon, rx + RAIL / 2 - 4, py + 27, 20, '#04121a');
    });

    // status bar
    const sy = panel.designH - BAR - 6;
    c.save();
    kit.fillRR(6, sy, W - 12, BAR, 10, 'rgba(4,8,17,.95)', 'rgba(150,205,255,.1)', 1);
    c.restore();
    kit.icon('wifi', 26, sy + BAR / 2, 14, PALETTE.ok);
    kit.text(usingWeb() ? 'site real carregado no plano 3D' : 'Reader3D · conteúdo nativo estéreo', 44, sy + BAR / 2, { size: 11, color: PALETTE.ink2 });
    kit.text(`modo mesa ${state.table ? 'ON' : 'OFF'} · curvatura ${state.curved ? 'alta' : 'padrão'}`, W - 240, sy + BAR / 2, { size: 10.5, color: PALETTE.ink3 });
    kit.button('pt:zoom-', W - 236, sy + 8, 30, 28, { label: '−', variant: 'ghost', size: 14 });
    kit.button('pt:zoom+', W - 202, sy + 8, 30, 28, { label: '+', variant: 'ghost', size: 14 });
    kit.button('pt:desk', W - 166, sy + 8, 158, 28, { label: 'arrumar na mesa', icon: 'grid', variant: 'ghost', size: 11 });
  }

  function draw(kit) {
    const a = area();
    kit.bg('default');
    if (usingWeb()) {
      const h = ensureHost();
      if (h) {
        h.visible = true;
        h.setParent(panel, a);
        kit.fillRR(a.x, a.y, a.w, a.h, 8, 'rgba(4,8,16,.35)', 'rgba(150,205,255,.1)', 1);
        if (meta.table) kit.text('modo mesa: o painel está deitado à sua frente — role com o toque', a.x + 8, a.y + a.h + 16, { size: 10.5, color: PALETTE.ink3 });
      }
      return;
    }
    if (host) host.visible = false;
    if (state.loading) {
      kit.text(`lendo ${state.url.replace(/^https?:\/\//, '').slice(0, 40)}…`, a.x + 10, a.y + 26, { size: 13, color: PALETTE.ink3 });
      return;
    }
    if (!state.reader) { go(meta.url); landing(kit, a); return; }
    state.reader.draw(kit, a);
  }

  /** First-run card: what the port is, and how to log in with hand tracking. */
  function landing(kit, a) {
    kit.text(meta.name, a.x + 6, a.y + 34, { size: 26, weight: 800 });
    kit.text((meta.desc || '').slice(0, 300), a.x + 6, a.y + 66, { size: 13.5, color: PALETTE.ink2, maxWidth: a.w - 20, lh: 1.55 });
    const y = a.y + 168;
    kit.divider(a.x, y, a.w, { label: 'COMO USAR ESTE PORT' });
    const steps = [
      ['cast', settings.get('stereo') ? 'Você está no VR Box: o conteúdo aparece em Reader3D (nativo, estéreo).' : 'Modo handheld/XR: o site real é projetado sobre o painel.'],
      ['pinch', 'Pinche para clicar; segure e mova a mão para arrastar a janela ou rolar o conteúdo.'],
      ['keyboard', 'Para digitar, pinche a barra de endereço: o teclado nativo do aparelho abre por cima do painel.'],
      ['hand', 'Login/QR: segure a mão aberta para ir ao Início e voltar para cá quando quiser.']
    ];
    steps.forEach(([ic, txt], i) => {
      const yy = y + 24 + i * 42;
      kit.fillRR(a.x, yy - 14, a.w, 36, 10, 'rgba(255,255,255,.035)');
      kit.icon(ic, a.x + 22, yy + 4, 16, meta.color || PALETTE.accent);
      kit.text(txt, a.x + 44, yy + 4, { size: 12, color: PALETTE.ink, maxWidth: a.w - 70 });
    });
    kit.button('pt:start', a.x, y + 24 + steps.length * 42 + 10, 200, 34, { label: 'Abrir agora', icon: 'play', variant: 'primary', size: 13 });
  }

  function onClick(region, loc) {
    const id = region.id;
    if (region.kind === 'link' && region.data?.href) return go(region.data.href);
    if (id.startsWith('pt:menu:')) { const k = id.slice('pt:menu:'.length); state.menu = state.menu === k ? null : k; return panel.markDirty(); }
    if (id.startsWith('pt:item:')) {
      const [, , menu, index] = id.split(':');
      state.menu = null;
      const i = +index;
      if (menu === 'arq') {
        if (i === 0) go(state.url);
        if (i === 1) env.openExternal?.(state.url);
        if (i === 2) state.zoom = Math.max(0.6, state.zoom - 0.1);
        if (i === 3) state.zoom = Math.min(1.8, state.zoom + 0.1);
      }
      if (menu === 'ver') {
        state.mode = ['auto', 'web', 'reader', state.mode][i] || 'auto';
        if (i === 3) { state.table = !state.table; applyTilt(); state.mode = 'auto'; }
        go(state.url);
      }
      if (menu === 'ajd') toast(i === 0 ? 'Esc=home · V=modo · R=recentrar · P=passthrough · F=mãos' : 'Câmera e giroscópio não saem do aparelho.', 'info', 4600);
      return panel.markDirty();
    }
    if (id === 'pt:back') { if (state.reader) state.reader = null; state.mode = state.mode; return go(meta.url); }
    if (id === 'pt:reload') return go(state.url);
    if (id === 'pt:mode') { state.mode = usingWeb() ? 'reader' : 'web'; return go(state.url); }
    if (id === 'pt:ext') { env.openExternal?.(state.url); return toast('abrindo no navegador do sistema…'); }
    if (id === 'pt:pin') { state.table = !state.table; applyTilt(); return panel.markDirty(); }
    if (id === 'pt:curve') { state.curved = !state.curved; applyTilt(); return panel.markDirty(); }
    if (id === 'pt:zoom-') { state.zoom = Math.max(0.6, state.zoom - 0.1); return panel.markDirty(); }
    if (id === 'pt:zoom+') { state.zoom = Math.min(1.8, state.zoom + 0.1); return panel.markDirty(); }
    if (id === 'pt:desk') { shell.relayout(); toast('janelas reorganizadas no arco'); return; }
    if (id === 'pt:start') return go(meta.url);
    if (id === 'pt:url') {
      domlayer?.openEditor({ panel, rect: region, value: state.url, onDone: (v) => { if (v) go(v); }, multiline: false });
      return;
    }
    if (id.startsWith('pt:go:')) { const appId = id.slice(6); shell.openApp(appId); return; }
  }

  function applyTilt() {
    const win = env.window;
    if (!win) return;
    win.tilt = 0;
    win.panel.group.rotation.x = state.table ? -0.95 : 0;
    win.panel.group.position.y = state.table ? -0.72 : win.pos.y;
    win.tiltX = state.table ? -0.95 : 0;
    settings.set('curve', state.curved ? 0.42 : 0.22);
    audio.toggle(state.curved, panel.worldPos);
  }

  function tick() {
    if (host && usingWeb()) { host.setParent(panel, area()); host.sync?.(); }
    const win = env.window;
    if (win?.tiltX !== undefined) win.panel.group.rotation.x += (win.tiltX - win.panel.group.rotation.x) * 0.12;
  }

  function destroy() { if (domlayer) domlayer.destroyHost(`port:${meta.id}`); }

  return { draw, chrome, onClick, tick, destroy, contentHeight: panel.designH };
}
