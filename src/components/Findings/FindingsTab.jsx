import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { get, set, KEYS } from '../../lib/storage.js';
import { getSevColor } from '../UrlParser/engine.js';
import { TECHNIQUES, TECHNIQUE_CATEGORIES } from '../../lib/techniques.js';

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const STATUSES = ['new', 'triaging', 'confirmed', 'reported', 'triaged', 'duplicate', 'resolved'];
const STATUS_COLOR = {
  new: '#6b7280', triaging: '#3b82f6', confirmed: '#f59e0b', reported: '#8b5cf6',
  triaged: '#10b981', duplicate: '#6b7280', resolved: '#10b981',
};
const blankForm = {
  host: '', title: '', category: '', severity: 'medium', status: 'new',
  cvss: '', bounty: '', tags: '', note: '', steps: '', request: '', response: '', refs: '',
};

const FENCE = '```';
function toMarkdown(f) {
  const lines = [
    `# [${(f.severity || '').toUpperCase()}] ${f.title}`,
    '',
    `- **Target:** ${f.host}`,
    f.category ? `- **Category:** ${f.category}` : '',
    f.cvss ? `- **CVSS:** ${f.cvss}` : '',
    `- **Status:** ${f.status}`,
    f.bounty ? `- **Bounty:** $${f.bounty}` : '',
    f.tags ? `- **Tags:** ${f.tags}` : '',
    '',
    '## Description', f.note || '_n/a_', '',
    '## Steps to Reproduce', f.steps || '_n/a_', '',
  ];
  if (f.request) lines.push('## Request', FENCE, f.request, FENCE, '');
  if (f.response) lines.push('## Response', FENCE, f.response, FENCE, '');
  if (f.refs) lines.push('## References', f.refs, '');
  return lines.filter((l) => l !== '').join('\n');
}
function download(name, text) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  window.URL.revokeObjectURL(url);
}

