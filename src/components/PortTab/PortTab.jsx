import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortImportPanel from './PortImportPanel.jsx';
import PortDetail from './PortDetail.jsx';
import PortSessionsModal from './PortSessionsModal.jsx';
import PortDiffModal from './PortDiffModal.jsx';
import { enrich, attackSurfaceScore, scoreBand, SEVERITIES, SEVERITY_RANK, CATEGORIES } from '../../lib/portintel.js';
import { enrichRecords } from '../../lib/cve.js';
import { exportCsv, exportJson, exportMarkdown, exportPlaybook } from '../../lib/portexporter.js';

const SEARCH_DEBOUNCE_MS = 200;

function useDebounced(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), delay); return () => clearTimeout(id); }, [value, delay]);
  return v;
}

export default function PortTab({ ports, projectName, onCopyToast, subRecords, onSendToSubdomains, scopeStatus, hasScope }) {
  const {
    records, importRecords, applyCve,
    toggleTag, setAudit, deleteMany, bulkSetAudit, clearAll,
  } = ports;

  const [query, setQuery] = useState('');
  const [sevFilter, setSevFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('open'); // default: only open
  const [catFilter, setCatFilter] = useState('all');
  const [scopeView, setScopeView] = useState('auto'); // auto(hide out) | all | in | out | unknown
  const [flag, setFlag] = useState(null); // null | 'kev' | 'cve' | 'danger'
  const [groupMode, setGroupMode] = useState('host'); // 'host' | 'cat' | 'flat'
  const [sort, setSort] = useState({ key: 'severity', dir: 'desc' });
  const [checked, setChecked] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [cveBusy, setCveBusy] = useState(null); // {done,total}

  // Cross-tab join: index subdomain records by host for HTTP info on port cards.
  const subIndex = useMemo(() => {
    const m = new Map();
    for (const s of subRecords || []) m.set(s.host, s);
    return m;
  }, [subRecords]);

  const dq = useDebounced(query, SEARCH_DEBOUNCE_MS);

  // Enrich every record once per records change (pure, cheap, memoized).
  const enriched = useMemo(() => records.map((r) => ({ r, e: enrich(r) })), [records]);

  const score = useMemo(() => attackSurfaceScore(enriched.map((x) => x.e)), [enriched]);
  const band = scoreBand(score);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    let out = enriched.filter(({ r, e }) => {
      if (stateFilter === 'open' && !(r.state || '').startsWith('open')) return false;
      if (stateFilter === 'closed' && (r.state || '').startsWith('open')) return false;
      if (sevFilter !== 'all' && e.severity !== sevFilter) return false;
      if (catFilter !== 'all' && e.category !== catFilter) return false;
      if (flag === 'kev' && !r.kev) return false;
      if (flag === 'cve' && !(r.cves && r.cves.length)) return false;
      if (flag === 'danger' && e.dangerousFlags.length === 0) return false;
      if (q && !(`${r.host} ${r.ip} ${r.port} ${r.service} ${r.product} ${r.version}`.toLowerCase().includes(q))) return false;
      if (hasScope) {
        const s = scopeStatus(r.host);
        if (scopeView === 'auto' && s === 'out') return false;
        if (scopeView === 'in' && s !== 'in') return false;
        if (scopeView === 'out' && s !== 'out') return false;
        if (scopeView === 'unknown' && s !== 'unknown') return false;
      }
      return true;
    });
    const dir = sort.dir === 'desc' ? -1 : 1;
    out = out.slice().sort((a, b) => {
      if (sort.key === 'severity') return (SEVERITY_RANK[a.e.severity] - SEVERITY_RANK[b.e.severity]) * dir || a.r.host.localeCompare(b.r.host);
      if (sort.key === 'host') return a.r.host.localeCompare(b.r.host) * dir || a.r.port - b.r.port;
      if (sort.key === 'port') return (a.r.port - b.r.port) * dir;
      return 0;
    });
    return out;
  }, [enriched, dq, sevFilter, stateFilter, catFilter, flag, sort, scopeView, hasScope, scopeStatus]);

  const sevCounts = useMemo(() => {
    const c = { all: enriched.length };
    for (const s of SEVERITIES) c[s] = 0;
    let kev = 0, danger = 0;
    for (const { r, e } of enriched) {
      c[e.severity]++;
      if (r.kev) kev++;
      if (e.dangerousFlags.length) danger++;
    }
    return { ...c, kev, danger };
  }, [enriched]);

  useEffect(() => { setChecked(new Set()); }, [dq, sevFilter, stateFilter, catFilter, flag]);

  const onSort = useCallback((key) => {
    setSort((p) => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'severity' ? 'desc' : 'asc' }));
  }, []);

  const copyVal = useCallback((v) => {
    navigator.clipboard?.writeText(v).then(() => onCopyToast(`Copied ${v}`), () => onCopyToast('Copy failed'));
  }, [onCopyToast]);

  const toggleCheck = (id) => setChecked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const runCveLookup = useCallback(async () => {
    const targets = (checked.size ? records.filter((r) => checked.has(r.id)) : records);
    const withProduct = targets.filter((r) => r.product && (r.state || '').startsWith('open'));
    if (!withProduct.length) { onCopyToast('No records with a detected product/version to look up.'); return; }
    setCveBusy({ done: 0, total: 0 });
    try {
      const map = await enrichRecords(withProduct, {
        onProgress: (done, total) => setCveBusy({ done, total }),
      });
      applyCve(map);
      onCopyToast(`CVE lookup complete for ${map.size} record(s).`);
    } catch {
      onCopyToast('CVE lookup failed (offline or blocked).');
    } finally {
      setCveBusy(null);
    }
  }, [checked, records, applyCve, onCopyToast]);

  const groups = useMemo(() => {
    if (groupMode === 'flat') return null;
    const m = new Map();
    if (groupMode === 'cat') for (const cat of CATEGORIES) m.set(cat, []);
    for (const item of filtered) {
      const key = groupMode === 'host' ? item.r.host : item.e.category;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(item);
    }
    let entries = [...m.entries()].filter(([, v]) => v.length);
    if (groupMode === 'host') {
      const worst = (items) => items.reduce((mx, x) => Math.max(mx, SEVERITY_RANK[x.e.severity]), 0);
      entries.sort((a, b) => worst(b[1]) - worst(a[1]) || a[0].localeCompare(b[0]));
    }
    return entries;
  }, [filtered, groupMode]);

  const exportTargets = () => (checked.size ? records.filter((r) => checked.has(r.id)) : filtered.map((x) => x.r));

  return (
    <div className="tab-content">
      <div className="tab-head port-head">
        <div>
          <h2>Port Scan</h2>
          <p>Paste scanner output — auto-parsed, scored, and mapped to CVEs &amp; exploits.</p>
        </div>
        {records.length > 0 && (
          <div className={`surface-score sev-bg-${band.sev}`} title="Attack surface score">
            <div className="surface-score-num">{score}</div>
            <div className="surface-score-label">{band.label}</div>
          </div>
        )}
      </div>

      <PortImportPanel onImport={importRecords} />

      {records.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-icon">🖧</div>
          <div className="empty-title">No port data yet</div>
          <div className="empty-sub">Paste Nmap, Masscan, Naabu, or Rustscan output above to begin.</div>
          {ports.sessions.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setSessionsOpen(true)}>
              💾 Reload a saved session ({ports.sessions.length})
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="glass-card filter-card port-filter-card">
            <div className="search-wrap">
              <span className="search-ic">⌕</span>
              <input placeholder="Search host / ip / port / service…" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
            </div>

            <div className="pill-row">
              <Pill active={sevFilter === 'all'} onClick={() => setSevFilter('all')}>All <b>{sevCounts.all}</b></Pill>
              {SEVERITIES.filter((s) => sevCounts[s] > 0).map((s) => (
                <Pill key={s} className={`sev-${s}`} active={sevFilter === s} onClick={() => setSevFilter(sevFilter === s ? 'all' : s)}>
                  {s} <b>{sevCounts[s]}</b>
                </Pill>
              ))}
              {sevCounts.kev > 0 && <Pill className="sev-critical" active={flag === 'kev'} onClick={() => setFlag(flag === 'kev' ? null : 'kev')}>🔥 KEV <b>{sevCounts.kev}</b></Pill>}
              {sevCounts.danger > 0 && <Pill className="sev-high" active={flag === 'danger'} onClick={() => setFlag(flag === 'danger' ? null : 'danger')}>⚠ Misconfig <b>{sevCounts.danger}</b></Pill>}
              <Pill active={flag === 'cve'} onClick={() => setFlag(flag === 'cve' ? null : 'cve')}>Has CVE</Pill>
            </div>

            <div className="filter-spacer" />

            <select className="mini-select" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} title="State filter">
              <option value="open">Open only</option>
              <option value="all">All states</option>
              <option value="closed">Closed/filtered</option>
            </select>
            <select className="mini-select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} title="Category filter">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {hasScope && (
              <select className="mini-select" value={scopeView} onChange={(e) => setScopeView(e.target.value)} title="Scope filter">
                <option value="auto">Hide out-of-scope</option>
                <option value="all">All (ignore scope)</option>
                <option value="in">In scope only</option>
                <option value="unknown">Unknown only</option>
                <option value="out">Out of scope only</option>
              </select>
            )}
            <select className="mini-select" value={groupMode} onChange={(e) => setGroupMode(e.target.value)} title="Grouping">
              <option value="host">Group: Host</option>
              <option value="cat">Group: Category</option>
              <option value="flat">No grouping</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={runCveLookup} disabled={!!cveBusy} title="Query Shodan CVEDB + CISA KEV">
              {cveBusy ? `CVEs ${cveBusy.done}/${cveBusy.total}…` : '🛡 Lookup CVEs'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiffOpen(true)} title="Compare against a saved session">
              🔀 Diff
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSessionsOpen(true)} title="Save / reload named snapshots">
              💾 Sessions{ports.sessions.length ? ` (${ports.sessions.length})` : ''}
            </button>
            <ExportMenu targets={exportTargets} projectName={projectName} ports={ports} onClear={clearAll} onCopyToast={onCopyToast} allRecords={records} scopeStatus={scopeStatus} hasScope={hasScope} />
          </div>

          {filtered.length === 0 ? (
            <div className="glass-card empty-state"><div className="empty-sub">No ports match the current filters.</div></div>
          ) : groupMode === 'host' ? (
            groups.map(([host, items]) => (
              <HostGroup key={host} host={host} items={items} sub={subIndex.get(host)}
                scopeBadge={hasScope ? scopeStatus(host) : null}
                {...{ checked, toggleCheck, copyVal, toggleTag, setDetail }} />
            ))
          ) : groupMode === 'cat' ? (
            groups.map(([cat, items]) => (
              <div key={cat} className="port-group">
                <div className="port-group-head">{cat} <span className="port-group-count">{items.length}</span></div>
                <PortTable rows={items} {...{ checked, toggleCheck, onSort, sort, copyVal, toggleTag, setAudit, setDetail }} />
              </div>
            ))
          ) : (
            <PortTable rows={filtered} {...{ checked, toggleCheck, onSort, sort, copyVal, toggleTag, setAudit, setDetail }} />
          )}
        </>
      )}

      {checked.size > 0 && (
        <div className="bulk-bar">
          <span>{checked.size} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            if (hasScope) {
              const oos = [...new Set(records.filter((r) => checked.has(r.id) && scopeStatus(r.host) === 'out').map((r) => r.host))];
              if (oos.length && !confirm(`⚠ ${oos.length} selected host(s) are OUT OF SCOPE:\n${oos.slice(0, 8).join('\n')}${oos.length > 8 ? '\n…' : ''}\n\nMark them vulnerable anyway?`)) return;
            }
            bulkSetAudit(checked, 'vulnerable');
          }}>Mark vulnerable</button>
          <button className="btn btn-ghost btn-sm" onClick={runCveLookup} disabled={!!cveBusy}>Lookup CVEs</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(records.filter((r) => checked.has(r.id)), 'selection')}>Export CSV</button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-5xx)' }} onClick={() => { deleteMany(checked); setChecked(new Set()); }}>Delete</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setChecked(new Set())}>Clear ✕</button>
        </div>
      )}

      {detail && <PortDetail rec={detail} onClose={() => setDetail(null)} onCopy={onCopyToast} onSendToSubdomains={onSendToSubdomains} />}
      {sessionsOpen && <PortSessionsModal ports={ports} onClose={() => setSessionsOpen(false)} onToast={onCopyToast} />}
      {diffOpen && <PortDiffModal ports={ports} onClose={() => setDiffOpen(false)} />}
    </div>
  );
}

