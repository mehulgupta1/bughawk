import { useEffect, useMemo, useRef, useState } from 'react';

// Ctrl-K command palette: jump tabs, switch projects, run actions.
export default function CommandPalette({ commands, onClose }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(s) ||
        (c.hint && c.hint.toLowerCase().includes(s)) ||
        (c.group && c.group.toLowerCase().includes(s))
    );
  }, [q, commands]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  const run = (cmd) => {
    if (!cmd) return;
    cmd.run();
    onClose();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="cmd-overlay" onMouseDown={onClose}>
      <div className="cmd-box" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder="Type a command or search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="cmd-results">
          {results.length === 0 ? (
            <div className="cmd-empty">No matching commands</div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                className={`cmd-item${i === active ? ' selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
              >
                <span className="cmd-item-icon">{c.icon}</span>
                <span className="cmd-item-label">{c.label}</span>
                {c.hint && <span className="cmd-item-hint">{c.hint}</span>}
              </button>
            ))
          )}
        </div>
        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
