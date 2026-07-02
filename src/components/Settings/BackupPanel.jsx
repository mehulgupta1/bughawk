import { useRef, useState } from 'react';
import { exportAll, importAll } from '../../lib/storage.js';
import { timed } from '../../lib/telemetry.js';

// Whole-workspace backup: one .json holding every project, wordlist, dork,
// API key and setting. Lets you move everything between browsers/ports/machines
// (IndexedDB is per-origin) and is real disaster recovery.
export default function BackupPanel({ onCopyToast }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const dump = await timed('Backup export', () => exportAll({ includeAuth: includeSecrets }));
      const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bughawk-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      onCopyToast?.(`Exported ${Object.keys(dump.data).length} keys`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let dump;
      try {
        dump = JSON.parse(ev.target.result);
      } catch {
        onCopyToast?.('Invalid JSON file');
        return;
      }
      const keyCount = dump?.data ? Object.keys(dump.data).length : 0;
      if (!confirm(`Restore ${keyCount} keys from this backup?\n\nThis REPLACES your current workspace (projects, wordlists, dorks, API keys). The app will reload afterward.`)) return;
      setBusy(true);
      try {
        await timed('Backup restore', () => importAll(dump, { mode: 'replace', includeAuth: includeSecrets }));
        onCopyToast?.('Workspace restored — reloading…');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        onCopyToast?.(err.message || 'Restore failed');
        setBusy(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">Backup entire workspace</div>
          <div className="setting-desc">Download all projects, wordlists, dorks &amp; API keys as a single .json. Restore it on any browser or port.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={doExport}>⤓ Export all</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>⤒ Restore</button>
          <input type="file" ref={fileRef} accept=".json" style={{ display: 'none' }} onChange={doImport} />
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">Include login credentials</div>
          <div className="setting-desc">Off by default so a backup file isn’t a credential leak. Turn on to carry your username/password hash too.</div>
        </div>
        <label className="check"><input type="checkbox" checked={includeSecrets} onChange={(e) => setIncludeSecrets(e.target.checked)} /><span>{includeSecrets ? 'included' : 'excluded'}</span></label>
      </div>
    </>
  );
}
