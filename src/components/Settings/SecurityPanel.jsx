import { useEffect, useState } from 'react';
import { getAuth, setCredentials, verify, lock } from '../../lib/auth.js';

// Change the login username/password (requires the current password) + log out.
export default function SecurityPanel() {
  const [username, setUsername] = useState('');
  const [cur, setCur] = useState('');
  const [newU, setNewU] = useState('');
  const [newP, setNewP] = useState('');
  const [newP2, setNewP2] = useState('');
  const [msg, setMsg] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => { const a = await getAuth(); if (!cancelled && a) { setUsername(a.username || ''); setNewU(a.username || ''); } })();
    return () => { cancelled = true; };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!(await verify(username, cur))) { setMsg({ ok: false, text: 'Current password is incorrect.' }); return; }
    if (!newU.trim()) { setMsg({ ok: false, text: 'Username cannot be empty.' }); return; }
    if (newP && newP.length < 4) { setMsg({ ok: false, text: 'New password must be at least 4 characters.' }); return; }
    if (newP !== newP2) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    setBusy(true);
    // keep current password if the new-password fields are left blank
    await setCredentials(newU, newP || cur);
    setBusy(false);
    setUsername(newU.trim());
    setCur(''); setNewP(''); setNewP2('');
    setMsg({ ok: true, text: 'Credentials updated.' });
  };

  const logout = () => { lock(); window.location.reload(); };

  return (
    <form onSubmit={save}>
      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
        <div className="setting-info">
          <div className="setting-name">Login credentials</div>
          <div className="setting-desc">Current user: <span className="mono">{username || '—'}</span>. Change the username/password (current password required).</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
      </div>

      <div className="sec-grid">
        <label className="sec-l">Current password
          <input className="sec-in" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="sec-l">New username
          <input className="sec-in" value={newU} onChange={(e) => setNewU(e.target.value)} spellCheck="false" />
        </label>
        <label className="sec-l">New password <em>(blank = keep)</em>
          <input className="sec-in" type="password" value={newP} onChange={(e) => setNewP(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="sec-l">Confirm new password
          <input className="sec-in" type="password" value={newP2} onChange={(e) => setNewP2(e.target.value)} autoComplete="new-password" />
        </label>
      </div>

      {msg && <div className={`sec-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !cur}>{busy ? '…' : 'Update credentials'}</button>

      <style>{`
        .sec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; max-width: 560px; }
        .sec-l { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--text2); }
        .sec-l em { color: var(--text3); font-style: normal; }
        .sec-in { padding: 8px 11px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-size: 13px; outline: none; }
        .sec-in:focus { border-color: var(--border-active); }
        .sec-msg { font-size: 12.5px; margin-bottom: 10px; }
        .sec-msg.ok { color: #22c55e; }
        .sec-msg.err { color: var(--status-5xx, #ef4444); }
        @media (max-width: 640px) { .sec-grid { grid-template-columns: 1fr; } }
      `}</style>
    </form>
  );
}
