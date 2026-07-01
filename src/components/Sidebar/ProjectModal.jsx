import { useEffect, useRef, useState } from 'react';

// One modal handling all three project dialogs based on `mode`:
//   'create' | 'rename' | 'delete'
export default function ProjectModal({ mode, project, onConfirm, onClose }) {
  const [name, setName] = useState(project?.name || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (mode !== 'delete') inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title =
    mode === 'create'
      ? 'New project'
      : mode === 'rename'
        ? 'Rename project'
        : 'Delete project';

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'delete') {
      onConfirm(project.id);
    } else {
      if (!name.trim()) return;
      onConfirm(name.trim());
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="modal-header">
            <h3>{title}</h3>
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="modal-body">
            {mode === 'delete' ? (
              <div className="modal-warn">
                Delete <strong>{project.name}</strong> and all{' '}
                <strong>{project.subdomainCount.toLocaleString()}</strong> of its hosts?
                This cannot be undone.
              </div>
            ) : (
              <div>
                <label className="field-label" htmlFor="proj-name">
                  Program / target name
                </label>
                <input
                  id="proj-name"
                  ref={inputRef}
                  className="input input-mono"
                  value={name}
                  placeholder="e.g. hackerone.com"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={mode === 'delete' ? 'btn btn-danger' : 'btn btn-primary'}
            >
              {mode === 'create' ? 'Create' : mode === 'rename' ? 'Save' : 'Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
