import { useEffect, useMemo, useRef, useState } from 'react';
import { API_TOOLS, TOOL_BY_ID, toSubfinderYaml, toEnv, filledCount } from '../../lib/apikeys.js';
import { get, set, KEYS } from '../../lib/storage.js';

export default function ApiKeysPanel() {
  const [vault, setVault] = useState({});
  const [activeId, setActiveId] = useState('subfinder');
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await get(KEYS.apiKeys, {});
      if (cancelled) return;
      setVault(v && typeof v === 'object' ? v : {});
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // debounced persist after first load
  useEffect(() => {
    if (!loaded) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set(KEYS.apiKeys, vault), 300);
    return () => timer.current && clearTimeout(timer.current);
  }, [vault, loaded]);

  const tool = TOOL_BY_ID[activeId];
  const values = vault[activeId] || {};
  const setField = (k, val) => setVault((p) => ({ ...p, [activeId]: { ...(p[activeId] || {}), [k]: val } }));

  const exportText = useMemo(
    () => (tool.exportKind === 'yaml' ? toSubfinderYaml(values) : toEnv(activeId, values)),
    [tool, values, activeId],
  );

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); };
  const download = () => {
    const name = tool.exportKind === 'yaml' ? (tool.exportName || 'config.yaml') : `${activeId}.env`;
    const blob = new Blob([exportText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const clearTool = () => { if (confirm(`Clear all ${tool.name} keys?`)) setVault((p) => ({ ...p, [activeId]: {} })); };

  return (
    <div className="ak-wrap">
      <style>{styles}</style>
      <div className="ak-head">
        <div>
          <h3 className="settings-h" style={{ margin: 0 }}>🔑 API Keys</h3>
          <p className="ak-sub">Stored locally in IndexedDB — never sent anywhere. Fill what you have; generate ready configs.</p>
        </div>
        <label className="ak-show"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> show keys</label>
      </div>

      <div className="ak-tabs">
        {API_TOOLS.map((t) => {
          const n = filledCount(t, vault[t.id] || {});
          return (
            <button key={t.id} className={`ak-tab ${activeId === t.id ? 'on' : ''}`} onClick={() => setActiveId(t.id)}>
              {t.icon} {t.name}{n > 0 && <span className="ak-badge">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="ak-panel">
        <div className="ak-tool-head">
          <div className="ak-tool-desc">{tool.desc} <a href={tool.doc} target="_blank" rel="noreferrer" className="ak-doc">docs ↗</a></div>
          <button className="ak-btn ak-danger" onClick={clearTool}>Clear</button>
        </div>

        <div className="ak-fields">
          {tool.fields.map((f) => (
            <label key={f.key} className="ak-field">
              <span className="ak-flabel">{f.label}{f.multi && <em> (comma-separated)</em>}</span>
              <input
                className="ak-in"
                type={show ? 'text' : 'password'}
                autoComplete="off"
                spellCheck="false"
                placeholder={f.ph}
                value={values[f.key] || ''}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="ak-export">
          <div className="ak-export-head">
            <strong>{tool.exportKind === 'yaml' ? tool.exportName : 'environment variables'}</strong>
            <div className="ak-export-actions">
              <button className="ak-btn" onClick={() => copy(exportText, 'exp')}>{copied === 'exp' ? '✓ copied' : 'Copy'}</button>
              <button className="ak-btn" onClick={download}>Download</button>
            </div>
          </div>
          <pre className="ak-pre">{exportText.trim() || '— fill in keys above —'}</pre>
        </div>
      </div>
    </div>
  );
}

const styles = `
.ak-wrap { margin-top: var(--sp-3); }
.ak-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ak-sub { margin: 2px 0 0; font-size: 12px; color: var(--text2); }
.ak-show { font-size: 12px; color: var(--text2); display: flex; align-items: center; gap: 6px; cursor: pointer; }
.ak-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0 12px; }
.ak-tab { background: var(--surface); color: var(--text2); border: 1px solid var(--border); border-radius: 20px; padding: 6px 14px; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.ak-tab.on { background: var(--accent-primary-dim); color: var(--accent-primary-bright); border-color: var(--border-active); }
.ak-badge { font-size: 10px; background: var(--accent-primary); color: #fff; border-radius: 999px; padding: 0 6px; min-width: 16px; text-align: center; }
.ak-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-4); }
.ak-tool-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.ak-tool-desc { font-size: 13px; color: var(--text2); }
.ak-doc { color: var(--accent-primary-bright); text-decoration: none; margin-left: 4px; }
.ak-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.ak-field { display: flex; flex-direction: column; gap: 4px; }
.ak-flabel { font-size: 12px; color: var(--text2); }
.ak-flabel em { color: var(--text3); font-style: normal; font-size: 11px; }
.ak-in { padding: 8px 11px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-base); color: var(--text-primary); font-family: var(--font-data); font-size: 12.5px; outline: none; }
.ak-in:focus { border-color: var(--border-active); }
.ak-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); padding: 7px 13px; border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; }
.ak-danger { color: var(--status-5xx); }
.ak-export { margin-top: 16px; }
.ak-export-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.ak-export-head strong { font-size: 12px; color: var(--text2); font-family: var(--font-data); }
.ak-export-actions { display: flex; gap: 8px; }
.ak-pre { margin: 0; padding: 12px; background: var(--bg-base); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-data); font-size: 12px; color: var(--text-primary); white-space: pre-wrap; word-break: break-all; max-height: 280px; overflow: auto; }
`;
