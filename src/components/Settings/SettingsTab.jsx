// Settings: theme + security + API key vault + data summary. (Data lives in IndexedDB.)
import ApiKeysPanel from './ApiKeysPanel.jsx';
import SecurityPanel from './SecurityPanel.jsx';
import BackupPanel from './BackupPanel.jsx';

export default function SettingsTab({ theme, onToggleTheme, projects, onWipeProject, activeProject, onCopyToast }) {
  return (
    <div className="tab-content">
      <div className="tab-head">
        <h2>Settings</h2>
        <p>Preferences for this workspace</p>
      </div>

      <div className="glass-card">
        <h3 className="settings-h">Appearance</h3>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">Theme</div>
            <div className="setting-desc">Switch between dark and light.</div>
          </div>
          <div className={`toggle${theme === 'dark' ? ' on' : ''}`} onClick={onToggleTheme} role="switch" aria-checked={theme === 'dark'} />
        </div>
      </div>

      <div className="glass-card">
        <h3 className="settings-h">Security</h3>
        <SecurityPanel />
      </div>

      <div className="glass-card">
        <ApiKeysPanel />
      </div>

      <div className="glass-card">
        <h3 className="settings-h">Data</h3>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">Projects</div>
            <div className="setting-desc">{projects.length} project(s) stored locally in IndexedDB.</div>
          </div>
        </div>
        <BackupPanel onCopyToast={onCopyToast} />
        {activeProject && (
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">Clear “{activeProject.name}” hosts</div>
              <div className="setting-desc">Removes all subdomains in the active project. Cannot be undone.</div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={onWipeProject}>Clear</button>
          </div>
        )}
      </div>
    </div>
  );
}
