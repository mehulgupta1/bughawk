import { memo, useCallback, useState } from 'react';
import { TAGS, TAG_MAP } from '../../lib/tags.js';

// Shows assigned colored tags + a "+" that opens a small picker popover.
// Simplified to reduce hook overhead — no useEffect/useRef for outside-click;
// uses onMouseLeave instead (cheaper, no global listener per row).
function TagCell({ tags, onToggle }) {
  const [open, setOpen] = useState(false);
  const current = tags || [];

  const handleToggle = useCallback((k) => {
    onToggle(k);
  }, [onToggle]);

  return (
    <div className="tags-wrap" onMouseLeave={() => open && setOpen(false)}>
      {current.map((k) => (
        <span
          key={k}
          className={`tag tag-${k}`}
          onClick={() => handleToggle(k)}
          title="Remove tag"
        >
          {TAG_MAP[k]?.label || k}
        </span>
      ))}
      <button className="tag-add" onClick={() => setOpen((o) => !o)} title="Add tag">
        +
      </button>
      {open && (
        <div className="tag-picker">
          {TAGS.map((t) => (
            <button
              key={t.key}
              className={`tag-picker-item${current.includes(t.key) ? ' selected' : ''}`}
              onClick={() => handleToggle(t.key)}
            >
              <span className={`tag-dot tag-${t.key}`} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(TagCell);
