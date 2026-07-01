import { useEffect, useRef, useState } from 'react';
import { DEFAULT_KEYWORDS } from '../../lib/smartflag.js';

// Edit the per-project smart auto-flag keyword list.
export default function KeywordModal({ keywords, onSave, onClose }) {
  const [list, setList] = useState(keywords && keywords.length ? keywords : DEFAULT_KEYWORDS);
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = () => {
    const v = input.trim().toLowerCase();
    if (v && !list.includes(v)) setList([...list, v]);
    setInput('');
  };
  const remove = (k) => setList(list.filter((x) => x !== k));

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span className="modal-title-ic">✦</span>
          Smart-flag keywords
        </div>
        <p className="modal-desc">
          Hosts whose name contains any of these get an automatic highlight — separate from
          your manual flag/tags.
        </p>

        <div className="kw-list">
          {list.map((k) => (
            <span key={k} className="kw-chip">
              {k}
              <button onClick={() => remove(k)} aria-label={`Remove ${k}`}>✕</button>
            </span>
          ))}
        </div>

        <div className="kw-input-row">
          <input
            ref={inputRef}
            className="kw-input"
            value={input}
            placeholder="add keyword…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); add(); }
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={add}>Add</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setList(DEFAULT_KEYWORDS)}>
            Reset
          </button>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { onSave(list); onClose(); }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
