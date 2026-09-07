import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { clamp, toast } from '../core/util.js';
import { Reader3D, normalize } from './reader.js';

/**
 * Navegador MR — duas superfícies na mesma janela volumétrica:
 *   • WEB REAL : iframe vivo, projetado exatamente sobre o plano do painel (handheld / WebXR)
 *   • READER3D : o documento é re-composto em blocos nativos (funciona no estéreo do VR Box)
 * Barra de endereço, abas, favoritos e histórico são widgets 3D clicáveis com pinch.
 */
export function make(env, meta) {
  const { panel, shell, domlayer, view } = env;
  const TOOLBAR = 72;
  const state = {
    tabs: [{ id: 't0', url: settings.get('homeUrl'), title: 'Início', reader: null, loading: false, mode: 'auto' }],
    tab: 0,
    history: settings.get('history') || [],
    typing: false
  };
  let host = null;
  const HOST_W = 1400, HOST_H = 900;

  const cur = () => state.tabs[state.tab];
  const contentTop = () => panel.contentTop + TOOLBAR;
  const area = () => ({ x: 12, y: contentTop() + 6, w: panel.designW - 24, h: panel.designH - contentTop() - TOOLBAR * 0 - 34 });

  const isSameOrigin = (u) => { try { return new URL(u, location.href).origin === location.origin; } catch { return false; } };
  const prettyTitle = (u) => {
    try {
      const x = new URL(u, location.href);
      return x.hostname === location.hostname ? (x.pathname.replace(/^\//, '') || 'Início') : x.hostname;
    } catch { return String(u).slice(0, 30); }
  };

  function effectiveMode() {
    const t = cur();
    if (t.mode === 'web') return domlayer?.allowDom ? 'web' : 'reader';
    if (t.mode === 'reader') return 'reader';
    if (domlayer?.allowDom && (isSameOrigin(t.url) || settings.get('allowCrossDom'))) return 'web';
    return 'reader';
  }

  function ensureHost() {
    if (!domlayer) return null;
    if (!host) {
      host = domlayer.host('browser:main', { w: HOST_W, h: HOST_H });
      host.child.addEventListener('load', () => {
        const t = cur();
        t.loading = false;
        try { t.title = host.child.contentDocument?.title || t.title; } catch { /* cross-origin: ok */ }
        panel.markDirty();
      });
    }
    return host;
  }

  async function go(raw, push = true) {
    const t = cur();
    const url = normalize(raw);
    t.url = url;
    t.title = prettyTitle(url);
    t.loading = true;
    if (push && state.history[state.history.length - 1] !== url) {
      state.history.push(url);
      state.history = state.history.slice(-40);
      settings.set('history', state.history);
    }
    if (effectiveMode() === 'web') {
      const h = ensureHost();
      if (h) { h.setUrl(url); h.visible = true; }
      t.loading = false;
    } else {
      if (host) host.visible = false;
      t.reader = await Reader3D.load(url);
      t.loading = false;
      refreshHeights();
    }
    audio.swoosh(panel.worldPos);
    panel.markDirty();
  }

  function refreshHeights() {
    const t = cur();
    if (!t.reader) return;
    t.reader.measure(panel.kit, area().w - 20);
    panel.contentH = contentTop() + t.reader.contentH + 60;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  // ---------------------------------------------------------------- fixed strip
  function chrome(kit) {
    const c = kit.ctx;
    const t = cur();
    const y0 = panel.contentTop;
    c.save();
    kit.fillRR(6, y0, panel.designW - 12, TOOLBAR - 4, 12, 'rgba(5,9,19,.97)', 'rgba(150,205,255,.14)', 1);
    c.restore();
    const nav = 30, gap = 4;
    kit.iconButton('br:back', 16, y0 + 8, nav, { icon: 'back' });
    kit.iconButton('br:fwd', 16 + nav + gap, y0 + 8, nav, { icon: 'next' });
    kit.iconButton('br:reload', 16 + (nav + gap) * 2, y0 + 8, nav, { icon: 'refresh' });
    kit.iconButton('br:home', 16 + (nav + gap) * 3, y0 + 8, nav, { icon: 'home' });
    const ox = 16 + (nav + gap) * 4;
    const ow = panel.designW - ox - 250;
    kit.field('br:url', ox, y0 + 8, ow, 30, {
      value: t.url === 'about:blank' ? '' : t.url, focused: state.typing,
      icon: String(t.url).startsWith('https') ? 'lock' : 'globe', placeholder: 'busque ou digite um endereço'
    });
    const mode = effectiveMode();
    kit.button('br:mode', panel.designW - 246, y0 + 8, 128, 30, {
      label: mode === 'web' ? 'WEB REAL' : 'READER 3D', icon: mode === 'web' ? 'desktop' : 'layers', variant: 'ghost', size: 11
    });
    kit.iconButton('br:go', panel.designW - 110, y0 + 8, 30, { icon: 'next' });
    kit.iconButton('br:newtab', panel.designW - 76, y0 + 8, 30, { icon: 'plus' });
    kit.iconButton('br:ext', panel.designW - 42, y0 + 8, 30, { icon: 'cast', label: '' });

    // tabs
    let tx = 16;
    const ty = y0 + TOOLBAR - 22;
    state.tabs.forEach((tab, i) => {
      const label = (tab.title || 'aba').slice(0, 18);
      const bw = kit.measure(label, 11, 600) + 46;
      const on = i === state.tab;
      kit.fillRR(tx, ty, bw, 24, 8, on ? hexA(PALETTE.accent, 0.24) : 'rgba(255,255,255,.04)', on ? hexA(PALETTE.accent, 0.55) : 'rgba(150,205,255,.12)', 1);
      kit.icon('globe', tx + 13, ty + 12, 12, on ? PALETTE.accent : PALETTE.ink3);
      kit.text(label, tx + 25, ty + 12, { size: 11, weight: on ? 700 : 500, color: on ? '#e9f4ff' : PALETTE.ink2 });
      kit.region({ id: `br:tab:${i}`, kind: 'button', x: tx, y: ty, w: Math.max(30, bw - 22), h: 24, data: { tab: i } });
      kit.region({ id: `br:tabx:${i}`, kind: 'button', x: tx + bw - 20, y: ty, w: 18, h: 24, data: { closeTab: i } });
      c.fillStyle = on ? 'rgba(200,235,255,.6)' : 'rgba(150,205,255,.3)';
      c.beginPath(); c.arc(tx + bw - 11, ty + 12, 3.2, 0, 6.2832); c.fill();
      tx += bw + 5;
    });
    kit.text(t.loading ? 'carregando…' : `${state.history.length} páginas no histórico`, tx + 10, ty + 12, { size: 10, color: PALETTE.ink3, letterSpacing: 0.6 });
  }

  // ---------------------------------------------------------------- content
  function draw(kit) {
    const a = area();
    const t = cur();
    kit.bg('default');
    if (effectiveMode() === 'web') {
      const h = ensureHost();
      if (h) {
        h.visible = true;
        h.setParent(panel, a);
        kit.fillRR(a.x, a.y, a.w, a.h, 10, 'rgba(5,9,18,.25)', 'rgba(150,205,255,.1)', 1);
        kit.text(t.url, a.x + 6, panel.designH - 14, { size: 10, color: PALETTE.ink3, font: MONO, maxWidth: a.w - 20 });
      }
      return;
    }
    if (host) host.visible = false;
    if (t.url === settings.get('homeUrl') || t.url === 'about:blank' || !t.reader) {
      startPage(kit, a);
      if (t.url !== settings.get('homeUrl') && t.url !== 'about:blank' && !t.reader) go(t.url, false);
      panel.maxScroll = 0;
      return;
    }
    if (t.reader.loading) {
      kit.text('lendo documento…', a.x + 12, a.y + 30, { size: 13, color: PALETTE.ink3 });
      return;
    }
    t.reader.draw(kit, a);
  }

  function startPage(kit, a) {
    kit.text('METAPORT INÍCIO', a.x + 6, a.y + 16, { size: 10.5, weight: 700, color: PALETTE.ink3, letterSpacing: 2 });
    const items = settings.get('bookmarks') || [];
    const cols = Math.min(4, Math.max(1, items.length));
    const cw = (a.w - 12 * (cols - 1)) / cols;
    items.slice(0, 8).forEach((b, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      kit.card(`br:bm:${i}`, a.x + col * (cw + 12), a.y + 30 + row * 100, cw, 88, {
        title: b.title, sub: String(b.url).replace(/^https?:\/\//, '').slice(0, 30), icon: b.icon || 'globe', accent: '#8fd6ff'
      });
    });
    const y2 = a.y + 30 + Math.ceil(items.length / cols) * 100 + 16;
    kit.divider(a.x, y2, a.w, { label: 'MOTOR DE BUSCA' });
    ['duckduckgo', 'google', 'bing', 'mdn'].forEach((e, i) => {
      kit.button(`br:engine:${e}`, a.x + i * 122, y2 + 16, 114, 28, { label: e, variant: settings.get('searchEngine') === e ? 'primary' : 'ghost', size: 11.5 });
    });
    kit.button('br:readerhelp', a.x + 4 * 122 + 8, y2 + 16, 150, 28, { label: 'sobre o Reader3D', icon: 'info', variant: 'ghost', size: 11.5 });
    const hist = state.history.slice(-7).reverse();
    if (hist.length) {
      kit.divider(a.x, y2 + 62, a.w, { label: 'HISTÓRICO' });
      hist.forEach((u, i) => {
        kit.button(`br:hist:${i}`, a.x, y2 + 78 + i * 30, a.w, 26, { label: `${prettyTitle(u)}   ·   ${u.slice(0, 74)}`, variant: 'ghost', size: 11, align: 'left' });
      });
    }
  }

  function onClick(region, loc) {
    const id = region.id;
    const t = cur();
    if (region.kind === 'link' && region.data?.href) { go(region.data.href); return; }
    if (id === 'br:url') {
      state.typing = true;
      domlayer?.openEditor({
        panel, rect: { x: region.x, y: region.y, w: region.w, h: region.h }, value: t.url === 'about:blank' ? '' : t.url,
        placeholder: 'endereço ou busca',
        onDone: (v) => { state.typing = false; if (v) go(v); panel.markDirty(); },
        onCancel: () => { state.typing = false; panel.markDirty(); }
      });
      return;
    }
    if (id === 'br:go') return go(t.url, false);
    if (id === 'br:back') { const prev = state.history.pop(); settings.set('history', state.history); return go(prev || t.url, false); }
    if (id === 'br:reload') { t.reader = null; panel.maxScroll = 0; return go(t.url, false); }
    if (id === 'br:home') return go(settings.get('homeUrl'));
    if (id === 'br:newtab') { state.tabs.push({ id: 't' + state.tabs.length, url: 'about:blank', title: 'Nova aba', reader: null, mode: 'auto' }); state.tab = state.tabs.length - 1; return panel.markDirty(); }
    if (id === 'br:mode') { t.mode = effectiveMode() === 'web' ? 'reader' : 'web'; if (effectiveMode() === 'reader' && !t.reader) go(t.url, false); refreshHeights(); return panel.markDirty(); }
    if (id === 'br:ext') { env.openExternal?.(t.url); return; }
    if (id.startsWith('br:tab:')) { state.tab = region.data.tab; refreshHeights(); return panel.markDirty(); }
    if (id.startsWith('br:tabx:')) {
      const i = region.data.closeTab;
      if (state.tabs.length === 1) { state.tabs[0] = { id: 't0', url: 'about:blank', title: 'Início', reader: null, mode: 'auto' }; state.tab = 0; }
      else { state.tabs.splice(i, 1); state.tab = clamp(state.tab - (i <= state.tab ? 1 : 0), 0, state.tabs.length - 1); }
      refreshHeights();
      return panel.markDirty();
    }
    if (id.startsWith('br:bm:')) return go((settings.get('bookmarks') || [])[+id.split(':')[2]]?.url || 'about:blank');
    if (id.startsWith('br:engine:')) { settings.set('searchEngine', id.split(':')[2]); return toast(`busca: ${id.split(':')[2]}`); }
    if (id.startsWith('br:hist:')) return go(state.history.slice(-7).reverse()[+id.split(':')[2]]);
    if (id === 'br:readerhelp') return toast('Reader3D re-compõe a página em blocos nativos para funcionar em estéreo.', 'info', 5200);
  }

  function onBack() {
    if (t_hasReader()) { const prev = state.history.pop(); if (prev) { settings.set('history', state.history); go(prev, false); return false; } }
    return true;
  }
  const t_hasReader = () => !!cur().reader;

  function tick() {
    if (host && effectiveMode() === 'web') { host.setParent(panel, area()); host.sync?.(); }
  }

  function nav(target) { if (target?.url) go(target.url); }
  function destroy() { if (domlayer) domlayer.destroyHost('browser:main'); }

  return { draw, chrome, onClick, onBack, tick, destroy, nav, scroll: true, contentHeight: panel.designH };
}
