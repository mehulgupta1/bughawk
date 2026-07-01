import { memo, useEffect, useRef, useState } from 'react';
import { getSevColor } from '../UrlParser/engine.js';
import { useProjectValue } from '../../hooks/useProjectValue.js';
import { KEYS } from '../../lib/storage.js';
import { reconCommands } from '../../lib/reconcommands.js';
import { exportJsReconReport, exportJson } from '../../lib/exporter.js';

const PAGE = 50; // results per page

const ORDER = ['secrets', 'misconfigs', 'juicy', 'framework', 'chunks', 'sourcemaps', 'urls', 'endpoints', 'paths', 'params', 'domains', 'graphql', 'environment', 'versions', 'hardcodedIds', 'errors'];
const LABEL = {
  secrets: 'Secrets', misconfigs: 'Misconfigs', juicy: 'Juicy', framework: 'Framework', chunks: 'Chunks',
  sourcemaps: 'Source maps', urls: 'URLs', endpoints: 'Endpoints', paths: 'Paths', params: 'Params',
  domains: 'Domains', graphql: 'GraphQL', environment: 'Environment', versions: 'Versions', hardcodedIds: 'IDs', errors: 'Errors',
};
// per-file sections (errors are global)
const SECS = ORDER.filter((k) => k !== 'errors');
const STR_KEYS = ['urls', 'endpoints', 'paths', 'params', 'domains', 'graphql', 'chunks', 'sourcemaps', 'environment', 'versions', 'framework', 'hardcodedIds'];
const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const NW = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));

function aggregate(parts) {
  const bySource = [], errors = [];
  const secrets = new Map(), misconfigs = new Map(), juicy = new Map();
  const sets = Object.fromEntries(STR_KEYS.map((k) => [k, new Set()]));
  for (const p of parts) {
    errors.push(...p.errors);
    for (const f of p.bySource) {
      bySource.push(f);
      for (const k of STR_KEYS) for (const v of (f[k] || [])) sets[k].add(v);
      for (const s of f.secrets) { const key = s.type + '\0' + s.value; const h = secrets.get(key) || { ...s, files: new Set() }; h.files.add(f.source); secrets.set(key, h); }
      for (const m of f.misconfigs) { const key = m.type + '\0' + m.evidence; const h = misconfigs.get(key) || { ...m, files: new Set() }; h.files.add(f.source); misconfigs.set(key, h); }
      for (const j of f.juicy) { const h = juicy.get(j.path) || { path: j.path, reasons: j.reasons, files: new Set() }; h.files.add(f.source); juicy.set(j.path, h); }
    }
  }
  const out = {
    secrets: [...secrets.values()].map((s) => ({ ...s, files: [...s.files] })).sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || a.type.localeCompare(b.type)),
    misconfigs: [...misconfigs.values()].map((m) => ({ ...m, files: [...m.files] })).sort((a, b) => RANK[a.severity] - RANK[b.severity]),
    juicy: [...juicy.values()].map((j) => ({ ...j, files: [...j.files] })).sort((a, b) => b.reasons.length - a.reasons.length),
    errors, bySource,
  };
  for (const k of STR_KEYS) out[k] = [...sets[k]].sort();
  out.counts = { secrets: out.secrets.length, misconfigs: out.misconfigs.length, juicy: out.juicy.length, errors: errors.length };
  for (const k of STR_KEYS) out.counts[k] = out[k].length;
  // roll up risk across files
  let riskScore = 0, criticalCount = 0;
  for (const f of bySource) { if (f.summary) { riskScore = Math.max(riskScore, f.summary.riskScore || 0); criticalCount += f.summary.criticalCount || 0; } }
  out.summary = { riskScore, criticalCount, filesWithFindings: bySource.length };
  return out;
}

function chunk(arr, n) {
  const out = Array.from({ length: n }, () => []);
  arr.forEach((x, i) => out[i % n].push(x));
  return out.filter((a) => a.length);
}

