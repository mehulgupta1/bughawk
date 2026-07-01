import { useEffect, useRef, useState } from 'react';
import { parseLine, normalizeHost } from '../../lib/parser.js';

const STATUS_OPTIONS = [
  { code: 200, label: '200 — OK' },
  { code: 301, label: '301 — Moved Permanently' },
  { code: 302, label: '302 — Found' },
  { code: 403, label: '403 — Forbidden' },
  { code: 404, label: '404 — Not Found' },
  { code: 500, label: '500 — Server Error' },
  { code: 'unknown', label: 'Unknown / no status' },
];

// "Bulk Import Subdomains" dialog — paste one host per line, with a default
// status code applied to any line that doesn't carry its own.
export default function BulkImportModal({ onImport, onClose }) {
  const [text, setText] = useState('');
  const [defaultCode, setDefaultCode] = useState(200);
  const [busy, setBusy] = useState(false);
  const taRef = useRef(null);

  useEffect(() => {
    taRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const fallback = defaultCode === 'unknown' ? 'unknown' : Number(defaultCode);
    const recs = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let rec = parseLine(line);
      if (!rec) {
        const host = normalizeHost(line);
        if (!host) continue;
        rec = { host, status: fallback, title: '', tech: [], length: null };
      } else if (rec.status === 'unknown') {
        rec.status = fallback;
      }
      recs.push(rec);
    }
    await onImport(recs);
    setBusy(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={() => !busy && onClose()}>
      <div className="modal bulk-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span className="modal-title-ic">⤴</span>
          Bulk Import Subdomains
        </div>

        <div className="form-group">
          <label className="form-label">Default status code</label>
          <select value={defaultCode} onChange={(e) => setDefaultCode(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Subdomains (one per line)</label>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'api.example.com\ndev.example.com\nstaging.example.com'}
            spellCheck={false}
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
