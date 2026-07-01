import { memo, useEffect, useMemo, useRef, useState, useDeferredValue, useCallback } from 'react';
import { loadWordlists, saveWordlists, cleanLines, crossListStats, suggestForTech } from '../../lib/wordlists.js';

// A wordlist = { id, name, category, variant, content, lines, preview }.
// `lines` + `preview` are computed once at save so cards never re-split big
// content (the bottleneck at ~1M lines). Stored globally, grouped by tech.
const lineCount = (s) => (s ? s.split('\n').filter(Boolean).length : 0);
// Count newlines without allocating a multi-million-element array (cheap on huge content).
const countLines = (s) => { if (!s) return 0; let n = 1; for (let i = s.indexOf('\n'); i !== -1; i = s.indexOf('\n', i + 1)) n++; return n; };
const BIG_BYTES = 2_000_000; // files/lists above this never touch the editor textarea
// First N lines without splitting the whole string (cheap on huge content).
const headLines = (s, n = 6) => {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const nl = s.indexOf('\n', idx);
    if (nl === -1) return s; // fewer than n lines
    idx = nl + 1;
  }
  return s.slice(0, idx - 1); // first n lines, no trailing newline
};
const withMeta = (l) => (l.lines != null && l.preview != null ? l : { ...l, lines: countLines(l.content), preview: headLines(l.content) });
const VARIANTS = ['short', 'medium', 'long'];
const CONTENT_SEARCH_MAX = 200000; // don't full-scan giant lists on every filter keystroke
const blankForm = { name: '', category: '', variant: '' };

