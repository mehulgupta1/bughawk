import { useEffect, useRef, useState } from 'react';

// Toggle which dynamic data columns are visible. Host + Status are pinned.
export default function ColumnsMenu({ columns, visible, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
        ⊞ Columns ({visible.size})
      </button>
      {open && (
        <div className="menu-list cols-menu">
          <div className="cols-pinned">Host &amp; Status are always shown</div>
          {columns.length === 0 ? (
            <div className="cols-empty">No data columns detected yet.</div>
          ) : (
            columns.map((c) => (
              <label key={c.key} className="cols-item">
                <input
                  type="checkbox"
                  checked={visible.has(c.key)}
                  onChange={() => onToggle(c.key)}
                />
                <span>{c.label}</span>
                <span className="cols-type">{c.type}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
