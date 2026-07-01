import { useState } from 'react';

const TABS = [
  { id: 'dashboard', icon: '▦', label: 'Dashboard' },
  { id: 'scope', icon: '🎯', label: 'Scope' },
  { id: 'subdomains', icon: '🌐', label: 'Subdomains', badge: true },
  { id: 'ports', icon: '🖧', label: 'Port Scan' },
  { id: 'urlparser', icon: '🔗', label: 'URL Parser' },
  { id: 'jsrecon', icon: '🔎', label: 'JS Recon' },
  { id: 'surface', icon: '🕸', label: 'Attack Surface' },
  { id: 'httpanalyzer', icon: '🧪', label: 'HTTP Analyzer' },
  { id: 'techstack', icon: '🧱', label: 'Tech Stack' },
  { id: 'findings', icon: '📝', label: 'Findings' },
];

export default function Sidebar({ activeTab, onTabChange, hostCount }) {
  const [collapsed, setCollapsed] = useState(false);

  const item = (t) => (
    <button
      key={t.id}
      className={`nav-item${activeTab === t.id ? ' active' : ''}`}
      onClick={() => onTabChange(t.id)}
      title={t.label}
    >
      <span className="nav-icon">{t.icon}</span>
      <span className="nav-label">{t.label}</span>
      {t.badge && <span className="nav-badge">{(hostCount || 0).toLocaleString()}</span>}
    </button>
  );

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button className="sidebar-toggle" onClick={() => setCollapsed((c) => !c)} title="Toggle sidebar">
        ☰
      </button>
      <nav>
        {TABS.map(item)}
        <div className="nav-divider" />
        {item({ id: 'settings', icon: '⚙', label: 'Settings' })}
        {item({ id: 'assets', icon: '🗂', label: 'Assets' })}
        {item({ id: 'wordlists', icon: '📚', label: 'Wordlists' })}
        {item({ id: 'dorks', icon: '🐙', label: 'GitHub Dorks' })}
        {item({ id: 'notebook', icon: '📓', label: 'Notebook' })}
      </nav>
      <div className="sidebar-spacer" />
    </aside>
  );
}
