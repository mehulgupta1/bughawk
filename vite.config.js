import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react(), jsProxyPlugin()],
});
