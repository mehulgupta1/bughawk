import React, {
  useState,
  useEffect,
  useRef,
  memo,
  useMemo,
  useCallback,
  useDeferredValue,
} from 'react';
import VirtualTable from '../SubdomainTab/VirtualTable.jsx';
import { get, set, KEYS } from '../../lib/storage.js';
import { addWordlist, loadWordlists } from '../../lib/wordlists.js';
import { CATEGORIES, SOURCES, getSevColor, escapeHtml, csvCell, buildTemplates, urlTemplate, CONF_RANK, collectJwts, buildVerbMatrix, buildEnvMatrix, buildParamDossier, fuzzCommand } from './engine.js';

const ROW_HEIGHT = 64;
const PAGE_SIZE = 50;

function download(text, name, mime) {
  const blob = new Blob([text], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.URL.revokeObjectURL(url);
}

// In-memory working-state cache keyed by project id. This makes the parsed
// results / input survive any remount of the component — tab switches, Vite
// HMR during dev, or conditional re-renders — without re-parsing.
const workCache = new Map();

// --- ROW ---

const UrlRow = memo(function UrlRow({ d, i, activeTab, status, isCopied, onToggleStatus, onCopy, highlightUrl }) {
  return (
    <div className="up-row" data-status={status || 'none'} style={{ height: ROW_HEIGHT }}>
      <div className="up-row-flags">
        <label className={`up-flag ${status === 'tested' ? 'is-tested' : ''}`}>
          <input type="checkbox" checked={status === 'tested'} onChange={() => onToggleStatus(d.url, 'tested')} />
          Tested
        </label>
        <label className={`up-flag ${status === 'vulnerable' ? 'is-vuln' : ''}`}>
          <input type="checkbox" checked={status === 'vulnerable'} onChange={() => onToggleStatus(d.url, 'vulnerable')} />
          Vuln
        </label>
      </div>

      <div className="up-row-idx">{i + 1}</div>

      {activeTab === 'topRisk' && (
        <div
          className="up-score"
          style={{ background: `${getSevColor(d.severity)}22`, color: getSevColor(d.severity), borderColor: `${getSevColor(d.severity)}55` }}
        >
          {d.score}
        </div>
      )}

      {d.confidence && <span className={`up-conf up-conf-${d.confidence}`} title={`${d.confidence} confidence this is a real candidate`}>{d.confidence[0].toUpperCase()}</span>}

      {d.highEntropy && <span className="up-entropy" title="High-entropy token detected">⚡</span>}

      {d.dupeCount > 0 && <span className="up-dupe" title={`${d.dupeCount} duplicate URL(s) collapsed into this one`}>×{(d.dupeCount + 1).toLocaleString()}</span>}

      <div
        className="up-url"
        title={d.url}
        style={{ textDecoration: status === 'tested' ? 'line-through' : 'none', opacity: status === 'tested' ? 0.55 : 1 }}
        dangerouslySetInnerHTML={highlightUrl(d.url, activeTab, d.categories)}
      />

      {activeTab === 'topRisk' && (
        <div className="up-tags">
          {d.categories.map((catId) => {
            const cDef = CATEGORIES.find((c) => c.id === catId);
            if (!cDef) return null;
            return (
              <span
                key={catId}
                className="up-tag"
                style={cDef.sev === 'custom' ? { borderColor: 'rgba(139,92,246,0.5)', color: '#a78bfa' } : undefined}
              >
                {cDef.label}
              </span>
            );
          })}
        </div>
      )}

      <button className="up-icon-btn" onClick={() => onCopy(d.original || d.url, `url-${i}`)} title="Copy URL">
        {isCopied ? (
          <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
});

const TEMPLATE_ROW_H = 60;
const LENS_PAGE = 100;

function Pager({ page, pages, onSet, label }) {
  if (pages <= 1) return null;
  return (
    <div className="up-pager">
      <span className="up-pager-info">{label}</span>
      <div className="up-pager-ctrls">
        <button className="up-pager-btn" disabled={page === 0} onClick={() => onSet(0)}>« First</button>
        <button className="up-pager-btn" disabled={page === 0} onClick={() => onSet(page - 1)}>‹ Prev</button>
        <span className="up-pager-page">Page {page + 1} / {pages.toLocaleString()}</span>
        <button className="up-pager-btn" disabled={page >= pages - 1} onClick={() => onSet(page + 1)}>Next ›</button>
        <button className="up-pager-btn" disabled={page >= pages - 1} onClick={() => onSet(pages - 1)}>Last »</button>
      </div>
    </div>
  );
}

const TemplateRow = memo(function TemplateRow({ t, isCopied, isFuzzed, onCopy, onFuzz, onDrill, idx }) {
  const color = getSevColor(t.severity);
  return (
    <div className="up-trow" style={{ height: TEMPLATE_ROW_H }}>
      <div className="up-tcount" title={`${t.count} URLs collapse to this template`}>×{t.count.toLocaleString()}</div>
      {t.rarity != null && <div className="up-rarity" title="Rarity (IDF) — higher = more unique/forgotten">◈{t.rarity}</div>}
      <div className="up-score" title={`${t.score} pts`} style={{ background: `${color}22`, color, borderColor: `${color}55` }}>{t.score}</div>
      <div className="up-turl up-turl-link" title={`${t.template}\n(click to see the ${t.count} underlying URLs)`} onClick={() => onDrill(t.template)}>{t.template}</div>
      <div className="up-tags">
        {t.categories.map((catId) => {
          const cDef = CATEGORIES.find((c) => c.id === catId);
          return cDef ? <span key={catId} className="up-tag">{cDef.label}</span> : null;
        })}
      </div>
      <button className="up-icon-btn" onClick={() => onFuzz(t.template, `fz-${idx}`)} title="Copy ffuf command for this template">
        {isFuzzed ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span> : '⚡'}
      </button>
      <button className="up-icon-btn" onClick={() => onCopy(t.sample, `tmpl-${idx}`)} title="Copy a sample URL">
        {isCopied ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span> : '⧉'}
      </button>
    </div>
  );
});

// --- MAIN COMPONENT ---

const DEFAULT_CHECKS = {
  isURL: true, hasHost: true, noLocal: true, noBlank: true,
  noFrag: true, decodePct: true, noImg: true, uniq: true,
  entropy: true, noExt: true, normParam: true, minLen: true,
};

const ReconUrlParser = memo(function ReconUrlParser({ activeProjectId = 'default', active = true }) {
  // Rehydrate working state from the in-memory cache (survives remounts/HMR).
  const cached = workCache.get(activeProjectId) || {};

  const [source, setSource] = useState(cached.source || 'GAU');
  const [rawInput, setRawInput] = useState(cached.rawInput || '');
  const [parsedData, setParsedData] = useState(cached.parsedData || []);
  const [activeTab, setActiveTab] = useState(cached.activeTab || 'topRisk');
  const [filterText, setFilterText] = useState('');
  const [page, setPage] = useState(0);
  const [resultView, setResultView] = useState('categories'); // 'categories' | 'endpoints'
  const [drillTemplate, setDrillTemplate] = useState(null); // selected endpoint template for drill-down
  const [minConf, setMinConf] = useState('all'); // 'all' | 'medium' | 'high'
  // Start collapsed (preview) when the restored input is already large, so a
  // remount never renders a 31k-line editable textarea (the reveal lag).
  const [editingInput, setEditingInput] = useState(() => {
    const c = workCache.get(activeProjectId);
    return !(c && c.rawInput && c.rawInput.split('\n').length > 500);
  });
  const [endpointSort, setEndpointSort] = useState('count'); // 'count' | 'rarity'
  const [wlSave, setWlSave] = useState(null); // { content, name, category } | null
  const [wlCats, setWlCats] = useState([]);

  const openWlSave = useCallback(async (content, name, category) => {
    if (!content) { alert('Nothing to send — list is empty.'); return; }
    const lists = await loadWordlists();
    setWlCats([...new Set(lists.map((l) => l.category).filter(Boolean))].sort());
    setWlSave({ content, name, category });
  }, []);
  const confirmWlSave = useCallback(async () => {
    await addWordlist(wlSave, { dedup: true });
    setWlSave(null);
  }, [wlSave]);
  const [inputPage, setInputPage] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(cached.stats || {});
  const [showSessions, setShowSessions] = useState(false);
  const [wordlistScope, setWordlistScope] = useState('active');
  const [showWordlists, setShowWordlists] = useState(false); // wordlist generator is opt-in (it parses every URL)
  const [urlStatuses, setUrlStatuses] = useState(cached.urlStatuses || {});
  const [isParsing, setIsParsing] = useState(false);
  const [progressInfo, setProgressInfo] = useState({ percent: 0, text: '' });
  const [copiedState, setCopiedState] = useState(null);

  const [customRegexes, setCustomRegexes] = useState(cached.customRegexes || []);
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [newCustomPattern, setNewCustomPattern] = useState('');

  const [checks, setChecks] = useState(cached.checks || DEFAULT_CHECKS);
  const [minLen, setMinLen] = useState(cached.minLen ?? 2);
  const [entThresh, setEntThresh] = useState(cached.entThresh ?? 2.0);

  // Persist working state so it can be restored after any remount.
  useEffect(() => {
    workCache.set(activeProjectId, {
      source, rawInput, parsedData, stats, urlStatuses, activeTab, checks, minLen, entThresh, customRegexes,
    });
  }, [activeProjectId, source, rawInput, parsedData, stats, urlStatuses, activeTab, checks, minLen, entThresh, customRegexes]);

  // Defer mounting the heavy results subtree until ONE frame after the tab
  // becomes visible. The light shell (input + settings) shows instantly, so the
  // tab "opens" immediately even with tens of thousands of parsed rows; the
  // results paint a beat later. While the tab is hidden the results are fully
  // unmounted, so revealing it never triggers a giant synchronous layout.
  const [showHeavy, setShowHeavy] = useState(active);
  useEffect(() => {
    if (!active) { setShowHeavy(false); return; }
    const id = requestAnimationFrame(() => setShowHeavy(true));
    return () => cancelAnimationFrame(id);
  }, [active]);

  const fileInputRef = useRef(null);
  const rawInputRef = useRef(null);
  const workerRef = useRef(null);

  // Lazily create the parse worker and tear it down on unmount.
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./parser.worker.js', import.meta.url), { type: 'module' });
    }
    return workerRef.current;
  }, []);
  useEffect(() => () => { if (workerRef.current) workerRef.current.terminate(); }, []);

  // --- Session storage (project-scoped, IndexedDB via lib/storage) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await get(KEYS.urlSessions(activeProjectId), []);
      if (!cancelled) setSessions(Array.isArray(s) ? s : []);
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  // Reload survival: if there's no in-memory state for this project, hydrate the
  // last scan from IndexedDB so results survive a full page refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Skip only if we already have real in-memory results (e.g. a tab remount
      // mid-session). On a fresh page reload the cache entry is empty, so we
      // still hydrate from disk.
      const mem = workCache.get(activeProjectId);
      if (mem && Array.isArray(mem.parsedData) && mem.parsedData.length > 0) return;
      const snap = await get(KEYS.urlLastScan(activeProjectId), null);
      if (cancelled || !snap || !Array.isArray(snap.parsedData) || snap.parsedData.length === 0) return;
      setParsedData(snap.parsedData);
      setStats(snap.stats || {});
      setUrlStatuses(snap.urlStatuses || {});
      if (snap.source) setSource(snap.source);
      if (snap.rawInput != null) {
        setRawInput(snap.rawInput);
        if (snap.rawInput.split('\n').length > 500) setEditingInput(false);
        else if (rawInputRef.current) rawInputRef.current.value = snap.rawInput;
      }
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  const saveSessionsStore = useCallback(async (data) => {
    const ok = await set(KEYS.urlSessions(activeProjectId), data);
    if (ok) setSessions(data);
    else alert('Error saving session: IndexedDB storage failed.');
    return ok;
  }, [activeProjectId]);

  // --- Handlers ---
  const addCustomRegex = () => {
    if (!newCustomLabel || !newCustomPattern) return;
    if (newCustomPattern.length > 200) {
      alert('Pattern too long (max 200 chars).');
      return;
    }
    // Heuristic guard against catastrophic backtracking (e.g. (a+)+, (a*)*, (a+)*).
    if (/\([^)]*[+*][^)]*\)\s*[+*]/.test(newCustomPattern)) {
      alert('That pattern has nested quantifiers (e.g. "(a+)+") which can hang the scan. Please rewrite it.');
      return;
    }
    try {
      new RegExp(newCustomPattern, 'i');
      setCustomRegexes((prev) => [...prev, { label: newCustomLabel, pattern: newCustomPattern, id: `custom_${Date.now()}` }]);
      setNewCustomLabel('');
      setNewCustomPattern('');
    } catch (e) {
      alert('Invalid Regular Expression! ' + e.message);
    }
  };

  const removeCustomRegex = (id) => setCustomRegexes((prev) => prev.filter((r) => r.id !== id));

  const handleCopy = useCallback((text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedState(id);
    setTimeout(() => setCopiedState(null), 2000);
  }, []);

  const handleFuzz = useCallback((template, id) => {
    navigator.clipboard.writeText(fuzzCommand(template));
    setCopiedState(id);
    setTimeout(() => setCopiedState(null), 2000);
  }, []);

  const toggleUrlStatus = useCallback((url, type) => {
    setUrlStatuses((prev) => {
      const next = { ...prev };
      if (next[url] === type) delete next[url];
      else next[url] = type;
      return next;
    });
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const currentVal = readInput();
      const newVal = currentVal ? currentVal + '\n' + evt.target.result : evt.target.result;
      commitInput(newVal);
      if (editingInput && rawInputRef.current) rawInputRef.current.value = newVal;
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const toggleCheck = (id) => setChecks((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = (bool) => {
    const next = {};
    Object.keys(checks).forEach((k) => { next[k] = bool; });
    setChecks(next);
  };

  const dedupFirst = () => {
    const currentVal = readInput();
    if (!currentVal) return;
    const lines = currentVal.split('\n').map((l) => l.trim()).filter(Boolean);
    const newVal = [...new Set(lines)].join('\n');
    commitInput(newVal);
    if (editingInput && rawInputRef.current) rawInputRef.current.value = newVal;
  };

  // --- Parse (runs in the worker) ---
  const runParse = () => {
    if (isParsing) return;
    const currentVal = readInput();
    if (currentVal !== rawInput) commitInput(currentVal);
    if (!currentVal) return;
    const lines = currentVal.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    setIsParsing(true);
    setProgressInfo({ percent: 0, text: 'Initializing engine…' });

    const worker = getWorker();
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') {
        setProgressInfo({ percent: d.percent, text: d.text });
      } else if (d.type === 'done') {
        setParsedData(d.results);
        setStats(d.stats);
        setActiveTab('topRisk');
        setIsParsing(false);
        // Persist this scan so it survives a full page reload.
        set(KEYS.urlLastScan(activeProjectId), {
          parsedData: d.results, stats: d.stats, rawInput: currentVal, source, urlStatuses,
        });
      } else if (d.type === 'error') {
        setIsParsing(false);
        alert('Parse failed: ' + d.message);
      }
    };
    worker.onerror = (err) => {
      setIsParsing(false);
      alert('Worker error: ' + err.message);
    };

    // Custom regexes are passed as plain {pattern} objects (cloneable).
    worker.postMessage({
      lines,
      opts: { checks, minLen, entThresh, customRegexes: customRegexes.map((c) => ({ pattern: c.pattern })) },
    });
  };

  // Abort an in-flight scan by killing the worker outright (the next parse
  // lazily recreates it).
  const cancelParse = () => {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    setIsParsing(false);
    setProgressInfo({ percent: 0, text: '' });
  };

  // --- Highlighting ---
  const highlightUrl = useCallback((urlStr, currentTab) => {
    if (currentTab === 'topRisk') {
      let html = escapeHtml(urlStr);
      html = html.replace(/([?&])([^=]+)(=)/g, '$1<span class="up-hl-key">$2</span>$3');
      html = html.replace(/(=)([^&]+)(?=&|$)/g, '$1<span class="up-hl-val">$2</span>');
      html = html.replace(/(ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/g, '<span class="up-hl-jwt">$1</span>');
      return { __html: html };
    }

    let cat = CATEGORIES.find((c) => c.id === currentTab);
    if (!cat) return { __html: escapeHtml(urlStr) };

    if (cat.id === 'custom_regex') {
      const validPatterns = customRegexes
        .map((cr) => { try { new RegExp(cr.pattern, 'i'); return cr.pattern; } catch { return null; } })
        .filter(Boolean);
      if (validPatterns.length > 0) cat = { ...cat, paths: new RegExp(`(${validPatterns.join('|')})`, 'i') };
    }

    const intervals = [];
    const addMatches = (regex) => {
      if (!regex) return;
      try {
        const re = new RegExp(regex.source, 'gi');
        let match;
        while ((match = re.exec(urlStr)) !== null) {
          intervals.push([match.index, re.lastIndex]);
          if (re.lastIndex === match.index) re.lastIndex++;
        }
      } catch { /* ignore */ }
    };
    addMatches(cat.paths);
    addMatches(cat.params);
    addMatches(cat.strict);
    addMatches(cat.valueCheck);

    if (intervals.length === 0) return { __html: escapeHtml(urlStr) };

    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
      const last = merged[merged.length - 1];
      const curr = intervals[i];
      if (curr[0] <= last[1]) last[1] = Math.max(last[1], curr[1]);
      else merged.push(curr);
    }

    let result = '';
    let lastIdx = 0;
    for (const [start, end] of merged) {
      result += escapeHtml(urlStr.substring(lastIdx, start));
      result += '<span class="up-hl-match">';
      result += escapeHtml(urlStr.substring(start, end));
      result += '</span>';
      lastIdx = end;
    }
    result += escapeHtml(urlStr.substring(lastIdx));
    return { __html: result };
  }, [customRegexes]);

  // --- Derived data ---
  const deferredFilterText = useDeferredValue(filterText);
  const activeData = useMemo(() => {
    let data = parsedData;
    if (activeTab !== 'topRisk') data = data.filter((d) => d.categories.includes(activeTab));
    if (minConf !== 'all') {
      const threshold = CONF_RANK[minConf];
      data = data.filter((d) => (CONF_RANK[d.confidence] || 0) >= threshold);
    }
    if (deferredFilterText) {
      const lower = deferredFilterText.toLowerCase();
      data = data.filter((d) => d.url.toLowerCase().includes(lower));
    }
    return data;
  }, [parsedData, activeTab, deferredFilterText, minConf]);

  // Pagination — render only PAGE_SIZE rows at a time.
  const totalPages = Math.max(1, Math.ceil(activeData.length / PAGE_SIZE));
  // Reset to page 1 whenever the underlying list changes.
  useEffect(() => { setPage(0); }, [activeTab, deferredFilterText, parsedData, minConf]);
  const safePage = Math.min(page, totalPages - 1);
  const pagedData = useMemo(
    () => activeData.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [activeData, safePage],
  );

  // Endpoint templating — only computed when the Endpoints lens is active.
  const templates = useMemo(
    () => (resultView === 'endpoints' ? buildTemplates(parsedData) : []),
    [resultView, parsedData],
  );
  const filteredTemplates = useMemo(() => {
    let arr = templates;
    if (deferredFilterText) {
      const lo = deferredFilterText.toLowerCase();
      arr = arr.filter((t) => t.template.toLowerCase().includes(lo));
    }
    if (endpointSort === 'rarity') arr = [...arr].sort((a, b) => b.rarity - a.rarity);
    return arr;
  }, [templates, deferredFilterText, endpointSort]);
  // Underlying URLs for the drilled-into template.
  const drillUrls = useMemo(
    () => (drillTemplate ? parsedData.filter((d) => urlTemplate(d.url) === drillTemplate) : []),
    [drillTemplate, parsedData],
  );

  // Extra lenses — each computed only when its view is active, then filtered.
  const lc = (deferredFilterText || '').toLowerCase();
  const jwtFindings = useMemo(() => {
    const all = resultView === 'jwts' ? collectJwts(parsedData) : [];
    return lc ? all.filter((j) => j.url.toLowerCase().includes(lc)) : all;
  }, [resultView, parsedData, lc]);
  const verbMatrix = useMemo(() => {
    const all = resultView === 'verb' ? buildVerbMatrix(parsedData) : [];
    return lc ? all.filter((v) => v.template.toLowerCase().includes(lc)) : all;
  }, [resultView, parsedData, lc]);
  const envMatrix = useMemo(() => {
    const all = resultView === 'env' ? buildEnvMatrix(parsedData) : [];
    return lc ? all.filter((e) => e.path.toLowerCase().includes(lc)) : all;
  }, [resultView, parsedData, lc]);
  const paramDossier = useMemo(() => {
    const all = resultView === 'params' ? buildParamDossier(parsedData) : [];
    return lc ? all.filter((d) => d.param.toLowerCase().includes(lc)) : all;
  }, [resultView, parsedData, lc]);

  // Shared pagination for the JWT / verb / env / params lenses.
  const [lensPage, setLensPage] = useState(0);
  useEffect(() => { setLensPage(0); }, [resultView, lc, parsedData]);
  const lensList = resultView === 'jwts' ? jwtFindings : resultView === 'verb' ? verbMatrix : resultView === 'env' ? envMatrix : resultView === 'params' ? paramDossier : [];
  const lensPages = Math.max(1, Math.ceil(lensList.length / LENS_PAGE));
  const safeLensPage = Math.min(lensPage, lensPages - 1);
  const lensSlice = lensList.slice(safeLensPage * LENS_PAGE, safeLensPage * LENS_PAGE + LENS_PAGE);
  // Leaving the Endpoints lens clears any drill-down.
  useEffect(() => { if (resultView !== 'endpoints') setDrillTemplate(null); }, [resultView]);

  const exportCsv = () => {
    let rows;
    let name;
    if (resultView === 'endpoints') {
      rows = ['Template,Count,Score,Severity,Categories,Sample'];
      filteredTemplates.forEach((t) => {
        rows.push([csvCell(t.template), t.count, t.score, csvCell(t.severity), csvCell(t.categories.join('|')), csvCell(t.sample)].join(','));
      });
      name = 'recon_endpoints.csv';
    } else {
      rows = ['URL,Score,Severity,Confidence,Categories,Dupes,Source'];
      activeData.forEach((d) => {
        rows.push([csvCell(d.url), d.score, csvCell(d.severity), csvCell(d.confidence || ''), csvCell(d.categories.join('|')), (d.dupeCount || 0) + 1, csvCell(source)].join(','));
      });
      name = `recon_parsed_${activeTab}.csv`;
    }
    download(rows.join('\n'), name, 'text/csv');
  };

  // Plain .txt — bare URLs / templates, one per line (feed straight into other tools).
  const exportTxt = () => {
    let lines;
    let name;
    if (resultView === 'endpoints') {
      lines = filteredTemplates.map((t) => t.template);
      name = 'recon_endpoints.txt';
    } else {
      lines = activeData.map((d) => d.url);
      name = `recon_parsed_${activeTab}.txt`;
    }
    download(lines.join('\n') + '\n', name, 'text/plain');
  };

  const saveCurrentSession = async () => {
    const currentVal = readInput();
    if (!currentVal) { alert('No data to save! Import some URLs first.'); return; }
    const newSession = {
      id: Date.now().toString(),
      name: `Target Session — ${new Date().toLocaleString()}`,
      date: new Date().toLocaleString(),
      source,
      summary: { topRisk: parsedData.length > 0 ? (parsedData[0]?.score || 0) : 0, ...stats },
      rawInput: currentVal,
      checks,
      urlStatuses,
      customRegexes,
    };
    const ok = await saveSessionsStore([...sessions, newSession]);
    if (ok) alert('Session saved.');
  };

  // Deferred so the ~1 `new URL()` per result never blocks the parse-complete
  // commit or a tab reveal — React paints the UI first, then fills these in.
  const deferredParsed = useDeferredValue(parsedData);
  const deferredActive = useDeferredValue(activeData);
  const wordlists = useMemo(() => {
    if (!showWordlists) return { keys: '', vals: '', paths: '' }; // not computed until opened
    const keys = new Set();
    const vals = new Set();
    const paths = new Set();
    const sourceData = wordlistScope === 'active' ? deferredActive : deferredParsed;
    sourceData.forEach((d) => {
      try {
        const url = new URL(d.original || d.url);
        const params = new URLSearchParams(url.search);
        for (const [k, v] of params.entries()) {
          if (k) keys.add(k);
          if (v) vals.add(v);
        }
        url.pathname.split('/').filter(Boolean).forEach((seg) => {
          if (seg.length > 2 && !/^\d+$/.test(seg)) paths.add(seg);
        });
      } catch { /* ignore */ }
    });
    return {
      keys: Array.from(keys).sort().join('\n'),
      vals: Array.from(vals).sort().join('\n'),
      paths: Array.from(paths).sort().join('\n'),
    };
  }, [showWordlists, deferredParsed, deferredActive, wordlistScope]);

  const checkTooltips = {
    isURL: 'Ensures the string is a structurally valid URL.',
    hasHost: 'Ensures the URL has a hostname.',
    noLocal: 'Drops localhost, 127.0.0.0/8, 0.0.0.0 and ::1.',
    noBlank: 'Removes parameters with no value.',
    noFrag: 'Removes #fragments (never sent to the backend).',
    decodePct: 'Also match against a URL-decoded copy to uncover hidden payloads.',
    noImg: 'Drops static image/media URLs.',
    uniq: 'Strict deduplication of identical URLs.',
    entropy: 'Tags (does not drop) URLs whose param values look like random tokens.',
    noExt: 'Drops static .css / .map files.',
    normParam: 'Alphabetises params to improve deduplication.',
    minLen: 'Drops params shorter than the configured minimum.',
  };

  const visibleCats = useMemo(() => CATEGORIES.filter((c) => (stats[c.id] || 0) > 0), [stats]);
  // Split once per input change (not per render).
  const inputLines = useMemo(() => (rawInput ? rawInput.split('\n') : []), [rawInput]);
  const lineCount = useMemo(() => inputLines.filter(Boolean).length, [inputLines]);
  // Big inputs render as a 100-line read-only preview so the DOM never holds
  // tens of thousands of <textarea> lines (that was the tab-reveal lag).
  const INPUT_PAGE = 100;
  const bigInput = inputLines.length > 500;
  const showPreview = bigInput && !editingInput;
  const inputPages = Math.max(1, Math.ceil(inputLines.length / INPUT_PAGE));
  const safeInputPage = Math.min(inputPage, inputPages - 1);
  const previewText = useMemo(
    () => (showPreview ? inputLines.slice(safeInputPage * INPUT_PAGE, safeInputPage * INPUT_PAGE + INPUT_PAGE).join('\n') : ''),
    [showPreview, inputLines, safeInputPage],
  );
  // Read the canonical input: the live textarea while editing, else state.
  const readInput = () => (editingInput && rawInputRef.current ? rawInputRef.current.value : rawInput);
  const commitInput = (val) => {
    setRawInput(val);
    if (val.split('\n').length > 500) setEditingInput(false); // collapse to preview
  };

  return (
    <div className="up-wrap">
      <style>{styles}</style>

      {/* Header */}
      <header className="up-header">
        <div className="up-title">
          <div className="up-logo">🔗</div>
          <div>
            <h1>URL Parser</h1>
            <p>Multi-pass validation &amp; vulnerability triage engine</p>
          </div>
        </div>
        <div className="up-source-group">
          {SOURCES.map((s) => (
            <button key={s} className={`up-source ${source === s ? 'is-active' : ''}`} onClick={() => setSource(s)}>{s}</button>
          ))}
        </div>
      </header>

      {/* Input + settings */}
      <div className="up-grid">
        <section className="up-panel up-input-panel">
          <div className="up-panel-head">
            <div className="up-panel-title">
              Raw URLs
              <span className="up-chip">{lineCount.toLocaleString()} lines</span>
            </div>
            <div className="up-panel-actions">
              {showPreview && <button className="up-btn-ghost" onClick={() => setEditingInput(true)}>✏ Edit</button>}
              <button className="up-btn-ghost" onClick={() => fileInputRef.current.click()}>📂 Import</button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".txt,.csv" onChange={handleFileUpload} />
              <button className="up-btn-ghost up-danger" onClick={() => { setRawInput(''); setEditingInput(true); setInputPage(0); if (rawInputRef.current) rawInputRef.current.value = ''; }}>🗑 Clear</button>
            </div>
          </div>
          {showPreview ? (
            <>
              <textarea
                className="up-textarea up-mono"
                readOnly
                value={previewText}
                spellCheck="false"
                wrap="off"
              />
              <div className="up-pager">
                <span className="up-pager-info">
                  lines {(safeInputPage * INPUT_PAGE + 1).toLocaleString()}–{Math.min((safeInputPage + 1) * INPUT_PAGE, inputLines.length).toLocaleString()} of {inputLines.length.toLocaleString()}
                </span>
                <div className="up-pager-ctrls">
                  <button className="up-pager-btn" disabled={safeInputPage === 0} onClick={() => setInputPage(0)}>« First</button>
                  <button className="up-pager-btn" disabled={safeInputPage === 0} onClick={() => setInputPage((p) => Math.max(0, p - 1))}>‹ Prev</button>
                  <span className="up-pager-page">Page {safeInputPage + 1} / {inputPages.toLocaleString()}</span>
                  <button className="up-pager-btn" disabled={safeInputPage >= inputPages - 1} onClick={() => setInputPage((p) => Math.min(inputPages - 1, p + 1))}>Next ›</button>
                  <button className="up-pager-btn" disabled={safeInputPage >= inputPages - 1} onClick={() => setInputPage(inputPages - 1)}>Last »</button>
                </div>
              </div>
            </>
          ) : (
            <textarea
              ref={rawInputRef}
              className="up-textarea"
              placeholder="Paste raw URLs here, or import a .txt / .csv file…"
              defaultValue={rawInput}
              onPaste={(e) => {
                // Big paste: keep it out of the DOM entirely (textarea with 31k
                // lines is what made the tab open slowly). Store in state + show
                // the paginated preview instead.
                const text = e.clipboardData.getData('text');
                if (text && text.split('\n').length > 500) {
                  e.preventDefault();
                  const cur = readInput();
                  commitInput(cur ? cur + '\n' + text : text);
                }
              }}
              onBlur={(e) => commitInput(e.target.value)}
              spellCheck="false"
              wrap="off"
            />
          )}
        </section>

        <aside className="up-side">
          <section className="up-panel up-pad">
            <div className="up-side-head">
              <strong>Validation Pipeline</strong>
              <div className="up-toggle-all">
                <button className="up-mini up-mini-on" onClick={() => toggleAll(true)}>All</button>
                <button className="up-mini up-mini-off" onClick={() => toggleAll(false)}>None</button>
              </div>
            </div>
            <div className="up-checks">
              {Object.keys(checks).map((k) => (
                <label key={k} title={checkTooltips[k]} className={`up-check ${checks[k] ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={checks[k]} onChange={() => toggleCheck(k)} />
                  {k}
                </label>
              ))}
            </div>
          </section>

          <section className="up-panel up-pad">
            <strong className="up-side-label">Sensitivity</strong>
            <div className="up-slider">
              <div className="up-slider-row"><span>Min param value length</span><b>{minLen}</b></div>
              <input type="range" min="1" max="10" value={minLen} onChange={(e) => setMinLen(Number(e.target.value))} />
            </div>
            <div className="up-slider">
              <div className="up-slider-row"><span>Entropy threshold</span><b>{entThresh}</b></div>
              <input type="range" min="0" max="4" step="0.1" value={entThresh} onChange={(e) => setEntThresh(Number(e.target.value))} />
            </div>
          </section>

          <section className="up-panel up-pad">
            <strong className="up-side-label">Custom Signatures</strong>
            <div className="up-custom-form">
              <input type="text" placeholder="Label (e.g. Internal IP)" value={newCustomLabel} onChange={(e) => setNewCustomLabel(e.target.value)} />
              <input type="text" className="up-mono" placeholder="Regex (e.g. 10\.\d+)" value={newCustomPattern} onChange={(e) => setNewCustomPattern(e.target.value)} />
              <button className="up-btn-ghost" onClick={addCustomRegex}>+ Add rule (5 pts)</button>
            </div>
            {customRegexes.length > 0 && (
              <div className="up-custom-list">
                {customRegexes.map((r) => (
                  <div key={r.id} className="up-custom-item">
                    <div className="up-custom-meta">
                      <span className="up-custom-name">{r.label}</span>
                      <span className="up-custom-pat">{r.pattern}</span>
                    </div>
                    <button className="up-icon-btn up-danger" onClick={() => removeCustomRegex(r.id)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Actions + progress */}
      <div className="up-actions-bar">
        {isParsing && (
          <div className="up-progress">
            <div className="up-progress-row"><span>{progressInfo.text}</span><span className="up-progress-pct">{progressInfo.percent}%</span></div>
            <div className="up-progress-track"><div className="up-progress-fill" style={{ width: `${progressInfo.percent}%` }} /></div>
          </div>
        )}
        <div className="up-actions">
          <button className="up-btn-primary" onClick={runParse} disabled={isParsing}>
            {isParsing ? '⏳ Processing…' : '▶ Parse & Analyze'}
          </button>
          {isParsing && (
            <button className="up-btn-ghost up-danger" onClick={cancelParse}>✕ Cancel</button>
          )}
          <button className="up-btn-ghost" onClick={dedupFirst} disabled={isParsing}>🔗 Dedup First</button>
          <button className="up-btn-ghost" onClick={exportCsv} disabled={isParsing || parsedData.length === 0}>📦 Export CSV</button>
          <button className="up-btn-ghost" onClick={exportTxt} disabled={isParsing || parsedData.length === 0}>📄 Export TXT</button>
          <button className="up-btn-ghost" onClick={saveCurrentSession} disabled={isParsing}>💾 Save Session</button>
        </div>
      </div>

      {/* Results */}
      {stats.total !== undefined && !showHeavy && (
        <div className="up-results-loading">Rendering results…</div>
      )}
      {stats.total !== undefined && showHeavy && (
        <div className="up-results">
          <div className="up-summary">
            <div className="up-sum-cell"><span>Processed</span><b>{stats.total.toLocaleString()}</b></div>
            <div className="up-sum-cell"><span>Skipped</span><b className="up-muted">{stats.skipped.toLocaleString()}</b></div>
            <div className="up-sum-cell"><span className="up-ok">Matched</span><b className="up-ok">{stats.matched.toLocaleString()}</b></div>
            <div className="up-sum-cell up-crit"><span>Criticals</span><b>{stats.criticals.toLocaleString()}</b></div>
          </div>

          <div className="up-cards">
            {CATEGORIES.map((c) => {
              const count = stats[c.id] || 0;
              const isActive = activeTab === c.id;
              const color = getSevColor(c.sev);
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveTab(c.id)}
                  className={`up-card ${isActive ? 'is-active' : ''}`}
                  style={{ opacity: count === 0 && !isActive ? 0.4 : 1, '--card-accent': color }}
                >
                  <div className="up-card-count" style={{ color: count > 0 ? color : 'var(--text-primary)' }}>{count.toLocaleString()}</div>
                  <div className="up-card-label">{c.label}</div>
                  <div className="up-card-sev" style={{ color }}>{c.sev}</div>
                </button>
              );
            })}
          </div>

          {stats.domainBreakdown && Object.keys(stats.domainBreakdown).length > 0 && (
            <div className="up-domains">
              <div className="up-section-tag">🌐 Domain Breakdown ({Object.keys(stats.domainBreakdown).length})</div>
              <div className="up-panel up-pad">
                <div className="up-domain-grid">
                  {Object.entries(stats.domainBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 200).map(([domain, count]) => (
                    <div key={domain} className="up-domain-item">
                      <span className="up-domain-name" title={domain}>{domain}</span>
                      <span className="up-domain-count">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="up-panel up-table-panel">
            <div className="up-tabs-bar">
              <div className="up-lens">
                <button className={`up-lens-btn ${resultView === 'categories' ? 'is-active' : ''}`} onClick={() => setResultView('categories')}>🔥 Categories</button>
                <button className={`up-lens-btn ${resultView === 'endpoints' ? 'is-active' : ''}`} onClick={() => setResultView('endpoints')}>🧬 Endpoints</button>
                <button className={`up-lens-btn ${resultView === 'params' ? 'is-active' : ''}`} onClick={() => setResultView('params')}>📊 Parameters</button>
                <button className={`up-lens-btn ${resultView === 'jwts' ? 'is-active' : ''}`} onClick={() => setResultView('jwts')}>🔑 JWTs</button>
                <button className={`up-lens-btn ${resultView === 'verb' ? 'is-active' : ''}`} onClick={() => setResultView('verb')}>🔀 IDOR Matrix</button>
                <button className={`up-lens-btn ${resultView === 'env' ? 'is-active' : ''}`} onClick={() => setResultView('env')}>🚦 Env Drift</button>
              </div>

              {resultView === 'categories' ? (
                <div className="up-tabs">
                  <button className={`up-pill ${activeTab === 'topRisk' ? 'is-active' : ''}`} onClick={() => setActiveTab('topRisk')}>Top Risk</button>
                  {visibleCats.map((c) => (
                    <button
                      key={c.id}
                      className={`up-pill ${activeTab === c.id ? 'is-active' : ''}`}
                      onClick={() => setActiveTab(c.id)}
                      style={activeTab === c.id ? { color: getSevColor(c.sev), borderColor: getSevColor(c.sev), background: `${getSevColor(c.sev)}18` } : undefined}
                    >
                      {c.label} <span className="up-pill-n">{stats[c.id]}</span>
                    </button>
                  ))}
                </div>
              ) : resultView === 'endpoints' ? (
                <span className="up-tmpl-count">
                  {filteredTemplates.length.toLocaleString()} templates ·{' '}
                  <button className="up-sort-link" onClick={() => setEndpointSort((s) => (s === 'count' ? 'rarity' : 'count'))}>
                    sort: {endpointSort === 'count' ? 'count ▾' : 'rarity ▾'}
                  </button>
                </span>
              ) : resultView === 'params' ? (
                <span className="up-tmpl-count">{paramDossier.length.toLocaleString()} unique parameters</span>
              ) : resultView === 'jwts' ? (
                <span className="up-tmpl-count">{jwtFindings.length.toLocaleString()} JWT(s) decoded</span>
              ) : resultView === 'verb' ? (
                <span className="up-tmpl-count">{verbMatrix.length.toLocaleString()} endpoint templates · destructive verbs first</span>
              ) : (
                <span className="up-tmpl-count">{envMatrix.length.toLocaleString()} shared paths · drift first (needs httpx status input)</span>
              )}

              {resultView === 'categories' && (
                <select className="up-conf-select" value={minConf} onChange={(e) => setMinConf(e.target.value)} title="Minimum detection confidence to show">
                  <option value="all">Confidence: All ({((stats.conf_high || 0) + (stats.conf_medium || 0) + (stats.conf_low || 0)).toLocaleString()})</option>
                  <option value="medium">Confidence: Medium &amp; High ({((stats.conf_medium || 0) + (stats.conf_high || 0)).toLocaleString()})</option>
                  <option value="high">Confidence: High only ({(stats.conf_high || 0).toLocaleString()})</option>
                </select>
              )}
              <input className="up-filter" type="text" placeholder={resultView === 'endpoints' ? 'Filter templates…' : 'Filter URLs…'} value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            </div>

            {resultView === 'categories' ? (
              <>
                <div className="up-table-body">
                  {activeData.length === 0 ? (
                    <div className="up-empty"><span>🔍</span>No URLs matched for this view.</div>
                  ) : (
                    <VirtualTable
                      items={pagedData}
                      rowHeight={ROW_HEIGHT}
                      getKey={(d) => d.url}
                      renderRow={(d, localIdx) => {
                        const globalIdx = safePage * PAGE_SIZE + localIdx;
                        return (
                          <UrlRow
                            d={d}
                            i={globalIdx}
                            activeTab={activeTab}
                            status={urlStatuses[d.url]}
                            isCopied={copiedState === `url-${globalIdx}`}
                            onToggleStatus={toggleUrlStatus}
                            onCopy={handleCopy}
                            highlightUrl={highlightUrl}
                          />
                        );
                      }}
                    />
                  )}
                </div>

                {activeData.length > PAGE_SIZE && (
                  <div className="up-pager">
                    <span className="up-pager-info">
                      {(safePage * PAGE_SIZE + 1).toLocaleString()}–{Math.min((safePage + 1) * PAGE_SIZE, activeData.length).toLocaleString()} of {activeData.length.toLocaleString()}
                    </span>
                    <div className="up-pager-ctrls">
                      <button className="up-pager-btn" disabled={safePage === 0} onClick={() => setPage(0)}>« First</button>
                      <button className="up-pager-btn" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Prev</button>
                      <span className="up-pager-page">Page {safePage + 1} / {totalPages.toLocaleString()}</span>
                      <button className="up-pager-btn" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next ›</button>
                      <button className="up-pager-btn" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last »</button>
                    </div>
                  </div>
                )}
              </>
            ) : resultView === 'endpoints' ? (
              drillTemplate ? (
                <>
                  <div className="up-drill-head">
                    <button className="up-pager-btn" onClick={() => setDrillTemplate(null)}>← Templates</button>
                    <span className="up-drill-tmpl" title={drillTemplate}>{drillTemplate}</span>
                    <span className="up-drill-count">{drillUrls.length.toLocaleString()} URLs</span>
                  </div>
                  <div className="up-table-body">
                    <VirtualTable
                      items={drillUrls}
                      rowHeight={ROW_HEIGHT}
                      getKey={(d) => d.url}
                      renderRow={(d, i) => (
                        <UrlRow
                          d={d}
                          i={i}
                          activeTab="topRisk"
                          status={urlStatuses[d.url]}
                          isCopied={copiedState === `drill-${i}`}
                          onToggleStatus={toggleUrlStatus}
                          onCopy={(text) => handleCopy(text, `drill-${i}`)}
                          highlightUrl={highlightUrl}
                        />
                      )}
                    />
                  </div>
                </>
              ) : (
                <div className="up-table-body">
                  {filteredTemplates.length === 0 ? (
                    <div className="up-empty"><span>🧬</span>No endpoint templates.</div>
                  ) : (
                    <VirtualTable
                      items={filteredTemplates}
                      rowHeight={TEMPLATE_ROW_H}
                      getKey={(t) => t.template}
                      renderRow={(t, i) => (
                        <TemplateRow t={t} idx={i} isCopied={copiedState === `tmpl-${i}`} isFuzzed={copiedState === `fz-${i}`} onCopy={handleCopy} onFuzz={handleFuzz} onDrill={setDrillTemplate} />
                      )}
                    />
                  )}
                </div>
              )
            ) : resultView === 'params' ? (
              <>
                <div className="up-table-body up-scroll">
                  {lensList.length === 0 ? (
                    <div className="up-empty"><span>📊</span>No parameters found.</div>
                  ) : lensSlice.map((d, i) => {
                    const gi = safeLensPage * LENS_PAGE + i;
                    return (
                      <div key={d.param} className="up-trow" style={{ height: 'auto', padding: '10px 16px' }}>
                        <div className="up-param-name" title={`sample: ${d.sample}`}>{d.param}</div>
                        <div className="up-param-stat" title="endpoints × hosts">{d.endpoints}ep · {d.hosts}h</div>
                        <div className="up-param-types">{d.types.slice(0, 4).map((t) => <span key={t} className="up-tag">{t}</span>)}</div>
                        <div className="up-tags">
                          {d.categories.map((catId) => {
                            const cDef = CATEGORIES.find((c) => c.id === catId);
                            return cDef ? <span key={catId} className="up-tag">{cDef.label}</span> : null;
                          })}
                        </div>
                        <button className="up-icon-btn" onClick={() => handleFuzz(`{HOST}/{PATH}?${d.param}={val}`, `pf-${gi}`)} title="Copy ffuf command for this param">
                          {copiedState === `pf-${gi}` ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span> : '⚡'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <Pager page={safeLensPage} pages={lensPages} onSet={setLensPage} label={`${lensList.length.toLocaleString()} parameters`} />
              </>
            ) : resultView === 'jwts' ? (
              <>
                <div className="up-table-body up-scroll">
                  {lensList.length === 0 ? (
                    <div className="up-empty"><span>🔑</span>No JWTs found in these URLs.</div>
                  ) : lensSlice.map((j, i) => {
                    const gi = safeLensPage * LENS_PAGE + i;
                    return (
                      <div key={j.token} className="up-jwt-row">
                        <div className="up-jwt-top">
                          <span className="up-jwt-alg" data-bad={j.issues.some((s) => /alg:none|forgeable/.test(s)) || undefined}>alg: {j.alg}</span>
                          {j.exp && <span className={`up-jwt-tag ${j.expired ? 'is-bad' : ''}`}>{j.expired ? 'EXPIRED' : 'valid'} {new Date(j.exp * 1000).toISOString().slice(0, 10)}</span>}
                          {j.iss && <span className="up-jwt-meta">iss: {j.iss}</span>}
                          {j.sub && <span className="up-jwt-meta">sub: {j.sub}</span>}
                          <button className="up-icon-btn" style={{ marginLeft: 'auto' }} onClick={() => handleCopy(j.token, `jwt-${gi}`)} title="Copy token">{copiedState === `jwt-${gi}` ? '✓' : '⧉'}</button>
                        </div>
                        <div className="up-jwt-issues">
                          {j.issues.map((s) => <span key={s} className={`up-jwt-issue ${/alg:none|forgeable|injection|expired/.test(s) ? 'is-bad' : ''}`}>{s}</span>)}
                        </div>
                        <div className="up-jwt-url" title={j.url}>{j.url}</div>
                      </div>
                    );
                  })}
                </div>
                <Pager page={safeLensPage} pages={lensPages} onSet={setLensPage} label={`${lensList.length.toLocaleString()} JWT(s)`} />
              </>
            ) : resultView === 'verb' ? (
              <>
                <div className="up-table-body up-scroll">
                  {lensList.length === 0 ? (
                    <div className="up-empty"><span>🔀</span>No endpoints. Feed httpx <code>-method</code> output to populate verbs.</div>
                  ) : lensSlice.map((v) => (
                    <div key={v.template} className="up-trow" style={{ height: 'auto', padding: '10px 16px' }}>
                      {v.destructive && <span className="up-conf up-conf-high" title="Has a state-changing verb (POST/PUT/DELETE/PATCH) → BOLA candidate">!</span>}
                      <div className="up-verb-methods">
                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                          <span key={m} className={`up-verb ${v.methods.includes(m) ? 'on' : ''}`}>{m}</span>
                        ))}
                      </div>
                      <div className="up-turl" title={v.template}>{v.template}</div>
                      <div className="up-tcount">×{v.count.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                <Pager page={safeLensPage} pages={lensPages} onSet={setLensPage} label={`${lensList.length.toLocaleString()} templates`} />
              </>
            ) : (
              <>
                <div className="up-table-body up-scroll">
                  {lensList.length === 0 ? (
                    <div className="up-empty"><span>🚦</span>No shared paths across hosts. Feed httpx with status codes (<code>-sc -json</code>) for drift detection.</div>
                  ) : lensSlice.map((e) => (
                    <div key={e.path} className="up-env-row">
                      <div className="up-env-head">
                        {e.drift && <span className="up-conf up-conf-high" title="Open on one host, blocked on another → auth boundary drift">!</span>}
                        <span className="up-turl" title={e.path}>{e.path}</span>
                        <span className="up-tcount">{e.hosts.length} hosts</span>
                      </div>
                      <div className="up-env-hosts">
                        {e.hosts.map((h) => (
                          <span key={h.host} className="up-env-host" title={h.host}>
                            {h.host}: <b>{h.statuses.length ? h.statuses.join(',') : '?'}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Pager page={safeLensPage} pages={lensPages} onSet={setLensPage} label={`${lensList.length.toLocaleString()} shared paths`} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Wordlists */}
      {showHeavy && parsedData.length > 0 && (
        <div className="up-wordlists">
          <div className="up-wl-head">
            <h2>Wordlist Generator</h2>
            {showWordlists ? (
              <div className="up-scope">
                <button className={wordlistScope === 'active' ? 'is-active' : ''} onClick={() => setWordlistScope('active')}>Active Tab</button>
                <button className={wordlistScope === 'all' ? 'is-active' : ''} onClick={() => setWordlistScope('all')}>All Parsed</button>
                <button onClick={() => setShowWordlists(false)}>Hide</button>
              </div>
            ) : (
              <button className="up-btn-ghost" onClick={() => setShowWordlists(true)}>Generate wordlists</button>
            )}
          </div>
          {showWordlists && (
          <div className="up-wl-grid">
            {[['Parameter Keys', 'keys'], ['Parameter Values', 'vals'], ['Path Segments', 'paths']].map(([label, key]) => (
              <div key={key} className="up-panel up-wl-col">
                <div className="up-panel-head">
                  <div className="up-panel-title">{label}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="up-mini up-mini-on" onClick={() => openWlSave(wordlists[key], `${source}-${key}`, key === 'keys' ? 'params' : key === 'paths' ? 'paths' : 'values')} title="Save to the Wordlists library">💾 Send</button>
                    <button className="up-mini up-mini-on" onClick={() => handleCopy(wordlists[key], `wl-${key}`)}>
                      {copiedState === `wl-${key}` ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <textarea
                  readOnly
                  className="up-textarea up-mono up-wl-text"
                  value={wordlists[key].length > 5000 ? wordlists[key].substring(0, 5000) + '\n\n… [preview truncated — click Copy for full list]' : wordlists[key]}
                />
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Sessions */}
      <div className="up-sessions">
        <button className="up-sessions-toggle" onClick={() => setShowSessions(!showSessions)}>
          {showSessions ? '▼' : '▶'} Saved Sessions <span className="up-chip">{sessions.length}</span>
        </button>
        {showSessions && (
          <div className="up-session-grid">
            {sessions.length === 0 && <div className="up-muted up-italic">No saved sessions yet.</div>}
            {sessions.map((s) => (
              <div key={s.id} className="up-panel up-pad up-session-card">
                <div>
                  <div className="up-session-top">
                    <div className="up-session-name">{s.name}</div>
                    <div className="up-session-pts">{s.summary?.topRisk || 0} pts</div>
                  </div>
                  <div className="up-session-meta">{s.date} · {s.summary?.total || 0} URLs · {s.source}</div>
                </div>
                <div className="up-session-actions">
                  <button
                    className="up-btn-ghost"
                    onClick={() => {
                      if (!s.rawInput) { alert('Legacy session — no raw input stored. Please delete.'); return; }
                      setRawInput(s.rawInput);
                      setInputPage(0);
                      if (s.rawInput.split('\n').length > 500) setEditingInput(false);
                      else { setEditingInput(true); if (rawInputRef.current) rawInputRef.current.value = s.rawInput; }
                      if (s.checks) setChecks(s.checks);
                      if (s.urlStatuses) setUrlStatuses(s.urlStatuses);
                      if (s.customRegexes) setCustomRegexes(s.customRegexes);
                      setSource(s.source);
                      alert("Session loaded. Click 'Parse & Analyze' to rebuild the dashboard.");
                    }}
                  >Load</button>
                  <button className="up-btn-ghost up-danger" onClick={() => saveSessionsStore(sessions.filter((x) => x.id !== s.id))}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wlSave && (
        <div className="up-modal-bg" onClick={() => setWlSave(null)}>
          <div className="up-modal" onClick={(e) => e.stopPropagation()}>
            <strong>Send to Wordlists</strong>
            <p className="up-modal-sub">{wlSave.content.split('\n').filter(Boolean).length.toLocaleString()} entries (deduped on save)</p>
            <label className="up-modal-l">Name
              <input className="up-modal-in" value={wlSave.name} onChange={(e) => setWlSave((s) => ({ ...s, name: e.target.value }))} />
            </label>
            <label className="up-modal-l">Category / tech
              <input className="up-modal-in" list="up-wlcats" value={wlSave.category} onChange={(e) => setWlSave((s) => ({ ...s, category: e.target.value }))} />
              <datalist id="up-wlcats">{wlCats.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <div className="up-modal-actions">
              <button className="up-btn-ghost" onClick={() => setWlSave(null)}>Cancel</button>
              <button className="up-btn-primary" onClick={confirmWlSave} disabled={!wlSave.name.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// --- STYLES (scoped, using the app's BugHawk design tokens) ---
const styles = `
.up-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); width: 100%; box-sizing: border-box; }
.up-wrap h1, .up-wrap h2 { margin: 0; }
.up-wrap input, .up-wrap textarea, .up-wrap button { font-family: inherit; }
.up-wrap * { box-sizing: border-box; }

/* Header */
.up-header { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-5); flex-wrap: wrap; }
.up-title { display: flex; align-items: center; gap: var(--sp-3); }
.up-logo { width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--grad); display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: var(--glow-purple); }
.up-title h1 { font-family: var(--font-display); font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
.up-title p { margin: 2px 0 0; font-size: 13px; color: var(--text2); }
.up-source-group { display: flex; gap: 2px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); flex-wrap: wrap; }
.up-source { padding: 6px 12px; border: none; background: transparent; color: var(--text2); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; }
.up-source:hover { color: var(--text-primary); }
.up-source.is-active { background: var(--accent-primary-dim); color: var(--accent-primary-bright); }

/* Layout — align-items:start so the input panel does NOT stretch to match the
   taller settings column. */
.up-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--sp-5); margin-bottom: var(--sp-5); align-items: stretch; }
.up-side { display: flex; flex-direction: column; gap: var(--sp-4); }
.up-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); }
.up-pad { padding: var(--sp-4); }

