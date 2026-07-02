import { useEffect, useMemo, useRef, useState } from 'react';
import { countLines, parseLine } from '../../lib/parser.js';
import { debounce } from '../../utils/debounce.js';
import { logPerf } from '../../lib/telemetry.js';

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
  // Holds a large paste OUT of the textarea. A multi-MB dump in a <textarea>
  // freezes the browser for seconds just laying out the text; we intercept it
  // and import straight from here instead.
  const pastedRef = useRef('');
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
    pastedRef.current = ''; // typing/small paste supersedes any held big paste
    setResult(null);
    recount(e.target.value);
  };

  // Intercept a large paste so the browser never has to render MBs of text in
  // the textarea (that layout is the multi-second freeze). Keep it in a ref and
  // show the row count; the textarea stays empty and snappy.
  const LARGE_PASTE = 200_000; // ~200KB / a few thousand lines
  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    if (text.length <= LARGE_PASTE) return; // small paste: normal textarea behaviour
    e.preventDefault();
    pastedRef.current = text;
    if (taRef.current) taRef.current.value = '';
    setResult(null);
    setCount(countLines(text));
    setHasText(true);
  };

  const runImport = () => {
    const text = pastedRef.current || (taRef.current ? taRef.current.value : '');
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    const lines = text.split(/\r?\n/);
    const recs = [];
    let idx = 0;
    // Split the timing: `ms` = actual parse CPU (summed across chunks), `wallMs`
    // = elapsed incl. the yields between chunks. Import (merge+write) is timed
    // separately as "Import subdomains".
    const wallStart = performance.now();
    let parseCpu = 0;
    setProgress({ done: 0, total: lines.length, phase: 'parse' });

    const step = () => {
      const cs = performance.now();
      const end = Math.min(idx + CHUNK, lines.length);
      for (; idx < end; idx++) {
        const r = parseLine(lines[idx]);
        if (r) recs.push(r);
      }
      parseCpu += performance.now() - cs;
      if (idx < lines.length) {
        setProgress({ done: idx, total: lines.length, phase: 'parse' });
        setTimeout(step, 0);
      } else {
        logPerf('action', {
          label: `Parse subdomains (${lines.length.toLocaleString()} lines)`,
          ms: Math.round(parseCpu),
          wallMs: Math.round(performance.now() - wallStart),
          lines: lines.length,
          parsed: recs.length,
        });
        setProgress({ done: lines.length, total: lines.length, phase: 'save' });
        setTimeout(async () => {
          const summary = await onImport(recs);
          setResult(summary);
          setProgress(null);
          setBusy(false);
          pastedRef.current = '';
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
        onPaste={onPaste}
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
