import { PALETTE, hexA, MONO, FONT } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { store, scopedStore } from '../core/storage.js';
import { audio } from '../core/audio.js';
import { clamp, toast, uid } from '../core/util.js';
import { SAMPLES } from './samples.js';
import { API_VERSION } from '../core/api.js';

const TABS = ['editor', 'exemplos', 'api', 'console'];
const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|of|in|new|await|async|class|try|catch|=>|true|false|null|undefined)\b/g;
const STR = /(['"`])(?:\\.|(?!\1)[^\\])*\1/g;
const NUM = /\b\d+(\.\d+)?\b/g;
const CALL = /\b(MetaPort[a-zA-Z0-9_.]*)/g;

/**
 * Studio: editor + executor + catálogo de amostras + referência da MetaPort Script API.
 * O código é executado num contexto rastreado (MetaPort_*), então parar limpa painéis,
 * objetos 3D, timers e listeners criados pelo script.
 */
export function make(env, meta) {
  const { panel, domlayer, shell } = env;
  const scratch = scopedStore('studio');
  const state = {
    tab: 0,
    code: scratch.get('code') || SAMPLES[0].code,
    running: false,
    ctx: null,
    cursor: 0,
    showApi: 0,
    logs: [],
    editing: false
  };

  env.bus.on('script:log', (e) => {
    state.logs.push(e);
    if (state.logs.length > 120) state.logs.shift();
    if (state.tab === 3) panel.markDirty();
  });

  function stop() {
    state.ctx?.dispose();
    state.ctx = null;
    state.running = false;
    panel.markDirty();
  }

  function run() {
    stop();
    const ctx = env.createScriptContext({ id: 'studio.' + uid('run'), name: 'Studio Run' });
    const ok = env.runScript(state.code, ctx);
    state.ctx = ctx;
    state.running = ok;
    if (ok) { audio.ok(panel.worldPos); toast('script executado'); } else { audio.error(panel.worldPos); toast('erro no script — veja o console', 'err'); state.tab = 3; }
    panel.markDirty();
  }

  function publish() {
    const name = prompt2('Nome do app', 'Meu App VR');
    // use a real in-world prompt when DOM available; fall back to a generated name
    const id = `user.${(name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    shell.apps.set(id, {
      id, name: name || 'Meu App VR', icon: 'bolt', color: '#9be7ff', category: 'user', user: true,
      tagline: 'publicado pelo Studio', desc: 'App escrito na MetaPort Script API.', size: state.code.length * 3, version: '1.0.0', author: 'você',
      async make(en) {
        const ctx = en.createScriptContext({ id, name: name || 'Meu App VR' });
        en.runScript(state.code, ctx);
        return {
          draw: (kit, t) => {
            kit.bg();
            if (ctx.contentDraw) ctx.contentDraw(kit, t);
            else for (const fn of ctx.drawHooks) fn(kit, en.panel, t);
          },
          onClick: (region, loc) => { for (const fn of ctx.onClickHooks) fn({ region, loc }); },
          tick: (dt, t) => { env.animateObjects(dt, t); for (const fn of ctx.tickHooks) fn(dt, t); },
          destroy: () => ctx.dispose(),
          get contentHeight() { return ctx.contentHeight || 0; }
        };
      }
    });
    env.publishApp({ id, name: name || 'Meu App VR', code: state.code, icon: 'bolt', color: '#9be7ff', desc: 'App escrito no Studio.', author: 'você' });
    shell.installed.add(id);
    settings.set('installed', [...shell.installed]);
    audio.ok(panel.worldPos);
    toast(`"${name}" está na Store e no Início`);
    panel.markDirty();
  }

  function prompt2(label, def) {
    if (domlayer?.allowDom) {
      // fire-and-forget: the editor commits asynchronously and we keep the current name
      const r = { x: 40, y: panel.designH - 120, w: 420, h: 44 };
      domlayer.openEditor({ panel, rect: r, value: def, placeholder: label, onDone: (v) => { state.pubName = v || def; publishWith(state.pubName); } });
      return state.pubName || def;
    }
    const v = globalThis.prompt?.(label, def);
    return v || def;
  }

  function publishWith(name) {
    const id = `user.${(name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    env.publishApp({ id, name, code: state.code, icon: 'bolt', color: '#9be7ff', desc: 'App escrito no Studio.', author: 'você' });
    shell.installed.add(id);
    settings.set('installed', [...shell.installed]);
    toast(`"${name}" publicado`);
    panel.markDirty();
  }

  // ---------------------------------------------------------------- drawing
  function draw(kit) {
    const W = panel.designW, H = panel.designH;
    const rect = env.window.content;
    kit.bg('default');
    kit.tabs('su:tab', rect.x, rect.y - 4, rect.w * 0.62, { items: TABS, current: state.tab, h: 30, size: 12 });
    kit.button('su:run', rect.x + rect.w * 0.64, rect.y - 4, Math.min(150, rect.w * 0.17), 30, { label: state.running ? 'REEXECTAR' : 'EXECUTAR', icon: 'play', variant: 'primary', size: 11.5 });
    kit.button('su:stop', rect.x + rect.w - 118, rect.y - 4, 110, 30, { label: state.running ? 'PARAR' : 'LIMPAR', icon: 'stop', variant: state.running ? 'danger' : 'ghost', size: 11.5 });

    const top = rect.y + 34;
    if (state.tab === 0) editor(kit, { x: rect.x, y: top, w: rect.w, h: H - top - 74 });
    if (state.tab === 1) samples(kit, { x: rect.x, y: top, w: rect.w, h: H - top - 74 });
    if (state.tab === 2) api(kit, { x: rect.x, y: top, w: rect.w, h: H - top - 74 });
    if (state.tab === 3) console_(kit, { x: rect.x, y: top, w: rect.w, h: H - top - 74 });
  }

  function editor(kit, a) {
    const c = kit.ctx;
    const lines = state.code.split('\n');
    const lh = 19;
    kit.fillRR(a.x, a.y, a.w, a.h, 10, 'rgba(3,6,14,.92)', 'rgba(150,205,255,.16)', 1);
    c.save();
    c.beginPath(); c.rect(a.x, a.y, a.w, a.h); c.clip();
    // gutter
    kit.fillRR(a.x, a.y, 46, a.h, 0, 'rgba(255,255,255,.03)');
    const first = Math.max(0, Math.floor(panel.scroll / lh));
    for (let i = first; i < Math.min(lines.length, first + Math.ceil(a.h / lh) + 2); i++) {
      const y = a.y + 14 + i * lh - panel.scroll;
      kit.text(String(i + 1).padStart(2, ' '), a.x + 10, y, { size: 11, color: 'rgba(150,205,255,.35)', font: MONO });
      drawLine(kit, lines[i] || '', a.x + 56, y, i);
      if (i === state.cursor) {
        c.fillStyle = hexA(PALETTE.accent, 0.55);
        c.fillRect(a.x + 56 + kit.measure((lines[i] || '').slice(0, state.col || 0), 12.5, 400, MONO), y - 8, 1.5, 16);
      }
    }
    c.restore();
    kit.region({ id: 'su:code', kind: 'code', x: a.x, y: a.y, w: a.w, h: Math.min(a.h, lines.length * lh + 28), data: { lines: lines.length } });

    panel.contentH = a.y + lines.length * lh + 40;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);

    // footer bar
    const fy = panel.designH - 58;
    kit.fillRR(a.x, fy, a.w, 46, 10, 'rgba(255,255,255,.035)', 'rgba(150,205,255,.12)', 1);
    kit.text(`${lines.length} linhas · ${state.code.length} caracteres · API v${API_VERSION}`, a.x + 16, fy + 23, { size: 11, color: PALETTE.ink3, font: MONO });
    kit.button('su:edit', a.x + 250, fy + 8, 150, 30, { label: 'editar ⌨', icon: 'keyboard', variant: 'ghost', size: 11.5 });
    kit.button('su:save', a.x + 408, fy + 8, 130, 30, { label: 'salvar', icon: 'folder', variant: 'ghost', size: 11.5 });
    kit.button('su:pub', a.x + 546, fy + 8, 176, 30, { label: 'publicar na Store', icon: 'store', variant: 'accent2', size: 11.5 });
    kit.button('su:fmt', a.x + a.w - 110, fy + 8, 96, 30, { label: 'indentar', icon: 'sliders', variant: 'ghost', size: 11 });
  }

  function drawLine(kit, line, x, y, i) {
    const c = kit.ctx;
    // tiny syntax painter — cheap, no tokenizer dependency
    const plain = line.replace(/\t/g, '  ');
    c.save();
    c.font = `400 12.5px ${MONO}`;
    c.textBaseline = 'middle';
    const comment = plain.indexOf('//');
    const code = comment >= 0 ? plain.slice(0, comment) : plain;
    let px = x;
    const tokens = code.split(/(\s+|[(),.{}[\]:;=+\-*/<>])/);
    for (const tk of tokens) {
      if (!tk) continue;
      let col = '#dbe9f7';
      if (KEYWORDS.test(tk)) col = '#ff9ad2';
      else if (/^['"`]/.test(tk)) col = '#a5f3c0';
      else if (/^\d/.test(tk)) col = '#ffd166';
      else if (/^MetaPort/.test(tk)) col = '#7fe9ff';
      else if (/^[A-Z]/.test(tk)) col = '#b8c6ff';
      KEYWORDS.lastIndex = 0;
      c.fillStyle = col;
      c.fillText(tk, px, y);
      px += c.measureText(tk).width;
    }
    if (comment >= 0) {
      c.fillStyle = 'rgba(140,180,210,.55)';
      c.font = `italic 400 12.5px ${MONO}`;
      c.fillText(plain.slice(comment), x + c.measureText(code).width + 6, y);
    }
    c.restore();
  }

  function samples(kit, a) {
    const list = SAMPLES;
    list.forEach((s, i) => {
      const y = a.y + i * 78;
      kit.card(`su:s:${i}`, a.x, y, a.w, 70, {
        title: `${i + 1}. ${s.name}`, sub: s.desc, icon: 'code', accent: i % 2 ? PALETTE.accent2 : PALETTE.accent,
        right: `${s.code.split('\n').length} linhas`,
        draw: (k, x, y2, w, h) => {
          k.button(`su:sload:${i}`, x + w - 122, y2 + h / 2 - 15, 108, 30, { label: 'carregar', icon: 'download', variant: 'ghost', size: 11 });
        }
      });
    });
    panel.contentH = a.y + list.length * 78 + 30;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function api(kit, a) {
    const groups = API_DOCS;
    let y = a.y;
    groups.forEach((g, gi) => {
      const open = state.showApi === gi;
      kit.button(`su:g:${gi}`, a.x, y, a.w, 32, { label: `${open ? '▾' : '▸'}  ${g.group}`, icon: g.icon, variant: open ? 'primary' : 'ghost', size: 13, align: 'left' });
      y += 38;
      if (!open) return;
      g.items.forEach((it, ii) => {
        const h = 44 + (it.doc ? Math.ceil(it.doc.length / 90) * 15 : 0);
        kit.fillRR(a.x + 6, y, a.w - 12, h - 6, 8, 'rgba(255,255,255,.03)', 'rgba(150,205,255,.1)', 1);
        kit.text(it.sig, a.x + 20, y + 16, { size: 12.5, weight: 700, color: '#8ff6ff', font: MONO });
        if (it.doc) kit.text(it.doc, a.x + 20, y + 34, { size: 11, color: PALETTE.ink3, maxWidth: a.w - 200, lh: 1.35 });
        kit.button(`su:copy:${gi}.${ii}`, a.x + a.w - 96, y + 6, 84, 24, { label: 'inserir', variant: 'ghost', size: 10 });
        y += h;
      });
      y += 6;
    });
    panel.contentH = y + 40;
    panel.maxScroll = Math.max(0, panel.contentH - panel.designH + 10);
  }

  function console_(kit, a) {
    kit.fillRR(a.x, a.y, a.w, a.h, 10, 'rgba(2,5,12,.94)', 'rgba(150,205,255,.14)', 1);
    const lh = 17;
    const lines = state.logs.length ? state.logs : [{ kind: 'log', line: 'sem saída ainda — rode um script na aba editor.', t: 0 }];
    kit.ctx.save();
    kit.ctx.beginPath();
    kit.ctx.rect(a.x, a.y, a.w, a.h);
    kit.ctx.clip();
    const start = Math.max(0, lines.length - Math.floor(a.h / lh));
    lines.slice(start).forEach((l, i) => {
      const col = l.kind === 'err' ? '#ff8aa2' : l.kind === 'warn' ? '#ffc45e' : '#c8e6ff';
      kit.text(`${String(l.t).padStart(5, ' ')}  ${l.kind === 'err' ? '✕' : l.kind === 'warn' ? '!' : '›'} ${l.line}`, a.x + 12, a.y + 14 + i * lh, { size: 11.5, color: col, font: MONO, maxWidth: a.w - 24 });
    });
    kit.ctx.restore();
    kit.button('su:clear', a.x + a.w - 120, a.y + a.h + 8, 110, 26, { label: 'limpar', icon: 'trash', variant: 'ghost', size: 11 });
    panel.maxScroll = 0;
  }

  function chrome() { /* window title bar is enough */ }

  function onClick(region, loc) {
    const id = region.id;
    if (id.startsWith('su:tab:')) { state.tab = region.data.index; panel.scroll = 0; panel.markDirty(); return; }
    if (id === 'su:run') return run();
    if (id === 'su:stop') { stop(); return; }
    if (id === 'su:save') { scratch.set({ code: state.code }); toast('rascunho salvo'); audio.ok(panel.worldPos); return; }
    if (id === 'su:pub') return publish();
    if (id === 'su:fmt') { state.code = state.code.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n'); panel.markDirty(); return; }
    if (id === 'su:clear') { state.logs = []; panel.markDirty(); return; }
    if (id.startsWith('su:g:')) { const gi = +id.slice('su:g:'.length); state.showApi = state.showApi === gi ? -1 : gi; panel.scroll = 0; panel.markDirty(); return; }
    if (id.startsWith('su:sload:')) { const s = SAMPLES[+id.split(':')[2]]; state.code = s.code; state.tab = 0; panel.markDirty(); toast(`${s.name} carregado`); return; }
    if (id.startsWith('su:copy:')) {
      const [g, i] = id.split(':')[2].split('.').map(Number);
      const it = API_DOCS[g]?.items[i];
      if (it) { state.code += `\n${it.insert || it.sig}`; toast('trecho inserido no editor'); }
      return;
    }
    if (id === 'su:code' || id === 'su:edit') {
      if (!domlayer?.allowDom) { toast('Edição direta requer modo handheld/WebXR (teclado nativo).', 'warn', 4200); return; }
      state.editing = true;
      domlayer.openEditor({
        panel,
        rect: { x: 20, y: panel.contentTop + 40, w: Math.round(panel.designW * 0.62), h: Math.round(panel.designH * 0.6) },
        value: state.code, multiline: true,
        onDone: (v) => { state.code = v; state.editing = false; scratch.set({ code: v }); panel.markDirty(); toast('código atualizado'); },
        onCancel: () => { state.editing = false; panel.markDirty(); }
      });
      return;
    }
  }

  function onScroll(dy) { /* handled by panel */ }

  function tick() { if (state.running) panel.markDirty(); }
  function destroy() { stop(); }

  return { draw, chrome, onClick, onScroll, tick, destroy };
}

export const API_DOCS = [
  { group: 'MetaPort.on · ciclo de vida', icon: 'bolt', items: [
    { sig: "MetaPort.on('draw', (kit, panel, t) => {})", doc: 'Desenha no painel do app (ou no seu). Kit tem botão, slider, texto, gráfico, card.', insert: "MetaPort.on('draw', (kit, panel, t) => {\n  kit.bg();\n});" },
    { sig: "MetaPort.on('tick', (dt, t) => {})", doc: 'Chamado a cada frame — use para animações e lógica.', insert: "MetaPort.on('tick', (dt, t) => {});" },
    { sig: "MetaPort.on('pinch', (hand) => {})", doc: 'Dispara quando qualquer mão muda o estado de pinça.', insert: "MetaPort.on('pinch', (h) => { if (h?.pinch) MetaPort.audio.tone(880, .1); });" },
    { sig: 'MetaPort.log(...) · warn · error', doc: 'Saída no Console do Studio (também no devtools).', insert: 'MetaPort.log(\'oi\');' }
  ] },
  { group: 'MetaPort.ui · painéis holográficos', icon: 'grid', items: [
    { sig: 'MetaPort.ui.panel({ width, height, x, y, z, color, title, draw, onClick })', doc: 'Cria um painel de vidro no mundo com seu canvas. Retorna handle com .draw .onClick .place .hide .dispose.', insert: "const p = MetaPort.ui.panel({ width: .8, draw: (kit, panel) => { kit.bg(); kit.text('oi', 20, 30, { size: 30 }); } });" },
    { sig: 'MetaPort.ui.setContentDraw((kit, t) => {})', doc: 'Usa a janela do próprio app como superfície (modo instalado).', insert: 'MetaPort.ui.setContentDraw((kit) => { kit.bg(); });' },
    { sig: 'MetaPort.ui.hud(texto, ms)', doc: 'Aviso rápido no ar.', insert: "MetaPort.ui.hud('pronto');", },
    { sig: 'kit.button/toggle/slider/card/stat/progress/tabs/text', doc: 'Widgets com hit-region automática — o clique chega em onClick({region}).' }
  ] },
  { group: 'MetaPort.scene · objetos 3D', icon: 'layers', items: [
    { sig: "MetaPort.scene.add({ type:'box|sphere|torus|ring|plane|points|line|beam|icon', size, color, glow, glass, pos, spin, float })", doc: 'Cria geometria real na cena; retorna THREE.Mesh com .spin() .float() .onClick() .set() .remove().', insert: "MetaPort.scene.add({ type: 'torus', size: .3, color: '#46f0d0', glow: 1, pos: [0,.1,-1] }).spin(0,1,0);" },
    { sig: 'MetaPort.scene.clear()', doc: 'Remove tudo que o script criou.' },
    { sig: 'MetaPort.world.ping(força)', doc: 'Pulso de luz no chão do mundo (feedback de interação).' }
  ] },
  { group: 'MetaPort.hands · visão computacional', icon: 'hand', items: [
    { sig: 'MetaPort.hands.list()', doc: 'Mãos: label, pinch, pinchAmount, grab, point, open, peace, gap, span, pointer{x,y}, landmarks[21].' },
    { sig: 'MetaPort.hands.point(hand, índice)', doc: 'World position de um landmark — plugue em qualquer objeto 3D.', insert: 'const v = MetaPort.hands.point(MetaPort.hands.primary(), 8);' },
    { sig: 'MetaPort.hands.count · .available()', doc: 'Nº de mãos e status do MediaPipe (ok | loading | error).' }
  ] },
  { group: 'MetaPort.audio · som espacial', icon: 'music', items: [
    { sig: 'MetaPort.audio.tone(freq, dur, { type, gain, pos })', doc: 'Oscilador com panner HRTF se você passar pos (THREE.Vector3).', insert: "MetaPort.audio.tone(520,.2,{type:'triangle'})" },
    { sig: 'MetaPort.audio.note(midi, dur) · chord(root, dur, tipo)', doc: 'Síntede direta; tipos: major, minor, sus, maj7.', insert: "MetaPort.audio.chord(60, 1.2, 'maj7');" },
    { sig: 'MetaPort.haptic(ms)', doc: 'Vibração (funciona no Android).' }
  ] },
  { group: 'MetaPort.xr · headset e entrada', icon: 'vr', items: [
    { sig: 'MetaPort.xr.enterVRBox() · enterMR() · enterWebXR() · recenter()', doc: 'Troca de modo a partir de um app.' },
    { sig: 'MetaPort.xr.info()', doc: '{ fps, res, draws, mode }.' },
    { sig: 'MetaPort.input.ray()', doc: 'Ray atual do cursor (origem + direção).' }
  ] },
  { group: 'MetaPort.storage · apps · tempo', icon: 'folder', items: [
    { sig: "MetaPort.storage.set('k', v) / get('k')", doc: 'JSON por app, isolado dos demais.' },
    { sig: 'MetaPort.apps.open(id) · list() · publish({name, code})', doc: 'Controle da plataforma; publish manda para a Store.' },
    { sig: 'MetaPort.time.frame(fn) · every(ms, fn) · after(ms, fn)', doc: 'Timers que morrem junto com o contexto do script.' }
  ] }
];
