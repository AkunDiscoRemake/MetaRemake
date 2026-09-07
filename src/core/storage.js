import { hash } from './util.js';

/** Namespaced persistence. On Android this lands in the WebView's localStorage. */
const NS = 'metaport:';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('storage full?', e);
      return false;
    }
  },
  remove(key) { try { localStorage.removeItem(NS + key); } catch { /* ignore */ } },
  keys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) out.push(k.slice(NS.length));
    }
    return out;
  },
  exportAll() {
    const obj = {};
    for (const k of this.keys()) obj[k] = this.get(k);
    return obj;
  },
  wipe() { for (const k of this.keys()) this.remove(k); },
  usage() {
    let n = 0;
    for (const k of this.keys()) n += (localStorage.getItem(NS + k) || '').length;
    return n * 2;
  }
};

/**
 * Per-app scratch storage so Script API apps can't stomp on each other.
 * Works both as a whole bucket (get()/set(obj)) and with named keys
 * (get('strokes', []) / set('lifes', 3)) — every value lives in one JSON blob.
 */
export function scopedStore(appId) {
  const key = `app:${appId}`;
  const all = () => store.get(key, {}) || {};
  return {
    get(name = undefined, fallback = null) {
      if (name === undefined) return store.get(key, fallback ?? {});
      const obj = all();
      return Object.prototype.hasOwnProperty.call(obj, name) ? obj[name] : fallback;
    },
    set(name, value) {
      if (typeof name === 'object' && name !== null) return store.set(key, Object.assign(all(), name));
      const obj = all();
      obj[name] = value;
      return store.set(key, obj);
    },
    patch(v) { return store.set(key, Object.assign(all(), v)); },
    remove(name) { const obj = all(); delete obj[name]; return store.set(key, obj); },
    keys() { return Object.keys(all()); },
    clear() { store.remove(key); }
  };
}

export function seededRandom(appId) {
  let s = hash(String(appId)) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
