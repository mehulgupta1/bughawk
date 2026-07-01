import ProjectSwitcher from './ProjectSwitcher.jsx';

// Tab registry — structured so more tabs can be added later.
const TABS = [
  { id: 'dashboard', icon: '◆', label: 'Dashboard' },
  { id: 'subdomains', icon: '◇', label: 'Subdomains' },
];

export default function Sidebar({
  projects,
  activeId,
  activeProject,
  activeTab,
  onTabChange,
  onSwitch,
  onNew,
  onRename,
  onDelete,
  theme,
  onToggleTheme,
}) {
  const hostCount = activeProject?.subdomainCount || 0;

  return (
    <aside className="rail">
      <div className="brand">
        <span className="brand-mark">P</span>
        <span className="brand-name">Perimeter</span>
      </div>

      <ProjectSwitcher
        projects={projects}
        activeId={activeId}
        activeProject={activeProject}
        onSwitch={onSwitch}
        onNew={onNew}
        onRename={onRename}
        onDelete={onDelete}
      />

      <div className="rail-divider" />

      <nav className="rail-nav">
        <div className="rail-section-label">Navigate</div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-item${activeTab === t.id ? ' active' : ''}`}
            title={t.label}
            onClick={() => onTabChange(t.id)}
          >
            <span className="nav-item-icon">{t.icon}</span>
            <span className="nav-item-label">{t.label}</span>
            {t.id === 'subdomains' && (
              <span className="nav-badge">{hostCount.toLocaleString()}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="rail-spacer" />

      <div className="rail-footer">
        <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
          <span className="theme-icon">
            <span className="sun">☀</span>
            <span className="moon">☾</span>
          </span>
          <span className="theme-label">
            {theme === 'light' ? 'Light' : 'Dark'} mode
          </span>
        </button>
      </div>
    </aside>
  );
}
