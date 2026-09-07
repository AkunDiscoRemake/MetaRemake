import { drawIcon } from './icons.js';
import { clamp } from '../core/util.js';

export const FONT = '"Inter", "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif';
export const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

export const PALETTE = {
  ink: '#e9f4ff',
  ink2: '#a9c4de',
  ink3: '#6e88a4',
  bg: '#070c18',
  bg2: '#0c1424',
  card: 'rgba(255,255,255,.045)',
  cardHi: 'rgba(255,255,255,.085)',
  line: 'rgba(150,205,255,.16)',
  line2: 'rgba(150,205,255,.28)',
  accent: '#46f0d0',
  accent2: '#ff3ea5',
  warn: '#ffc45e',
  err: '#ff6b8a',
  ok: '#69f0a5'
};

/**
 * Canvas UI kit. Every pixel of MetaPort's interface is painted into a texture that
 * lives on a volumetric panel in the world — there is no DOM menu, no flat overlay.
 * Widgets register hit regions, which the hand/gaze/mouse ray maps onto.
 */
export class Kit {
  constructor(panel) {
    this.panel = panel;
    this.ctx = null;
    this.w = 0; this.h = 0;
    this.regions = [];
    this.chromeOffset = 0;
    this.time = 0;
    this.tints = null;
  }

  begin(ctx, w, h, state, t) {
    this.ctx = ctx; this.w = w; this.h = h; this.state = state; this.time = t;
    this.regions.length = 0;
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }
  end() { return this.regions; }

