import { PALETTE, hexA, MONO } from '../ui/kit.js';
import { settings } from '../core/settings.js';
import { clamp } from '../core/util.js';

export const DEFAULT_PROXY = 'https://api.allorigins.win/raw?url=';

function proxyFor(url) {
  const p = settings.get('readerProxy') ?? DEFAULT_PROXY;
  if (!p) return url;
  try {
    const sameOrigin = new URL(url, location.href).origin === location.origin;
    if (sameOrigin) return url;
  } catch { /* relative url */ }
  return p.includes('{url}') ? p.replace('{url}', encodeURIComponent(url)) : p + encodeURIComponent(url);
}

/**
 * Reader3D — the stereo-safe web surface.
 *
 * A cross-origin iframe cannot be duplicated into both eye buffers, so in VR Box
 * mode MetaPort fetches the document and re-composes it as native blocks (headings,
 * paragraphs, links, images, code) painted straight onto the panel texture. The
 * result is genuinely volumetric, readable at 4× supersampling, and pinch-scrollable.
 */
export class Reader3D {
  constructor(url) {
    this.url = url;
    this.finalUrl = url;
    this.title = '';
    this.byline = '';
    this.blocks = [];
    this.heights = new Map();
    this.loading = true;
    this.error = null;
    this.fetched = 0;
  }

  static async load(url) {
    const r = new Reader3D(url);
    const t0 = performance.now();
    try {
      const target = normalize(url);
      r.finalUrl = target;
      const res = await fetch(proxyFor(target), { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      r.parse(text, target);
    } catch (e) {
      r.error = `${e?.name || 'erro'}: ${e?.message || e}`;
      r.blocks = [{ type: 'p', text: `Não consegui ler esta página (${r.error}).\n\nDicas: (1) alguns sites bloqueiam leitores — abra em modo Realidade Mista (handheld) ou WebXR para usar o site real; (2) configure um proxy em Ajustes → Navegador; (3) verifique a URL.` }];
      r.title = 'leitor indisponível';
    }
    r.loading = false;
    r.fetched = performance.now() - t0;
    return r;
  }

  parse(html, base) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,svg,iframe,nav footer,form').forEach((n) => n.remove());
    this.title = clean(doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || '') || base;
    this.byline = clean(doc.querySelector('meta[property="og:site_name"]')?.content || doc.querySelector('meta[name="author"]')?.content || '') || new URL(abs(base, base)).hostname;
    const body = doc.body || doc.documentElement;
    const out = [];
    const walk = (el, depth = 0) => {
      for (const node of el.children) {
        const tag = node.tagName.toLowerCase();
        if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
          out.push({ type: 'h', level: +tag[1], text: clean(node.textContent) });
        } else if (tag === 'p') {
          const t = clean(node.textContent);
          if (t.length > 1) out.push({ type: 'p', text: t });
        } else if (tag === 'li') {
          const t = clean(node.textContent);
          const a = node.querySelector('a[href]');
          if (t.length > 1) out.push({ type: 'li', text: t.slice(0, 420), href: a ? abs(a.getAttribute('href'), base) : null });
        } else if (tag === 'img') {
          const src = node.getAttribute('src');
          if (src) out.push({ type: 'img', src: abs(src, base), alt: clean(node.getAttribute('alt') || '') });
        } else if (tag === 'a' && node.children.length === 0) {
          const t = clean(node.textContent);
          if (t.length > 1) out.push({ type: 'a', text: t.slice(0, 260), href: abs(node.getAttribute('href') || '', base) });
        } else if (tag === 'pre' || tag === 'code') {
          out.push({ type: 'code', text: (node.textContent || '').slice(0, 1400) });
        } else if (tag === 'blockquote') {
          out.push({ type: 'q', text: clean(node.textContent) });
        } else if (['article', 'section', 'main', 'div', 'ul', 'ol'].includes(tag) && depth < 4) {
          walk(node, depth + 1);
        }
        if (out.length > 260) return;
      }
    };
    walk(body);
    if (!out.length) {
      const t = clean(body.textContent || '');
      out.push({ type: 'p', text: t.slice(0, 6000) || 'Página sem texto extraível.' });
    }
    // collapse: keep a sane reading length
    this.blocks = out.filter((b) => b.text || b.src).slice(0, 220);
    this.links = out.filter((b) => b.href);
  }