const isUrlList = (t) => {
  const lines = t.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return null;
  const u = lines.filter((l) => /^https?:\/\/\S+$/i.test(l));
  return u.length >= lines.length * 0.8 ? u : null;
};

// keep only items absent from the previous scan → "new since last run"
function diffData(cur, prev) {
  if (!prev) return cur;
  const sSeen = new Set((prev.secrets || []).map((s) => s.type + '\0' + s.value));
  const mSeen = new Set((prev.misconfigs || []).map((m) => m.type + '\0' + m.evidence));
  const jSeen = new Set((prev.juicy || []).map((j) => j.path));
  const strSeen = Object.fromEntries(STR_KEYS.map((k) => [k, new Set(prev[k] || [])]));
  const out = {
    secrets: (cur.secrets || []).filter((s) => !sSeen.has(s.type + '\0' + s.value)),
    misconfigs: (cur.misconfigs || []).filter((m) => !mSeen.has(m.type + '\0' + m.evidence)),
    juicy: (cur.juicy || []).filter((j) => !jSeen.has(j.path)),
    errors: cur.errors || [],
  };
  for (const k of STR_KEYS) out[k] = (cur[k] || []).filter((v) => !strSeen[k].has(v));
  out.bySource = (cur.bySource || []).map((f) => {
    const nf = { ...f };
    nf.secrets = (f.secrets || []).filter((s) => !sSeen.has(s.type + '\0' + s.value));
    nf.misconfigs = (f.misconfigs || []).filter((m) => !mSeen.has(m.type + '\0' + m.evidence));
    nf.juicy = (f.juicy || []).filter((j) => !jSeen.has(j.path));
    for (const k of STR_KEYS) nf[k] = (f[k] || []).filter((v) => !strSeen[k].has(v));
    return nf;
  }).filter((f) => SECS.reduce((n, k) => n + (f[k] ? f[k].length : 0), 0) > 0);
  out.counts = { ...cur.counts, secrets: out.secrets.length, misconfigs: out.misconfigs.length, juicy: out.juicy.length, errors: out.errors.length };
  for (const k of STR_KEYS) out.counts[k] = out[k].length;
  out.summary = cur.summary;
  return out;
}

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