const FindingsTab = memo(function FindingsTab({ activeProjectId = 'default', hosts = [], initialDraft = null, onDraftConsumed }) {
  const [findings, setFindings] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const [fSev, setFSev] = useState('all');
  const [fHost, setFHost] = useState('all');
  const [hostSearch, setHostSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => { const v = await get(KEYS.findings(activeProjectId), []); if (!cancelled) setFindings(Array.isArray(v) ? v : []); })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const persist = useCallback((next) => { setFindings(next); set(KEYS.findings(activeProjectId), next); }, [activeProjectId]);

  // Prefill from "Create finding" in the Notebook.
  useEffect(() => {
    if (!initialDraft) return;
    setForm((f) => ({ ...f, host: initialDraft.host || '', category: initialDraft.category || '', title: initialDraft.title || '' }));
    setEditingId(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
    onDraftConsumed?.();
  }, [initialDraft, onDraftConsumed]);

  // Hosts come straight from the Subdomains tab + any host already used in a finding.
  const hostOptions = useMemo(
    () => [...new Set([...hosts, ...findings.map((f) => f.host)].filter(Boolean))].sort(),
    [hosts, findings],
  );
  // typeahead suggestions for the form's Target-host input (never render 100k <option>)
  const formHostSug = useMemo(() => {
    const q = (form.host || '').trim().toLowerCase();
    const src = q ? hostOptions.filter((h) => h.toLowerCase().includes(q)) : hostOptions;
    return src.slice(0, 50);
  }, [form.host, hostOptions]);
  // capped + searchable host chip list (rendering 100k chips froze the tab)
  const shownHosts = useMemo(() => {
    const q = hostSearch.trim().toLowerCase();
    const src = q ? hostOptions.filter((h) => h.toLowerCase().includes(q)) : hostOptions;
    return src.slice(0, 300);
  }, [hostSearch, hostOptions]);
  const findingCountByHost = useMemo(() => {
    const m = {};
    for (const f of findings) m[f.host] = (m[f.host] || 0) + 1;
    return m;
  }, [findings]);

  const stats = useMemo(() => {
    const byStatus = {}; const bySev = {}; let bounty = 0;
    for (const f of findings) {
      byStatus[f.status] = (byStatus[f.status] || 0) + 1;
      bySev[f.severity] = (bySev[f.severity] || 0) + 1;
      bounty += Number(f.bounty) || 0;
    }
    return { byStatus, bySev, bounty };
  }, [findings]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return findings.filter((f) => {
      if (fStatus !== 'all' && f.status !== fStatus) return false;
      if (fSev !== 'all' && f.severity !== fSev) return false;
      if (fHost !== 'all' && f.host !== fHost) return false;
      if (!s) return true;
      return `${f.title} ${f.host} ${f.note} ${f.tags} ${f.category}`.toLowerCase().includes(s);
    });
  }, [findings, q, fStatus, fSev, fHost]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const f of filtered) { if (!m.has(f.host)) m.set(f.host, []); m.get(f.host).push(f); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const resetForm = () => { setForm(blankForm); setEditingId(null); };
  const scrollToForm = () => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const save = () => {
    if (!form.host.trim() || !form.title.trim()) { alert('Target host and title are required.'); return; }
    const now = Date.now();
    if (!editingId) {
      // Dedup guard
      const dup = findings.find((f) => f.host === form.host.trim() && f.title.trim().toLowerCase() === form.title.trim().toLowerCase());
      if (dup && !confirm('A finding with this title already exists for this host. Add anyway?')) return;
    }
    if (editingId) {
      persist(findings.map((f) => {
        if (f.id !== editingId) return f;
        const statusLog = f.status !== form.status ? [...(f.statusLog || []), { status: form.status, at: now }] : (f.statusLog || []);
        return { ...f, ...form, host: form.host.trim(), title: form.title.trim(), updated: now, statusLog };
      }));
    } else {
      persist([...findings, { ...form, host: form.host.trim(), title: form.title.trim(), id: `f_${now}`, created: now, updated: now, statusLog: [{ status: form.status, at: now }] }]);
    }
    resetForm();
  };

  const edit = (f) => { setForm({ ...blankForm, ...f }); setEditingId(f.id); scrollToForm(); };
  const remove = (id) => { if (confirm('Delete this finding?')) persist(findings.filter((f) => f.id !== id)); };
  const quickStatus = (f, status) => persist(findings.map((x) => (x.id === f.id ? { ...x, status, updated: Date.now(), statusLog: [...(x.statusLog || []), { status, at: Date.now() }] } : x)));

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); };

  const insertTemplate = () => {
    if (!form.category) { alert('Pick a category first to insert its techniques.'); return; }
    const techs = TECHNIQUES.filter((t) => t.cat === form.category).slice(0, 8).map((t, i) => `${i + 1}. ${t.t}`).join('\n');
    setForm((prev) => ({ ...prev, steps: (prev.steps ? prev.steps + '\n' : '') + techs }));
  };

  const exportAll = () => {
    if (filtered.length === 0) { alert('Nothing to export.'); return; }
    download('findings.md', filtered.map(toMarkdown).join('\n\n---\n\n'));
  };

  return (
    <div className="fn-wrap">
      <style>{styles}</style>

      <header className="fn-head">
        <div>
          <h1>📝 Findings</h1>
          <p>{findings.length} findings · ${stats.bounty.toLocaleString()} bounty · {Object.keys(findingCountByHost).length} hosts</p>
        </div>
        <button className="fn-btn" onClick={exportAll}>📦 Export Markdown</button>
      </header>

      {/* Status / severity summary */}
      <div className="fn-summary">
        {STATUSES.filter((s) => stats.byStatus[s]).map((s) => (
          <span key={s} className="fn-pill" style={{ color: STATUS_COLOR[s], borderColor: `${STATUS_COLOR[s]}55` }}>{s} {stats.byStatus[s]}</span>
        ))}
        {SEVERITIES.filter((s) => stats.bySev[s]).map((s) => (
          <span key={s} className="fn-pill" style={{ color: getSevColor(s), borderColor: `${getSevColor(s)}55` }}>{s} {stats.bySev[s]}</span>
        ))}
      </div>

      {/* Editor */}
      <section className="fn-panel fn-pad" ref={formRef}>
        <strong>{editingId ? 'Edit finding' : 'New finding'}</strong>
        <div className="fn-grid">
          <label className="fn-l">Target host
            <input className="fn-in" list="fn-hosts" placeholder="api.target.com" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
            <datalist id="fn-hosts">{formHostSug.map((h) => <option key={h} value={h} />)}</datalist>
          </label>
          <label className="fn-l">Title
            <input className="fn-in" placeholder="IDOR on /api/orders/{id}" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="fn-l">Category
            <select className="fn-in" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="">—</option>
              {TECHNIQUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="fn-l">Severity
            <select className="fn-in" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="fn-l">Status
            <select className="fn-in" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="fn-l">CVSS
            <input className="fn-in" placeholder="7.5 / vector" value={form.cvss} onChange={(e) => setForm((f) => ({ ...f, cvss: e.target.value }))} />
          </label>
          <label className="fn-l">Bounty $
            <input className="fn-in" type="number" placeholder="0" value={form.bounty} onChange={(e) => setForm((f) => ({ ...f, bounty: e.target.value }))} />
          </label>
          <label className="fn-l">Tags (comma)
            <input className="fn-in" placeholder="p1, auth, api" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
          </label>
        </div>
        <textarea className="fn-area" placeholder="Description — what you found and why it matters" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        <div className="fn-steps-head">
          <span>Steps to reproduce / PoC</span>
          <button className="fn-btn-sm" onClick={insertTemplate} title="Insert techniques for the chosen category">+ insert {form.category || 'category'} techniques</button>
        </div>
        <textarea className="fn-area" placeholder="1. ... 2. ..." value={form.steps} onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))} />
        <div className="fn-grid2">
          <textarea className="fn-area fn-mono" placeholder="Raw request (optional)" value={form.request} onChange={(e) => setForm((f) => ({ ...f, request: e.target.value }))} />
          <textarea className="fn-area fn-mono" placeholder="Raw response (optional)" value={form.response} onChange={(e) => setForm((f) => ({ ...f, response: e.target.value }))} />
        </div>
        <input className="fn-in" placeholder="References (URLs, CWE, links)" value={form.refs} onChange={(e) => setForm((f) => ({ ...f, refs: e.target.value }))} style={{ marginTop: 10 }} />
        <div className="fn-actions">
          {editingId && <button className="fn-btn" onClick={resetForm}>Cancel</button>}
          <button className="fn-btn fn-primary" onClick={save}>{editingId ? 'Update finding' : 'Save finding'}</button>
        </div>
      </section>

      {/* Filters */}
      <div className="fn-filters">
        <input className="fn-search" placeholder="Search findings…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="fn-in fn-sm" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="all">all status</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className="fn-in fn-sm" value={fSev} onChange={(e) => setFSev(e.target.value)}><option value="all">all severity</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className="fn-in fn-sm" value={fHost} onChange={(e) => setFHost(e.target.value)}><option value="all">all hosts</option>{(fHost !== 'all' && !hostOptions.slice(0, 200).includes(fHost) ? [fHost] : []).concat(hostOptions.slice(0, 200)).map((h) => <option key={h} value={h}>{h}</option>)}</select>
      </div>

      {/* All subdomains — pulled straight from the Subdomains tab. Click one to
          filter to it AND prefill the new-finding form. */}
      <div className="fn-hostbar-head">
        All subdomains ({hostOptions.length.toLocaleString()}) — click to write a finding against it
        <input className="fn-in fn-sm" style={{ marginLeft: 8, minWidth: 200 }} placeholder="filter hosts…" value={hostSearch} onChange={(e) => setHostSearch(e.target.value)} />
      </div>
      <div className="fn-hostbar">
        {shownHosts.map((h) => (
          <button
            key={h}
            className={`fn-hostchip ${fHost === h ? 'on' : ''}`}
            onClick={() => { setFHost(fHost === h ? 'all' : h); setForm((f) => ({ ...f, host: h })); }}
            title="Filter + prefill new finding for this host"
          >
            {h} {findingCountByHost[h] ? <b>{findingCountByHost[h]}</b> : <span className="fn-zero">0</span>}
          </button>
        ))}
        {hostOptions.length === 0 && <span className="fn-empty">Import subdomains in the Subdomains tab — they'll appear here automatically.</span>}
        {hostOptions.length > shownHosts.length && <span className="fn-empty">…{(hostOptions.length - shownHosts.length).toLocaleString()} more — use the filter</span>}
      </div>

      {grouped.length === 0 && <div className="fn-empty">No findings match. Add one above.</div>}
      {grouped.map(([host, items]) => (
        <section key={host} className="fn-group">
          <div className="fn-host">{host} <span className="fn-host-n">{items.length}</span></div>
          {items.map((f) => (
            <div key={f.id} className="fn-card">
              <div className="fn-card-top">
                <span className="fn-sev" style={{ background: `${getSevColor(f.severity)}22`, color: getSevColor(f.severity), borderColor: `${getSevColor(f.severity)}55` }}>{f.severity}</span>
                <span className="fn-title" onClick={() => setExpanded(expanded === f.id ? null : f.id)}>{f.title}</span>
                {f.category && <span className="fn-tag">{f.category}</span>}
                {f.bounty ? <span className="fn-bounty">${Number(f.bounty).toLocaleString()}</span> : null}
                <select className="fn-status" style={{ color: STATUS_COLOR[f.status] }} value={f.status} onChange={(e) => quickStatus(f, e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {expanded === f.id && (
                <div className="fn-detail">
                  {f.cvss && <div className="fn-meta">CVSS: {f.cvss}</div>}
                  {f.tags && <div className="fn-meta">Tags: {f.tags}</div>}
                  {f.note && <div className="fn-block"><b>Description</b><div className="fn-text">{f.note}</div></div>}
                  {f.steps && <div className="fn-block"><b>Steps</b><pre className="fn-pre">{f.steps}</pre></div>}
                  {f.request && <div className="fn-block"><b>Request</b><pre className="fn-pre">{f.request}</pre></div>}
                  {f.response && <div className="fn-block"><b>Response</b><pre className="fn-pre">{f.response}</pre></div>}
                  {f.refs && <div className="fn-meta">Refs: {f.refs}</div>}
                  {f.statusLog && f.statusLog.length > 1 && (
                    <div className="fn-meta">Timeline: {f.statusLog.map((s) => `${s.status}@${new Date(s.at).toLocaleDateString()}`).join(' → ')}</div>
                  )}
                </div>
              )}
              <div className="fn-card-actions">
                <button className="fn-btn-sm" onClick={() => copy(toMarkdown(f), `md-${f.id}`)}>{copied === `md-${f.id}` ? '✓ Copied' : 'Copy MD'}</button>
                <button className="fn-btn-sm" onClick={() => download(`${f.host}-${f.title}`.replace(/[^\w.-]+/g, '_') + '.md', toMarkdown(f))}>Export</button>
                <button className="fn-btn-sm" onClick={() => edit(f)}>Edit</button>
                <button className="fn-btn-sm fn-danger" onClick={() => remove(f.id)}>Delete</button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
});

const styles = `
.fn-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); max-width: none; }
.fn-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.fn-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.fn-head p { margin: 2px 0 0; font-size: 13px; color: var(--text2); }
.fn-summary { display: flex; flex-wrap: wrap; gap: 6px; margin: var(--sp-4) 0; }
.fn-pill { font-size: 11px; font-weight: 600; padding: 3px 10px; border: 1px solid; border-radius: 999px; text-transform: capitalize; }
.fn-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: var(--sp-4); }
.fn-pad { padding: var(--sp-4); }
.fn-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
.fn-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.fn-l { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text2); }
.fn-in { padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.fn-in:focus { border-color: var(--border-active); }
.fn-area { width: 100%; box-sizing: border-box; min-height: 70px; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; resize: vertical; }
.fn-mono { font-family: var(--font-data); font-size: 12px; white-space: pre; min-height: 90px; }
.fn-steps-head { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: var(--text2); }
.fn-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.fn-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 9px 16px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; }
.fn-btn:hover { background: var(--surface-hover); }
.fn-primary { background: var(--grad); color: #fff; border: none; font-weight: 600; }
.fn-btn-sm { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
.fn-btn-sm:hover { background: var(--surface-hover); }
.fn-danger { color: #ef4444; }
.fn-filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.fn-search { flex: 1; min-width: 200px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.fn-sm { font-size: 12px; }
.fn-hostbar-head { font-size: 12px; color: var(--text2); margin-bottom: 8px; }
.fn-hostbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--sp-4); max-height: 220px; overflow: auto; }
.fn-hostchip { font-size: 12px; font-family: var(--font-data); background: var(--surface); border: 1px solid var(--border); color: var(--text2); padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; }
.fn-hostchip.on { background: var(--accent-primary-dim); color: var(--accent-primary-bright); border-color: var(--border-active); }
.fn-hostchip b { color: var(--accent-primary-bright); margin-left: 4px; }
.fn-zero { color: var(--text3); margin-left: 4px; }
.fn-group { margin-bottom: var(--sp-4); }
.fn-host { font-family: var(--font-data); font-size: 14px; font-weight: 700; color: var(--accent-primary-bright); margin-bottom: 8px; }
.fn-host-n { font-size: 11px; color: var(--text2); background: var(--surface); border: 1px solid var(--border); padding: 1px 7px; border-radius: 999px; margin-left: 6px; }
.fn-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; margin-bottom: 8px; }
.fn-card-top { display: flex; align-items: center; gap: 10px; }
.fn-sev { flex-shrink: 0; text-transform: uppercase; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
.fn-title { flex: 1; min-width: 0; font-weight: 600; font-size: 13.5px; cursor: pointer; }
.fn-tag { font-size: 10px; padding: 2px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; color: var(--text2); }
.fn-bounty { font-size: 12px; font-weight: 700; color: #10b981; }
.fn-status { background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-transform: capitalize; }
.fn-detail { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px; }
.fn-meta { font-size: 12px; color: var(--text2); margin-bottom: 6px; }
.fn-block { margin-bottom: 10px; }
.fn-block b { font-size: 12px; color: var(--text-primary); }
.fn-text { font-size: 13px; color: var(--text2); white-space: pre-wrap; margin-top: 4px; }
.fn-pre { background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; font-family: var(--font-data); font-size: 11.5px; color: var(--text2); white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; margin: 4px 0 0; }
.fn-card-actions { display: flex; gap: 6px; margin-top: 10px; }
.fn-empty { color: var(--text2); font-style: italic; padding: 8px 0; }
@media (max-width: 900px) { .fn-grid { grid-template-columns: 1fr 1fr; } .fn-grid2 { grid-template-columns: 1fr; } }
`;

export default FindingsTab;
