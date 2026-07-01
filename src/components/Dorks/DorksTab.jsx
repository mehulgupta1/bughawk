import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { buildDorks, DORK_CATEGORIES, buildGoogleDorks, GOOGLE_CATEGORIES, dorkQuery, dorkUrl, googleQuery, googleUrl } from '../../lib/dorks.js';
import { get, set, KEYS } from '../../lib/storage.js';

const EMPTY_CUSTOM = { github: [], google: [], githubCats: [], googleCats: [] };

const DorksTab = memo(function DorksTab({ defaultTarget = '' }) {
  const [engine, setEngine] = useState('github'); // 'github' | 'google'
  const [target, setTarget] = useState(defaultTarget);
  const [org, setOrg] = useState('');
  const [filter, setFilter] = useState('');
  const [cat, setCat] = useState('all');
  const [copied, setCopied] = useState(null);
  const [opened, setOpened] = useState({}); // query -> true (checked/visited)
  const [custom, setCustom] = useState(EMPTY_CUSTOM); // user dorks + categories
  const [addCat, setAddCat] = useState('');
  const [addQ, setAddQ] = useState('');
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const o = await get(KEYS.dorksOpened, {});
      const c = await get(KEYS.customDorks, EMPTY_CUSTOM);
      if (cancelled) return;
      setOpened(o && typeof o === 'object' ? o : {});
      setCustom({ ...EMPTY_CUSTOM, ...(c && typeof c === 'object' ? c : {}) });
    })();
    return () => { cancelled = true; };
  }, []);

  const persistCustom = useCallback((next) => { setCustom(next); set(KEYS.customDorks, next); }, []);
  const catsKey = engine === 'github' ? 'githubCats' : 'googleCats';
  const dorksKey = engine; // 'github' | 'google'

  const addDork = () => {
    const c = (addCat || '').trim();
    const q = (addQ || '').trim();
    if (!c || !q) return;
    persistCustom({ ...custom, [dorksKey]: [...custom[dorksKey], { cat: c, q }] });
    setAddQ('');
  };
  const removeDork = (entry) => {
    persistCustom({ ...custom, [dorksKey]: custom[dorksKey].filter((d) => !(d.cat === entry.cat && d.q === entry.rawQ)) });
  };
  const addCategory = () => {
    const n = (newCatName || '').trim();
    if (!n || custom[catsKey].includes(n)) { setNewCatName(''); return; }
    persistCustom({ ...custom, [catsKey]: [...custom[catsKey], n] });
    setAddCat(n);
    setNewCatName('');
  };

  const setMark = useCallback((query, val) => {
    setOpened((prev) => {
      const next = { ...prev };
      if (val) next[query] = true; else delete next[query];
      set(KEYS.dorksOpened, next);
      return next;
    });
  }, []);

  const builtinCats = engine === 'github' ? DORK_CATEGORIES : GOOGLE_CATEGORIES;
  const customCats = custom[catsKey];
  // built-in categories + any custom category (created or used by a custom dork)
  const categoriesList = useMemo(() => {
    const used = custom[dorksKey].map((d) => d.cat);
    return [...new Set([...builtinCats, ...customCats, ...used])];
  }, [builtinCats, customCats, custom, dorksKey]);

  const dorks = useMemo(() => {
    const t = target.trim();
    if (!t) return [];
    const built = engine === 'github' ? buildDorks(t, org.trim()) : buildGoogleDorks(t);
    const mine = custom[dorksKey].map((d) => {
      const query = engine === 'github' ? dorkQuery(d.q, t, org.trim()) : googleQuery(d.q, t);
      const url = engine === 'github' ? dorkUrl(query) : googleUrl(query);
      return { cat: d.cat, q: d.q, rawQ: d.q, query, url, custom: true };
    });
    return [...built, ...mine];
  }, [engine, target, org, custom, dorksKey]);
  const visible = useMemo(() => {
    const f = filter.toLowerCase();
    return dorks.filter((d) => (cat === 'all' || d.cat === cat) && (!f || d.query.toLowerCase().includes(f)));
  }, [dorks, filter, cat]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const d of visible) { if (!m.has(d.cat)) m.set(d.cat, []); m.get(d.cat).push(d); }
    return [...m.entries()];
  }, [visible]);

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); };
  const copyAllQueries = () => copy(visible.map((d) => d.query).join('\n'), 'all-q');
  const copyAllUrls = () => copy(visible.map((d) => d.url).join('\n'), 'all-u');

  return (
    <div className="dk-wrap">
      <style>{styles}</style>

      <header className="dk-head">
        <div>
          <h1>{engine === 'github' ? '🐙 GitHub Dorks' : '🔍 Google Dorks'}</h1>
          <p>{dorks.length} dorks · {engine === 'github' ? "code-search the target's org & domain for leaked secrets" : 'search Google for exposed files, panels & leaks'}</p>
        </div>
        <div className="dk-engine">
          <button className={engine === 'github' ? 'on' : ''} onClick={() => { setEngine('github'); setCat('all'); }}>🐙 GitHub</button>
          <button className={engine === 'google' ? 'on' : ''} onClick={() => { setEngine('google'); setCat('all'); }}>🔍 Google</button>
        </div>
      </header>

      <section className="dk-panel dk-pad">
        <div className="dk-inputs">
          <label className="dk-l">Target (domain / keyword)
            <input className="dk-in" placeholder="target.com" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          {engine === 'github' && (
            <label className="dk-l">GitHub org (optional → unlocks org-scoped dorks)
              <input className="dk-in" placeholder="targetorg" value={org} onChange={(e) => setOrg(e.target.value)} />
            </label>
          )}
        </div>
        {!target && <div className="dk-empty">Enter a target above to generate dorks.</div>}
      </section>

      {target && (
        <>
          <section className="dk-panel dk-pad dk-add">
            <div className="dk-add-title">＋ Add your own dork ({engine === 'github' ? 'GitHub' : 'Google'})</div>
            <div className="dk-add-row">
              <select className="dk-in dk-add-cat" value={addCat} onChange={(e) => setAddCat(e.target.value)}>
                <option value="">— category —</option>
                {categoriesList.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="dk-in dk-add-q" placeholder={engine === 'github' ? 'e.g. {T} "MY_SECRET" filename:.env' : 'e.g. site:{T} inurl:secret'} value={addQ} onChange={(e) => setAddQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDork()} />
              <button className="dk-btn" onClick={addDork} disabled={!addCat || !addQ.trim()}>Add dork</button>
            </div>
            <div className="dk-add-row">
              <input className="dk-in dk-add-q" placeholder="new category name…" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
              <button className="dk-btn" onClick={addCategory} disabled={!newCatName.trim()}>＋ Create category</button>
            </div>
            <div className="dk-add-hint">Use <code>{'{T}'}</code> for the target{engine === 'github' ? <> and <code>{'{ORG}'}</code> for the org</> : ''}. Saved in-app, available across projects.</div>
          </section>

          <div className="dk-bar">
            <div className="dk-cats">
              {['all', ...categoriesList].map((c) => (
                <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
            <input className="dk-filter" placeholder="Filter dorks…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="dk-btn" onClick={copyAllQueries}>{copied === 'all-q' ? '✓' : 'Copy queries'}</button>
            <button className="dk-btn" onClick={copyAllUrls}>{copied === 'all-u' ? '✓' : 'Copy URLs'}</button>
          </div>

          {grouped.map(([c, items]) => (
            <section key={c} className="dk-group">
              <div className="dk-cat">{c} <span className="dk-cat-n">{items.length}</span></div>
              {items.map((d, i) => (
                <div key={i} className={`dk-row ${opened[d.query] ? 'is-done' : ''}`}>
                  <input type="checkbox" className="dk-chk" checked={!!opened[d.query]} onChange={(e) => setMark(d.query, e.target.checked)} title="Mark as checked" />
                  <code className="dk-q" title={d.query}>{d.query}</code>
                  {d.custom && <span className="dk-tag">custom</span>}
                  <button className="dk-icon" onClick={() => copy(d.query, `${c}-${i}`)} title="Copy query">{copied === `${c}-${i}` ? '✓' : '⧉'}</button>
                  <a className="dk-open" href={d.url} target="_blank" rel="noreferrer" onClick={() => setMark(d.query, true)}>Open ↗</a>
                  {d.custom && <button className="dk-icon dk-del" onClick={() => removeDork(d)} title="Delete custom dork">✕</button>}
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
});

const styles = `
.dk-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); max-width: none; }
.dk-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.dk-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.dk-head p { margin: 2px 0 var(--sp-5); font-size: 13px; color: var(--text2); }
.dk-engine { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px; }
.dk-engine button { border: none; background: transparent; color: var(--text2); padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
.dk-engine button.on { background: var(--accent-primary-dim); color: var(--accent-primary-bright); }
.dk-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: var(--sp-4); }
.dk-pad { padding: var(--sp-4); }
.dk-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dk-l { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text2); }
.dk-in { padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 14px; outline: none; }
.dk-in:focus { border-color: var(--border-active); }
.dk-bar { display: flex; align-items: center; gap: 10px; margin-bottom: var(--sp-4); flex-wrap: wrap; }
.dk-cats { display: flex; gap: 4px; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px; }
.dk-cats button { border: none; background: transparent; color: var(--text2); padding: 5px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
.dk-cats button.on { background: var(--accent-primary-dim); color: var(--accent-primary-bright); }
.dk-filter { flex: 1; min-width: 160px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
.dk-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; white-space: nowrap; }
.dk-group { margin-bottom: var(--sp-4); }
.dk-cat { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--accent-primary-bright); margin-bottom: 8px; }
.dk-cat-n { font-size: 11px; color: var(--text2); background: var(--surface); border: 1px solid var(--border); padding: 1px 7px; border-radius: 999px; margin-left: 6px; }
.dk-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface); margin-bottom: 6px; }
.dk-row.is-done { opacity: 0.55; }
.dk-row.is-done .dk-q { text-decoration: line-through; }
.dk-chk { accent-color: var(--accent-primary); flex-shrink: 0; cursor: pointer; }
.dk-q { flex: 1; min-width: 0; font-family: var(--font-data); font-size: 12.5px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dk-icon { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); border-radius: var(--radius-sm); padding: 5px 9px; cursor: pointer; flex-shrink: 0; }
.dk-open { flex-shrink: 0; font-size: 12px; font-weight: 600; color: var(--accent-primary-bright); text-decoration: none; padding: 5px 10px; border: 1px solid var(--border-active); border-radius: var(--radius-sm); background: var(--accent-primary-dim); }
.dk-empty { color: var(--text2); font-style: italic; margin-top: 12px; }
.dk-add { margin-bottom: var(--sp-4); }
.dk-add-title { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--accent-primary-bright); margin-bottom: 10px; }
.dk-add-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.dk-add-cat { flex: 0 0 220px; }
.dk-add-q { flex: 1; min-width: 220px; font-family: var(--font-data); font-size: 12.5px; }
.dk-add-hint { font-size: 11px; color: var(--text2); }
.dk-add-hint code { background: var(--surface); border: 1px solid var(--border); padding: 0 5px; border-radius: 4px; }
.dk-tag { flex-shrink: 0; font-size: 9.5px; text-transform: uppercase; color: var(--accent-primary-bright); background: var(--accent-primary-dim); border-radius: 999px; padding: 1px 7px; }
.dk-del { color: var(--status-5xx); }
@media (max-width: 720px) { .dk-inputs { grid-template-columns: 1fr; } }
`;

export default DorksTab;
