// Production server for the recon dashboard — zero dependencies (Node built-ins).
// Serves the built app from dist/ AND the same-origin /__jsproxy used by JS Recon
// (server-side fetch → no CORS). Bound to localhost = private to this machine.
//
//   node server.mjs            # serves http://localhost:5050
//   PORT=8080 node server.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 5050;
const HOST = process.env.HOST || '127.0.0.1'; // localhost only; set 0.0.0.0 for LAN/Tailscale
const MAX = 25 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

async function proxy(req, res) {
  const u = new URL(req.url, 'http://x').searchParams.get('url');
  res.setHeader('Cache-Control', 'no-store');
  if (!u || !/^https?:\/\//i.test(u)) { res.statusCode = 400; return res.end('bad url'); }
  try {
    const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (jsrecon)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) { res.statusCode = 413; return res.end('too large'); }
    res.statusCode = r.ok ? 200 : r.status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(buf);
  } catch (e) { res.statusCode = 502; res.end('fetch failed: ' + (e?.message || e)); }
}

async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  // resolve safely within ROOT; fall back to index.html for SPA routes / 404s
  let file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) file = join(ROOT, 'index.html');
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(ROOT, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('not found');
  }
}

createServer((req, res) => {
  if (req.url.startsWith('/__jsproxy')) return proxy(req, res);
  return serveStatic(req, res);
}).listen(PORT, HOST, () => {
  console.log(`recon dashboard -> http://localhost:${PORT}  (private, ${HOST})`);
});
