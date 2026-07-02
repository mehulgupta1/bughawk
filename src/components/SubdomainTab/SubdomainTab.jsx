import { useCallback, useEffect, useMemo, useRef, useState, useTransition, memo } from 'react';
import ImportPanel from './ImportPanel.jsx';
import FilterPills, { CURATED_CODES } from './FilterPills.jsx';
import BulkBar from './BulkBar.jsx';
import BulkImportModal from './BulkImportModal.jsx';
import ColumnsMenu from './ColumnsMenu.jsx';
import KeywordModal from './KeywordModal.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import GroupedTable from './GroupedTable.jsx';
import DataRow, { TableHeader, tableMinWidth } from './DataRow.jsx';
import { exportTxt, exportCsv } from '../../lib/exporter.js';
import { getAvailableColumns, DEFAULT_VISIBLE } from '../../lib/columns.js';
import { matchKeyword } from '../../lib/smartflag.js';

const PAGE_SIZE = 100;
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 250;

// Debounce hook — prevents re-filtering 100k rows on every keystroke
function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SubdomainTab({
  subs,
  active = true,
  onCopyToast,
  keywords,
  onSaveKeywords,
  focusNewIds,
  onClearFocusNew,
  scopeStatus,
  hasScope,
}) {
  const { records, toggleTag, toggleLabel, bulkAddLabel, setAudit, bulkSetAudit, deleteMany, importRecords } = subs;

  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState(null);
  const [sort, setSort] = useState({ key: 'host', dir: 'asc' });
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState(() => new Set());
  const [autoFilter, setAutoFilter] = useState(true);
  const [view, setView] = useState('flat'); // 'flat' | 'ip' | 'tech'
  const [bulkOpen, setBulkOpen] = useState(false);
  const [kwOpen, setKwOpen] = useState(false);
  const [historyRec, setHistoryRec] = useState(null);
  const [visible, setVisible] = useState(() => new Set(DEFAULT_VISIBLE));
  const [jumpPage, setJumpPage] = useState('');
  const [isPending, startTransition] = useTransition();

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  // FIX: newCutoff was computed on EVERY render (Date.now() changes each time),
  // causing counts + filtered memos to recompute on EVERY render.
  // Now computed once on mount — doesn't meaningfully change within a session.
  const newCutoff = useMemo(() => Date.now() - NEW_WINDOW_MS, []);

  // Available data columns adapt to the project's actual data. Skip the scan
  // while this tab is hidden — no point computing columns for an invisible table.
  const available = useMemo(() => (active ? getAvailableColumns(records) : []), [active, records]);
  const visibleCols = useMemo(
    () => available.filter((c) => visible.has(c.key)),
    [available, visible]
  );
  const hasIp = useMemo(() => records.some((r) => r.ip), [records]);

  // ─── DATA PIPELINE (matches the HTML version's approach) ───
  //
  // HTML version: filter(search+scope) → count pills → filter(status) → sort → paginate
  // Each step is separated so clicking a status pill does NOT re-sort.
  //
  // Step 1: base = search + auto-filter-oos + focus filter
  const base = useMemo(() => {
    // Hidden tab: don't filter/sort 100k rows in the background. Recomputes the
    // moment the tab becomes active (deps include `active`).
    if (!active) return [];
    const q = debouncedQuery.trim().toLowerCase();
    const focus = focusNewIds && focusNewIds.size ? focusNewIds : null;
    const scopeFilter = autoFilter && hasScope;
    if (!q && !autoFilter && !focus) return records;
    return records.filter((r) => {
      if (focus && !focus.has(r.id)) return false;
      if (autoFilter && r.tags && r.tags.includes('oos')) return false;
      if (scopeFilter && scopeStatus(r.host) === 'out') return false;
      if (q && !r.host.includes(q)) return false;
      return true;
    });
  }, [active, records, debouncedQuery, autoFilter, focusNewIds, hasScope, scopeStatus]);

  // Step 2: counts from base (for filter pills) — does NOT depend on selection
  const counts = useMemo(() => {
    const c = { all: base.length, other: 0, new: 0 };
    for (const code of CURATED_CODES) c[code] = 0;
    for (const r of base) {
      const code = String(r.status);
      if (CURATED_CODES.includes(code)) c[code]++;
      else c.other++;
      if (r.addedAt && r.addedAt >= newCutoff) c.new++;
    }
    return c;
  }, [base, newCutoff]);

  // Step 3: sort base ONCE — only recomputes when sort column/dir changes,
  // NOT when clicking a status pill. This is the key optimization.
  // For grouped views, skip sorting entirely (groups sort by group size).
  const sorted = useMemo(() => {
    if (view !== 'flat') return base; // grouped views don't need sorted data
    const dir = sort.dir === 'desc' ? -1 : 1;
    return base.slice().sort((a, b) => {
      if (sort.key === 'host') return a.host < b.host ? -dir : a.host > b.host ? dir : 0;
      if (sort.key === 'date') return ((a.addedAt || 0) - (b.addedAt || 0)) * dir;
      const av = typeof a.status === 'number' ? a.status : 999;
      const bv = typeof b.status === 'number' ? b.status : 999;
      return (av - bv) * dir;
    });
  }, [base, sort, view]);

  // Step 4: filter by status pill — just a cheap O(n) filter, NO sort
  const filtered = useMemo(() => {
    if (selection == null) return sorted;
    return sorted.filter((r) => {
      const code = String(r.status);
      if (selection === 'other') return !CURATED_CODES.includes(code);
      if (selection === 'new') return r.addedAt && r.addedAt >= newCutoff;
      return code === String(selection);
    });
  }, [sorted, selection, newCutoff]);

  // Step 5: paginate — just a cheap slice
  useEffect(() => { setPage(0); setJumpPage(''); }, [debouncedQuery, selection, sort, autoFilter, view, focusNewIds]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage]
  );

  // ─── HANDLERS ───
  const onSort = useCallback((key) => {
    setSort((p) => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }, []);
  const copyHost = useCallback((host) => {
    navigator.clipboard?.writeText(host).then(() => onCopyToast(`Copied ${host}`), () => onCopyToast('Copy failed'));
  }, [onCopyToast]);
  const toggleCheck = useCallback((id) => {
    setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleColumn = useCallback((key) => {
    setVisible((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  const clearChecked = () => setChecked(new Set());
  const checkedRecords = () => records.filter((r) => checked.has(r.id));

  const allPageChecked = pageRows.length > 0 && pageRows.every((r) => checked.has(r.id));
  const toggleAllPage = () => {
    setChecked((prev) => {
      const n = new Set(prev);
      if (allPageChecked) pageRows.forEach((r) => n.delete(r.id));
      else pageRows.forEach((r) => n.add(r.id));
      return n;
    });
  };

  // Use useTransition for non-urgent view/selection switches so UI stays responsive
  const handleSelection = useCallback((sel) => {
    startTransition(() => setSelection(sel));
  }, []);
  const handleView = useCallback((v) => {
    startTransition(() => setView(v));
  }, []);

  const handlers = useMemo(() => ({
    onCheck: toggleCheck, onCopy: copyHost, onToggleTag: toggleTag,
    onSetAudit: setAudit, onToggleLabel: toggleLabel, onHistory: setHistoryRec,
  }), [toggleCheck, copyHost, toggleTag, setAudit, toggleLabel]);

  const keywordOf = useCallback((r) => matchKeyword(r.host, keywords), [keywords]);
  const isNew = useCallback((r) => r.addedAt && r.addedAt >= newCutoff, [newCutoff]);

  const minWidth = tableMinWidth(visibleCols);
  const grouping = view !== 'flat';

  // Jump-to-page handler
  const handleJumpPage = useCallback((e) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && p <= pageCount) {
      setPage(p - 1);
      setJumpPage('');
    }
  }, [jumpPage, pageCount]);

  // Page number buttons: show first, last, and a window around current page
  const pageButtons = useMemo(() => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, i) => i);
    }
    const pages = new Set([0, pageCount - 1]);
    for (let i = Math.max(0, safePage - 2); i <= Math.min(pageCount - 1, safePage + 2); i++) {
      pages.add(i);
    }
    return [...pages].sort((a, b) => a - b);
  }, [pageCount, safePage]);

  return (
    <div className="tab-content">
      <ImportPanel
        onImport={importRecords}
        onManualAdd={() => setBulkOpen(true)}
        autoFilter={autoFilter}
        onAutoFilter={setAutoFilter}
        groupByTech={view === 'tech'}
        onGroupByTech={(on) => handleView(on ? 'tech' : 'flat')}
        groupByIp={view === 'ip'}
        onGroupByIp={(on) => handleView(on ? 'ip' : 'flat')}
      />

      {focusNewIds && focusNewIds.size > 0 && (
        <div className="focus-banner">
          Showing <strong>{focusNewIds.size.toLocaleString()}</strong> new subdomains from your last import
          <button className="btn btn-ghost btn-sm" onClick={onClearFocusNew}>Clear ✕</button>
        </div>
      )}

      <div className="glass-card filter-card">
        <div className="search-wrap">
          <span className="search-ic">⌕</span>
          <input placeholder="Search subdomains…" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        </div>
        <FilterPills counts={counts} selection={selection} onSelect={handleSelection} />
        <div className="filter-spacer" />

        <ColumnsMenu columns={available} visible={visible} onToggle={toggleColumn} />
        <button className="btn btn-ghost btn-sm" onClick={() => setKwOpen(true)} title="Smart-flag keywords">✦ Keywords</button>
        <DataMenu subs={subs} filtered={filtered} />
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-icon">🌐</div>
          <div className="empty-title">No subdomains yet</div>
          <div className="empty-sub">Paste recon output above or use Manual Add to get started.</div>
        </div>
      ) : view === 'ip' && !hasIp ? (
        <div className="glass-card empty-state">
          <div className="empty-icon">🧭</div>
          <div className="empty-title">No IP data found in your imports</div>
          <div className="empty-sub">Re-export with <span className="mono">httpx -ip</span> (or JSONL with an <span className="mono">ip</span> field) to enable this view.</div>
        </div>
      ) : grouping ? (
        <GroupedTable
          records={filtered}
          groupBy={view}
          visibleCols={visibleCols}
          rowProps={{ checked, handlers, keywordOf, isNew, sort, onSort }}
        />
      ) : (
        <div className="vtable">
          <div className="vtable-scroll">
            <div className="vtable-inner" style={{ minWidth }}>
              <div className="vtable-head-sticky">
                <TableHeader
                  visibleCols={visibleCols}
                  sort={sort}
                  onSort={onSort}
                  selectAll={
                    <input type="checkbox" className="row-cb" checked={allPageChecked} onChange={toggleAllPage} />
                  }
                />
              </div>
              {pageRows.map((r, i) => (
                <DataRow
                  key={r.id}
                  rec={r}
                  index={safePage * PAGE_SIZE + i + 1}
                  visibleCols={visibleCols}
                  keyword={keywordOf(r)}
                  isNew={isNew(r)}
                  checked={checked.has(r.id)}
                  {...handlers}
                />
              ))}
            </div>
          </div>
          <div className="pagination">
            <div className="mono pagination-info">
              {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length.toLocaleString()}
              {' · '}{PAGE_SIZE} per page
            </div>
            <div className="page-controls">
              <button className="page-btn" disabled={safePage === 0} onClick={() => setPage(0)} title="First page">⟨⟨</button>
              <button className="page-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
              <div className="page-numbers">
                {pageButtons.map((p, idx) => {
                  const prev = idx > 0 ? pageButtons[idx - 1] : p - 1;
                  return (
                    <span key={p}>
                      {p - prev > 1 && <span className="page-ellipsis">…</span>}
                      <button
                        className={`page-num${p === safePage ? ' active' : ''}`}
                        onClick={() => setPage(p)}
                      >
                        {p + 1}
                      </button>
                    </span>
                  );
                })}
              </div>
              <button className="page-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
              <button className="page-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(pageCount - 1)} title="Last page">⟩⟩</button>
              {pageCount > 7 && (
                <form className="page-jump" onSubmit={handleJumpPage}>
                  <input
                    type="number"
                    className="page-jump-input"
                    placeholder={`1–${pageCount}`}
                    min={1}
                    max={pageCount}
                    value={jumpPage}
                    onChange={(e) => setJumpPage(e.target.value)}
                  />
                  <button type="submit" className="page-btn page-jump-btn">Go</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <BulkBar
        count={checked.size}
        onTag={(l) => bulkAddLabel(checked, l)}
        onAudit={(a) => bulkSetAudit(checked, a)}
        onExport={() => exportCsv(checkedRecords(), 'selection')}
        onDelete={() => { deleteMany(checked); clearChecked(); }}
        onClear={clearChecked}
      />

      {bulkOpen && <BulkImportModal onImport={importRecords} onClose={() => setBulkOpen(false)} />}
      {kwOpen && <KeywordModal keywords={keywords} onSave={onSaveKeywords} onClose={() => setKwOpen(false)} />}
      {historyRec && <HistoryPanel record={historyRec} onClose={() => setHistoryRec(null)} />}
    </div>
  );
}

// Memoized: stays mounted (display toggle), so it must not re-render on every
// unrelated tab switch. Pair with stable `subs` (useSubdomains) + stable props.
const SubdomainTabMemo = memo(SubdomainTab);
export default SubdomainTabMemo;

function DataMenu({ subs, filtered }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);

  const handleExportBackup = () => {
    const data = JSON.stringify({ records: subs.records, activity: subs.activity });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recon_session_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        if (confirm('Warning: This will overwrite your current project data. Continue?')) {
          subs.loadSession(json);
        }
      } catch (err) {
        alert('Invalid JSON session file.');
      }
    };
    reader.readAsText(file);
    e.target.value = null;
    setOpen(false);
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear ALL data in this project? This cannot be undone.')) {
      subs.clearAll();
      setOpen(false);
    }
  };

  const sep = <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />;
  const sessions = subs.sessions || [];

  const saveSession = async () => {
    const name = prompt('Name this session (snapshot of current subdomains):', `Session ${new Date().toLocaleString()}`);
    if (name === null) return;
    await subs.saveNamedSession(name);
    setOpen(false);
  };
  const loadSession = async (id, label) => {
    if (confirm(`Load session "${label}"? This replaces the current subdomains for this project.`)) {
      await subs.loadNamedSession(id);
      setOpen(false);
    }
  };

  return (
    <div className="menu">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>Data ▾</button>
      {open && (
        <div className="menu-list" onMouseLeave={() => setOpen(false)}>
          {/* Export respects the active status pill + search → "export the 200s" = pick 200 then this */}
          <div className="menu-head">Export current view ({filtered.length.toLocaleString()})</div>
          <button className="menu-item" onClick={() => { exportTxt(filtered, 'subdomains'); setOpen(false); }} disabled={filtered.length === 0}>Export View (.txt)</button>
          <button className="menu-item" onClick={() => { exportCsv(filtered, 'subdomains'); setOpen(false); }} disabled={filtered.length === 0}>Export View (.csv)</button>
          {sep}
          {/* In-app sessions: stored in the app, reload anytime */}
          <div className="menu-head">Sessions (saved in app)</div>
          <button className="menu-item" onClick={saveSession} disabled={subs.records.length === 0}>💾 Save current as session…</button>
          {sessions.length === 0 && <div className="menu-empty">No saved sessions yet</div>}
          {sessions.map((s) => (
            <div key={s.id} className="menu-row">
              <button className="menu-item menu-item-grow" title={new Date(s.at).toLocaleString()} onClick={() => loadSession(s.id, s.name)}>
                ↺ {s.name} <span className="menu-dim">({(s.count || 0).toLocaleString()})</span>
              </button>
              <button className="menu-x" title="Delete session" onClick={() => subs.deleteNamedSession(s.id)}>✕</button>
            </div>
          ))}
          {sep}
          <div className="menu-head">Backup (file)</div>
          <button className="menu-item" onClick={handleExportBackup} disabled={subs.records.length === 0}>Save Backup (.json)</button>
          <button className="menu-item" onClick={() => fileRef.current?.click()}>Load Backup (.json)</button>
          <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".json" onChange={handleImportBackup} />
          {sep}
          <button className="menu-item" style={{ color: 'var(--status-5xx)' }} onClick={handleClear} disabled={subs.records.length === 0}>Clear All Data</button>
        </div>
      )}
    </div>
  );
}
