import { memo, useMemo, useRef, useState } from 'react';
import { parseRequest, parseResponse, analyzeRequest, analyzeResponse } from '../../lib/httpanalyzer.js';
import { TECHNIQUES, TECHNIQUE_CATEGORIES, TECHNIQUE_COUNT } from '../../lib/techniques.js';
import { getSevColor } from '../UrlParser/engine.js';

const HttpAnalyzerTab = memo(function HttpAnalyzerTab() {
  const [reqText, setReqText] = useState('');
  const [resText, setResText] = useState('');
  const [findings, setFindings] = useState(null);
  const [libCat, setLibCat] = useState('all');
  const [libSearch, setLibSearch] = useState('');
  const libRef = useRef(null);
  const showTechniques = (cat) => {
    setLibCat(cat);
    setLibSearch('');
    requestAnimationFrame(() => libRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const analyze = () => {
    const f = [];
    if (reqText.trim()) analyzeRequest(parseRequest(reqText)).forEach((x) => f.push({ ...x, src: 'request' }));
    if (resText.trim()) analyzeResponse(parseResponse(resText)).forEach((x) => f.push({ ...x, src: 'response' }));
    setFindings(f);
  };

  const relevantCats = useMemo(() => new Set((findings || []).map((x) => x.cat)), [findings]);
  const library = useMemo(() => {
    const s = libSearch.toLowerCase();
    return TECHNIQUES.filter((t) => (libCat === 'all' || t.cat === libCat) && (!s || t.t.toLowerCase().includes(s)));
  }, [libCat, libSearch]);

  return (
    <div className="ha-wrap">
      <style>{styles}</style>
      <header className="ha-head">
        <div>
          <h1>🧪 HTTP Analyzer</h1>
          <p>Paste a raw request &amp; response → findings + {TECHNIQUE_COUNT} techniques</p>
        </div>
        <button className="ha-btn-primary" onClick={analyze}>Analyze</button>
      </header>

      <div className="ha-io">
        <div className="ha-col">
          <div className="ha-label">Raw Request</div>
          <textarea className="ha-area" value={reqText} onChange={(e) => setReqText(e.target.value)} spellCheck="false" wrap="off"
            placeholder={'POST /login?next=/ HTTP/1.1\nHost: target.com\nCookie: session=...\nContent-Type: application/x-www-form-urlencoded\n\nuser=a&pass=b'} />
        </div>
        <div className="ha-col">
          <div className="ha-label">Raw Response</div>
          <textarea className="ha-area" value={resText} onChange={(e) => setResText(e.target.value)} spellCheck="false" wrap="off"
            placeholder={'HTTP/1.1 200 OK\nContent-Type: text/html\nSet-Cookie: session=...; Path=/\nAccess-Control-Allow-Origin: *\n\n<html>...'} />
        </div>
      </div>

      {findings && (
        <section className="ha-panel">
          <div className="ha-panel-head">
            <strong>Findings</strong>
            <span className="ha-count">{findings.length} issue(s)</span>
          </div>
          {findings.length === 0 && <div className="ha-empty">No issues from the built-in checks. Browse techniques below for manual tests.</div>}
          {findings.map((x, i) => (
            <div key={i} className="ha-find">
              <span className="ha-sev" style={{ background: `${getSevColor(x.sev)}22`, color: getSevColor(x.sev), borderColor: `${getSevColor(x.sev)}55` }}>{x.sev}</span>
              <div className="ha-find-body">
                <div className="ha-find-title">{x.title} <span className="ha-src">{x.src}</span></div>
                <div className="ha-find-detail">{x.detail}</div>
                <div className="ha-find-fix">↳ {x.fix} <button className="ha-link" onClick={() => showTechniques(x.cat)}>see {x.cat} techniques →</button></div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="ha-panel" ref={libRef}>
        <div className="ha-panel-head">
          <strong>Technique Library</strong>
          <span className="ha-count">{library.length} / {TECHNIQUE_COUNT}</span>
          <input className="ha-search" placeholder="Search techniques…" value={libSearch} onChange={(e) => setLibSearch(e.target.value)} />
        </div>
        <div className="ha-cats">
          <button className={libCat === 'all' ? 'on' : ''} onClick={() => setLibCat('all')}>all</button>
          {relevantCats.size > 0 && [...relevantCats].map((c) => (
            <button key={`r-${c}`} className={`ha-rel ${libCat === c ? 'on' : ''}`} onClick={() => setLibCat(c)}>★ {c}</button>
          ))}
          {TECHNIQUE_CATEGORIES.map((c) => (
            <button key={c} className={libCat === c ? 'on' : ''} onClick={() => setLibCat(c)}>{c}</button>
          ))}
        </div>
        <div className="ha-tech-list">
          {library.map((t, i) => (
            <div key={i} className="ha-tech">
              <span className="ha-tech-cat">{t.cat}</span>
              <code className="ha-tech-t">{t.t}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});

const styles = `
.ha-wrap { font-family: var(--font-body); color: var(--text-primary); padding: var(--sp-5); max-width: none; }
.ha-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-4); flex-wrap: wrap; }
.ha-head h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
.ha-head p { margin: 2px 0 0; font-size: 13px; color: var(--text2); }
.ha-btn-primary { background: var(--grad); color: #fff; border: none; padding: 10px 22px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; box-shadow: var(--glow-purple); }
.ha-io { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); margin-bottom: var(--sp-4); }
.ha-col { display: flex; flex-direction: column; }
.ha-label { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.ha-area { width: 100%; box-sizing: border-box; min-height: 220px; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 12px; outline: none; resize: vertical; white-space: pre; }
.ha-area:focus { border-color: var(--border-active); }
.ha-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-4); margin-bottom: var(--sp-4); }
.ha-panel-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.ha-count { font-size: 12px; color: var(--text2); }
.ha-search { margin-left: auto; padding: 7px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; width: 240px; max-width: 50%; }
.ha-empty { color: var(--text2); font-style: italic; }
.ha-find { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.ha-sev { flex-shrink: 0; align-self: flex-start; text-transform: uppercase; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px; border: 1px solid; }
.ha-find-title { font-weight: 600; font-size: 13px; }
.ha-src { font-size: 10px; color: var(--text3); text-transform: uppercase; margin-left: 6px; }
.ha-find-detail { font-size: 12px; color: var(--text2); font-family: var(--font-data); word-break: break-all; margin: 2px 0; }
.ha-find-fix { font-size: 12px; color: var(--text2); }
.ha-link { background: none; border: none; color: var(--accent-primary-bright); cursor: pointer; font-size: 12px; padding: 0; }
.ha-cats { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.ha-cats button { border: 1px solid var(--border); background: var(--surface); color: var(--text2); padding: 4px 10px; border-radius: 999px; font-size: 11px; cursor: pointer; }
.ha-cats button.on { background: var(--accent-primary-dim); color: var(--accent-primary-bright); border-color: var(--border-active); }
.ha-cats .ha-rel { color: #f59e0b; border-color: rgba(245,158,11,0.4); }
.ha-tech-list { max-height: 520px; overflow: auto; }
.ha-tech { display: flex; gap: 10px; padding: 6px 0; border-top: 1px solid var(--border); }
.ha-tech-cat { flex-shrink: 0; width: 90px; font-size: 10px; color: var(--accent-primary-bright); text-transform: uppercase; font-weight: 700; }
.ha-tech-t { flex: 1; font-family: var(--font-data); font-size: 12px; color: var(--text-primary); white-space: pre-wrap; word-break: break-word; }
@media (max-width: 820px) { .ha-io { grid-template-columns: 1fr; } }
`;

export default HttpAnalyzerTab;