function Pill({ active, onClick, className = '', children }) {
  return (
    <button className={`fpill ${className}${active ? ' active' : ''}`} onClick={onClick}>{children}</button>
  );
}

// Collapsible per-host card: host shown once, its ports nested inside, with a
// severity summary in the header.
function HostGroup({ host, items, sub, scopeBadge, checked, toggleCheck, copyVal, toggleTag, setDetail }) {
  const [open, setOpen] = useState(true);
  const ip = items.find((x) => x.r.ip && x.r.ip !== host)?.r.ip;
  const sevCount = {};
  for (const x of items) sevCount[x.e.severity] = (sevCount[x.e.severity] || 0) + 1;
  const worst = SEVERITIES.find((s) => sevCount[s]) || 'info';
  const kev = items.filter((x) => x.r.kev).length;
  const cve = items.filter((x) => x.r.cves && x.r.cves.length).length;
  const danger = items.filter((x) => x.e.dangerousFlags.length).length;
  const allChecked = items.every((x) => checked.has(x.r.id));

  return (
    <div className={`host-card host-sev-${worst}`}>
      <div className="host-card-head">
        <input type="checkbox" className="row-cb" checked={allChecked}
          onClick={(ev) => ev.stopPropagation()}
          onChange={() => { const target = !allChecked; items.forEach((x) => { if (checked.has(x.r.id) !== target) toggleCheck(x.r.id); }); }} />
        <button className="host-caret-btn" onClick={() => setOpen((o) => !o)}>
          <span className="host-caret">{open ? '▾' : '▸'}</span>
          <span className={`sev-dot sev-bg-${worst}`} />
          <span className="host-name mono">{host}</span>
          {ip && <span className="host-ip mono">{ip}</span>}
        </button>
        {scopeBadge && <span className={`scope-badge sm ${scopeBadge}`}>{scopeBadge}</span>}
        {sub && (
          <span className="host-http" title={`From Subdomains tab: ${sub.title || ''}`}>
            HTTP {sub.status ?? '—'}
            {sub.title ? ` · ${sub.title.slice(0, 40)}` : ''}
            {Array.isArray(sub.tech) && sub.tech.length ? ` · ${sub.tech.slice(0, 3).join(', ')}` : ''}
          </span>
        )}
        <span className="host-spacer" />
        <span className="host-portcount">{items.length} {items.length === 1 ? 'port' : 'ports'}</span>
        {sevCount.critical > 0 && <span className="mini-tag danger">{sevCount.critical} critical</span>}
        {sevCount.high > 0 && <span className="mini-tag exp">{sevCount.high} high</span>}
        {danger > 0 && <span className="mini-tag danger">⚠ {danger}</span>}
        {kev > 0 && <span className="mini-tag kev">🔥 {kev}</span>}
        {cve > 0 && <span className="mini-tag cve">{cve} CVE</span>}
      </div>
      {open && (
        <div className="host-card-body">
          {items.map(({ r, e }) => (
            <div key={r.id} className={`hport-row${e.dangerousFlags.length ? ' row-danger' : ''}`} onClick={() => setDetail(r)}>
              <span onClick={(ev) => ev.stopPropagation()}>
                <input type="checkbox" className="row-cb" checked={checked.has(r.id)} onChange={() => toggleCheck(r.id)} />
              </span>
              <span className={`sev-pill sev-${e.severity}`}>{e.severity}</span>
              <span className="hport-port mono">{r.port}/{r.proto}{!r.state.startsWith('open') && <em className="state-tag"> {r.state}</em>}</span>
              <span className="hport-svc">{[r.service, r.product, r.version].filter(Boolean).join(' ') || '—'}</span>
              <span className="hport-tags">
                {r.kev && <span className="mini-tag kev">🔥 KEV</span>}
                {r.cves && r.cves.length > 0 && <span className="mini-tag cve">{r.cves.length} CVE</span>}
                {e.exploits.length > 0 && <span className="mini-tag exp">exploit</span>}
                {e.dangerousFlags.length > 0 && <span className="mini-tag danger">misconfig</span>}
                {e.anomalies.length > 0 && <span className="mini-tag anom">anomaly</span>}
              </span>
              <span className="hport-act" onClick={(ev) => ev.stopPropagation()}>
                <button className="icon-btn" title="Copy host:port" onClick={() => copyVal(`${r.host}:${r.port}`)}>⧉</button>
                <button className="icon-btn" title="Flag" onClick={() => toggleTag(r.id)}>{r.tag ? '★' : '☆'}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PortTable({ rows, checked, toggleCheck, onSort, sort, copyVal, toggleTag, setAudit, setDetail }) {
  const sortArrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');
  return (
    <div className="vtable">
      <div className="vtable-scroll">
        <div className="vtable-inner" style={{ minWidth: 880 }}>
          <div className="vtable-head-sticky">
            <div className="port-row port-row-head">
              <span className="pc-cb" />
              <span className="pc-sev sortable" onClick={() => onSort('severity')}>Sev{sortArrow('severity')}</span>
              <span className="pc-host sortable" onClick={() => onSort('host')}>Host{sortArrow('host')}</span>
              <span className="pc-port sortable" onClick={() => onSort('port')}>Port{sortArrow('port')}</span>
              <span className="pc-svc">Service / Version</span>
              <span className="pc-tags">Findings</span>
              <span className="pc-act" />
            </div>
          </div>
          {rows.map(({ r, e }) => (
            <div key={r.id} className={`port-row${e.dangerousFlags.length ? ' row-danger' : ''}`} onClick={() => setDetail(r)}>
              <span className="pc-cb" onClick={(ev) => ev.stopPropagation()}>
                <input type="checkbox" className="row-cb" checked={checked.has(r.id)} onChange={() => toggleCheck(r.id)} />
              </span>
              <span className="pc-sev"><span className={`sev-pill sev-${e.severity}`}>{e.severity}</span></span>
              <span className="pc-host mono" title={r.ip || ''}>
                {r.tag && <span className="star">★</span>}{r.host}
              </span>
              <span className="pc-port mono">{r.port}/{r.proto}
                {!r.state.startsWith('open') && <span className="state-tag"> {r.state}</span>}
              </span>
              <span className="pc-svc">{[r.service, r.product, r.version].filter(Boolean).join(' ') || '—'}</span>
              <span className="pc-tags">
                {r.kev && <span className="mini-tag kev">🔥 KEV</span>}
                {r.cves && r.cves.length > 0 && <span className="mini-tag cve">{r.cves.length} CVE</span>}
                {e.exploits.length > 0 && <span className="mini-tag exp">exploit</span>}
                {e.dangerousFlags.length > 0 && <span className="mini-tag danger">misconfig</span>}
                {e.anomalies.length > 0 && <span className="mini-tag anom">anomaly</span>}
              </span>
              <span className="pc-act" onClick={(ev) => ev.stopPropagation()}>
                <button className="icon-btn" title="Copy host:port" onClick={() => copyVal(`${r.host}:${r.port}`)}>⧉</button>
                <button className="icon-btn" title="Flag" onClick={() => toggleTag(r.id)}>{r.tag ? '★' : '☆'}</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportMenu({ targets, projectName, ports, onClear, onCopyToast, allRecords, scopeStatus, hasScope }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);
  const close = () => setOpen(false);

  const saveSession = () => {
    const data = JSON.stringify({ records: ports.records, activity: ports.activity });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ports_session_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onCopyToast?.('Session saved');
    close();
  };

  const loadSession = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        if (confirm('This will overwrite the current port data. Continue?')) {
          ports.loadSession(json);
          onCopyToast?.('Session loaded');
        }
      } catch {
        alert('Invalid JSON session file.');
      }
    };
    reader.readAsText(file);
    e.target.value = null;
    close();
  };

  return (
    <div className="menu">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>Data ▾</button>
      {open && (
        <div className="menu-list" onMouseLeave={close}>
          <button className="menu-item" onClick={() => { exportMarkdown(targets(), projectName); close(); }}>Export Report (.md)</button>
          <button className="menu-item" onClick={() => {
            let recs = allRecords;
            if (hasScope) {
              const before = recs.length;
              recs = recs.filter((r) => scopeStatus(r.host) !== 'out');
              if (before !== recs.length) onCopyToast?.(`Playbook excludes ${before - recs.length} out-of-scope record(s)`);
            }
            exportPlaybook(recs, projectName); close();
          }} disabled={!allRecords || allRecords.length === 0}>Export Playbook (.sh)</button>
          <button className="menu-item" onClick={() => { exportCsv(targets()); close(); }}>Export Data (.csv)</button>
          <button className="menu-item" onClick={() => { exportJson(targets()); close(); }}>Export Data (.json)</button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button className="menu-item" onClick={saveSession} disabled={ports.records.length === 0}>Save Session Backup (.json)</button>
          <button className="menu-item" onClick={() => fileRef.current?.click()}>Load Session Backup (.json)</button>
          <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".json" onChange={loadSession} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button className="menu-item" style={{ color: 'var(--status-5xx)' }} onClick={() => { if (confirm('Clear ALL port data in this project?')) { onClear(); close(); } }}>Clear All Port Data</button>
        </div>
      )}
    </div>
  );
}