  // ---------------------------------------------------------------- primitives
  rr(x, y, w, h, r = 10) {
    const c = this.ctx;
    const rad = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }
  fillRR(x, y, w, h, r, fill, stroke, lw = 1) {
    const c = this.ctx;
    this.rr(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  text(str, x, y, { size = 15, weight = 500, color = PALETTE.ink, align = 'left', baseline = 'middle', font = FONT, maxWidth = 0, lh = 1.34, opacity = 1, letterSpacing = 0, glow = 0 } = {}) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = opacity;
    c.font = `${weight} ${size}px ${font}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = baseline;
    if ('letterSpacing' in c) c.letterSpacing = `${letterSpacing}px`;
    if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
    const lines = maxWidth ? wrap(c, String(str), maxWidth, size, weight, font) : [String(str)];
    lines.forEach((ln, i) => c.fillText(ln, x, y + i * size * lh));
    c.restore();
    return lines.length * size * lh;
  }
  measure(str, size, weight = 500, font = FONT) {
    const c = this.ctx;
    c.save(); c.font = `${weight} ${size}px ${font}`;
    const w = c.measureText(str).width; c.restore();
    return w;
  }
  icon(name, x, y, s = 22, color = PALETTE.ink2, opts) { drawIcon(this.ctx, name, x, y, s, color, opts); }
  gradient(x0, y0, x1, y1, stops) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }
  radial(x, y, r0, r1, stops) {
    const g = this.ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }
  glow(x, y, r, color, alpha = 0.5) {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = this.radial(x, y, 0, r, [[0, hexA(color, alpha)], [0.6, hexA(color, alpha * 0.25)], [1, hexA(color, 0)]]);
    c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
    c.restore();
  }
  bg(kind = 'default') {
    const c = this.ctx, { w, h } = this;
    const g = c.createLinearGradient(0, 0, w * 0.4, h);
    if (kind === 'void') { g.addColorStop(0, 'rgba(4,7,16,.94)'); g.addColorStop(1, 'rgba(2,4,10,.97)'); }
    else if (kind === 'light') { g.addColorStop(0, 'rgba(20,32,54,.86)'); g.addColorStop(1, 'rgba(9,16,30,.92)'); }
    else { g.addColorStop(0, 'rgba(10,17,32,.9)'); g.addColorStop(0.55, 'rgba(7,12,24,.94)'); g.addColorStop(1, 'rgba(4,8,18,.96)'); }
    this.fillRR(0, 0, w, h, this.panel.radius || 22, g);
    // scan shimmer
    c.save();
    c.globalCompositeOperation = 'lighter';
    const y = (this.time * 26) % (h + 240) - 120;
    const sg = c.createLinearGradient(0, y - 60, 0, y + 60);
    sg.addColorStop(0, 'rgba(120,220,255,0)');
    sg.addColorStop(0.5, 'rgba(120,220,255,0.045)');
    sg.addColorStop(1, 'rgba(120,220,255,0)');
    c.fillStyle = sg; c.fillRect(0, y - 60, w, 120);
    c.restore();
  }
  header(title, sub = '', { icon = 'grid', right = null } = {}) {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = this.gradient(0, 0, this.w, 0, [[0, 'rgba(70,240,208,.14)'], [0.5, 'rgba(70,240,208,.03)'], [1, 'rgba(255,62,165,.10)']]);
    c.fillRect(0, 0, this.w, 62);
    c.restore();
    this.icon(icon, 30, 32, 22, PALETTE.accent);
    this.text(title, 56, 26, { size: 20, weight: 700, letterSpacing: 0.2 });
    if (sub) this.text(sub, 56, 44, { size: 11.5, weight: 500, color: PALETTE.ink3, letterSpacing: 1.4 });
    if (right) right(this);
    c.strokeStyle = 'rgba(150,205,255,.16)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(16, 62.5); c.lineTo(this.w - 16, 62.5); c.stroke();
  }

  // ---------------------------------------------------------------- widgets
  region(r) {
    if (this.chromeOffset) r.y += this.chromeOffset;   // keep fixed chrome hit-testable while content scrolls
    this.regions.push(r);
    return r;
  }

  button(id, x, y, w, h, { label = '', icon = '', variant = 'default', disabled = false, size = 14.5, align = 'center', hint = '' } = {}) {
    const c = this.ctx;
    const hot = this.state.hover === id && !disabled;
    const down = this.state.down === id && !disabled;
    let fill, stroke, color = PALETTE.ink;
    if (variant === 'primary') { fill = this.gradient(x, y, x + w, y + h, [[0, hot ? '#5cffe0' : '#46f0d0'], [1, '#2b8bff']]); color = '#04121a'; }
    else if (variant === 'danger') { fill = hexA(PALETTE.err, hot ? 0.26 : 0.14); stroke = hexA(PALETTE.err, 0.5); color = '#ffd6de'; }
    else if (variant === 'ghost') { fill = hot ? 'rgba(255,255,255,.07)' : 'transparent'; stroke = hot ? PALETTE.line2 : 'transparent'; }
    else if (variant === 'accent2') { fill = this.gradient(x, y, x + w, y + h, [[0, '#ff3ea5'], [1, '#a52bff']]); color = '#170210'; }
    else { fill = hot ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.045)'; stroke = hot ? PALETTE.line2 : PALETTE.line; }
    c.save();
    if (down) c.translate(0, 1);
    this.fillRR(x, y, w, h, Math.min(13, h / 2.4), fill, stroke, 1.2);
    if (hot && !disabled) {
      c.globalCompositeOperation = 'lighter';
      this.fillRR(x, y, w, h, Math.min(13, h / 2.4), 'rgba(120,220,255,.06)', null);
      c.restore(); c.save();
    }
    const pad = 14;
    let tx = x + pad;
    if (icon) { this.icon(icon, tx + 9, y + h / 2, 17, variant === 'primary' ? color : PALETTE.ink2); tx += 26; }
    if (label) {
      const tw = this.measure(label, size, variant === 'primary' ? 700 : 600);
      const lx = align === 'left' ? tx : (icon ? tx : x + w / 2 - tw / 2);
      this.text(label, align === 'center' && !icon ? x + w / 2 : lx, y + h / 2, { size, weight: variant === 'primary' ? 700 : 600, color, align: align === 'center' && !icon ? 'center' : 'left' });
    }
    if (hint) this.text(hint, x + w - pad, y + h / 2, { size: 11, color: PALETTE.ink3, align: 'right' });
    c.restore();
    if (!disabled) this.region({ id, kind: 'button', x, y, w, h, data: { label } });
    return { hot, down };
  }

  iconButton(id, x, y, s, { icon, variant = 'ghost', label = '' } = {}) {
    const c = this.ctx;
    const hot = this.state.hover === id, down = this.state.down === id;
    this.fillRR(x, y, s, s, s / 3.2, hot ? 'rgba(120,220,255,.16)' : variant === 'solid' ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.03)', hot ? PALETTE.line2 : 'rgba(150,205,255,.12)', 1);
    this.icon(icon, x + s / 2, y + s / 2, s * 0.48, down ? PALETTE.accent : hot ? PALETTE.ink : PALETTE.ink2);
    if (label) this.text(label, x + s + 6, y + s / 2, { size: 11, color: PALETTE.ink3 });
    this.region({ id, kind: 'button', x, y, w: s, h: s, data: { icon, label } });
  }

  toggle(id, x, y, { label = '', value = false, sub = '', w = 0 } = {}) {
    const c = this.ctx;
    const tw = 46, th = 26;
    const hot = this.state.hover === id;
    if (label) this.text(label, x, y + th / 2, { size: 14, weight: 600, color: PALETTE.ink });
    if (sub) this.text(sub, x, y + th / 2 + 14, { size: 11, color: PALETTE.ink3 });
    const bx = w ? x + w - tw : x + (label ? this.measure(label, 14, 600) + 14 : 0);
    const by = y;
    const col = value ? PALETTE.accent : 'rgba(160,200,230,.22)';
    this.fillRR(bx, by, tw, th, th / 2, value ? hexA(PALETTE.accent, 0.28) : 'rgba(255,255,255,.05)', hot ? PALETTE.line2 : 'rgba(150,205,255,.16)', 1.2);
    const kx = value ? bx + tw - th / 2 : bx + th / 2;
    c.save();
    if (value) { c.shadowColor = PALETTE.accent; c.shadowBlur = 14; }
    c.beginPath(); c.arc(kx, by + th / 2, th / 2 - 4, 0, 6.2832);
    c.fillStyle = col; c.fill();
    c.restore();
    this.region({ id, kind: 'toggle', x: Math.min(x, bx), y: by, w: Math.max(w || 240, tw + 8), h: th, data: { value, toggleX: bx } });
    return value;
  }

  slider(id, x, y, w, { label = '', value = 0, min = 0, max = 1, step = 0, format, sub = '' } = {}) {
    const c = this.ctx;
    const hot = this.state.hover === id, dragging = this.state.down === id;
    if (label) this.text(label, x, y - 9, { size: 13, weight: 600 });
    const txt = format ? format(value) : (Number.isInteger(min) && Number.isInteger(step) ? String(value) : value.toFixed(2));
    this.text(txt, x + w, y - 9, { size: 12.5, weight: 700, color: PALETTE.accent, align: 'right' });
    const h = 26, ty = y + 4;
    this.fillRR(x, ty, w, h, h / 2, dragging ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.045)', hot ? PALETTE.line2 : 'rgba(150,205,255,.14)', 1);
    const t = clamp((value - min) / (max - min || 1), 0, 1);
    const px = x + 13 + t * (w - 26);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = this.gradient(x, 0, x + w, 0, [[0, PALETTE.accent], [1, '#3f8dff']]);
    c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 13, ty + h / 2); c.lineTo(px, ty + h / 2); c.stroke();
    c.restore();
    c.save();
    c.shadowColor = PALETTE.accent; c.shadowBlur = dragging ? 20 : 10;
    c.beginPath(); c.arc(px, ty + h / 2, dragging ? 9.5 : 8, 0, 6.2832);
    c.fillStyle = '#eafffb'; c.fill();
    c.restore();
    if (sub) this.text(sub, x, ty + h + 9, { size: 10.5, color: PALETTE.ink3 });
    this.region({ id, kind: 'slider', x, y: ty, w, h, data: { min, max, step, value, horizontal: true }, value });
    return value;
  }

  /** Maps a pointer x inside the slider to a value (used by the panel's drag handler). */
  static sliderValue(region, px) {
    const d = region.data;
    const t = clamp((px - region.x - 13) / (region.w - 26), 0, 1);
    let v = d.min + t * (d.max - d.min);
    if (d.step) v = Math.round(v / d.step) * d.step;
    return Math.round(v * 1e6) / 1e6;
  }

  tabs(id, x, y, w, { items = [], current = 0, size = 13.5, h = 34 } = {}) {
    const c = this.ctx;
    const n = items.length || 1;
    const bw = w / n;
    this.fillRR(x, y, w, h, h / 2, 'rgba(255,255,255,.04)', 'rgba(150,205,255,.14)', 1);
    items.forEach((label, i) => {
      const bx = x + i * bw;
      const on = i === current;
      const hot = this.state.hover === `${id}:${i}`;
      if (on) this.fillRR(bx + 2, y + 2, bw - 4, h - 4, (h - 4) / 2, this.gradient(bx, 0, bx + bw, 0, [[0, 'rgba(70,240,208,.9)'], [1, 'rgba(63,141,255,.9)']]), null);
      else if (hot) this.fillRR(bx + 2, y + 2, bw - 4, h - 4, (h - 4) / 2, 'rgba(255,255,255,.05)');
      this.text(label, bx + bw / 2, y + h / 2 + 0.5, { size, weight: on ? 700 : 500, color: on ? '#04121a' : PALETTE.ink2, align: 'center' });
      this.region({ id: `${id}:${i}`, kind: 'tab', x: bx, y, w: bw, h, data: { index: i, key: id } });
    });
  }

  card(id, x, y, w, h, { title = '', sub = '', icon = 'grid', accent = PALETTE.accent, badge = '', right = '', selected = false, hoverable = true, footer = null, draw = null, rounded = 16 } = {}) {
    const c = this.ctx;
    const hot = hoverable && this.state.hover === id;
    const down = this.state.down === id;
    c.save();
    if (down) c.translate(0, 1.5);
    const bg = this.gradient(x, y, x + w, y + h, selected
      ? [[0, hexA(accent, 0.22)], [1, 'rgba(12,20,36,.92)']]
      : hot ? [[0, 'rgba(255,255,255,.10)'], [1, 'rgba(10,17,32,.9)']] : [[0, 'rgba(255,255,255,.05)'], [1, 'rgba(8,14,28,.88)']]);
    this.fillRR(x, y, w, h, rounded, bg, selected ? hexA(accent, 0.65) : hot ? PALETTE.line2 : 'rgba(150,205,255,.14)', selected ? 1.6 : 1);
    if (selected || hot) {
      c.globalCompositeOperation = 'lighter';
      this.glow(x + 30, y + 30, 60, accent, hot ? 0.14 : 0.09);
      c.restore(); c.save();
    }
    let ix = x + 18;
    if (icon) {
      c.save();
      this.fillRR(ix, y + 18, 38, 38, 12, hexA(accent, 0.16), hexA(accent, 0.4), 1);
      this.icon(icon, ix + 19, y + 37, 21, accent);
      c.restore();
      ix += 50;
    }
    if (title) this.text(title, ix, y + (sub ? 30 : 37), { size: 15.5, weight: 700 });
    if (sub) this.text(sub, ix, y + 48, { size: 11.5, color: PALETTE.ink3, maxWidth: w - (ix - x) - 20 });
    if (badge) {
      const bw = this.measure(badge, 10.5, 700) + 16;
      this.fillRR(x + w - bw - 16, y + 18, bw, 20, 10, hexA(accent, 0.18), hexA(accent, 0.45), 1);
      this.text(badge, x + w - bw / 2 - 16, y + 28.5, { size: 10.5, weight: 700, color: accent, align: 'center', letterSpacing: 0.6 });
    }
    if (right) this.text(right, x + w - 18, y + h / 2, { size: 12, color: PALETTE.ink2, align: 'right' });
    if (draw) { c.save(); draw(this, x, y, w, h, { hot, selected }); c.restore(); }
    if (footer) this.text(footer, x + 18, y + h - 18, { size: 11, color: PALETTE.ink3 });
    c.restore();
    if (hoverable) this.region({ id, kind: 'card', x, y, w, h, data: { selected } });
    return { hot, x, y, w, h };
  }

  progress(x, y, w, { value = 0, label = '', h = 8, color = PALETTE.accent } = {}) {
    const c = this.ctx;
    this.fillRR(x, y, w, h, h / 2, 'rgba(255,255,255,.06)');
    const v = clamp(value, 0, 1);
    if (v > 0.001) {
      c.save(); c.shadowColor = color; c.shadowBlur = 12;
      this.fillRR(x, y, Math.max(h, w * v), h, h / 2, this.gradient(x, 0, x + w, 0, [[0, color], [1, '#3f8dff']]));
      c.restore();
    }
    if (label) this.text(label, x + w, y - 8, { size: 11, color: PALETTE.ink3, align: 'right' });
  }

  stat(id, x, y, w, h, { label, value, unit = '', icon = 'bolt', color = PALETTE.accent, sub = '' } = {}) {
    const c = this.ctx;
    this.fillRR(x, y, w, h, 14, 'rgba(255,255,255,.04)', 'rgba(150,205,255,.13)', 1);
    if (icon) this.icon(icon, x + 22, y + 24, 17, color);
    this.text(String(label).toUpperCase(), x + 44, y + 24, { size: 10, weight: 700, color: PALETTE.ink3, letterSpacing: 1.3 });
    this.text(String(value), x + 18, y + h - 26, { size: 22, weight: 700, color });
    if (unit) this.text(unit, x + 18 + this.measure(String(value), 22, 700) + 6, y + h - 20, { size: 11, color: PALETTE.ink3 });
    if (sub) this.text(sub, x + w - 14, y + h - 20, { size: 10.5, color: PALETTE.ink3, align: 'right' });
  }

  chip(x, y, label, { color = PALETTE.accent, size = 10.5, pad = 9, active = false, id = null } = {}) {
    const c = this.ctx;
    const w = this.measure(label, size, 700) + pad * 2;
    this.fillRR(x, y - 9, w, 19, 9.5, active ? hexA(color, 0.9) : hexA(color, 0.14), active ? null : hexA(color, 0.4), 1);
    this.text(label, x + w / 2, y + 0.5, { size, weight: 700, color: active ? '#04121a' : color, align: 'center', letterSpacing: 0.4 });
    if (id) this.region({ id, kind: 'chip', x, y: y - 9, w, h: 19, data: { label } });
    return w;
  }

  /** Read a widget's current value by region id (slider / toggle / field / tabs). */
  value(id) {
    const r = this.regions.find((x) => x.id === id);
    if (!r) return null;
    return r.value ?? r.data?.value ?? r.data?.index ?? r.data?.checked ?? null;
  }
  /** All widget values keyed by region id. */
  values() {
    const out = {};
    for (const r of this.regions) { const v = this.value(r.id); if (v != null) out[r.id] = v; }
    return out;
  }

  list(id, x, y, w, rows, { rowH = 46, draw = null } = {}) {
    rows.forEach((r, i) => {
      const ry = y + i * rowH;
      const hot = this.state.hover === `${id}:${i}`;
      this.fillRR(x, ry, w, rowH - 6, 10, hot ? 'rgba(255,255,255,.075)' : 'rgba(255,255,255,.03)');
      if (draw) draw(this, r, x, ry, w, rowH - 6, i);
      this.region({ id: `${id}:${i}`, kind: 'row', x, y: ry, w, h: rowH, data: { row: r, index: i } });
    });
  }

  divider(x, y, w, { label = '' } = {}) {
    const c = this.ctx;
    c.strokeStyle = 'rgba(150,205,255,.14)'; c.lineWidth = 1;
    c.beginPath();
    if (label) {
      const lw = this.measure(label, 10.5, 700) + 14;
      c.moveTo(x, y + .5); c.lineTo(x + (w - lw) / 2, y + .5);
      c.moveTo(x + (w + lw) / 2, y + .5); c.lineTo(x + w, y + .5);
      c.stroke();
      this.text(label, x + w / 2, y, { size: 10.5, weight: 700, color: PALETTE.ink3, align: 'center', letterSpacing: 1.2 });
    } else { c.moveTo(x, y + .5); c.lineTo(x + w, y + .5); c.stroke(); }
  }

  field(id, x, y, w, h, { label = '', value = '', placeholder = 'digite…', focused = false, icon = 'keyboard' } = {}) {
    this.fillRR(x, y, w, h, 12, focused ? 'rgba(70,240,208,.10)' : 'rgba(255,255,255,.045)', focused ? hexA(PALETTE.accent, 0.7) : 'rgba(150,205,255,.16)', focused ? 1.6 : 1);
    let tx = x + 14;
    if (icon) { this.icon(icon, tx + 8, y + h / 2, 15, PALETTE.ink3); tx += 24; }
    if (label) { this.text(label, tx, y + h / 2, { size: 11, color: PALETTE.ink3, letterSpacing: 1 }); tx += this.measure(label, 11, 700) + 10; }
    this.text(value || placeholder, tx, y + h / 2, { size: 14, weight: 500, color: value ? PALETTE.ink : PALETTE.ink3, maxWidth: x + w - tx - 16 });
    if (focused) {
      const c = this.ctx;
      const blink = Math.sin(this.time * 6) > 0;
      if (blink) {
        const tw = this.measure(value || '', 14, 500);
        c.fillStyle = PALETTE.accent;
        c.fillRect(tx + Math.min(tw, x + w - tx - 16) + 3, y + h / 2 - 9, 2, 18);
      }
    }
    this.region({ id, kind: 'field', x, y, w, h, data: { value, placeholder } });
  }

  keys(id, x, y, w, { rows = null, size = 30 } = {}) {
    const layout = rows || [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l','_'],
      ['z','x','c','v','b','n','m',',','.','-']
    ];
    const gap = 5;
    const kw = (w - gap * (layout[0].length - 1)) / layout[0].length;
    layout.forEach((row, r) => {
      row.forEach((ch, c2) => {
        const kx = x + c2 * (kw + gap), ky = y + r * (size + gap);
        this.button(`${id}:${ch}`, kx, ky, kw, size, { label: ch, variant: 'ghost', size: 13 });
      });
    });
    return y + layout.length * (size + gap);
  }

  spark(x, y, w, h, values, { color = PALETTE.accent, fill = true, min = 0, max = 1 } = {}) {
    const c = this.ctx;
    if (!values?.length) return;
    const n = values.length;
    const dx = w / (n - 1 || 1);
    const norm = (v) => y + h - ((v - min) / (max - min || 1)) * h;
    c.save();
    c.beginPath();
    values.forEach((v, i) => (i ? c.lineTo(x + i * dx, norm(v)) : c.moveTo(x, norm(v))));
    if (fill) {
      c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath();
      c.fillStyle = this.gradient(x, y, x, y + h, [[0, hexA(color, 0.32)], [1, hexA(color, 0)]]);
      c.fill();
      c.beginPath();
      values.forEach((v, i) => (i ? c.lineTo(x + i * dx, norm(v)) : c.moveTo(x, norm(v))));
    }
    c.strokeStyle = color; c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke();
    c.restore();
  }

  scrollbar(y, h, { t = 0, thumb = 0.3 } = {}) {
    const x = this.w - 6;
    this.fillRR(x, y, 3, h, 2, 'rgba(255,255,255,.06)');
    const th = Math.max(24, h * clamp(thumb, 0.05, 1));
    const ty = y + t * (h - th);
    this.fillRR(x, ty, 3, th, 2, 'rgba(140,220,255,.5)');
  }

  ripple(x, y, r, color, alpha) {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = hexA(color, alpha);
    c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.stroke();
    c.restore();
  }

  footer(text, { icon } = {}) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = 0.75;
    this.text(text, this.w / 2, this.h - 16, { size: 11, color: PALETTE.ink3, align: 'center', letterSpacing: 0.4 });
    c.restore();
    if (icon) this.icon(icon, this.w / 2 - this.measure(text, 11) / 2 - 12, this.h - 16, 13, PALETTE.ink3);
  }
}

export function wrap(ctx, str, maxW, size, weight, font) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    out.push(line);
  }
  ctx.restore();
  return out;
}

/** #rrggbb / rgba() → rgba with alpha, for canvas fills. */
export function hexA(hex, a = 1) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    const nums = hex.match(/[\d.]+/g).map(Number);
    return `rgba(${nums[0]},${nums[1]},${nums[2]},${a})`;
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mixHex(a, b, t) {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
