import { useEffect, useMemo, useRef, useState } from 'react';
import { countLines, parseLine } from '../../lib/parser.js';
import { statusLabel } from '../../lib/status.js';
import { debounce } from '../../utils/debounce.js';

// Preview parses only the first N lines cheaply; full parse happens on confirm,
// chunked for very large pastes so the UI stays responsive.
const PREVIEW_ROWS = 5;
const CHUNK = 10000;

export default function ImportModal({ onImport, onClose }) {
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, phase }
  const [result, setResult] = useState(null);
  const taRef = useRef(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // Debounce the line counter so giant pastes don't recount per keystroke.
  const recount = useMemo(
    () => debounce((v) => setCount(countLines(v)), 150),
    []
  );
  const onChange = (e) => {
    setText(e.target.value);
    setResult(null);
    recount(e.target.value);
  };

  // Cheap preview: first few parsed rows.
  const preview = useMemo(() => {
    const rows = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && rows.length < PREVIEW_ROWS; i++) {
      const r = parseLine(lines[i]);
      if (r) rows.push(r);
    }
    return rows;
  }, [text]);

  // Chunked full parse so 100k lines don't freeze the main thread, with a
  // visible progress indicator. The final merge + batched IndexedDB write is
  // awaited via the (async) onImport.
  const runImport = () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    const lines = text.split(/\r?\n/);
    const records = [];
    let idx = 0;
    setProgress({ done: 0, total: lines.length, phase: 'parse' });

    const step = () => {
      const end = Math.min(idx + CHUNK, lines.length);
      for (; idx < end; idx++) {
        const r = parseLine(lines[idx]);
        if (r) records.push(r);
      }
      if (idx < lines.length) {
        setProgress({ done: idx, total: lines.length, phase: 'parse' });
        setTimeout(step, 0);
      } else {
        setProgress({ done: lines.length, total: lines.length, phase: 'save' });
        // Yield once so the "Saving…" frame paints before the heavy write.
        setTimeout(async () => {
          const summary = await onImport(records);
          setResult(summary);
          setProgress(null);
          setBusy(false);
        }, 0);
      }
    };
    setTimeout(step, 0);
  };

  return (
    <div className="modal-overlay" onMouseDown={() => !busy && onClose()}>
      <div className="modal modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Import scan results</h3>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div>
            <label className="field-label" htmlFor="import-ta">
              Paste httpx / CSV / JSONL / plain-domain output
            </label>
            <textarea
              id="import-ta"
              ref={taRef}
              className="textarea"
              value={text}
              onChange={onChange}
              placeholder={'https://api.example.com [200] [Login] [nginx]\nshop.example.com,404\n{"url":"https://x.example.com","status_code":500}'}
              spellCheck={false}
            />
          </div>

          <div className="import-meta">
            <span>
              detected <strong>{count.toLocaleString()}</strong> rows
            </span>
            {preview.length > 0 && <span>preview of first {preview.length}</span>}
          </div>

          {preview.length > 0 && (
            <table className="preview-table">
              <thead>
                <tr>
                  <th>host</th>
                  <th>status</th>
                  <th>title</th>
                  <th>tech</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td>{r.host}</td>
                    <td>{statusLabel(r.status)}</td>
                    <td>{r.title || '—'}</td>
                    <td>{r.tech?.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

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
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            className="btn btn-primary"
            onClick={runImport}
            disabled={busy || !text.trim() || !!result}
          >
            {busy ? 'Working…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
