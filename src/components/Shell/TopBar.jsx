import { useEffect, useRef, useState } from 'react';

// Top bar: project switcher (left), Ctrl-K command hint (center), theme (right).
export default function TopBar({
  projects,
  activeId,
  activeProject,
  onSwitch,
  onNew,
  onRename,
  onDelete,
  onOpenPalette,
  theme,
  onToggleTheme,
}) {
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

  const empty = projects.length === 0;

  return (
    <header className="topbar">
      <div className="proj-switcher" ref={ref}>
        <button
          className={`proj-btn${open ? ' open' : ''}`}
          onClick={() => (empty ? onNew() : setOpen((o) => !o))}
        >
          <span className="proj-mark" />
          <span className="proj-name">{empty ? 'Create project' : activeProject?.name}</span>
          <span className="proj-meta">
            {empty ? '' : `${(activeProject?.subdomainCount || 0).toLocaleString()}`}
          </span>
          <span className="chevron">▾</span>
        </button>

        {open && !empty && (
          <div className="proj-dropdown">
            {projects.map((p) => (
              <button
                key={p.id}
                className={`proj-item${p.id === activeId ? ' active' : ''}`}
                onClick={() => {
                  onSwitch(p.id);
                  setOpen(false);
                }}
              >
                <span className="proj-dot" />
                <span className="proj-item-name">{p.name}</span>
                <span className="proj-item-count">
                  {(p.subdomainCount || 0).toLocaleString()}
                </span>
              </button>
            ))}
            <div className="proj-divider" />
            <button className="proj-action" onClick={() => { onNew(); setOpen(false); }}>
              ＋ Add new project
            </button>
            <button
              className="proj-action"
              onClick={() => { onRename(activeProject); setOpen(false); }}
            >
              ✎ Rename current
            </button>
            <button
              className="proj-action danger"
              onClick={() => { onDelete(activeProject); setOpen(false); }}
            >
              🗑 Delete current
            </button>
          </div>
        )}
      </div>

      <div className="topbar-center">
        <button className="cmd-hint" onClick={onOpenPalette}>
          ⌕ Search commands… <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="topbar-right">
        <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'light' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  );
}
