#!/usr/bin/env node
/**
 * MetaPort — dist → Android assets
 *
 * Copies the built web app into the WebView wrapper's asset folder. Run after
 * `npm run build`. The APK then contains the whole experience (no network).
 *
 *   node scripts/sync-android.mjs [--src dist] [--out android/app/src/main/assets/www]
 */
import { cp, rm, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const SRC = path.resolve(ROOT, arg('src', 'dist'));
const OUT = path.resolve(ROOT, arg('out', 'android/app/src/main/assets/www'));

async function exists(p) { try { return (await stat(p)).isDirectory(); } catch { return false; } }
async function du(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await du(p) : (await stat(p)).size;
  }
  return total;
}

if (!await exists(SRC)) {
  console.error(`✗ ${path.relative(ROOT, SRC)} não existe. Rode antes:  npm run build`);
  process.exit(1);
}

console.log(`→ copiando ${path.relative(ROOT, SRC)}  ⇒  ${path.relative(ROOT, OUT)}`);
await rm(OUT, { recursive: true, force: true });
await mkdir(path.dirname(OUT), { recursive: true });
await cp(SRC, OUT, { recursive: true });

// WebViewAssetLoader refuses to serve a directory listing; a tiny index marker
// also makes sure an empty copy fails loudly in CI instead of shipping a
// blank app.
const index = path.join(OUT, 'index.html');
try {
  const s = await stat(index);
  if (s.size < 200) throw new Error('index.html suspostamente vazio');
} catch {
  console.error('✗ index.html ausente no bundle copiado — build quebrado.');
  process.exit(1);
}

const bytes = await du(OUT);
const files = (await readdir(SRC, { recursive: true })).length;
console.log(`✓ ${files} arquivos, ${(bytes / 1048576).toFixed(2)} MB em ${path.relative(ROOT, OUT)}`);
