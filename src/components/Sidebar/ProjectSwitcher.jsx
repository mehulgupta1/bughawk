import { useEffect, useRef, useState } from 'react';

function initials(name) {
  const clean = name.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return clean.slice(0, 2);
}

// Dropdown-style project switcher that sits directly below the brand block.
export default function ProjectSwitcher({
  projects,
  activeId,
  activeProject,
  onSwitch,
  onNew,
  onRename,
  onDelete,
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
    <div className="proj-switcher" ref={ref}>
      <button
        className="proj-trigger"
        onClick={() => (empty ? onNew() : setOpen((o) => !o))}
        title={empty ? 'Create your first project' : activeProject?.name}
        aria-label="Switch project"
      >
        <span className="proj-avatar">
          {empty ? '+' : initials(activeProject?.name || '?')}
        </span>
        <span className="proj-trigger-text">
          <span className="proj-trigger-name">
            {empty ? 'New project' : activeProject?.name}
          </span>
          <span className="proj-trigger-sub">
            {empty
              ? 'click to create'
              : `${(activeProject?.subdomainCount || 0).toLocaleString()} hosts`}
          </span>
        </span>
        {!empty && <span className="proj-caret">▾</span>}
      </button>

      {open && !empty && (
        <div className="proj-dropdown">
          <div className="proj-dropdown-label">Projects</div>
          {projects.map((p) => (
            <div key={p.id} className={`proj-item${p.id === activeId ? ' active' : ''}`}>
              <button
                className="proj-item-name"
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  onSwitch(p.id);
                  setOpen(false);
                }}
              >
                {p.name}
              </button>
              <span className="proj-item-count">
                {(p.subdomainCount || 0).toLocaleString()}
              </span>
              <span className="proj-item-actions">
                <button
                  className="btn btn-icon"
                  title="Rename"
                  onClick={() => {
                    onRename(p);
                    setOpen(false);
                  }}
                >
                  ✎
                </button>
                <button
                  className="btn btn-icon"
                  title="Delete"
                  onClick={() => {
                    onDelete(p);
                    setOpen(false);
                  }}
                >
                  🗑
                </button>
              </span>
            </div>
          ))}
          <button
            className="proj-dropdown-new"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
          >
            + New project
          </button>
        </div>
      )}
    </div>
  );
}
