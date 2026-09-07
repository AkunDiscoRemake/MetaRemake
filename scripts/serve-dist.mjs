#!/usr/bin/env node
/**
 * MetaPort — static server for the production bundle.
 *
 * Serves `dist/` over http://0.0.0.0:PORT with the exact permissions the app
 * needs (camera + a permissive enough policy to load module scripts and CDN
 * assets). Useful to test the real build before packaging:
 *
 *   npm run build && npm run preview [--port 4173]
 *
 * Over https (needed for getUserMedia outside localhost):
 *   npm run preview -- --https        # uses ./certs/{key,cert}.pem
 */
import http from 'node:http';
import https from 'node:https';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split('=')[1] : dflt;
};
const useTls = process.argv.includes('--https');
const PORT = +arg('port', process.env.PORT || 4173);
const HOST = arg('host', '0.0.0.0');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.gz': 'application/gzip', '.map': 'application/json'
};

function resolve(target) {
  const clean = decodeURIComponent(target.split('?')[0].replace(/\0/g, ''));
  let p = path.normalize(path.join(DIST, clean));
  if (!p.startsWith(DIST)) return null;
  if (existsSync(p) && statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!existsSync(p) && !path.extname(p)) {
    const spa = path.join(DIST, 'index.html');
    if (existsSync(spa)) return spa;
  }
  return existsSync(p) ? p : null;
}

const handler = (req, res) => {
  const file = resolve(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 — rode `npm run build` antes de servir dist/');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': cache,
    // camera access requires a secure context; this header set mirrors the dev server
    'permissions-policy': 'camera=(*), microphone=(*), display-capture=(*), fullscreen=(*)',
    'cross-origin-embedder-policy': 'unsafe-none',
    'referrer-policy': 'no-referrer-when-downgrade'
  });
  createReadStream(file).pipe(res);
};

const server = useTls
  ? https.createServer({
      key: readFileSync(path.join(ROOT, 'certs/key.pem')),
      cert: readFileSync(path.join(ROOT, 'certs/cert.pem'))
    }, handler)
  : http.createServer(handler);

if (useTls && !existsSync(path.join(ROOT, 'certs/key.pem'))) {
  console.error('✗ --https exige ./certs/key.pem e ./certs/cert.pem (gere com mkcert).');
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`MetaPort (build) → ${useTls ? 'https' : 'http'}://${shown}:${PORT}`);
  console.log(`  raiz: ${path.relative(ROOT, DIST) || '.'}`);
  console.log('  Ctrl+C para sair');
});
