// Generates large, realistic test data for every BugHawk import feature.
// Run: node test-data/generate.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'test-data'; // run from the project root
const w = (name, gen) => {
  const p = path.join(OUT, name);
  const s = fs.createWriteStream(p);
  gen((line) => s.write(line));
  s.end();
  console.log('wrote', name);
};

const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
const STATUS = [200, 200, 200, 301, 302, 403, 404, 500, 401, 503];
const TECH = ['nginx', 'Apache', 'PHP', 'WordPress', 'React', 'Tomcat', 'Express', 'Cloudflare', 'IIS', 'GraphQL'];
const TITLES = ['Login', 'Dashboard', 'API', 'Admin Panel', 'Home', 'Forbidden', 'Not Found', 'Staging', 'Dev Portal', 'Grafana'];
// A few CNAMEs that look like takeover candidates so that feature has data.
const CNAMES = ['', '', '', '', 'abc.s3.amazonaws.com', 'proj.github.io', 'app.herokuapp.com', 'x.azurewebsites.net', 'shop.myshopify.com'];

// 1) Subdomains — httpx JSONL, 100k
w('subdomains_100k.jsonl', (out) => {
  for (let i = 0; i < 100000; i++) {
    const host = `sub${i}.${pick(['acme', 'example', 'target', 'corp', 'shop'])}.com`;
    const o = {
      url: `https://${host}`,
      status_code: pick(STATUS),
      title: pick(TITLES),
      tech: [pick(TECH), pick(TECH)],
      content_length: rand(50000),
      host: `${rand(255)}.${rand(255)}.${rand(255)}.${rand(255)}`,
      cname: pick(CNAMES),
      webserver: pick(TECH),
    };
    out(JSON.stringify(o) + '\n');
  }
});

// 2) URLs — 100k, with params/secrets/extensions for the URL Parser
w('urls_100k.txt', (out) => {
  const params = ['id', 'redirect', 'url', 'token', 'api_key', 'file', 'page', 'q', 'callback', 'debug'];
  const exts = ['', '', '.js', '.php', '.json', '.bak', '.zip', '.env', '.sql', '.config'];
  for (let i = 0; i < 100000; i++) {
    const host = `sub${rand(5000)}.example.com`;
    const p = pick(params);
    const secret = p === 'api_key' || p === 'token' ? `AKIA${rand(1e9)}X${rand(1e6)}` : rand(100000);
    out(`https://${host}/path${rand(9000)}/endpoint${pick(exts)}?${p}=${secret}&page=${rand(50)}\n`);
  }
});

// 3) Ports — masscan/naabu JSON lines, 50k host:port pairs
w('ports_50k.json', (out) => {
  const svc = ['ssh', 'http', 'https', 'ftp', 'mysql', 'redis', 'smtp', 'rdp', 'telnet', 'postgres'];
  const ports = [22, 80, 443, 21, 3306, 6379, 25, 3389, 23, 5432, 8080, 8443, 9200];
  for (let i = 0; i < 50000; i++) {
    const ip = `10.${rand(255)}.${rand(255)}.${rand(255)}`;
    out(JSON.stringify({ ip, port: pick(ports), service: pick(svc) }) + '\n');
  }
});

// 4) Assets — mixed dump (hosts + urls + js files), smart-import routes each
w('assets_mixed_60k.txt', (out) => {
  for (let i = 0; i < 60000; i++) {
    const r = rand(3);
    if (r === 0) out(`asset${i}.example.com\n`);
    else if (r === 1) out(`https://cdn${rand(2000)}.example.com/app/bundle${rand(9000)}.js\n`);
    else out(`https://api${rand(2000)}.example.com/v2/resource${rand(9000)}?id=${rand(9999)}\n`);
  }
});

// 5) JS Recon — one big JS file (~1.5MB) with secrets, keys, endpoints
w('bigscript.js', (out) => {
  out(`// bundle.js\nconst AWS_KEY="AKIAIOSFODNN7EXAMPLE";\nconst GOOGLE="AIzaSyA-1234567890abcdefghijklmnopqrstuv";\n`);
  out(`const JWT="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123";\nconst STRIPE="sk_live_${'x'.repeat(24)}";\n`);
  for (let i = 0; i < 20000; i++) {
    out(`fetch("/api/v${rand(3)}/users/${i}/profile?token="+t${i});\n`);
    out(`const ep${i} = "https://api.internal-${rand(50)}.example.com/graphql";\n`);
    if (i % 500 === 0) out(`const key${i}="sk_test_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}";\n`);
  }
  out(`//# sourceMappingURL=bundle.js.map\n`);
});

// 6) Nuclei findings — JSONL for the Attack Surface tab, 5k
w('nuclei_5k.jsonl', (out) => {
  const sev = ['info', 'low', 'medium', 'high', 'critical'];
  const names = ['exposed-panel', 'cve-2021-44228', 'git-config', 'open-redirect', 'ssrf', 'xss-reflected'];
  for (let i = 0; i < 5000; i++) {
    const host = `sub${rand(100000)}.example.com`;
    out(JSON.stringify({ host, 'matched-at': `https://${host}/x`, info: { name: pick(names), severity: pick(sev) }, 'template-id': pick(names) }) + '\n');
  }
});

// 7) HTTP Analyzer — a raw request/response with weak headers + a secret
w('http_sample.txt', (out) => {
  out([
    'GET /api/account HTTP/1.1',
    'Host: target.com',
    'Cookie: session=abcdef123456; token=AKIAIOSFODNN7EXAMPLE',
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    '',
    'HTTP/1.1 200 OK',
    'Server: nginx/1.18.0',
    'Access-Control-Allow-Origin: *',
    'Set-Cookie: session=xyz; path=/',
    'X-Powered-By: PHP/7.4.3',
    'Content-Type: application/json',
    '',
    '{"user":"admin","apiKey":"AIzaSyA-1234567890abcdefghijklmnop","internal_ip":"10.0.0.5"}',
  ].join('\n'));
});

// 8) Wordlist — 100k entries
w('wordlist_100k.txt', (out) => {
  const words = ['admin', 'api', 'backup', 'config', 'dev', 'test', 'staging', 'internal', 'old', 'tmp', 'login', 'upload'];
  for (let i = 0; i < 100000; i++) out(`${pick(words)}/${pick(words)}${rand(9999)}\n`);
});

console.log('\nDone. Files are in test-data/');
