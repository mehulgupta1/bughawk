import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { get, set, KEYS } from '../../lib/storage.js';
import { buildGraph, queryGraph, parseNuclei } from '../../lib/graph.js';
import { snapshotSig, computeEvents, newHostsSince, resurrections, churn } from '../../lib/events.js';
import { buildWorklist, worklistCsv, DEFAULT_WEIGHTS, WEIGHT_LABELS } from '../../lib/worklist.js';
import { getSevColor, buildTemplates, csvCell } from '../UrlParser/engine.js';

const WL_PAGE = 100;

const WEEK = 7 * 24 * 60 * 60 * 1000;
const fmt = (ts) => new Date(ts).toLocaleString();
const EVENT_LABEL = { host_new: '🆕 new host', host_back: '⚠ resurrected', host_gone: '✖ gone', port_new: '➕ new port' };

const SurfaceTab = memo(function SurfaceTab({ activeProjectId = 'default', subs = [], ports = [], scopeRules = [] }) {
  const [urlResults, setUrlResults] = useState([]);
  const [nuclei, setNuclei] = useState([]);
  const [nucleiText, setNucleiText] = useState('');
  const [events, setEvents] = useState([]);
  const [q, setQ] = useState({ inScope: true, nonStdPort: false, highConf: false, hasFinding: false, takeover: false, isNew: false });
  const [savedAt, setSavedAt] = useState(null);
  // Worklist state
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [done, setDone] = useState({});
  const [wlMinScore, setWlMinScore] = useState(0);
  const [wlInScopeOnly, setWlInScopeOnly] = useState(true);
  const [wlHideDone, setWlHideDone] = useState(true);
  const [wlPage, setWlPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = await get(KEYS.urlLastScan(activeProjectId), null);
      const nf = await get(KEYS.nucleiFindings(activeProjectId), []);
      const ev = await get(KEYS.surfaceEvents(activeProjectId), []);
      const snap = await get(KEYS.surfaceSnapshot(activeProjectId), null);
      if (cancelled) return;
      const wts = await get(KEYS.surfaceWeights(activeProjectId), null);
      const dn = await get(KEYS.worklistDone(activeProjectId), {});
      if (cancelled) return;
      setUrlResults(last && Array.isArray(last.parsedData) ? last.parsedData : []);
      setNuclei(Array.isArray(nf) ? nf : []);
      setEvents(Array.isArray(ev) ? ev : []);
      setSavedAt(snap ? snap.ts : null);
      setWeights(wts ? { ...DEFAULT_WEIGHTS, ...wts } : DEFAULT_WEIGHTS);
      setDone(dn && typeof dn === 'object' ? dn : {});
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const setWeight = useCallback((k, v) => {
    setWeights((prev) => {
      const next = { ...prev, [k]: v };
      set(KEYS.surfaceWeights(activeProjectId), next);
      return next;
    });
  }, [activeProjectId]);
  const toggleDone = useCallback((id) => {
    setDone((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = 1;
      set(KEYS.worklistDone(activeProjectId), next);
      return next;
    });
  }, [activeProjectId]);

  const newHosts = useMemo(() => newHostsSince(events, Date.now() - WEEK), [events]);
  const nodes = useMemo(
    () => buildGraph({ subs, ports, urlResults, nuclei, scopeRules, newHosts }),
    [subs, ports, urlResults, nuclei, scopeRules, newHosts],
  );

  const importNuclei = useCallback(async () => {
    const parsed = parseNuclei(nucleiText);
    if (parsed.length === 0) { alert('No nuclei findings parsed. Paste `nuclei -jsonl` output.'); return; }
    await set(KEYS.nucleiFindings(activeProjectId), parsed);
    setNuclei(parsed);
    setNucleiText('');
    alert(`Imported ${parsed.length} nuclei finding(s).`);
  }, [nucleiText, activeProjectId]);
  const results = useMemo(() => queryGraph(nodes, q), [nodes, q]);
  const takeovers = useMemo(() => nodes.filter((n) => n.takeover), [nodes]);
  const churnTop = useMemo(() => churn(events).slice(0, 10), [events]);
  const resur = useMemo(() => resurrections(events).slice(-20).reverse(), [events]);
  const recent = useMemo(() => [...events].sort((a, b) => b.ts - a.ts).slice(0, 50), [events]);

  // Worklist: rank every actionable item across the surface.
  const rarityMap = useMemo(() => {
    const m = new Map();
    for (const t of buildTemplates(urlResults)) m.set(t.template, t.rarity);
    return m;
  }, [urlResults]);
  const worklist = useMemo(() => buildWorklist(nodes, rarityMap, weights), [nodes, rarityMap, weights]);
  const wlFiltered = useMemo(() => worklist.filter((it) => {
    if (it.score < wlMinScore) return false;
    if (wlInScopeOnly && nodes.find((n) => n.host === it.host)?.inScope === 'out') return false;
    if (wlHideDone && done[it.id]) return false;
    return true;
  }), [worklist, wlMinScore, wlInScopeOnly, wlHideDone, done, nodes]);
  useEffect(() => { setWlPage(0); }, [wlMinScore, wlInScopeOnly, wlHideDone, weights, urlResults]);
  const wlPages = Math.max(1, Math.ceil(wlFiltered.length / WL_PAGE));
  const wlSafePage = Math.min(wlPage, wlPages - 1);
  const wlSlice = wlFiltered.slice(wlSafePage * WL_PAGE, wlSafePage * WL_PAGE + WL_PAGE);

  const exportWorklist = useCallback(() => {
    const blob = new Blob([worklistCsv(wlFiltered, csvCell)], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'worklist.csv'; a.click();
    window.URL.revokeObjectURL(url);
  }, [wlFiltered]);

  // Snapshot: diff current data vs last snapshot, append events.
  const takeSnapshot = useCallback(async () => {
    const currSig = snapshotSig(subs, ports);
    const prev = await get(KEYS.surfaceSnapshot(activeProjectId), null);
    const now = Date.now();
    const newEvents = computeEvents(prev ? prev.sig : {}, currSig, events, now);
    const merged = [...events, ...newEvents];
    await set(KEYS.surfaceEvents(activeProjectId), merged);
    await set(KEYS.surfaceSnapshot(activeProjectId), { ts: now, sig: currSig });
    setEvents(merged);
    setSavedAt(now);
    alert(`Snapshot saved. ${newEvents.length} change event(s) recorded.`);
  }, [activeProjectId, subs, ports, events]);

  const toggle = (k) => setQ((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="sf-wrap">
      <style>{styles}</style>

      <header className="sf-head">
        <div>
          <h1>Attack Surface</h1>
          <p>Cross-tab graph · {nodes.length.toLocaleString()} hosts · {events.length.toLocaleString()} events{savedAt ? ` · last snapshot ${fmt(savedAt)}` : ' · no snapshot yet'}</p>
        </div>
        <button className="sf-btn-primary" onClick={takeSnapshot}>📸 Snapshot now</button>
      </header>

      {/* Priority worklist */}
      <section className="sf-panel sf-pad">
        <div className="sf-wl-head">
          <strong>🎯 Priority Worklist</strong>
          <span className="sf-count">{wlFiltered.length.toLocaleString()} items</span>
          <button className="sf-btn-ghost" onClick={exportWorklist} style={{ marginLeft: 'auto' }}>📦 Export CSV</button>
        </div>

        <div className="sf-weights">
          {Object.keys(DEFAULT_WEIGHTS).map((k) => (
            <label key={k} className="sf-weight">
              <span>{WEIGHT_LABELS[k]} <b>{weights[k]}×</b></span>
              <input type="range" min="0" max="5" step="0.5" value={weights[k]} onChange={(e) => setWeight(k, Number(e.target.value))} />
            </label>
          ))}
          <button className="sf-btn-ghost" onClick={() => { setWeights(DEFAULT_WEIGHTS); set(KEYS.surfaceWeights(activeProjectId), DEFAULT_WEIGHTS); }}>Reset</button>
        </div>

        <div className="sf-wl-filters">
          <label className="sf-chk-inline">Min score <input type="number" value={wlMinScore} onChange={(e) => setWlMinScore(Number(e.target.value) || 0)} style={{ width: 56 }} /></label>
          <label className={`sf-chk ${wlInScopeOnly ? 'on' : ''}`}><input type="checkbox" checked={wlInScopeOnly} onChange={() => setWlInScopeOnly((v) => !v)} /> In-scope only</label>
          <label className={`sf-chk ${wlHideDone ? 'on' : ''}`}><input type="checkbox" checked={wlHideDone} onChange={() => setWlHideDone((v) => !v)} /> Hide done</label>
        </div>

        <div className="sf-table">
          <div className="sf-row sf-row-head">
            <span className="sf-c-sm">#</span><span className="sf-c-sm">Score</span><span className="sf-c-sm">Kind</span>
            <span className="sf-c-host">Target</span><span className="sf-c-md">Detail</span><span className="sf-c-sm">Done</span>
          </div>
          {wlSlice.map((it, i) => {
            const rank = wlSafePage * WL_PAGE + i + 1;
            const color = getSevColor(it.severity);
            const breakdown = Object.entries(it.parts).map(([k, v]) => `${k}: ${Math.round(v * 10) / 10}`).join('  ');
            return (
              <div key={it.id} className="sf-row" style={{ opacity: done[it.id] ? 0.5 : 1 }}>
                <span className="sf-c-sm sf-mono">{rank}</span>
                <span className="sf-c-sm"><b className="sf-score" title={breakdown} style={{ color }}>{it.score}</b></span>
                <span className="sf-c-sm">{it.kind}</span>
                <span className="sf-c-host" title={it.url || it.host}>{it.host}</span>
                <span className="sf-c-md" title={it.detail}>{it.detail}{it.url && <span className="sf-wl-url"> · {it.url.replace(/^https?:\/\/[^/]+/, '')}</span>}</span>
                <span className="sf-c-sm"><input type="checkbox" checked={!!done[it.id]} onChange={() => toggleDone(it.id)} /></span>
              </div>
            );
          })}
          {wlFiltered.length === 0 && <div className="sf-empty">Nothing queued. Import findings/subs/ports and lower the filters.</div>}
        </div>
        {wlPages > 1 && (
          <div className="sf-pager">
            <button className="sf-btn-ghost" disabled={wlSafePage === 0} onClick={() => setWlPage(0)}>« First</button>
            <button className="sf-btn-ghost" disabled={wlSafePage === 0} onClick={() => setWlPage((p) => p - 1)}>‹ Prev</button>
            <span>Page {wlSafePage + 1} / {wlPages}</span>
            <button className="sf-btn-ghost" disabled={wlSafePage >= wlPages - 1} onClick={() => setWlPage((p) => p + 1)}>Next ›</button>
            <button className="sf-btn-ghost" disabled={wlSafePage >= wlPages - 1} onClick={() => setWlPage(wlPages - 1)}>Last »</button>
          </div>
        )}
      </section>

      {/* Query */}
      <section className="sf-panel sf-pad">
        <strong>Query</strong>
        <div className="sf-filters">
          {[
            ['inScope', 'In scope'], ['nonStdPort', 'Non-standard port'], ['highConf', 'High-confidence finding'],
            ['hasFinding', 'Has any finding'], ['takeover', 'Takeover candidate'], ['isNew', 'New this week'],
          ].map(([k, label]) => (
            <label key={k} className={`sf-chk ${q[k] ? 'on' : ''}`}>
              <input type="checkbox" checked={q[k]} onChange={() => toggle(k)} /> {label}
            </label>
          ))}
        </div>
        <div className="sf-count">{results.length.toLocaleString()} matching hosts</div>
        <div className="sf-table">
          <div className="sf-row sf-row-head">
            <span className="sf-c-host">Host</span><span className="sf-c-sm">Scope</span><span className="sf-c-sm">Status</span>
            <span className="sf-c-md">Ports</span><span className="sf-c-sm">Finding</span><span className="sf-c-md">IP</span>
          </div>
          {results.slice(0, 300).map((n) => (
            <div key={n.host} className="sf-row">
              <span className="sf-c-host" title={n.host}>{n.isNew && <b className="sf-new">NEW</b>}{n.takeover && <b className="sf-to">TAKEOVER</b>}{n.host}</span>
              <span className={`sf-c-sm sf-scope-${n.inScope}`}>{n.inScope}</span>
              <span className="sf-c-sm">{n.status ?? '—'}</span>
              <span className="sf-c-md sf-mono">{n.ports.length ? n.ports.map((p) => <span key={p} className={!([80, 443].includes(p)) ? 'sf-port-alt' : ''}>{p} </span>) : '—'}</span>
              <span className="sf-c-sm">{n.maxSev ? <b style={{ color: getSevColor(n.maxSev) }}>{n.findings.length}·{n.maxConf?.[0]?.toUpperCase()}</b> : '—'}</span>
              <span className="sf-c-md sf-mono">{n.ip || '—'}</span>
            </div>
          ))}
          {results.length === 0 && <div className="sf-empty">No hosts match. Import subs/ports/URLs in the other tabs, then snapshot.</div>}
        </div>
      </section>

      {/* Nuclei findings */}
      <section className="sf-panel sf-pad">
        <div className="sf-wl-head">
          <strong>🧪 Nuclei findings</strong>
          <span className="sf-count">{nuclei.length.toLocaleString()} imported · correlated onto the graph + worklist</span>
        </div>
        <textarea
          className="sf-nuclei-in"
          placeholder="Paste `nuclei -jsonl` output here…"
          value={nucleiText}
          onChange={(e) => setNucleiText(e.target.value)}
          spellCheck="false"
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="sf-btn-primary" onClick={importNuclei}>Import nuclei</button>
          {nuclei.length > 0 && <button className="sf-btn-ghost" onClick={async () => { await set(KEYS.nucleiFindings(activeProjectId), []); setNuclei([]); }}>Clear</button>}
        </div>
        {nuclei.length > 0 && (
          <div className="sf-table" style={{ marginTop: 12 }}>
            {nuclei.slice(0, 200).map((f, i) => (
              <div key={i} className="sf-row">
                <span className="sf-c-sm" style={{ color: getSevColor(f.severity), fontWeight: 700 }}>{f.severity}</span>
                <span className="sf-c-host" title={f.url}>{f.name}</span>
                <span className="sf-c-md sf-mono">{f.host}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="sf-grid">
        {/* Delta feed */}
        <section className="sf-panel sf-pad">
          <strong>Change feed</strong>
          <div className="sf-feed">
            {recent.length === 0 && <div className="sf-empty">Take a snapshot to start tracking change.</div>}
            {recent.map((e, i) => (
              <div key={i} className="sf-evt">
                <span className="sf-evt-type">{EVENT_LABEL[e.type] || e.type}</span>
                <span className="sf-evt-entity">{e.entity}{e.detail ? `:${e.detail}` : ''}</span>
                <span className="sf-evt-ts">{fmt(e.ts)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Resurrections + churn */}
        <section className="sf-panel sf-pad">
          <strong>⚠ Resurrected ({resur.length})</strong>
          <div className="sf-feed">
            {resur.length === 0 && <div className="sf-empty">None yet — hosts that come back after going dark show here.</div>}
            {resur.map((e, i) => <div key={i} className="sf-evt"><span className="sf-evt-entity">{e.entity}</span><span className="sf-evt-ts">{fmt(e.ts)}</span></div>)}
          </div>
          <strong style={{ display: 'block', marginTop: 16 }}>🔥 Churn (most-changed)</strong>
          <div className="sf-feed">
            {churnTop.length === 0 && <div className="sf-empty">—</div>}
            {churnTop.map((c) => <div key={c.entity} className="sf-evt"><span className="sf-evt-entity">{c.entity}</span><span className="sf-evt-ts">{c.count}×</span></div>)}
          </div>
        </section>
      </div>

      {takeovers.length > 0 && (
        <section className="sf-panel sf-pad">
          <strong className="sf-to-title">🎯 Subdomain takeover candidates ({takeovers.length})</strong>
          <div className="sf-table">
            {takeovers.map((n) => (
              <div key={n.host} className="sf-row">
                <span className="sf-c-host">{n.host}</span>
                <span className="sf-c-md sf-mono">{n.cname || '—'}</span>
                <span className={`sf-c-sm sf-scope-${n.inScope}`}>{n.inScope}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

const styles = `
.sf-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); }
.sf-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-5); gap: var(--sp-4); flex-wrap: wrap; }
.sf-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.sf-head p { margin: 2px 0 0; font-size: 13px; color: var(--text2); }
.sf-btn-primary { background: var(--grad); color: #fff; border: none; padding: 10px 20px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; box-shadow: var(--glow-purple); }
.sf-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: var(--sp-5); }
.sf-pad { padding: var(--sp-4); }
.sf-filters { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
.sf-chk { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2); cursor: pointer; border: 1px solid var(--border); padding: 4px 10px; border-radius: 999px; }
.sf-chk.on { color: var(--accent-primary-bright); border-color: var(--border-active); background: var(--accent-primary-dim); }
.sf-chk input { accent-color: var(--accent-primary); }
.sf-count { font-size: 12px; color: var(--text2); margin-bottom: 8px; }
.sf-table { border-top: 1px solid var(--border); max-height: 460px; overflow: auto; }
.sf-row { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
.sf-row-head { color: var(--text3); text-transform: uppercase; font-size: 10px; letter-spacing: 1px; position: sticky; top: 0; background: var(--bg-surface); }
.sf-c-host { flex: 1; min-width: 0; font-family: var(--font-data); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-c-sm { width: 70px; flex-shrink: 0; }
.sf-c-md { width: 150px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-mono { font-family: var(--font-data); color: var(--text2); }
.sf-port-alt { color: #f59e0b; font-weight: 700; }
.sf-scope-in { color: #10b981; } .sf-scope-out { color: #ef4444; } .sf-scope-unknown { color: var(--text3); }
.sf-new { color: var(--cyan); margin-right: 6px; font-size: 9px; }
.sf-to { color: #ef4444; margin-right: 6px; font-size: 9px; }
.sf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-5); }
@media (max-width: 900px) { .sf-grid { grid-template-columns: 1fr; } }
.sf-feed { max-height: 320px; overflow: auto; margin-top: 8px; }
.sf-evt { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.sf-evt-type { width: 110px; flex-shrink: 0; color: var(--text2); }
.sf-evt-entity { flex: 1; min-width: 0; font-family: var(--font-data); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-evt-ts { color: var(--text3); font-size: 11px; white-space: nowrap; }
.sf-empty { color: var(--text2); font-size: 13px; padding: 16px 0; font-style: italic; }
.sf-to-title { color: #ef4444; }
.sf-btn-ghost { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 12px; border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; }
.sf-btn-ghost:hover:not(:disabled) { background: var(--surface-hover); }
.sf-btn-ghost:disabled { opacity: .4; cursor: default; }
.sf-wl-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.sf-weights { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 16px; align-items: center; margin-bottom: 12px; }
.sf-weight { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text2); }
.sf-weight b { color: var(--accent-primary-bright); }
.sf-weight input { accent-color: var(--accent-primary); }
.sf-wl-filters { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.sf-chk-inline { font-size: 12px; color: var(--text2); display: flex; gap: 6px; align-items: center; }
.sf-chk-inline input { background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 2px 6px; }
.sf-score { font-family: var(--font-data); font-weight: 800; cursor: help; }
.sf-wl-url { color: var(--text3); font-family: var(--font-data); font-size: 11px; }
.sf-pager { display: flex; align-items: center; gap: 8px; justify-content: center; padding-top: 12px; font-size: 12px; color: var(--text2); }
.sf-nuclei-in { width: 100%; box-sizing: border-box; min-height: 90px; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 12px; outline: none; resize: vertical; }
`;

export default SurfaceTab;
