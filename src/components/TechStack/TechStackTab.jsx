import { memo, useEffect, useMemo, useState } from 'react';
import { detectFromResponse, detectFromRecord, STACK_CATEGORIES } from '../../lib/techstack.js';
import { get, KEYS } from '../../lib/storage.js';
import { hostOf } from '../../lib/graph.js';

const CAT_META = {
  frontend: ['🎨', 'Frontend'], backend: ['⚙️', 'Backend'], database: ['🗄️', 'Database'],
  cms: ['📰', 'CMS'], server: ['🖥️', 'Server'], cdn: ['🌐', 'CDN'], waf: ['🛡️', 'WAF'],
  cloud: ['☁️', 'Cloud'], analytics: ['📊', 'Analytics / 3rd-party'],
};

const TechStackTab = memo(function TechStackTab({ records = [], activeProjectId = 'default' }) {
  const [raw, setRaw] = useState('');
  const [host, setHost] = useState('');
  const [result, setResult] = useState(null);
  const [urlsByHost, setUrlsByHost] = useState({});

  // Pull every parsed URL for the project so stored detection sees paths/domains
  // (s3/cloudfront/_next/wp-content/graphql…), not just server/title/tech.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = await get(KEYS.urlLastScan(activeProjectId), null);
      if (cancelled) return;
      const m = {};
      for (const r of (last && last.parsedData) || []) {
        const h = hostOf(r.url);
        if (!h) continue;
        (m[h] = m[h] || []).push(r.original || r.url);
      }
      setUrlsByHost(m);
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const hostList = useMemo(
    () => [...new Set([...records.map((r) => r.host), ...Object.keys(urlsByHost)].filter(Boolean))].sort(),
    [records, urlsByHost],
  );

  // Never render 100k <option>s — show at most 50 suggestions, filtered by what's typed.
  const hostSuggestions = useMemo(() => {
    const q = host.trim().toLowerCase();
    const src = q ? hostList.filter((h) => h.toLowerCase().includes(q)) : hostList;
    return src.slice(0, 50);
  }, [host, hostList]);

  const detect = () => setResult(detectFromResponse(raw));
  const detectStored = () => {
    if (!host) return;
    const rec = records.find((r) => r.host === host) || { host };
    const extra = (urlsByHost[host] || []).join('\n');
    setResult(detectFromRecord(rec, extra));
  };

  const grouped = useMemo(() => {
    if (!result) return [];
    const m = {};
    for (const d of result) { (m[d.cat] = m[d.cat] || []).push(d); }
    return STACK_CATEGORIES.filter((c) => m[c]).map((c) => [c, m[c]]);
  }, [result]);

  return (
    <div className="ts-wrap">
      <style>{styles}</style>
      <header className="ts-head">
        <div>
          <h1>🧱 Tech Stack Detector</h1>
          <p>Fingerprint frontend · backend · server · CDN · WAF · CMS · cloud · DB from a response</p>
        </div>
      </header>

      <section className="ts-panel">
        <div className="ts-stored">
          <span>Detect from stored recon:</span>
          <input
            className="ts-in"
            list="ts-host-suggestions"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={`type a host (${hostList.length.toLocaleString()} known)…`}
            spellCheck="false"
            style={{ minWidth: 280 }}
          />
          <datalist id="ts-host-suggestions">
            {hostSuggestions.map((h) => <option key={h} value={h} />)}
          </datalist>
          <button className="ts-btn" onClick={detectStored} disabled={!host}>Detect</button>
          <span className="ts-hint">{host && urlsByHost[host] ? `analyzes server/title/tech + ${urlsByHost[host].length} parsed URLs` : 'analyzes all stored recon for the host'}</span>
        </div>
        <div className="ts-or">— or paste a full response (headers + body) for even more —</div>
        <textarea
          className="ts-area"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck="false"
          wrap="off"
          placeholder={'HTTP/1.1 200 OK\nServer: nginx/1.18.0\nX-Powered-By: Express\nCF-RAY: ...\nSet-Cookie: ...\n\n<html> ... full body / JS references ...'}
        />
        <button className="ts-btn ts-primary" onClick={detect}>Detect stack</button>
      </section>

      {result && (
        <section className="ts-results">
          {grouped.length === 0 && <div className="ts-empty">No technologies fingerprinted. Paste headers + body (or JS references) for more signal.</div>}
          {grouped.map(([cat, items]) => (
            <div key={cat} className="ts-cat">
              <div className="ts-cat-h">{CAT_META[cat][0]} {CAT_META[cat][1]}</div>
              <div className="ts-items">
                {items.map((d, i) => (
                  <span key={i} className="ts-item">
                    {d.name}{d.version ? <b className="ts-ver">{d.version}</b> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
});

const styles = `
.ts-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); max-width: none; }
.ts-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.ts-head p { margin: 2px 0 var(--sp-4); font-size: 13px; color: var(--text2); }
.ts-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-4); margin-bottom: var(--sp-4); }
.ts-stored { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--text2); }
.ts-or { text-align: center; color: var(--text3); font-size: 12px; margin: 12px 0; }
.ts-in { padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.ts-hint { color: var(--text3); font-size: 11px; }
.ts-area { width: 100%; box-sizing: border-box; min-height: 200px; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 12px; outline: none; resize: vertical; white-space: pre; }
.ts-area:focus { border-color: var(--border-active); }
.ts-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 16px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; }
.ts-btn:disabled { opacity: .5; cursor: default; }
.ts-primary { background: var(--grad); color: #fff; border: none; font-weight: 600; margin-top: 10px; }
.ts-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-3); }
.ts-cat { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
.ts-cat-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--accent-primary-bright); margin-bottom: 8px; }
.ts-items { display: flex; flex-wrap: wrap; gap: 6px; }
.ts-item { font-size: 12px; background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 4px 10px; border-radius: 999px; }
.ts-ver { color: var(--accent-primary-bright); margin-left: 5px; font-family: var(--font-data); }
.ts-empty { color: var(--text2); font-style: italic; }
`;

export default TechStackTab;
