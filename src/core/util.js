/** Minimal event emitter used across the runtime and exposed to the Script API. */
export class Emitter {
  constructor() { this._m = new Map(); }
  on(type, fn) {
    if (!this._m.has(type)) this._m.set(type, new Set());
    this._m.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }
  off(type, fn) { this._m.get(type)?.delete(fn); }
  emit(type, ...args) {
    const s = this._m.get(type);
    if (!s) return 0;
    for (const fn of [...s]) {
      try { fn(...args); } catch (err) { console.error(`[event:${type}]`, err); }
    }
    return s.size;
  }
}

let toastTimer = null;
/** Transient 2D-free notice channel: toasts are also mirrored into the 3D HUD. */
export function toast(msg, kind = 'info', ms = 2600) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind !== 'info' ? ' ' + kind : '');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, ms);
  setTimeout(() => el.remove(), ms + 400);
  while (host.children.length > 3) host.firstChild.remove();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, ms + 500);
  globalThis.META?.bus?.emit('toast', { msg, kind });
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** Exponential smoothing that tolerates frame gaps (used for pose/landmark filtering). */
export function smoother(factor = 0.35) {
  let last = null;
  return (v, f = factor) => {
    last = last === null ? v : last + (v - last) * f;
    return last;
  };
}
export function resetSmoother() { /* helper kept for API symmetry */ }

export function formatBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function now() { return performance.now(); }
