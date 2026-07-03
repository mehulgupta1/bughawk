import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Dev-only: receive telemetry beacons (src/lib/telemetry.js) and append them to
// perf.log at the project root, so per-tab timings / jank / errors are readable
// as a file instead of screenshots. Truncates on session-start to keep the log
// scoped to the latest run.
function perfLogPlugin() {
  const file = fileURLToPath(new URL('./perf.log', import.meta.url));
  const handler = (req, res, next) => {
    if (req.url !== '/__perf' || req.method !== 'POST') return next();
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        // Append a marker on reload instead of truncating, so history survives
        // page reloads (we were losing the import/error entries we needed).
        if (body.includes('"kind":"session-start"')) fs.appendFileSync(file, '\n=== SESSION RELOAD ===\n');
        fs.appendFileSync(file, body);
      } catch { /* best effort */ }
      res.statusCode = 204;
      res.end();
    });
  };
  return {
    name: 'perf-log',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

// Same-origin JS proxy: the browser hits /__jsproxy?url=<remote .js>, Vite fetches
// it server-side (Node, no CORS) and streams it back. Lets JS Recon pull any
// target's JS straight from the browser. Active in `vite dev` and `vite preview`.
function jsProxyPlugin() {
  const MAX = 25 * 1024 * 1024; // skip absurdly large files
  const handler = async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/__jsproxy')) return next();
    const u = new URL(req.url, 'http://localhost').searchParams.get('url');
    res.setHeader('Cache-Control', 'no-store');
    if (!u || !/^https?:\/\//i.test(u)) { res.statusCode = 400; return res.end('bad url'); }
    try {
      const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (jsrecon)' } });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX) { res.statusCode = 413; return res.end('too large'); }
      res.statusCode = r.ok ? 200 : r.status;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(buf);
    } catch (e) {
      res.statusCode = 502;
      return res.end('fetch failed: ' + (e && e.message ? e.message : e));
    }
  };
  return {
    name: 'js-recon-proxy',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  base: '/bughawk/', // GitHub Pages base path
  plugins: [react(), jsProxyPlugin(), perfLogPlugin()],
  build: {
    rollupOptions: {
      output: {
        // Split React into its own long-cached chunk; app code + lazy tabs
        // (see App.jsx) get their own chunks so first paint doesn't parse
        // every tab. Workers are bundled separately by Vite already.
        manualChunks(id) {
          if (/node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});