/* Input panel */
.up-input-panel { display: flex; flex-direction: column; }
.up-panel-head { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); gap: var(--sp-2); }
.up-panel-title { display: flex; align-items: center; gap: var(--sp-2); font-size: 14px; font-weight: 600; }
.up-panel-actions { display: flex; gap: var(--sp-2); }
.up-chip { font-size: 11px; font-weight: 600; color: var(--text2); background: var(--surface); border: 1px solid var(--border); padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.up-textarea { flex: 1; width: 100%; min-height: 280px; background: transparent; border: none; color: var(--text-primary); font-family: var(--font-data); font-size: 13px; padding: var(--sp-4); outline: none; resize: none; white-space: pre; overflow: auto; }

/* Side sections */
.up-side-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); font-size: 14px; }
.up-side-label { display: block; font-size: 14px; margin-bottom: var(--sp-4); }
.up-toggle-all { display: flex; gap: 4px; }
.up-mini { font-size: 11px; border: none; padding: 3px 8px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600; }
.up-mini-on { background: rgba(16,185,129,0.14); color: #10b981; }
.up-mini-off { background: rgba(239,68,68,0.14); color: #ef4444; }
.up-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.up-check { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; color: var(--text2); }
.up-check.is-on { color: var(--text-primary); }
.up-check input { accent-color: var(--accent-primary); }

.up-slider { margin-bottom: var(--sp-4); }
.up-slider:last-child { margin-bottom: 0; }
.up-slider-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text2); margin-bottom: 8px; }
.up-slider-row b { color: var(--text-primary); }
.up-slider input { width: 100%; accent-color: var(--accent-primary); }