const JsReconTab = memo(function JsReconTab({ activeProjectId, onCreateFinding, onSendToSubdomains }) {
  const [data, setData] = useProjectValue(activeProjectId, KEYS.jsRecon, null);
  const [prev, setPrev] = useProjectValue(activeProjectId, KEYS.jsReconPrev, null);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState([]);
  const [view, setView] = useState('file');
  const [active, setActive] = useState('secrets');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // {done,total}
  const [meta, setMeta] = useState('');
  const [diffOnly, setDiffOnly] = useState(false);
  const fileRef = useRef(null);

  const run = (jobs, total) => {
    setBusy(true); setProgress({ done: 0, total });
    const t0 = performance.now();
    let done = 0, finished = 0;
    const parts = [];
    jobs.forEach((job) => {
      const w = new Worker(new URL('./jsrecon.worker.js', import.meta.url), { type: 'module' });
      w.onerror = (err) => { console.error('[jsrecon] worker crash', err.message); if (++finished === jobs.length) finish(); };
      w.onmessage = (e) => {
        if (e.data.tick) { done += e.data.tick; setProgress({ done, total }); return; }
        parts.push({ bySource: e.data.bySource, errors: e.data.errors });
        w.terminate();
        if (++finished === jobs.length) finish();
      };
      w.postMessage(job);
    });
    function finish() {
      const agg = aggregate(parts);
      if (data) setPrev(data);   // last scan becomes the baseline for diff/monitoring
      setData(agg);
      setBusy(false); setProgress(null);
      setActive('secrets');
      setMeta(`${total.toLocaleString()} analyzed in ${((performance.now() - t0) / 1000).toFixed(1)}s · risk ${agg.summary.riskScore} · ${agg.summary.criticalCount} critical`);
    }
  };

  const analyze = () => {
    if (busy) return;
    if (picked.length) { run(chunk(picked, NW).map((files) => ({ files })), picked.length); return; }
    const list = isUrlList(input);
    if (list) run(chunk(list, NW).map((urls) => ({ urls })), list.length);
    else if (input.trim()) run([{ text: input }], 1);
  };

  const rescan = (urls) => {
    const abs = urls.filter((u) => /^https?:\/\//.test(u));
    if (!abs.length) return;
    setPicked([]); if (fileRef.current) fileRef.current.value = '';
    setInput(abs.join('\n'));
    run(chunk(abs, NW).map((u) => ({ urls: u })), abs.length);
  };

  // what we render: full result, or only-new-since-last-scan when diff mode is on
  const shown = data ? (diffOnly && prev ? diffData(data, prev) : data) : null;

  const copyActive = () => {
    if (!shown) return;
    const plain = active === 'secrets' ? shown.secrets.map((s) => `${s.severity}\t${s.type}\t${s.value}`).join('\n')
      : active === 'misconfigs' ? shown.misconfigs.map((m) => `${m.severity}\t${m.type}\t${m.evidence}`).join('\n')
      : active === 'juicy' ? shown.juicy.map((j) => `${j.path}\t[${j.reasons.join(',')}]`).join('\n')
      : (shown[active] || []).join('\n');
    navigator.clipboard.writeText(plain);
  };

  return (
    <div className="jr-wrap">
      <style>{styles}</style>
      <header className="jr-head">
        <div>
          <h1>🔎 JS Recon</h1>
          <p>Paste JS · a list of .js URLs · or load files → secrets · misconfigs · endpoints · chunks · source maps</p>
        </div>
        <button className="jr-btn-primary" onClick={analyze} disabled={busy}>{busy ? 'Analyzing…' : 'Analyze'}</button>
      </header>

      <textarea
        className="jr-area"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck="false"
        placeholder={'Paste a list of .js URLs (one per line) — fetched server-side (no CORS) & analyzed.\nhttps://target.com/static/app.js\n\nOr paste raw JavaScript. Or load local .js files below.'}
      />
      <div className="jr-row">
        <input ref={fileRef} type="file" multiple accept=".js,.txt,.map,.mjs,.cjs"
          onChange={(e) => { setPicked([...e.target.files]); setMeta(`${e.target.files.length} file(s) selected`); }} />
        <button className="jr-btn" onClick={() => { setInput(''); setPicked([]); if (fileRef.current) fileRef.current.value = ''; setData(null); setMeta(''); }}>Clear</button>
        <span className="jr-meta">{meta}</span>
      </div>
      {progress && (
        <div className="jr-row">
          <progress className="jr-prog" value={progress.done} max={progress.total} />
          <span className="jr-meta">{progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span>
        </div>
      )}

      {shown && (
        <>
          <div className="jr-row">
            {prev && (
              <button className={`jr-btn ${diffOnly ? 'jr-on' : ''}`} onClick={() => setDiffOnly((d) => !d)} title="Show only what's new vs the previous scan">
                {diffOnly ? '◉ New since last scan' : '○ New since last scan'}
              </button>
            )}
            <button className="jr-btn" onClick={() => exportJsReconReport(shown, 'target')}>⤓ Report (.md)</button>
            <button className="jr-btn" onClick={() => exportJson(shown, 'jsrecon')}>⤓ JSON</button>
            {shown.domains.length > 0 && onSendToSubdomains && (
              <button className="jr-btn" onClick={() => onSendToSubdomains(shown.domains)}>⮕ {shown.domains.length} domain(s) → Subdomains</button>
            )}
          </div>

          <div className="jr-tabs">
            <button className={`jr-tab ${view === 'file' ? 'on' : ''}`} onClick={() => setView('file')}>By file ({shown.bySource.length})</button>
            <button className={`jr-tab ${view === 'merged' ? 'on' : ''}`} onClick={() => setView('merged')}>Merged</button>
            <span className="jr-sep" />
            {view === 'merged' && ORDER.map((k) => (
              <button key={k} className={`jr-tab ${active === k ? 'on' : ''}`} onClick={() => setActive(k)}>{LABEL[k]} {shown.counts[k] || 0}</button>
            ))}
          </div>

          {diffOnly && <div className="jr-meta" style={{ marginBottom: 8 }}>showing only items new since the previous scan</div>}

          {view === 'file'
            ? <ByFile data={shown} onFinding={onCreateFinding} />
            : <Merged data={shown} active={active} onCopy={copyActive} onRescan={rescan} onFinding={onCreateFinding} />}

          <Commands data={shown} />
        </>
      )}
    </div>
  );
});

function Src({ files }) {
  if (!files || !files.length) return null;
  return <span className="jr-srctag"> · {files.slice(0, 3).join(', ')}{files.length > 3 ? ` +${files.length - 3}` : ''}</span>;
}

function Commands({ data }) {
  const base = (() => { try { return new URL((data.urls || []).find((u) => /^https?:\/\//.test(u)) || '').origin; } catch { return ''; } })();
  const cmds = reconCommands(data, base);
  if (!cmds.length) return null;
  return (
    <section className="jr-panel" style={{ marginTop: 14 }}>
      <div className="jr-sechead" style={{ fontSize: 12 }}>⌨ Ready-to-run commands {base ? `(base: ${base})` : ''}</div>
      {cmds.map((c, i) => (
        <div key={i} className="jr-cmd">
          <div className="jr-cmd-head">
            <span className="jr-cmd-label">{c.label}</span>
            <button className="jr-mini" onClick={() => navigator.clipboard.writeText(c.text)}>copy</button>
          </div>
          <pre className="jr-cmd-pre">{c.text.length > 600 ? c.text.slice(0, 600) + '\n…' : c.text}</pre>
        </div>
      ))}
    </section>
  );
}

function SecretRow({ s, withSrc, onFinding }) {
  const c = getSevColor(s.severity);
  return (
    <div className="jr-item">
      <span className="jr-sev" style={{ background: `${c}22`, color: c, borderColor: `${c}55` }}>{s.severity}</span>
      {s.confidence && <span className={`jr-conf jr-conf-${s.confidence}`}>{s.confidence}</span>}
      <span className="jr-type">{s.type}</span>
      <span className="jr-val">{s.value}</span>
      {withSrc && <Src files={s.files} />}
      {onFinding && (
        <button className="jr-mini" title="Create a finding from this secret"
          onClick={() => onFinding({ host: hostOf((s.files || [])[0] || ''), category: 'Sensitive Data Exposure', title: `${s.type} exposed in JS` })}>
          → Finding
        </button>
      )}
    </div>
  );
}
function McRow({ m, withSrc }) {
  const c = getSevColor(m.severity);
  return (
    <div className="jr-item">
      <span className="jr-sev" style={{ background: `${c}22`, color: c, borderColor: `${c}55` }}>{m.severity}</span>
      <span className="jr-type">{m.type}</span>
      <span className="jr-val">{m.evidence}</span>
      {withSrc && <Src files={m.files} />}
    </div>
  );
}
function JuicyRow({ j, withSrc }) {
  return (
    <div className="jr-item">
      <span className="jr-reasons">[{j.reasons.join(', ')}]</span>
      <span className="jr-val">{j.path}</span>
      {withSrc && <Src files={j.files} />}
    </div>
  );
}
function rows(key, val, withSrc, onFinding) {
  if (key === 'secrets') return val.map((s, i) => <SecretRow key={i} s={s} withSrc={withSrc} onFinding={onFinding} />);
  if (key === 'misconfigs') return val.map((m, i) => <McRow key={i} m={m} withSrc={withSrc} />);
  if (key === 'juicy') return val.map((j, i) => <JuicyRow key={i} j={j} withSrc={withSrc} />);
  return val.map((v, i) => <div key={i} className="jr-item"><span className="jr-val">{v}</span></div>);
}

function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (pages <= 1) return null;
  const from = page * PAGE + 1;
  const to = Math.min(total, (page + 1) * PAGE);
  return (
    <div className="jr-row jr-pager">
      <button className="jr-btn" disabled={page <= 0} onClick={() => onPage(page - 1)}>‹ Prev</button>
      <span className="jr-meta">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} · page {page + 1}/{pages}</span>
      <button className="jr-btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}

function Merged({ data, active, onCopy, onRescan, onFinding }) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [active]); // reset to first page when switching section
  const val = data[active] || [];
  const p = Math.min(page, Math.max(0, Math.ceil(val.length / PAGE) - 1));
  const slice = val.slice(p * PAGE, (p + 1) * PAGE);
  const canRescan = (active === 'chunks' || active === 'sourcemaps') && val.length;
  return (
    <section className="jr-panel">
      {val.length === 0 ? <div className="jr-empty">none</div> : rows(active, slice, true, onFinding)}
      <Pager page={p} total={val.length} onPage={setPage} />
      <div className="jr-row" style={{ marginTop: 12 }}>
        <button className="jr-btn" onClick={onCopy}>Copy all</button>
        {canRescan ? <button className="jr-btn-primary" onClick={() => onRescan(val)}>⮕ Scan these {val.length} {LABEL[active].toLowerCase()}</button> : null}
      </div>
    </section>
  );
}

function ByFile({ data, onFinding }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(() => new Set());
  const [allOpen, setAllOpen] = useState(false);
  useEffect(() => { setPage(0); setOpen(new Set()); setAllOpen(false); }, [data]);
  if (!data.bySource.length) return <section className="jr-panel"><div className="jr-empty">no findings</div></section>;

  const files = data.bySource;
  const p = Math.min(page, Math.max(0, Math.ceil(files.length / PAGE) - 1));
  const slice = files.slice(p * PAGE, (p + 1) * PAGE);
  const isOpen = (idx) => allOpen || open.has(idx);
  const toggle = (idx) => setOpen((s) => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  const count = (f) => SECS.reduce((n, k) => n + (k !== 'framework' && f[k] ? f[k].length : 0), 0);

  return (
    <section className="jr-panel">
      <div className="jr-row" style={{ marginTop: 0 }}>
        <button className="jr-btn" onClick={() => { setAllOpen((a) => !a); setOpen(new Set()); }}>
          {allOpen ? '▾ Collapse all' : '▸ Expand all'}
        </button>
        <span className="jr-meta">{files.length.toLocaleString()} file(s) with findings</span>
      </div>
      {slice.map((f, li) => {
        const idx = p * PAGE + li;
        const o = isOpen(idx);
        return (
          <div key={idx}>
            <button className="jr-fhead jr-fhead-btn" onClick={() => toggle(idx)}>
              <span className="jr-caret">{o ? '▾' : '▸'}</span> 📄 {f.source}
              {f.framework && f.framework.length ? <span className="jr-fwk"> [{f.framework.join(', ')}]</span> : null}
              {f.summary ? <span className="jr-risk"> risk {f.summary.riskScore}</span> : null}
              <span className="jr-fcount">{count(f)} finding(s)</span>
            </button>
            {o && SECS.map((k) => (f[k] && f[k].length && k !== 'framework'
              ? <div key={k}><div className="jr-sechead">{LABEL[k]} ({f[k].length})</div>{rows(k, f[k], false, onFinding)}</div>
              : null))}
          </div>
        );
      })}
      <Pager page={p} total={files.length} onPage={setPage} />
    </section>
  );
}

const styles = `
.jr-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); max-width: none; }
.jr-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-4); flex-wrap: wrap; }
.jr-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.jr-head p { margin: 2px 0 0; font-size: 13px; color: var(--text2); }
.jr-btn-primary { background: var(--grad); color: #fff; border: none; padding: 10px 22px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; box-shadow: var(--glow-purple); }
.jr-btn-primary:disabled { opacity: .6; cursor: default; }
.jr-btn { background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border); padding: 8px 16px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; }
.jr-area { width: 100%; box-sizing: border-box; min-height: 180px; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 12px; outline: none; resize: vertical; white-space: pre; }
.jr-area:focus { border-color: var(--border-active); }
.jr-row { display: flex; gap: 10px; align-items: center; margin: 10px 0; flex-wrap: wrap; }
.jr-meta { font-size: 12px; color: var(--text2); }
.jr-prog { flex: 1; height: 8px; }
.jr-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0 12px; align-items: center; }
.jr-tab { background: var(--bg-surface); color: var(--text2); border: 1px solid var(--border); border-radius: 20px; padding: 5px 13px; font-size: 12.5px; cursor: pointer; }
.jr-tab.on { background: var(--accent-dim, rgba(139,92,246,.15)); color: var(--accent, #a78bfa); border-color: var(--border-active); }
.jr-sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
.jr-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-4); }
.jr-item { display: flex; gap: 8px; align-items: baseline; padding: 5px 0; border-top: 1px solid var(--border); font-family: var(--font-data); font-size: 12.5px; word-break: break-all; }
.jr-item:first-child { border-top: none; }
.jr-sev { flex-shrink: 0; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 1px 7px; border-radius: 999px; border: 1px solid; }
.jr-conf { flex-shrink: 0; font-size: 9.5px; text-transform: uppercase; color: var(--text3, #64748b); }
.jr-conf-confirmed { color: #22c55e; }
.jr-conf-likely { color: #f59e0b; }
.jr-type { color: var(--accent, #a78bfa); flex-shrink: 0; }
.jr-val { color: var(--text-primary); }
.jr-reasons { color: #f59e0b; font-size: 10.5px; flex-shrink: 0; }
.jr-srctag { color: var(--text3, #64748b); font-size: 11px; }
.jr-mini { margin-left: auto; flex-shrink: 0; background: transparent; color: var(--accent, #a78bfa); border: 1px solid var(--border); border-radius: 6px; padding: 1px 8px; font-size: 10.5px; cursor: pointer; }
.jr-mini:hover { border-color: var(--border-active); }
.jr-btn.jr-on { background: var(--accent-dim, rgba(139,92,246,.15)); color: var(--accent, #a78bfa); border-color: var(--border-active); }
.jr-cmd { border-top: 1px solid var(--border); padding: 8px 0; }
.jr-cmd:first-of-type { border-top: none; }
.jr-cmd-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.jr-cmd-label { font-size: 12px; font-weight: 600; color: var(--text2); }
.jr-cmd-pre { margin: 0; padding: 8px 10px; background: var(--bg-base); border: 1px solid var(--border); border-radius: 6px; font-family: var(--font-data); font-size: 11.5px; white-space: pre-wrap; word-break: break-all; color: var(--text-primary); }
.jr-empty { color: var(--text2); font-style: italic; }
.jr-pager { justify-content: center; margin-top: 12px; }
.jr-fhead { margin: 16px 0 6px; padding: 7px 10px; background: var(--accent-dim, rgba(139,92,246,.12)); border-left: 3px solid var(--accent, #a78bfa); border-radius: 6px; font-family: var(--font-data); font-size: 12.5px; font-weight: 600; word-break: break-all; }
.jr-fhead:first-child { margin-top: 0; }
.jr-fhead-btn { display: block; width: 100%; text-align: left; cursor: pointer; color: var(--text-primary); }
.jr-caret { display: inline-block; width: 14px; color: var(--accent, #a78bfa); }
.jr-fcount { float: right; font-weight: 400; color: var(--text2); font-size: 11px; }
.jr-fwk { color: var(--accent, #a78bfa); }
.jr-risk { color: #ef4444; font-weight: 700; }
.jr-sechead { margin: 8px 0 2px; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--text2); }
`;

export default JsReconTab;