const WordlistsTab = memo(function WordlistsTab({ techHints = [] }) {
  const [lists, setLists] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('');
  const [variantFilter, setVariantFilter] = useState('all');
  const [copied, setCopied] = useState(null);
  const [clean, setClean] = useState({ dedup: true, sort: false });
  const [formLines, setFormLines] = useState(0);
  const fileRef = useRef(null);
  const importRef = useRef(null);
  const contentRef = useRef(null);
  const cleanWorkerRef = useRef(null);
  const getCleanWorker = useCallback(() => {
    if (!cleanWorkerRef.current) cleanWorkerRef.current = new Worker(new URL('./clean.worker.js', import.meta.url), { type: 'module' });
    return cleanWorkerRef.current;
  }, []);
  useEffect(() => () => { if (cleanWorkerRef.current) cleanWorkerRef.current.terminate(); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const w = (await loadWordlists()).map(withMeta);
      if (!cancelled) setLists(w);
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-load when returning to the tab so URL-Parser "Send to Wordlists" shows up.
  useEffect(() => {
    const onFocus = async () => setLists((await loadWordlists()).map(withMeta));
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const persist = useCallback((next) => { setLists(next); saveWordlists(next); }, []);

  // Export/Import — moves wordlists between origins (e.g. localhost:5173 → :5050),
  // since IndexedDB is per-port. Strips runtime meta; import merges by id, keeping
  // existing on collision.
  const exportLists = () => {
    const data = JSON.stringify(lists.map(({ id, name, category, variant, content, lines, preview }) =>
      ({ id, name, category, variant, content, lines, preview })), null, 0);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wordlists-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importLists = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const arr = JSON.parse(ev.target.result);
        if (!Array.isArray(arr)) throw new Error('not an array');
        const have = new Set(lists.map((l) => l.id));
        const incoming = arr
          .filter((l) => l && typeof l.content === 'string' && !have.has(l.id))
          .map((l) => ({ id: l.id || `wl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: l.name || 'imported', category: l.category || '', variant: l.variant || '', content: l.content, lines: l.lines ?? lineCount(l.content), preview: l.preview }));
        persist([...lists, ...incoming].map(withMeta));
        alert(`Imported ${incoming.length} wordlist(s).`);
      } catch (err) {
        alert('Invalid wordlists .json file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const categories = useMemo(() => [...new Set(lists.map((l) => l.category).filter(Boolean))].sort(), [lists]);
  // Deferred so a 1M-entry stats pass never blocks typing/rendering.
  const deferredLists = useDeferredValue(lists);
  // Cross-list overlap skips very large lists so a 47MB list can't freeze the header.
  const stats = useMemo(() => crossListStats(deferredLists.filter((l) => l.content.length < BIG_BYTES)), [deferredLists]);
  const suggested = useMemo(() => suggestForTech(lists, techHints), [lists, techHints]);
  const totalLines = useMemo(() => lists.reduce((a, l) => a + (l.lines || 0), 0), [lists]);

  const grouped = useMemo(() => {
    const f = filter.toLowerCase();
    const visible = lists.filter((l) => {
      if (variantFilter !== 'all' && (l.variant || '') !== variantFilter) return false;
      if (!f) return true;
      if (l.name.toLowerCase().includes(f) || (l.category || '').toLowerCase().includes(f)) return true;
      // Content search skipped for very large lists to keep filtering responsive.
      return l.content.length < CONTENT_SEARCH_MAX && l.content.toLowerCase().includes(f);
    });
    const map = new Map();
    for (const l of visible) {
      const k = l.category || 'Uncategorized';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(l);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lists, filter, variantFilter]);

  const resetForm = () => { setForm(blankForm); setEditingId(null); if (contentRef.current) contentRef.current.value = ''; setFormLines(0); };

  const save = () => {
    const rawContent = contentRef.current ? contentRef.current.value : '';
    if (!form.name.trim() || !rawContent.trim()) { alert('Name and content are required.'); return; }
    const content = cleanLines(rawContent, clean);
    const entry = {
      name: form.name.trim(),
      category: form.category.trim() || 'Uncategorized',
      variant: form.variant || '',
      content,
      lines: lineCount(content),
      preview: headLines(content),
    };
    if (editingId) {
      persist(lists.map((l) => (l.id === editingId ? { ...l, ...entry } : l)));
    } else {
      persist([...lists, { ...entry, id: `wl_${Date.now()}` }]);
    }
    resetForm();
  };

  const edit = (l) => {
    if (l.content.length > BIG_BYTES) {
      alert('This list is too large to edit inline. Use Export to edit it externally, then re-import.');
      return;
    }
    setForm({ name: l.name, category: l.category, variant: l.variant || '' });
    setEditingId(l.id);
    if (contentRef.current) contentRef.current.value = l.content;
    setFormLines(l.lines ?? countLines(l.content));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = (id) => { if (confirm('Delete this wordlist?')) persist(lists.filter((l) => l.id !== id)); };

  const copy = (l) => { navigator.clipboard.writeText(l.content); setCopied(l.id); setTimeout(() => setCopied(null), 1500); };

  const exportOne = (l) => {
    const blob = new Blob([l.content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${l.name.replace(/[^\w.-]+/g, '_')}.txt`; a.click();
    window.URL.revokeObjectURL(url);
  };

  const importFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const name = file.name.replace(/\.[^.]+$/, '');
      // Large file: process + store directly, never render it in the editor
      // textarea (that is what froze the page).
      if (text.length > BIG_BYTES) {
        // Clean off the main thread so a 47MB import never freezes the page.
        const category = form.category.trim() || 'Uncategorized';
        const variant = form.variant || '';
        const w = getCleanWorker();
        w.onmessage = (ev) => {
          const { content, lines, preview } = ev.data;
          setLists((prev) => { const next = [...prev, { id: `wl_${Date.now()}`, name, category, variant, content, lines, preview }]; saveWordlists(next); return next; });
          alert(`Imported ${lines.toLocaleString()} lines as "${name}". Large file — cleaned in the background, saved directly.`);
        };
        w.postMessage({ text, opts: clean });
        return;
      }
      setForm((f) => ({ ...f, name }));
      setEditingId(null);
      if (contentRef.current) contentRef.current.value = text;
      setFormLines(countLines(text));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  return (
    <div className="wlt-wrap">
      <style>{styles}</style>

      <header className="wlt-head">
        <div>
          <h1>📚 Wordlists</h1>
          <p>{lists.length} lists · {categories.length} categories · {totalLines.toLocaleString()} total lines · {stats.uniqueEntries.toLocaleString()} unique · {stats.sharedEntries.toLocaleString()} shared</p>
        </div>
      </header>

      {suggested.length > 0 && (
        <section className="wlt-panel wlt-pad wlt-suggest">
          <strong>🎯 Suggested for this target</strong>
          <span className="wlt-suggest-tech">stack: {[...new Set(techHints)].slice(0, 8).join(', ')}</span>
          <div className="wlt-suggest-chips">
            {suggested.map((l) => (
              <button key={l.id} className="wlt-suggest-chip" onClick={() => copy(l)} title={`Copy ${l.name} (${(l.lines || 0).toLocaleString()} lines)`}>
                {copied === l.id ? '✓ ' : '📋 '}{l.name} <em>{l.category}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Editor */}
      <section className="wlt-panel wlt-pad">
        <strong>{editingId ? 'Edit wordlist' : 'New wordlist'}</strong>
        <div className="wlt-form">
          <input className="wlt-in" placeholder="Name (e.g. WordPress plugins)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="wlt-in" list="wlt-cats" placeholder="Tech / category (e.g. WordPress, PHP, params)" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <datalist id="wlt-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <select className="wlt-in" value={form.variant} onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value }))}>
            <option value="">size: — (none)</option>
            {VARIANTS.map((v) => <option key={v} value={v}>size: {v}</option>)}
          </select>
        </div>
        <textarea
          ref={contentRef}
          className="wlt-area"
          placeholder="One entry per line…"
          defaultValue=""
          onBlur={(e) => setFormLines(countLines(e.target.value))}
          spellCheck="false"
          wrap="off"
        />
        <div className="wlt-actions">
          <span className="wlt-count">{formLines.toLocaleString()} lines</span>
          <label className="wlt-toggle"><input type="checkbox" checked={clean.dedup} onChange={() => setClean((c) => ({ ...c, dedup: !c.dedup }))} /> dedup</label>
          <label className="wlt-toggle"><input type="checkbox" checked={clean.sort} onChange={() => setClean((c) => ({ ...c, sort: !c.sort }))} /> sort</label>
          <button className="wlt-btn" onClick={() => fileRef.current.click()}>📂 Import file</button>
          <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".txt,.lst,.dic" onChange={importFile} />
          {editingId && <button className="wlt-btn" onClick={resetForm}>Cancel</button>}
          <button className="wlt-btn wlt-primary" onClick={save}>{editingId ? 'Update' : 'Save'}</button>
        </div>
      </section>

      <div className="wlt-filter-bar">
        <input className="wlt-filter" placeholder="Filter by name / category / content…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="wlt-vfilter">
          {['all', ...VARIANTS].map((v) => (
            <button key={v} className={variantFilter === v ? 'on' : ''} onClick={() => setVariantFilter(v)}>{v}</button>
          ))}
        </div>
        <button className="wlt-io" onClick={exportLists} disabled={lists.length === 0} title="Download all wordlists as .json">⤓ Export</button>
        <button className="wlt-io" onClick={() => importRef.current?.click()} title="Import wordlists from a .json (merges)">⤒ Import</button>
        <input type="file" ref={importRef} accept=".json" style={{ display: 'none' }} onChange={importLists} />
      </div>

      {grouped.length === 0 && <div className="wlt-empty">No wordlists yet. Add one above.</div>}
      {grouped.map(([cat, items]) => (
        <section key={cat} className="wlt-group">
          <div className="wlt-cat">{cat} <span className="wlt-cat-n">{items.length}</span></div>
          <div className="wlt-cards">
            {items.map((l) => (
              <div key={l.id} className="wlt-card">
                <div className="wlt-card-head">
                  <span className="wlt-name" title={l.name}>{l.variant && <b className={`wlt-variant wlt-v-${l.variant}`}>{l.variant}</b>}{l.name}</span>
                  <span className="wlt-lines">{(l.lines || 0).toLocaleString()}</span>
                </div>
                <pre className="wlt-preview">{l.preview}{(l.lines || 0) > 6 ? '\n…' : ''}</pre>
                <div className="wlt-card-actions">
                  <button className="wlt-btn-sm" onClick={() => copy(l)}>{copied === l.id ? '✓ Copied' : 'Copy'}</button>
                  <button className="wlt-btn-sm" onClick={() => exportOne(l)}>Export</button>
                  <button className="wlt-btn-sm" onClick={() => edit(l)}>Edit</button>
                  <button className="wlt-btn-sm wlt-danger" onClick={() => remove(l.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});

const styles = `
.wlt-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); max-width: none; }
.wlt-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.wlt-head p { margin: 2px 0 var(--sp-5); font-size: 13px; color: var(--text2); }
.wlt-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: var(--sp-4); }
.wlt-pad { padding: var(--sp-4); }
.wlt-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
.wlt-in { padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.wlt-in:focus { border-color: var(--border-active); }
.wlt-area { width: 100%; box-sizing: border-box; min-height: 160px; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 12.5px; outline: none; resize: vertical; white-space: pre; }
.wlt-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.wlt-count { font-size: 12px; color: var(--text2); margin-right: auto; }
.wlt-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 14px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; }
.wlt-btn:hover { background: var(--surface-hover); }
.wlt-primary { background: var(--grad); color: #fff; border: none; font-weight: 600; }
.wlt-filter { width: 100%; box-sizing: border-box; padding: 9px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; margin-bottom: var(--sp-4); }
.wlt-group { margin-bottom: var(--sp-5); }
.wlt-cat { font-family: var(--font-display); font-size: 14px; font-weight: 700; color: var(--accent-primary-bright); margin-bottom: 10px; }
.wlt-cat-n { font-size: 11px; color: var(--text2); background: var(--surface); border: 1px solid var(--border); padding: 1px 7px; border-radius: 999px; margin-left: 6px; }
.wlt-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-3); }
.wlt-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; }
.wlt-card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.wlt-name { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wlt-lines { font-size: 11px; color: var(--text2); font-family: var(--font-data); flex-shrink: 0; }
.wlt-preview { background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; font-family: var(--font-data); font-size: 11px; color: var(--text2); max-height: 110px; overflow: hidden; white-space: pre; margin: 0 0 8px; }
.wlt-card-actions { display: flex; gap: 6px; margin-top: auto; }
.wlt-btn-sm { flex: 1; background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 5px; border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; }
.wlt-btn-sm:hover { background: var(--surface-hover); }
.wlt-danger { color: #ef4444; }
.wlt-empty { color: var(--text2); font-style: italic; padding: 24px 0; }
.wlt-toggle { font-size: 12px; color: var(--text2); display: flex; align-items: center; gap: 4px; cursor: pointer; }
.wlt-toggle input { accent-color: var(--accent-primary); }
.wlt-suggest { border-color: var(--border-active); }
.wlt-suggest-tech { font-size: 12px; color: var(--text2); margin-left: 10px; }
.wlt-suggest-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.wlt-suggest-chip { background: var(--accent-primary-dim); border: 1px solid var(--border-active); color: var(--accent-primary-bright); padding: 6px 12px; border-radius: 999px; font-size: 12px; cursor: pointer; }
.wlt-suggest-chip em { color: var(--text2); font-style: normal; font-size: 10px; }
.wlt-filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: var(--sp-4); flex-wrap: wrap; }
.wlt-filter-bar .wlt-filter { margin-bottom: 0; flex: 1; min-width: 200px; }
.wlt-io { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 14px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; white-space: nowrap; }
.wlt-io:disabled { opacity: .5; cursor: default; }
.wlt-vfilter { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px; }
.wlt-vfilter button { border: none; background: transparent; color: var(--text2); padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; text-transform: capitalize; }
.wlt-vfilter button.on { background: var(--accent-primary-dim); color: var(--accent-primary-bright); }
.wlt-variant { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; margin-right: 6px; vertical-align: middle; }
.wlt-v-short { background: rgba(16,185,129,0.15); color: #10b981; }
.wlt-v-medium { background: rgba(245,158,11,0.15); color: #f59e0b; }
.wlt-v-long { background: rgba(239,68,68,0.15); color: #ef4444; }
@media (max-width: 720px) { .wlt-form { grid-template-columns: 1fr; } }
`;

export default WordlistsTab;