.up-custom-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: var(--sp-3); }
.up-custom-form input { padding: 8px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); outline: none; }
.up-mono { font-family: var(--font-data); }
.up-custom-list { display: flex; flex-direction: column; gap: 8px; }
.up-custom-item { display: flex; align-items: center; justify-content: space-between; padding: 8px; background: var(--accent-primary-dim); border: 1px solid rgba(139,92,246,0.25); border-radius: var(--radius-sm); }
.up-custom-meta { display: flex; flex-direction: column; overflow: hidden; padding-right: 8px; }
.up-custom-name { font-size: 12px; font-weight: 600; color: var(--accent-primary-bright); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-custom-pat { font-size: 10px; font-family: var(--font-data); color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Buttons */
.up-btn-primary { background: var(--grad); color: #fff; padding: 10px 22px; border: none; border-radius: var(--radius-sm); font-weight: 600; font-size: 14px; cursor: pointer; box-shadow: var(--glow-purple); transition: transform .15s, opacity .15s; }
.up-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.up-btn-primary:disabled { opacity: .6; cursor: default; }
.up-btn-ghost { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 9px 14px; border-radius: var(--radius-sm); font-weight: 500; font-size: 13px; cursor: pointer; transition: background .15s; }
.up-btn-ghost:hover:not(:disabled) { background: var(--surface-hover); }
.up-btn-ghost:disabled { opacity: .5; cursor: default; }
.up-danger { color: #ef4444; }

/* Actions / progress */
.up-actions-bar { margin-bottom: var(--sp-6); }
.up-actions { display: flex; gap: var(--sp-3); flex-wrap: wrap; }
.up-progress { margin-bottom: var(--sp-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 16px; }
.up-progress-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 8px; }
.up-progress-pct { color: var(--accent-primary-bright); }
.up-progress-track { height: 6px; background: var(--accent-primary-dim); border-radius: 4px; overflow: hidden; }
.up-progress-fill { height: 100%; background: var(--grad); transition: width .1s linear; }

/* Summary */
.up-summary { display: flex; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: var(--sp-5); flex-wrap: wrap; }
.up-sum-cell { flex: 1; min-width: 120px; padding: var(--sp-4) var(--sp-5); display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border); }
.up-sum-cell:last-child { border-right: none; }
.up-sum-cell span { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); }
.up-sum-cell b { font-size: 24px; font-weight: 700; }
.up-muted { color: var(--text2); }
.up-ok { color: #10b981 !important; }
.up-crit { background: rgba(239,68,68,0.06); }
.up-crit span, .up-crit b { color: #ef4444; }

/* Category cards */
.up-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-6); }
.up-card { position: relative; padding: var(--sp-4); border-radius: var(--radius); cursor: pointer; text-align: center; background: var(--bg-surface); border: 1px solid var(--border); transition: transform .15s, border-color .15s; overflow: hidden; }
.up-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: transparent; transition: background .15s; }
.up-card:hover { transform: translateY(-2px); border-color: var(--border-active); }
.up-card:hover::before { background: var(--card-accent); opacity: .5; }
.up-card.is-active { border-color: var(--card-accent); }
.up-card.is-active::before { background: var(--card-accent); }
.up-card-count { font-size: 30px; font-weight: 800; letter-spacing: -1px; margin-bottom: 6px; }
.up-card-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.up-card-sev { font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }

/* content-visibility lets the browser skip layout of these below-the-fold
   sections until they scroll into view. This is what keeps revealing the tab
   (display:none -> block) fast even with tens of thousands of parsed rows. */
.up-domains, .up-wordlists, .up-sessions { content-visibility: auto; contain-intrinsic-size: 0 480px; }

/* Domains */
.up-domains { margin-bottom: var(--sp-6); }
.up-section-tag { display: inline-flex; align-items: center; gap: 6px; background: var(--accent-primary-dim); border: 1px solid var(--border-active); color: var(--accent-primary-bright); padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: var(--sp-4); }
.up-domain-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-3); }
.up-domain-item { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; }
.up-domain-name { color: var(--accent-primary-bright); font-weight: 600; font-family: var(--font-data); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-domain-count { color: var(--text2); white-space: nowrap; font-weight: 500; }

/* Table */
.up-table-panel { overflow: hidden; }
.up-tabs-bar { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-4); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); background: var(--surface); }
.up-lens { display: flex; gap: 4px; background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px; flex-shrink: 0; }
.up-lens-btn { padding: 6px 12px; border: none; background: transparent; color: var(--text2); border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.up-lens-btn.is-active { background: var(--accent-primary-dim); color: var(--accent-primary-bright); }
.up-tmpl-count { flex: 1; font-size: 12px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-tabs { display: flex; gap: 8px; overflow-x: auto; }
.up-trow { display: flex; align-items: center; gap: var(--sp-3); padding: 0 var(--sp-4); border-bottom: 1px solid var(--border); }
.up-trow:hover { background: var(--surface-hover); }
.up-tcount { min-width: 64px; font-family: var(--font-data); font-size: 13px; font-weight: 700; color: var(--accent-primary-bright); flex-shrink: 0; }
.up-turl { flex: 1; min-width: 0; font-family: var(--font-data); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); }
.up-scroll { overflow: auto; }
.up-rarity { flex-shrink: 0; font-size: 11px; font-weight: 700; font-family: var(--font-data); color: var(--cyan); min-width: 44px; }
.up-sort-link { background: none; border: none; color: var(--accent-primary-bright); cursor: pointer; font-size: 12px; font-weight: 600; padding: 0; }
.up-param-name { flex: 1; min-width: 0; font-family: var(--font-data); font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-param-stat { flex-shrink: 0; font-size: 11px; color: var(--text2); font-family: var(--font-data); min-width: 80px; }
.up-param-types { display: flex; gap: 4px; flex-shrink: 0; }

/* JWT lens */
.up-jwt-row { padding: 12px 16px; border-bottom: 1px solid var(--border); }
.up-jwt-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.up-jwt-alg { font-family: var(--font-data); font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }
.up-jwt-alg[data-bad] { color: #ef4444; background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); }
.up-jwt-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--surface); color: var(--text2); border: 1px solid var(--border); }
.up-jwt-tag.is-bad { color: #ef4444; background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); }
.up-jwt-meta { font-size: 11px; color: var(--text2); font-family: var(--font-data); }
.up-jwt-issues { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
.up-jwt-issue { font-size: 10px; padding: 1px 7px; border-radius: 999px; background: var(--surface); color: var(--text2); border: 1px solid var(--border); }
.up-jwt-issue.is-bad { color: #ef4444; background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); font-weight: 600; }
.up-jwt-url { font-family: var(--font-data); font-size: 11px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Verb matrix */
.up-verb-methods { display: flex; gap: 3px; flex-shrink: 0; }
.up-verb { font-size: 10px; font-weight: 700; font-family: var(--font-data); padding: 2px 5px; border-radius: 4px; color: var(--text3); background: var(--surface); border: 1px solid var(--border); opacity: 0.4; }
.up-verb.on { opacity: 1; color: var(--accent-primary-bright); background: var(--accent-primary-dim); border-color: var(--border-active); }

/* Env drift */
.up-env-row { padding: 10px 16px; border-bottom: 1px solid var(--border); }
.up-env-head { display: flex; align-items: center; gap: 8px; }
.up-env-hosts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.up-env-host { font-size: 11px; font-family: var(--font-data); color: var(--text2); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; }
.up-turl-link { cursor: pointer; }
.up-turl-link:hover { color: var(--accent-primary-bright); text-decoration: underline; }
.up-drill-head { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); background: var(--surface); }
.up-drill-tmpl { flex: 1; min-width: 0; font-family: var(--font-data); font-size: 12.5px; color: var(--accent-primary-bright); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-drill-count { font-size: 12px; color: var(--text2); white-space: nowrap; }
.up-pill { padding: 7px 14px; border-radius: 999px; border: 1px solid transparent; background: transparent; color: var(--text2); cursor: pointer; font-weight: 500; font-size: 13px; white-space: nowrap; transition: all .15s; }
.up-pill:hover { color: var(--text-primary); background: var(--surface-hover); }
.up-pill.is-active { background: var(--accent-primary-dim); color: var(--accent-primary-bright); border-color: var(--border-active); }
.up-pill-n { opacity: .7; font-size: 11px; }
.up-filter { padding: 8px 14px; border-radius: 999px; background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border); font-size: 13px; width: 200px; outline: none; flex-shrink: 0; }
.up-filter:focus { border-color: var(--border-active); }
.up-table-body { height: 600px; }
.up-table-body .vtable { height: 100%; border: none; border-radius: 0; background: transparent; }
.up-table-body .vtable-scroll { flex: 1; min-height: 0; overflow: auto; }
.up-pager { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); background: var(--surface); flex-wrap: wrap; }
.up-pager-info { font-size: 12px; color: var(--text2); }
.up-pager-ctrls { display: flex; align-items: center; gap: 6px; }
.up-pager-page { font-size: 12px; font-weight: 600; color: var(--text-primary); padding: 0 8px; white-space: nowrap; }
.up-pager-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500; cursor: pointer; transition: background .15s; }
.up-pager-btn:hover:not(:disabled) { background: var(--surface-hover); }
.up-pager-btn:disabled { opacity: .4; cursor: default; }
.up-results-loading { padding: 40px; text-align: center; color: var(--text2); font-size: 14px; }
.up-empty { padding: 60px; text-align: center; color: var(--text2); display: flex; flex-direction: column; align-items: center; gap: 12px; }
.up-empty span { font-size: 32px; }

/* Row */
.up-row { display: flex; align-items: center; gap: var(--sp-3); padding: 0 var(--sp-4); border-bottom: 1px solid var(--border); border-left: 3px solid transparent; }
.up-row:hover { background: var(--surface-hover); }
.up-row[data-status='vulnerable'] { background: rgba(239,68,68,0.05); border-left-color: #ef4444; }
.up-row[data-status='tested'] { border-left-color: #10b981; }
.up-row-flags { display: flex; flex-direction: column; gap: 6px; width: 64px; flex-shrink: 0; border-right: 1px solid var(--border); padding-right: 8px; }
.up-flag { font-size: 10px; display: flex; align-items: center; gap: 4px; cursor: pointer; color: var(--text2); }
.up-flag input { accent-color: var(--accent-primary); }
.up-flag.is-tested { color: #10b981; }
.up-flag.is-vuln { color: #ef4444; }
.up-row-idx { width: 40px; flex-shrink: 0; font-size: 11px; color: var(--text3); text-align: right; }
.up-score { padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; min-width: 26px; text-align: center; border: 1px solid; flex-shrink: 0; }
.up-entropy { font-size: 15px; flex-shrink: 0; }
.up-dupe { flex-shrink: 0; font-size: 10px; font-weight: 700; font-family: var(--font-data); color: var(--accent-primary-bright); background: var(--accent-primary-dim); border: 1px solid var(--border-active); border-radius: 999px; padding: 1px 7px; }
.up-conf { flex-shrink: 0; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; border-radius: 5px; border: 1px solid; }
.up-conf-high { color: #ef4444; background: rgba(239,68,68,0.14); border-color: rgba(239,68,68,0.4); }
.up-conf-medium { color: #f59e0b; background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.4); }
.up-conf-low { color: var(--text3); background: var(--surface); border-color: var(--border); }
.up-conf-select { padding: 7px 10px; border-radius: var(--radius-sm); background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border); font-size: 12px; outline: none; cursor: pointer; flex-shrink: 0; }
.up-url { flex: 1; min-width: 0; font-family: var(--font-data); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-tags { display: flex; gap: 6px; flex-shrink: 0; max-width: 320px; overflow: hidden; }
.up-tag { font-size: 10px; padding: 2px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; color: var(--text2); white-space: nowrap; }
.up-icon-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); border-radius: var(--radius-sm); padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.up-icon-btn:hover { background: var(--surface-hover); }

/* Highlight spans */
.up-hl-key { color: #ef4444; font-weight: 600; }
.up-hl-val { color: #f59e0b; }
.up-hl-jwt { color: #3b82f6; font-weight: 600; background: rgba(59,130,246,0.12); padding: 0 2px; border-radius: 3px; }
.up-hl-match { background: rgba(239,68,68,0.22); color: #ef4444; font-weight: 700; padding: 0 2px; border-radius: 2px; }

/* Wordlists */
.up-wordlists { margin-top: var(--sp-6); }
.up-wl-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); }
.up-wl-head h2 { font-family: var(--font-display); font-size: 19px; font-weight: 700; }
.up-scope { display: flex; gap: 4px; background: var(--surface); padding: 4px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.up-scope button { padding: 6px 14px; border-radius: var(--radius-sm); border: none; font-size: 12px; font-weight: 600; cursor: pointer; background: transparent; color: var(--text2); }
.up-scope button.is-active { background: var(--accent-primary-dim); color: var(--accent-primary-bright); }
.up-wl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--sp-4); }
.up-wl-col { display: flex; flex-direction: column; overflow: hidden; }
.up-wl-text { flex: none; min-height: 0; height: 200px; resize: vertical; }

/* Send-to-Wordlists modal */
.up-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.up-modal { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-5); width: 420px; max-width: 92vw; box-shadow: 0 20px 60px var(--shadow-strong); }
.up-modal-sub { font-size: 12px; color: var(--text2); margin: 4px 0 14px; }
.up-modal-l { display: block; font-size: 12px; color: var(--text2); margin-bottom: 12px; }
.up-modal-in { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.up-modal-in:focus { border-color: var(--border-active); }
.up-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

/* Sessions */
.up-sessions { margin-top: var(--sp-6); }
.up-sessions-toggle { background: transparent; border: none; color: var(--text-primary); font-weight: 600; font-size: 17px; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 0; }
.up-session-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--sp-4); margin-top: var(--sp-4); }
.up-session-card { display: flex; flex-direction: column; gap: var(--sp-4); }
.up-session-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; gap: 8px; }
.up-session-name { font-weight: 600; font-size: 15px; }
.up-session-pts { font-size: 11px; color: #ef4444; font-weight: 700; background: rgba(239,68,68,0.1); padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.up-session-meta { font-size: 12px; color: var(--text2); }
.up-session-actions { display: flex; gap: 8px; margin-top: auto; }
.up-session-actions .up-btn-ghost { flex: 1; }
.up-italic { font-style: italic; }

@media (max-width: 980px) { .up-grid { grid-template-columns: 1fr; } }
`;

export default ReconUrlParser;
