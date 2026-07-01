import { useEffect, useMemo, useRef, useState } from 'react';
import { countLines, parseText } from '../../lib/portparser.js';
import { debounce } from '../../utils/debounce.js';

// Paste/import panel for port-scan output. Uncontrolled textarea (same reasoning
// as the subdomain ImportPanel) — big dumps must not re-render the table.
export default function PortImportPanel({ onImport }) {
  const taRef = useRef(null);
  const [count, setCount] = useState(0);
  const [hasText, setHasText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const recount = useMemo(
    () => debounce((v) => { setCount(countLines(v)); setHasText(v.trim().length > 0); }, 200),
    []
  );
  useEffect(() => () => recount.cancel(), [recount]);

  const runImport = async () => {
    const text = taRef.current ? taRef.current.value : '';
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    // Parsing is whole-blob (stateful for nmap), so do it directly.
    const { records, stats } = parseText(text);
    const summary = await onImport(records);
    setResult({ ...summary, format: stats.format });
    setBusy(false);
    if (taRef.current) taRef.current.value = '';
    setCount(0);
    setHasText(false);
  };

  return (
    <section className="import-panel">
      <textarea
        ref={taRef}
        className="import-panel-textarea mono"
        onInput={(e) => { setResult(null); recount(e.target.value); }}
        placeholder="Paste Nmap (-oN / -oG / -oX), Masscan, Naabu, or Rustscan output — format auto-detected…"
        spellCheck={false}
        disabled={busy}
      />

      {result && (
        <div className="import-result">
          Detected <strong>{result.format}</strong> · Imported:{' '}
          <strong>{result.added.toLocaleString()}</strong> added,{' '}
          <strong>{result.updated.toLocaleString()}</strong> updated,{' '}
          <strong>{result.skipped.toLocaleString()}</strong> skipped.
        </div>
      )}

      <div className="import-panel-bar">
        <span className="import-hint mono">
          Tip: <code>nmap -sCV -oX -</code> gives the richest data (versions, CPEs, scripts → CVEs).
        </span>
        <div className="import-panel-spacer" />
        <button className="btn btn-primary btn-grad" onClick={runImport} disabled={busy || !hasText}>
          {busy ? 'Parsing…' : '✦ Parse & Import'}
        </button>
      </div>

      {count > 0 && !busy && (
        <div className="import-panel-count mono">detected {count.toLocaleString()} lines</div>
      )}
    </section>
  );
}
