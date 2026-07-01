import { useEffect, useMemo, useRef, useState } from 'react';
import { countLines, parseLine } from '../../lib/parser.js';
import { debounce } from '../../utils/debounce.js';

const CHUNK = 5000;

// Always-visible paste/import panel. The textarea is UNCONTROLLED on purpose:
// pasting a multi-MB recon dump must not re-render the (potentially 100k-row)
// Subdomains subtree on every keystroke. We read its value from the ref only
// when needed, and derive the live row count via a debounced listener.
export default function ImportPanel({
  onImport,
  onManualAdd,
  autoFilter,
  onAutoFilter,
  groupByTech,
  onGroupByTech,
  groupByIp,
  onGroupByIp,
}) {
  const taRef = useRef(null);
  const [count, setCount] = useState(0);
  const [hasText, setHasText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const recount = useMemo(
    () =>
      debounce((v) => {
        setCount(countLines(v));
        setHasText(v.trim().length > 0);
      }, 200),
    []
  );
  useEffect(() => () => recount.cancel(), [recount]);

  const onInput = (e) => {
    setResult(null);
    recount(e.target.value);
  };

  const runImport = () => {
    const text = taRef.current ? taRef.current.value : '';
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    const lines = text.split(/\r?\n/);
    const recs = [];
    let idx = 0;
    setProgress({ done: 0, total: lines.length, phase: 'parse' });

    const step = () => {
      const end = Math.min(idx + CHUNK, lines.length);
      for (; idx < end; idx++) {
        const r = parseLine(lines[idx]);
        if (r) recs.push(r);
      }
      if (idx < lines.length) {
        setProgress({ done: idx, total: lines.length, phase: 'parse' });
        setTimeout(step, 0);
      } else {
        setProgress({ done: lines.length, total: lines.length, phase: 'save' });
        setTimeout(async () => {
          const summary = await onImport(recs);
          setResult(summary);
          setProgress(null);
          setBusy(false);
          if (taRef.current) taRef.current.value = '';
          setCount(0);
          setHasText(false);
        }, 0);
      }
    };
    setTimeout(step, 0);
  };

  return (
    <section className="import-panel">
      <textarea
        ref={taRef}
        className="import-panel-textarea mono"
        onInput={onInput}
        placeholder="Drop your recon output here — Subfinder, Amass, httpx, raw lists, JSON, anything…"
        spellCheck={false}
        disabled={busy}
      />

      {progress && (
        <div className="import-progress">
          <div className="import-progress-label mono">
            {progress.phase === 'save'
              ? 'Saving to database…'
              : `Parsing… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`}
          </div>
          <div className="import-progress-track">
            <div
              className="import-progress-fill"
              style={{
                width:
                  progress.phase === 'save'
                    ? '100%'
                    : `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {result && (
        <div className="import-result">
          Imported: <strong>{result.added.toLocaleString()}</strong> added,{' '}
          <strong>{result.updated.toLocaleString()}</strong> updated,{' '}
          <strong>{result.skipped.toLocaleString()}</strong> skipped.
        </div>
      )}

      <div className="import-panel-bar">
        <label className="check">
          <input type="checkbox" checked={!!autoFilter} onChange={(e) => onAutoFilter?.(e.target.checked)} />
          <span>Auto-filter out-of-scope</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!groupByTech} onChange={(e) => onGroupByTech?.(e.target.checked)} />
          <span>Group by Tech</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!groupByIp} onChange={(e) => onGroupByIp?.(e.target.checked)} />
          <span>Group by IP</span>
        </label>

        <div className="import-panel-spacer" />

        <button className="btn btn-ghost btn-sm" onClick={onManualAdd}>Manual Add</button>
        <button className="btn btn-primary btn-grad" onClick={runImport} disabled={busy || !hasText}>
          {busy ? 'Working…' : '✦ Parse & Import'}
        </button>
      </div>

      {count > 0 && !busy && (
        <div className="import-panel-count mono">detected {count.toLocaleString()} rows</div>
      )}
    </section>
  );
}
