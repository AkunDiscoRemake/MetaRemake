#!/usr/bin/env node
/**
 * MetaPort — asset fetcher
 *
 * Downloads the MediaPipe HandLandmarker model + WASM runtime into `public/`,
 * so the built app (and therefore the APK) works completely offline.
 * Re-runs are cheap: existing files are kept unless --force.
 *
 *   node scripts/fetch-assets.mjs [--force]
 */
import { mkdir, stat, writeFile, rename, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gunzip);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_WASM = path.join(ROOT, 'public', 'wasm');
const OUT_MODELS = path.join(ROOT, 'public', 'models');
const MP_VERSION = process.env.MEDIAPIPE_VERSION || '0.10.14';
const FORCE = process.argv.includes('--force');

/** Where to try each file, in order. The first working mirror wins. */
const SOURCES = {
  'wasm/vision_wasm_internal.js': [
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_internal.js`,
    `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_internal.js`
  ],
  'wasm/vision_wasm_internal.wasm': [
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_internal.wasm`,
    `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_internal.wasm`
  ],
  'wasm/vision_wasm_nosimd_internal.js': [
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_nosimd_internal.js`,
    `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_nosimd_internal.js`
  ],
  'wasm/vision_wasm_nosimd_internal.wasm': [
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_nosimd_internal.wasm`,
    `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}/wasm/vision_wasm_nosimd_internal.wasm`
  ],
  'models/hand_landmarker.task': [
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/model/hand_landmarker.task'
  ],
};

/** Last-ditch: some CI egress filters allow the gzipped model only. */
const MODEL_GZ = ['https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'];

/** Files copied straight from the installed npm package when network fails. */
const LOCAL_FALLBACK = {
  'wasm/vision_wasm_internal.js': `node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js`,
  'wasm/vision_wasm_internal.wasm': `node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm`,
  'wasm/vision_wasm_nosimd_internal.js': `node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js`,
  'wasm/vision_wasm_nosimd_internal.wasm': `node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm`
};

async function size(p) { try { return (await stat(p)).size; } catch { return -1; } }

async function download(url, timeoutMs = 90000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('resposta vazia');
    return buf;
  } finally { clearTimeout(t); }
}

async function grab(rel, urls) {
  const dest = path.join(ROOT, 'public', rel);
  const have = await size(dest);
  if (have > 0 && !FORCE) { console.log(`· ${rel} já existe (${fmt(have)})`); return true; }
  await mkdir(path.dirname(dest), { recursive: true });

  for (const url of urls) {
    try {
      process.stdout.write(`↓ ${rel}  ${shorten(url)} … `);
      const buf = await download(url);
      const tmp = `${dest}.part`;
      await writeFile(tmp, buf);
      await rename(tmp, dest);
      console.log(`ok (${fmt(buf.length)})`);
      return true;
    } catch (e) {
      console.log(`falhou: ${e.message}`);
    }
  }

  const local = LOCAL_FALLBACK[rel];
  if (local) {
    const src = path.join(ROOT, local);
    if (existsSync(src)) {
      const buf = await readFile(src);
      await writeFile(dest, buf);
      console.log(`· ${rel} copiado do pacote npm (${fmt(buf.length)})`);
      return true;
    }
  }
  console.warn(`⚠  ${rel}: não foi possível baixar — o app vai usar o CDN em tempo de execução.`);
  return false;
}

/**
 * Some mirrors refuse big binaries; the MediaPipe model is also served gzipped.
 * If the raw download failed we accept a .gz and inflate it.
 */
async function ensureModel() {
  const dest = path.join(OUT_MODELS, 'hand_landmarker.task');
  if (await size(dest) > 1_000_000) return;
  const gz = path.join(OUT_MODELS, 'hand_landmarker.task.gz');
  if (await size(gz) > 100_000) {
    try {
      await writeFile(dest, await gzip(await readFile(gz)));
      console.log('· hand_landmarker.task descomprimido do .gz');
    } catch { /* leave as-is */ }
  }
}

const fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1048576).toFixed(1)} MB`;
const shorten = (u) => u.replace(/^https?:\/\//, '').replace(/@[\d.]+\//, '@x/');

await mkdir(OUT_WASM, { recursive: true });
await mkdir(OUT_MODELS, { recursive: true });

for (const [rel, urls] of Object.entries(SOURCES)) {
  const ok = await grab(rel, urls);
  if (!ok && rel === 'models/hand_landmarker.task') {
    if (await grab('models/hand_landmarker.task.gz', MODEL_GZ)) await ensureModel();
  }
}
await ensureModel();

const needed = ['wasm/vision_wasm_internal.wasm', 'models/hand_landmarker.task'];
const missing = [];
for (const n of needed) if ((await size(path.join(ROOT, 'public', n))) <= 0) missing.push(n);
if (missing.length) {
  console.error(`\n✗ faltam assets essenciais: ${missing.join(', ')}`);
  console.error('  (o app ainda funciona via CDN — só não funciona offline)');
  process.exitCode = 0;   // not fatal for the build
} else {
  console.log('\n✓ assets de hand tracking prontos em public/');
}
