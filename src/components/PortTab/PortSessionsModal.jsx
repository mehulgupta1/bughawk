import { useState } from 'react';

// In-app named snapshot manager: save the current port data under a name, then
// reload / rename / delete any saved snapshot later. Stored in IndexedDB.
export default function PortSessionsModal({ ports, onClose, onToast }) {
  const { sessions, records, saveSnapshot, reloadSnapshot, deleteSnapshot, renameSnapshot } = ports;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const snap = await saveSnapshot(name);
    setBusy(false);
    setName('');
    onToast?.(`Saved “${snap.name}”`);
  };

  const reload = async (s) => {
    if (!confirm(`Reload “${s.name}”? This overwrites the current port data (${records.length} ports).`)) return;
    await reloadSnapshot(s.id);
    onToast?.(`Loaded “${s.name}”`);
    onClose();
  };

  const rename = async (s) => {
    const next = prompt('Rename session', s.name);
    if (next != null) await renameSnapshot(s.id, next);
  };

  const remove = async (s) => {
    if (confirm(`Delete saved session “${s.name}”? This cannot be undone.`)) {
      await deleteSnapshot(s.id);
      onToast?.('Session deleted');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sessions-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Saved Sessions</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="session-save-row">
          <input
            className="session-name-input"
            placeholder={`Name this snapshot of ${records.length} ports…`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            spellCheck={false}
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || records.length === 0}>
            ＋ Save current
          </button>
        </div>

        <div className="session-list">
          {sessions.length === 0 ? (
            <div className="detail-empty" style={{ padding: '16px 0' }}>
              No saved sessions yet. Save the current data above, then reload it anytime.
            </div>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="session-item">
                <div className="session-meta">
                  <div className="session-name">{s.name}</div>
                  <div className="session-sub mono">
                    {s.count} ports · {new Date(s.savedAt).toLocaleString()}
                  </div>
                </div>
                <div className="session-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => reload(s)}>Reload</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => rename(s)}>Rename</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-5xx)' }} onClick={() => remove(s)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
