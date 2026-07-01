import { useEffect, useState } from 'react';
import { isConfigured, isUnlocked, markUnlocked, setCredentials, verify } from '../../lib/auth.js';
import Galaxy from './Galaxy.jsx';
import SplitText from './SplitText.jsx';

// Gates the whole app: first run = create a username/password; afterwards = log in.
export default function LoginGate({ children }) {
  const [phase, setPhase] = useState('loading'); // loading | setup | locked | unlocked
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isUnlocked()) { if (!cancelled) setPhase('unlocked'); return; }
      const configured = await isConfigured();
      if (!cancelled) setPhase(configured ? 'locked' : 'setup');
    })();
    return () => { cancelled = true; };
  }, []);

  const unlock = () => { markUnlocked(); setPhase('unlocked'); setP(''); setP2(''); setErr(''); };

  const onSetup = async (e) => {
    e.preventDefault();
    setErr('');
    if (!u.trim()) return setErr('Choose a username.');
    if (p.length < 4) return setErr('Password must be at least 4 characters.');
    if (p !== p2) return setErr('Passwords do not match.');
    setBusy(true);
    await setCredentials(u, p);
    setBusy(false);
    unlock();
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const ok = await verify(u, p);
    setBusy(false);
    if (ok) unlock(); else setErr('Invalid username or password.');
  };

  if (phase === 'loading') return <div className="lg-screen"><div className="lg-loading">Loading…</div></div>;
  if (phase === 'unlocked') return children;

  const setup = phase === 'setup';
  return (
    <div className="lg-screen">
      <style>{styles}</style>
      <Galaxy speed={1.7} density={1.5} />
      <h1 className="lg-hero"><SplitText text="Welcome, Eagle" delay={120} /></h1>
      <form className="lg-card" onSubmit={setup ? onSetup : onLogin}>
        <div className="lg-logo">🦅</div>
        <h1 className="lg-title">{setup ? 'Create your login' : 'Welcome back'}</h1>
        <p className="lg-sub">{setup ? 'Set a username & password to lock this workspace.' : 'Enter your credentials to continue.'}</p>

        <label className="lg-l">Username
          <input className="lg-in" value={u} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="username" spellCheck="false" />
        </label>
        <label className="lg-l">Password
          <input className="lg-in" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} />
        </label>
        {setup && (
          <label className="lg-l">Confirm password
            <input className="lg-in" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
          </label>
        )}

        {err && <div className="lg-err">{err}</div>}
        <button className="lg-btn" type="submit" disabled={busy}>{busy ? '…' : setup ? 'Create & enter' : 'Log in'}</button>
        <p className="lg-note">Stored locally (password is hashed). Manage it later in Settings → Security.</p>
      </form>
    </div>
  );
}

const styles = `
.lg-screen { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px;
  background: radial-gradient(1200px 600px at 50% -10%, rgba(139,92,246,.18), transparent 60%), var(--bg-base, #0a0a0f);
  z-index: 9999; font-family: var(--font-body, system-ui); color: var(--text-primary, #f1f5f9); }
.lg-hero { position: relative; z-index: 1; margin: 0; font-family: var(--font-display, system-ui); font-weight: 800;
  font-size: clamp(30px, 6vw, 56px); letter-spacing: 0.5px; text-align: center;
  color: #f3f1ff; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.st { display: inline-block; white-space: pre; }
.st-c { display: inline-block; opacity: 0; transform: translateY(40px); animation: lg-split 1s cubic-bezier(.22,1,.36,1) forwards; will-change: transform, opacity; }
@keyframes lg-split {
  0%   { opacity: 0; transform: translateY(40px); }
  30%  { opacity: 1; }
  55%  { transform: translateY(-12px); }
  70%  { transform: translateY(6px); }
  82%  { transform: translateY(-3px); }
  92%  { transform: translateY(1px); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) { .st-c { animation: none; opacity: 1; transform: none; } }
.lg-loading { color: var(--text2, #94a3b8); }
.lg-galaxy { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
.lg-card { position: relative; z-index: 1; width: 360px; max-width: 90vw; background: rgba(12,12,20,0.72); backdrop-filter: blur(10px); border: 1px solid var(--border, rgba(255,255,255,.12));
  border-radius: 16px; padding: 28px 26px; box-shadow: 0 20px 60px rgba(0,0,0,.55); display: flex; flex-direction: column; }
.lg-logo { font-size: 34px; text-align: center; }
.lg-title { margin: 8px 0 2px; font-size: 21px; font-family: var(--font-display, inherit); text-align: center; }
.lg-sub { margin: 0 0 18px; font-size: 13px; color: var(--text2, #94a3b8); text-align: center; }
.lg-l { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--text2, #94a3b8); margin-bottom: 12px; }
.lg-in { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border, rgba(255,255,255,.1)); background: var(--bg-base, #0a0a0f); color: var(--text-primary, #f1f5f9); font-size: 14px; outline: none; }
.lg-in:focus { border-color: var(--border-active, #8b5cf6); }
.lg-err { background: rgba(239,68,68,.12); color: #ef4444; border: 1px solid rgba(239,68,68,.3); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin-bottom: 12px; }
.lg-btn { background: linear-gradient(135deg,#8b5cf6,#06b6d4); color: #fff; border: none; padding: 11px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; }
.lg-btn:disabled { opacity: .6; cursor: default; }
.lg-note { margin: 14px 0 0; font-size: 11px; color: var(--text3, #64748b); text-align: center; }
`;