  measure(kit, w) {
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      kit.ctx.save();
      let h = 0;
      if (b.type === 'h') h = (b.level === 1 ? 27 : b.level === 2 ? 21 : 17) * 1.55;
      else if (b.type === 'code') h = Math.min(240, 18 * (b.text.split('\n').length + 1) + 22);
      else if (b.type === 'img') h = 8;
      else {
        const size = b.type === 'p' ? 14.5 : 13.5;
        const lines = wrapLines(kit.ctx, b.text, w - (b.type === 'li' ? 34 : 24), size, b.type === 'q' ? 500 : 400);
        h = lines.length * size * 1.5 + (b.type === 'q' ? 20 : 12);
      }
      kit.ctx.restore();
      this.heights.set(i, h);
    }
    let total = 96;
    for (const h of this.heights.values()) total += h + 10;
    this.contentH = total;
    return total;
  }

  /** Draws blocks inside rect; registers link regions so pinch can navigate. */
  draw(kit, rect, { scroll = 0 } = {}) {
    const c = kit.ctx;
    const W = rect.w;
    let y = rect.y - 4;
    // article header
    c.save();
    kit.fillRR(rect.x, y, W, 72, 12, 'rgba(255,255,255,.035)', 'rgba(150,205,255,.14)', 1);
    kit.text(this.title || this.url, rect.x + 16, y + 26, { size: 19, weight: 800, maxWidth: W - 32 });
    kit.text(`${this.byline} · ${this.blocks.length} blocos · ${Math.round(this.fetched)}ms`, rect.x + 16, y + 52, { size: 10.5, color: PALETTE.ink3, letterSpacing: 1 });
    c.restore();
    y += 84;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const h = this.heights.get(i) || 24;
      if (y + h > scroll - 40 && y < scroll + rect.h + 40) {
        if (b.type === 'h') {
          const size = b.level === 1 ? 27 : b.level === 2 ? 21 : 17;
          c.fillStyle = hexA(PALETTE.accent, 0.7);
          c.fillRect(rect.x + 2, y + 4, 3, size);
          kit.text(b.text, rect.x + 14, y + size / 2, { size, weight: 800, maxWidth: W - 24 });
          y += size * 1.25 + 6;
        } else if (b.type === 'p' || b.type === 'q') {
          if (b.type === 'q') {
            kit.fillRR(rect.x + 10, y - 2, W - 20, h - 8, 10, 'rgba(120,200,255,.05)', 'rgba(120,200,255,.16)', 1);
            kit.text(b.text, rect.x + 24, y + 12, { size: 13.5, weight: 500, color: '#cfe6f8', maxWidth: W - 46, lh: 1.5 });
          } else {
            kit.text(b.text, rect.x + 8, y + 8, { size: 14.5, weight: 400, color: '#dbe9f7', maxWidth: W - 20, lh: 1.5 });
          }
          y += h;
        } else if (b.type === 'li') {
          const hot = kit.state.hover === `rd:${i}`;
          if (hot) kit.fillRR(rect.x + 6, y - 6, W - 12, 30, 8, 'rgba(255,255,255,.06)');
          c.fillStyle = hexA(PALETTE.accent, hot ? 1 : 0.6);
          c.beginPath(); c.arc(rect.x + 16, y + 6, 3, 0, 6.2832); c.fill();
          kit.text(b.text, rect.x + 28, y + 6, { size: 13.5, weight: b.href ? 600 : 400, color: b.href ? '#bfe9ff' : PALETTE.ink2, maxWidth: W - 44, lh: 1.45 });
          y += 28;
          if (b.href) kit.region({ id: `rd:${i}`, kind: 'link', x: rect.x + 6, y: y - 30, w: W - 12, h: 30, data: { href: b.href, reader: true } });
        } else if (b.type === 'a') {
          const hot = kit.state.hover === `rd:${i}`;
          kit.text(b.text, rect.x + 14, y + 4, { size: 13.5, weight: 700, color: hot ? '#8ff6ff' : PALETTE.accent, maxWidth: W - 30 });
          kit.region({ id: `rd:${i}`, kind: 'link', x: rect.x + 8, y: y - 6, w: W - 12, h: 22, data: { href: b.href, reader: true } });
          y += 24;
        } else if (b.type === 'code') {
          const lines = b.text.split('\n').slice(0, 12);
          kit.fillRR(rect.x + 8, y - 4, W - 16, lines.length * 17 + 16, 8, 'rgba(0,0,0,.4)', 'rgba(150,205,255,.14)', 1);
          lines.forEach((ln, li) => kit.text(ln.slice(0, 140), rect.x + 20, y + 10 + li * 17, { size: 11.5, font: MONO, color: '#b7ffd9' }));
          y += lines.length * 17 + 22;
        } else if (b.type === 'img') {
          y += 4;
        }
      } else {
        y += h;
      }
      y += 10;
    }
  }
}

export function normalize(url) {
  const u = String(url || '').trim();
  if (!u) return 'about:blank';
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('blob:') || u.startsWith('data:')) return u;
  if (u.includes('.') && !u.includes(' ')) return 'https://' + u;
  const engine = settings.get('searchEngine');
  const map = {
    duckduckgo: 'https://html.duckduckgo.com/html/?q=',
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    mdn: 'https://developer.mozilla.org/en-US/search?q='
  };
  return (map[engine] || map.duckduckgo) + encodeURIComponent(u);
}

export function abs(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

export function clean(t = '') {
  return String(t).replace(/\s+/g, ' ').trim();
}

export function wrapLines(ctx, text, maxW, size, weight = 400) {
  ctx.save();
  ctx.font = `${weight} ${size}px "Inter", system-ui, sans-serif`;
  const out = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
    else line = test;
    if (out.length > 40) break;
  }
  if (line) out.push(line);
  ctx.restore();
  return out;
}
