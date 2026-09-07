import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { clamp, formatBytes, hash, toast, mulberry } from '../core/util.js';
import { CATEGORIES } from './catalog.js';
import { publishApp, parseScriptMeta } from '../core/api.js';

/**
 * MetaPort Store — install, update and publish. Everything is 3D content on a
 * scrolling glass slab: hero card, category rail, ratings, install progress.
 */
export function make(env, meta) {
  const { shell, panel, domlayer } = env;
  const state = {
    cat: 'todos',
    query: '',
    sel: null,
    installing: new Map(),
    acc: 0
  };
  const ROW = 92;
  const rateFor = (id) => 3.6 + (hash(id) % 14) / 10;
  const installsFor = (id) => 1200 + (hash(id + 'i') % 84000);

  function catalog() {
    const q = state.query.trim().toLowerCase();
    return shell.allCatalog()
      .filter((a) => a.id !== 'launcher')
      .filter((a) => state.cat === 'todos' || a.category === state.cat || (state.cat === 'user' && a.user))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.tagline || '').toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q));
  }

  async function install(app) {
    if (shell.installed.has(app.id) || state.installing.has(app.id)) return;
    state.installing.set(app.id, { p: 0, label: 'conectando' });
    audio.swoosh(panel.worldPos);
    const steps = ['baixando', 'verificando', 'instalando', 'otimizando shaders'];
    const total = Math.max(1.2, Math.min(4.6, (app.size || 1_000_000) / 1_600_000));
    const t0 = performance.now();
    await new Promise((res) => {
      const iv = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        const p = clamp(el / total, 0, 0.999);
        state.installing.set(app.id, { p, label: steps[Math.min(steps.length - 1, Math.floor(p * steps.length))] });
        panel.markDirty();
        if (p >= 0.999) { clearInterval(iv); res(); }
      }, 60);
    });
    state.installing.delete(app.id);
    shell.installed.add(app.id);
    settings.set('installed', [...shell.installed]);
    shell.emit('app:registered', app);
    audio.ok(panel.worldPos);
    toast(`${app.name} instalado — abra pelo Início`);
    panel.markDirty();
  }

  function content(kit) {
    const c = kit.ctx;
    const W = panel.designW;
    const rect = env.window.content;
    const x0 = rect.x, y0 = rect.y, w = rect.w;
    let y = y0;
    kit.bg('light');

    // header + search + tabs
    kit.header('MetaPort Store', `${shell.installed.size} INSTALADOS · ${shell.allCatalog().length} NO CATÁLOGO`, {
      icon: 'store',
      right: (k) => {
        k.fillRR(W - 268, 15, 236, 32, 16, 'rgba(255,255,255,.05)', 'rgba(150,205,255,.2)', 1);
        k.icon('search', W - 250, 31, 14, PALETTE.ink3);
        k.text(state.query || 'buscar apps, ports, jogos…', W - 232, 31, { size: 12, color: state.query ? PALETTE.ink : PALETTE.ink3, maxWidth: 170 });
        k.region({ id: 'st:search', kind: 'field', x: W - 268, y: 15, w: 236, h: 32, data: { value: state.query } });
      }
    });
    y += 74;
    kit.tabs('st:cat', x0, y, w, { items: CATEGORIES.map((cat) => cat.label), current: CATEGORIES.findIndex((cat) => cat.id === state.cat), h: 30, size: 11.5 });
    kit.chip(x0 + w - 176, y + 44, '⭳ instalar por arquivo .js', { id: 'st:file', color: PALETTE.accent2, size: 10.5 });
    kit.text('ou publique pelo Studio', x0 + w - 176 + kit.measure('⭳ instalar por arquivo .js', 10.5, 700) + 12, y + 44, { size: 10, color: PALETTE.ink3 });
    y += 70;

    if (state.sel) { y = detail(kit, y); return y + 220; }

    // hero
    const feat = shell.allCatalog().filter((a) => !a.system)[0];
    if (feat) {
      kit.card('st:hero', x0, y, w, 168, {
        title: feat.name, sub: 'EM DESTAQUE · ' + (feat.desc || '').slice(0, 118), icon: feat.icon, accent: feat.color, badge: 'VR NATIVO',
        draw: (k, cx, cy, cw, ch) => {
          const g = k.gradient(cx, cy, cx + cw, cy + ch, [[0, hexA(feat.color, 0.3)], [1, 'rgba(6,11,22,.1)']]);
          k.fillRR(cx, cy, cw, ch, 16, g, null);
          k.icon(feat.icon, cx + cw - 76, cy + ch / 2, 64, hexA(feat.color, 0.85));
          k.text(`★ ${rateFor(feat.id).toFixed(1)}`, cx + cw - 30, cy + ch - 24, { size: 13, weight: 700, color: PALETTE.warn, align: 'right' });
        }
      });
      y += 184;
    }

    // rows
    const list = catalog();
    for (let i = 0; i < list.length; i++) {
      const app = list[i];
      const ry = y + i * ROW;
      const inst = shell.installed.has(app.id);
      const prog = state.installing.get(app.id);
      kit.card(`st:${app.id}`, x0, ry, w, ROW - 10, {
        title: app.name, sub: `${app.tagline || ''} · ${formatBytes(app.size || 1000)} · v${app.version}`,
        icon: app.icon, accent: app.color,
        badge: app.isPort ? 'PORT WEB' : app.system ? 'SISTEMA' : app.user ? 'DA API' : '',
        draw: (k, cx, cy, cw, ch, { hot }) => {
          // rating stars
          const r = rateFor(app.id);
          for (let s = 0; s < 5; s++) {
            k.icon('star', cx + 18 + s * 13, cy + ch - 17, 10, s < Math.round(r) ? PALETTE.warn : 'rgba(190,225,255,.25)');
          }
          k.text(`${installsFor(app.id).toLocaleString('pt-BR')} instalações`, cx + 90, cy + ch - 17, { size: 10.5, color: PALETTE.ink3 });
          const bw = 96;
          if (prog) {
            k.fillRR(cx + cw - bw - 16, cy + ch / 2 - 15, bw, 30, 15, 'rgba(255,255,255,.05)', hexA(app.color, 0.4), 1);
            k.progress(cx + cw - bw - 12, cy + ch / 2 + 9, bw - 8, { value: prog.p, color: app.color, h: 4 });
            k.text(`${Math.round(prog.p * 100)}%`, cx + cw - bw / 2 - 16, cy + ch / 2 - 6, { size: 11, weight: 700, color: app.color, align: 'center' });
            k.text(prog.label, cx + cw - bw / 2 - 16, cy + ch / 2 + 18, { size: 8.5, color: PALETTE.ink3, align: 'center', letterSpacing: 0.8 });
          } else {
            k.button(`st:install:${app.id}`, cx + cw - bw - 16, cy + ch / 2 - 15, bw, 30, {
              label: inst ? 'ABRIR' : 'INSTALAR', icon: inst ? 'play' : 'download', variant: inst ? 'ghost' : 'primary', size: 11.5
            });
          }
          if (inst) k.icon('check', cx + cw - bw - 34, cy + ch / 2, 13, PALETTE.ok);
        }
      });
    }
    y += list.length * ROW;
    if (!list.length) kit.text('Nada por aqui — troque a categoria ou limpe a busca.', x0 + 8, y + 30, { size: 13, color: PALETTE.ink3 });
    return y + 90;
  }

  function detail(kit, y) {
    const app = shell.apps.get(state.sel);
    if (!app) { state.sel = null; return y; }
    const rect = env.window.content;
    const x0 = rect.x, w = rect.w;
    kit.button('st:back', x0, y, 112, 30, { label: 'Voltar', icon: 'back', variant: 'ghost', size: 12 });
    y += 44;
    kit.card(`st:hero2`, x0, y, w, 150, {
      title: app.name, sub: app.tagline || '', icon: app.icon, accent: app.color, hoverable: false,
      draw: (k, cx, cy, cw, ch) => {
        k.fillRR(cx, cy, cw, ch, 16, k.gradient(cx, 0, cx + cw, ch, [[0, hexA(app.color, 0.28)], [1, 'rgba(5,9,18,.15)']]));
        k.text(app.author || 'MetaPort', cx + 70, cy + 48, { size: 12, color: PALETTE.ink2 });
        k.text(`★ ${rateFor(app.id).toFixed(1)}   ·   ${installsFor(app.id).toLocaleString('pt-BR')} instalações`, cx + 70, cy + 70, { size: 12, color: PALETTE.warn });
        const bw = 128;
        const inst = shell.installed.has(app.id);
        k.button(`st:install:${app.id}`, cx + cw - bw - 20, cy + ch - 54, bw, 36, {
          label: inst ? 'ABRIR AGORA' : 'INSTALAR', icon: inst ? 'play' : 'download', variant: 'primary', size: 12.5
        });
      }
    });
    y += 166;
    kit.text('SOBRE', x0 + 4, y, { size: 10.5, weight: 700, color: PALETTE.ink3, letterSpacing: 1.6 });
    y += 22;
    const h1 = kit.text(app.desc || 'Sem descrição.', x0 + 4, y, { size: 13, color: PALETTE.ink, maxWidth: w - 8, lh: 1.5 });
    y += h1 + 16;
    kit.text('CAPTURAS', x0 + 4, y, { size: 10.5, weight: 700, color: PALETTE.ink3, letterSpacing: 1.6 });
    y += 18;
    // procedurally generated screenshots of the app's own UI layout
    for (let i = 0; i < 3; i++) {
      const sw = (w - 24) / 3;
      shot(kit, x0 + i * (sw + 12), y, sw, 108, app, i);
    }
    y += 124;
    kit.divider(x0, y, w, { label: 'FICHA TÉCNICA' });
    y += 20;
    const rows = [
      ['Versão', app.version || '1.0.0'],
      ['Tamanho', formatBytes(app.size || 1000)],
      ['Categoria', (CATEGORIES.find((cat) => cat.id === app.category) || {}).label || app.category],
      ['Tipo', app.isPort ? 'Web app portado (desktop espacial)' : app.user ? 'App da MetaPort API' : 'App 3D nativo'],
      ['Entrada', 'pinch · olhar · toque · gamepad'],
      ['Requisitos', 'WebGL2 · câmera opcional · giroscópio opcional']
    ];
    rows.forEach(([k, v], i) => {
      const ry = y + i * 26;
      if (i % 2) kit.fillRR(x0, ry - 11, w, 24, 7, 'rgba(255,255,255,.025)');
      kit.text(k, x0 + 10, ry, { size: 12, color: PALETTE.ink3 });
      kit.text(String(v), x0 + w - 10, ry, { size: 12, weight: 600, align: 'right', maxWidth: w - 150 });
    });
    y += rows.length * 26 + 14;
    if (shell.installed.has(app.id) && !app.system) {
      kit.button('st:uninstall', x0, y, 150, 34, { label: 'Desinstalar', icon: 'trash', variant: 'danger', size: 12 });
      y += 44;
    }
    return y + 40;
  }

  function shot(kit, x, y, w, h, app, i) {
    const c = kit.ctx;
    const rnd = mulberry(hash(app.id + i));
    kit.fillRR(x, y, w, h, 10, 'rgba(8,14,26,.9)', 'rgba(150,205,255,.16)', 1);
    c.save();
    c.beginPath();
    c.roundRect(x, y, w, h, 10);
    c.clip();
    kit.fillRR(x, y, w, 14, 0, hexA(app.color, 0.5));
    for (let r = 0; r < 4; r++) {
      const bw = w * (0.35 + rnd() * 0.5);
      kit.fillRR(x + 8, y + 24 + r * 20, bw, 12, 4, hexA(app.color, 0.14 + rnd() * 0.22));
      kit.fillRR(x + 12, y + 28 + r * 20, bw * 0.4, 4, 2, 'rgba(220,240,255,.25)');
    }
    kit.icon(app.icon || 'grid', x + w - 18, y + h - 18, 16, hexA(app.color, 0.55));
    c.restore();
  }

  let lastY = 0;
  function drawWrapped(kit) {
    lastY = content(kit);
    panel.contentH = Math.max(panel.designH, lastY);
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 26);
  }

  function onClick(region, loc) {
    const id = region.id;
    if (id === 'st:search') {
      domlayer?.openEditor({
        panel, rect: { ...region, h: 30 }, value: state.query, placeholder: 'buscar na store…',
        onDone: (v) => { state.query = v || ''; panel.markDirty(); }
      });
      return;
    }
    if (id.startsWith('st:cat:')) { state.cat = CATEGORIES[+region.data.index]?.id || 'todos'; panel.markDirty(); return; }
    if (id.startsWith('st:install:')) {
      const appId = id.slice(11);
      const app = shell.apps.get(appId);
      if (shell.installed.has(appId)) { shell.openApp(appId); return; }
      if (app) install(app);
      return;
    }
    if (id === 'st:uninstall') { shell.unregister(state.sel); settings.set('installed', [...shell.installed]); toast(`${shell.apps.get(state.sel)?.name || 'app'} desinstalado`); panel.markDirty(); return; }
    if (id === 'st:file') { pickScript(); return; }
    if (id === 'st:back') { state.sel = null; panel.markDirty(); return; }
    if (id === 'st:hero') { state.sel = shell.allCatalog().filter((a) => !a.system)[0]?.id; panel.markDirty(); return; }
    if (id.startsWith('st:')) { state.sel = id.slice(3); panel.markDirty(); audio.hover(panel.worldPos); return; }
  }

  // ---- install a .js app straight from storage (handheld: uses the OS picker) ----
  let picker = null;
  function pickScript() {
    if (typeof document === 'undefined' || !document.body) { toast('no modo óculos use o Studio para publicar', 'warn'); return; }
    if (!picker) {
      picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = '.js,.mjs,.txt,text/javascript,text/plain';
      picker.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(picker);
      picker.addEventListener('change', async () => {
        const file = picker.files?.[0];
        picker.value = '';
        if (!file) return;
        if (file.size > 400_000) { toast('arquivo grande demais (máx. 400 kB)', 'warn'); return; }
        const code = await file.text().catch(() => '');
        if (!code || !/MetaPort|export\s+(const|function)/.test(code)) { toast('isso não parece um app MetaPort', 'err'); return; }
        try {
          const found = parseScriptMeta(code);
          const entry = publishApp({ ...found, name: found.name || file.name.replace(/\.[^.]+$/, ''), code }, env);
          if (entry) { shell.installed.add(entry.id); settings.set('installed', [...shell.installed]); }
          state.sel = entry?.id || null;
          audio.ok(panel.worldPos);
        } catch (e) { toast(`instalação falhou: ${e.message}`.slice(0, 120), 'err'); }
        panel.markDirty();
      });
    }
    picker.click();
    toast('escolha um .js com `export const meta`', 'info', 3200);
  }

  function tick(dt) {
    state.acc += dt;
    if (state.acc > 0.5 && state.installing.size) { state.acc = 0; panel.markDirty(); }
  }

  return { draw: drawWrapped, onClick, tick, get contentHeight() { return panel.contentH; } };
}
