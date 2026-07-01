import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { get, set, KEYS } from '../../lib/storage.js';
import { getSevColor } from '../UrlParser/engine.js';
import { FEATURES, featureLabel, suggestTechniques, featuresByHost } from '../../lib/features.js';

// note = { id, host, features:[{name,status}], tags, body, pinned, created, updated }.
const STATUSES = ['untested', 'testing', 'done', 'vuln'];
const STATUS_COLOR = { untested: '#6b7280', testing: '#3b82f6', done: '#10b981', vuln: '#ef4444' };
const nextStatus = (s) => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];
const withMeta = (n) => ({ ...n, features: Array.isArray(n.features) ? n.features : [] });
const blankForm = { host: '', tags: '', body: '', features: [] };

const NotebookTab = memo(function NotebookTab({ hosts = [], activeProjectId = 'default', onCreateFinding }) {
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [q, setQ] = useState('');
  const [featFilter, setFeatFilter] = useState('all');
  const [viewing, setViewing] = useState(null);
  const [draft, setDraft] = useState(blankForm);
  const [autoFeatures, setAutoFeatures] = useState({}); // host -> [featureKeys] from recon
  const [hostSearch, setHostSearch] = useState('');
  const formRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await get(KEYS.notebook, []);
      if (!cancelled) setNotes(Array.isArray(v) ? v.map(withMeta) : []);
    })();
    return () => { cancelled = true; };
  }, []);

  // Pull parsed URLs for the active project to auto-detect features per host.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const last = await get(KEYS.urlLastScan(activeProjectId), null);
      if (!cancelled) setAutoFeatures(last && Array.isArray(last.parsedData) ? featuresByHost(last.parsedData) : {});
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const persist = useCallback((next) => { setNotes(next); set(KEYS.notebook, next); }, []);

  const hostOptions = useMemo(() => [...new Set([...hosts, ...notes.map((n) => n.host)].filter(Boolean))].sort(), [hosts, notes]);
  // capped typeahead + searchable chip list — rendering 100k <option>/chips froze the tab
  const formHostSug = useMemo(() => {
    const qq = (form.host || '').trim().toLowerCase();
    const src = qq ? hostOptions.filter((h) => h.toLowerCase().includes(qq)) : hostOptions;
    return src.slice(0, 50);
  }, [form.host, hostOptions]);
  const shownHosts = useMemo(() => {
    const qq = hostSearch.trim().toLowerCase();
    const src = qq ? hostOptions.filter((h) => h.toLowerCase().includes(qq)) : hostOptions;
    return src.slice(0, 300);
  }, [hostSearch, hostOptions]);
  const noteByHost = useMemo(() => { const m = {}; for (const n of notes) if (n.host) m[n.host] = (m[n.host] || 0) + 1; return m; }, [notes]);

  // Coverage: per feature -> how many notes have it, and how many still untested.
  const coverage = useMemo(() => {
    const cov = {};
    for (const n of notes) for (const f of n.features) {
      cov[f.name] = cov[f.name] || { total: 0, untested: 0 };
      cov[f.name].total++;
      if (f.status === 'untested') cov[f.name].untested++;
    }
    return cov;
  }, [notes]);

  const visible = useMemo(() => {
    const s = q.toLowerCase();
    return notes
      .filter((n) => (featFilter === 'all' || n.features.some((f) => f.name === featFilter))
        && (!s || `${n.host} ${n.tags} ${n.body} ${n.features.map((f) => f.name).join(' ')}`.toLowerCase().includes(s)))
      .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updated - a.updated));
  }, [notes, q, featFilter]);

  // ---- feature helpers (work on a {features:[]} object) ----
  const hasFeat = (obj, key) => obj.features.some((f) => f.name === key);
  const toggleFeat = (setter, key) => setter((o) => ({
    ...o,
    features: hasFeat(o, key) ? o.features.filter((f) => f.name !== key) : [...o.features, { name: key, status: 'untested' }],
  }));
  const cycleFeat = (setter, key) => setter((o) => ({
    ...o, features: o.features.map((f) => (f.name === key ? { ...f, status: nextStatus(f.status) } : f)),
  }));
  const autoDetect = (setter, host) => {
    const keys = autoFeatures[host] || [];
    if (keys.length === 0) { alert('No features detected from parsed URLs for this host (parse its URLs in URL Parser first).'); return; }
    setter((o) => ({ ...o, features: [...o.features, ...keys.filter((k) => !hasFeat(o, k)).map((k) => ({ name: k, status: 'untested' }))] }));
  };

  const resetForm = () => { setForm(blankForm); setEditingId(null); };
  const save = () => {
    if (!form.host.trim() && !form.body.trim() && form.features.length === 0) { alert('Pick a subdomain and its features.'); return; }
    const now = Date.now();
    const entry = { host: form.host.trim(), tags: form.tags.trim(), body: form.body, features: form.features };
    if (editingId) persist(notes.map((n) => (n.id === editingId ? { ...n, ...entry, updated: now } : n)));
    else persist([...notes, { ...entry, id: `nb_${now}`, pinned: false, created: now, updated: now }]);
    resetForm();
  };
  const openView = (n) => { setViewing(n.id); setDraft({ host: n.host || '', tags: n.tags || '', body: n.body, features: n.features }); };
  const saveView = () => persist(notes.map((n) => (n.id === viewing ? { ...n, ...draft, host: draft.host.trim(), updated: Date.now() } : n)));
  const remove = (id) => { if (confirm('Delete this note?')) { persist(notes.filter((n) => n.id !== id)); if (viewing === id) setViewing(null); } };
  const togglePin = (id) => persist(notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
  const cycleCardFeat = (id, key) => persist(notes.map((n) => (n.id === id ? { ...n, features: n.features.map((f) => (f.name === key ? { ...f, status: nextStatus(f.status) } : f)) } : n)));

  const createFinding = (host, featKey) => {
    const feat = FEATURES.find((f) => f.key === featKey);
    onCreateFinding?.({ host, category: feat?.cats?.[0] || '', title: feat ? `${featureLabel(featKey)} issue` : '' });
  };

  const suggestions = useMemo(() => {
    const keys = (viewing ? draft : form).features.map((f) => f.name);
    return keys.length ? suggestTechniques(keys) : [];
  }, [viewing, draft, form]);

  const FeatureChips = ({ obj, setter, cycle, source }) => (
    <div className="nb-feat-row">
      {FEATURES.map((f) => {
        const sel = obj.features.find((x) => x.name === f.key);
        return (
          <button
            key={f.key}
            className={`nb-feat ${sel ? 'on' : ''}`}
            style={sel ? { borderColor: STATUS_COLOR[sel.status], color: STATUS_COLOR[sel.status] } : undefined}
            onClick={() => (sel && cycle ? cycle(setter, f.key) : toggleFeat(setter, f.key))}
            title={sel ? `${f.label}: ${sel.status} (click to cycle status)` : `add ${f.label}`}
          >
            {f.label}{sel ? ` · ${sel.status}` : ''}
          </button>
        );
      })}
      {source && <button className="nb-btn-sm" onClick={() => autoDetect(setter, source)} title="Detect features from parsed URLs">✨ Auto-detect</button>}
    </div>
  );

  return (
    <div className="nb-wrap">
      <style>{styles}</style>
      <header className="nb-head">
        <div>
          <h1>📓 Notebook</h1>
          <p>{notes.length} notes · {Object.keys(noteByHost).length} hosts · feature → attack mapping</p>
        </div>
      </header>

      {/* Coverage summary */}
      {Object.keys(coverage).length > 0 && (
        <div className="nb-coverage">
          {Object.entries(coverage).sort((a, b) => b[1].total - a[1].total).map(([k, c]) => (
            <button key={k} className={`nb-cov ${featFilter === k ? 'on' : ''}`} onClick={() => setFeatFilter(featFilter === k ? 'all' : k)}>
              {featureLabel(k)} <b>{c.total}</b>{c.untested ? <span className="nb-cov-u">· {c.untested} untested</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <section className="nb-panel" ref={formRef}>
        <strong>{editingId ? 'Edit note' : 'New note'}</strong>
        <div className="nb-row2">
          <input className="nb-in" list="nb-hosts" placeholder="subdomain (pick one)" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
          <datalist id="nb-hosts">{formHostSug.map((h) => <option key={h} value={h} />)}</datalist>
          <input className="nb-in" placeholder="tags (optional)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
        </div>
        <div className="nb-feat-label">Features it has — click to add, click again to cycle status</div>
        <FeatureChips obj={form} setter={setForm} cycle={cycleFeat} source={form.host} />
        <textarea className="nb-area" placeholder="Extra notes (optional)…" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} spellCheck="false" />
        {!editingId && form.features.length > 0 && (
          <div className="nb-suggest">
            <div className="nb-suggest-h">{suggestions.length} suggested techniques for {form.features.map((f) => featureLabel(f.name)).join(', ')}</div>
            <div className="nb-suggest-list">{suggestions.slice(0, 12).map((t, i) => <div key={i} className="nb-sg"><span className="nb-sg-cat">{t.cat}</span> {t.t}</div>)}</div>
          </div>
        )}
        <div className="nb-actions">
          {editingId && <button className="nb-btn" onClick={resetForm}>Cancel</button>}
          <button className="nb-btn nb-primary" onClick={save}>{editingId ? 'Update' : 'Save note'}</button>
        </div>
      </section>

      {/* Subdomains */}
      <div className="nb-hostbar-head">
        All subdomains ({hostOptions.length.toLocaleString()}) — click to start a note (auto-detects features)
        <input className="nb-in" style={{ marginLeft: 8, minWidth: 200, display: 'inline-block', width: 'auto' }} placeholder="filter hosts…" value={hostSearch} onChange={(e) => setHostSearch(e.target.value)} />
      </div>
      <div className="nb-hostbar">
        {shownHosts.map((h) => (
          <button key={h} className="nb-hostchip" onClick={() => { setForm({ ...blankForm, host: h }); autoDetect(setForm, h); formRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>
            {h} {noteByHost[h] ? <b>{noteByHost[h]}</b> : <span className="nb-zero">0</span>}
          </button>
        ))}
        {hostOptions.length === 0 && <span className="nb-empty">Import subdomains — they appear here automatically.</span>}
        {hostOptions.length > shownHosts.length && <span className="nb-empty">…{(hostOptions.length - shownHosts.length).toLocaleString()} more — use the filter</span>}
      </div>

      <input className="nb-search" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 'var(--sp-4)' }} />

      {visible.length === 0 && <div className="nb-empty">No notes yet. Pick a subdomain above.</div>}
      <div className="nb-grid">
        {visible.map((n) => (
          <div key={n.id} className={`nb-card ${n.pinned ? 'pinned' : ''} ${viewing === n.id ? 'active' : ''}`}>
            <div className="nb-card-top">
              <span className="nb-host-title">{n.host || 'general'}</span>
              <button className="nb-pin" onClick={() => togglePin(n.id)}>{n.pinned ? '📌' : '📍'}</button>
            </div>
            <div className="nb-feat-row">
              {n.features.map((f) => (
                <button key={f.name} className="nb-feat on" style={{ borderColor: STATUS_COLOR[f.status], color: STATUS_COLOR[f.status] }} onClick={() => cycleCardFeat(n.id, f.name)} title="click to cycle status">
                  {featureLabel(f.name)} · {f.status}
                </button>
              ))}
              {n.features.length === 0 && <span className="nb-empty">no features tagged</span>}
            </div>
            {n.body && <pre className="nb-body">{n.body}</pre>}
            <div className="nb-card-actions">
              <button className="nb-btn-sm nb-view" onClick={() => openView(n)}>👁 View</button>
              {n.host && n.features[0] && <button className="nb-btn-sm" onClick={() => createFinding(n.host, n.features[0].name)}>→ Finding</button>}
              <button className="nb-btn-sm nb-danger" onClick={() => remove(n.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <div className="nb-drawer">
          <div className="nb-drawer-head">
            <strong>{draft.host || 'note'}</strong>
            <button className="nb-btn-sm" onClick={() => setViewing(null)}>✕ Close</button>
          </div>
          <input className="nb-in" list="nb-hosts" placeholder="subdomain" value={draft.host} onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))} />
          <div className="nb-feat-label">Features — click to toggle, again to cycle status</div>
          <FeatureChips obj={draft} setter={setDraft} cycle={cycleFeat} source={draft.host} />
          <textarea className="nb-drawer-area" value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder="Notes…" spellCheck="false" />
          {suggestions.length > 0 && (
            <div className="nb-suggest">
              <div className="nb-suggest-h">{suggestions.length} techniques for selected features</div>
              <div className="nb-suggest-list nb-suggest-scroll">{suggestions.map((t, i) => <div key={i} className="nb-sg"><span className="nb-sg-cat">{t.cat}</span> {t.t}</div>)}</div>
            </div>
          )}
          <div className="nb-drawer-actions">
            <button className="nb-btn-sm nb-danger" onClick={() => remove(viewing)}>Delete</button>
            <div style={{ display: 'flex', gap: 8 }}>
              {draft.host && draft.features[0] && <button className="nb-btn-sm" onClick={() => createFinding(draft.host, draft.features[0].name)}>→ Finding</button>}
              <button className="nb-btn nb-primary" onClick={saveView}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const styles = `
.nb-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); max-width: 1200px; }
.nb-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.nb-head p { margin: 2px 0 var(--sp-4); font-size: 13px; color: var(--text2); }
.nb-coverage { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--sp-4); }
.nb-cov { font-size: 12px; background: var(--surface); border: 1px solid var(--border); color: var(--text2); padding: 4px 10px; border-radius: 999px; cursor: pointer; }
.nb-cov.on { background: var(--accent-primary-dim); color: var(--accent-primary-bright); border-color: var(--border-active); }
.nb-cov b { color: var(--accent-primary-bright); margin-left: 4px; }
.nb-cov-u { color: #f59e0b; margin-left: 4px; }
.nb-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-4); margin-bottom: var(--sp-4); }
.nb-row2 { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin: 12px 0; }
.nb-in { padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.nb-in:focus { border-color: var(--border-active); }
.nb-feat-label { font-size: 12px; color: var(--text2); margin-bottom: 8px; }
.nb-feat-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.nb-feat { font-size: 11px; background: var(--surface); border: 1px solid var(--border); color: var(--text2); padding: 4px 10px; border-radius: 999px; cursor: pointer; }
.nb-feat.on { background: var(--accent-primary-dim); font-weight: 600; }
.nb-area { width: 100%; box-sizing: border-box; min-height: 70px; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 13px; outline: none; resize: vertical; }
.nb-suggest { margin-top: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; background: var(--bg-base); }
.nb-suggest-h { font-size: 12px; color: var(--accent-primary-bright); margin-bottom: 6px; }
.nb-suggest-list { font-size: 12px; }
.nb-suggest-scroll { max-height: 240px; overflow: auto; }
.nb-sg { padding: 3px 0; border-top: 1px solid var(--border); color: var(--text2); font-family: var(--font-data); }
.nb-sg-cat { color: var(--accent-primary-bright); text-transform: uppercase; font-size: 9px; font-weight: 700; margin-right: 6px; }
.nb-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.nb-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 9px 16px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; }
.nb-primary { background: var(--grad); color: #fff; border: none; font-weight: 600; }
.nb-btn-sm { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
.nb-view { color: var(--accent-primary-bright); }
.nb-danger { color: #ef4444; }
.nb-hostbar-head { font-size: 12px; color: var(--text2); margin-bottom: 8px; }
.nb-hostbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--sp-4); max-height: 180px; overflow: auto; }
.nb-hostchip { font-size: 12px; font-family: var(--font-data); background: var(--surface); border: 1px solid var(--border); color: var(--text2); padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; }
.nb-hostchip b { color: var(--accent-primary-bright); margin-left: 4px; }
.nb-zero { color: var(--text3); margin-left: 4px; }
.nb-search { width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.nb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--sp-3); }
.nb-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; }
.nb-card.pinned { border-color: var(--border-active); }
.nb-card.active { border-color: var(--border-active); box-shadow: var(--glow-purple); }
.nb-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.nb-host-title { font-family: var(--font-data); font-weight: 700; font-size: 13.5px; color: var(--accent-primary-bright); word-break: break-all; }
.nb-pin { background: none; border: none; cursor: pointer; font-size: 14px; }
.nb-body { background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; font-family: var(--font-data); font-size: 12px; color: var(--text2); white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow: auto; margin: 8px 0; }
.nb-card-actions { display: flex; gap: 6px; margin-top: auto; padding-top: 8px; }
.nb-empty { color: var(--text2); font-style: italic; font-size: 13px; }
.nb-drawer { position: fixed; top: var(--topbar-h); right: 0; bottom: 0; width: 480px; max-width: 94vw; background: var(--bg-surface); border-left: 1px solid var(--border); box-shadow: -10px 0 40px var(--shadow-strong); padding: var(--sp-4); display: flex; flex-direction: column; z-index: 50; overflow: auto; }
.nb-drawer-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.nb-drawer-head strong { font-family: var(--font-data); color: var(--accent-primary-bright); word-break: break-all; }
.nb-drawer .nb-in { margin-bottom: 10px; width: 100%; box-sizing: border-box; }
.nb-drawer-area { min-height: 120px; margin-top: 10px; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 13px; outline: none; resize: vertical; }
.nb-drawer-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
@media (max-width: 720px) { .nb-row2 { grid-template-columns: 1fr; } }
`;

export default NotebookTab;
