import { useCallback, useEffect, useMemo, useState } from 'react';
import TopBar from './components/Shell/TopBar.jsx';
import Sidebar from './components/Shell/Sidebar.jsx';
import CommandPalette from './components/Shell/CommandPalette.jsx';
import ErrorBoundary from './components/Shell/ErrorBoundary.jsx';
import ProjectModal from './components/Sidebar/ProjectModal.jsx';
import Dashboard from './components/Dashboard/Dashboard.jsx';
import SubdomainTab from './components/SubdomainTab/SubdomainTab.jsx';
import ReconUrlParser from './components/UrlParser/ReconUrlParser.jsx';
import JsReconTab from './components/JsRecon/JsReconTab.jsx';
import PortTab from './components/PortTab/PortTab.jsx';
import ScopeTab from './components/ScopeTab/ScopeTab.jsx';
import AssetsTab from './components/AssetsTab/AssetsTab.jsx';
import SurfaceTab from './components/Surface/SurfaceTab.jsx';
import WordlistsTab from './components/Wordlists/WordlistsTab.jsx';
import DorksTab from './components/Dorks/DorksTab.jsx';
import HttpAnalyzerTab from './components/HttpAnalyzer/HttpAnalyzerTab.jsx';
import FindingsTab from './components/Findings/FindingsTab.jsx';
import TechStackTab from './components/TechStack/TechStackTab.jsx';
import NotebookTab from './components/Notebook/NotebookTab.jsx';
import SettingsTab from './components/Settings/SettingsTab.jsx';
import { useProjects } from './hooks/useProjects.js';
import { useSubdomains } from './hooks/useSubdomains.js';
import { usePorts } from './hooks/usePorts.js';
import { useTheme } from './hooks/useTheme.js';
import { useProjectValue } from './hooks/useProjectValue.js';
import { KEYS } from './lib/storage.js';
import { recordSnapshot } from './lib/events.js';
import { DEFAULT_KEYWORDS } from './lib/smartflag.js';
import { scopeOf } from './lib/scope.js';

export default function App() {
  const { theme, toggleTheme } = useTheme();

  const {
    projects,
    activeId,
    activeProject,
    isLoading: projectsLoading,
    createProject,
    renameProject,
    deleteProject,
    switchProject,
    updateProjectMeta,
  } = useProjects();

  const subs = useSubdomains(activeId, updateProjectMeta);
  const ports = usePorts(activeId, updateProjectMeta);
  const [notes, setNotes] = useProjectValue(activeId, KEYS.notes, '');
  const [keywords, setKeywords] = useProjectValue(activeId, KEYS.keywords, DEFAULT_KEYWORDS);
  const [scopeRules, setScopeRules] = useProjectValue(activeId, KEYS.scope, []);
  const [assets, setAssets] = useProjectValue(activeId, KEYS.assets, { subdomains: [], urls: [], jsfiles: [] });
  // Stable matcher: host -> 'in' | 'out' | 'unknown'. Recreated only when rules change.
  const scopeStatus = useMemo(() => (host) => scopeOf(host, scopeRules), [scopeRules]);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [findingDraft, setFindingDraft] = useState(null); // prefill carried Notebook -> Findings
  const [modal, setModal] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [focusNewIds, setFocusNewIds] = useState(null);

  // Tab switch with a perceived-latency log: time from click to two frames
  // later (i.e. after React commits + the browser paints the new tab).
  const handleTabChange = useCallback((tab) => {
    if (!import.meta.env?.DEV) { setActiveTab(tab); return; }
    const t = performance.now();
    setActiveTab(tab);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      console.log(`[tab:${tab}] visible after ${(performance.now() - t).toFixed(1)}ms`);
    }));
  }, []);

  const viewNew = useCallback((ids) => {
    setFocusNewIds(new Set(ids));
    setActiveTab('subdomains');
  }, []);
  const clearFocusNew = useCallback(() => setFocusNewIds(null), []);
  // Drop the focus filter when switching project.
  useEffect(() => { setFocusNewIds(null); }, [activeId]);

  // Auto-snapshot the attack surface after every subs/ports change (debounced),
  // so the change feed / resurrection / churn fill in without manual snapshots.
  useEffect(() => {
    if (!activeId) return undefined;
    const t = setTimeout(() => { recordSnapshot(activeId, subs.records, ports.records); }, 1000);
    return () => clearTimeout(t);
  }, [activeId, subs.records, ports.records]);

  const showToast = useCallback((msg) => setToast(msg), []);

  // Stable handlers so always-mounted memo'd tabs (JS Recon) don't re-render every tab switch.
  const createFinding = useCallback((d) => { setFindingDraft(d); setActiveTab('findings'); }, []);
  const sendToSubdomains = useCallback(async (hosts) => {
    const partials = (hosts || []).map((h) => ({ host: h, status: 'unknown', tech: [] }));
    const summary = await subs.importRecords(partials);
    showToast(`Sent ${summary.added} new host(s) to Subdomains`);
  }, [subs, showToast]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  // Global Ctrl/Cmd-K to open the command palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const confirmModal = (value) => {
    if (modal.mode === 'create') createProject(value);
    else if (modal.mode === 'rename') renameProject(modal.project.id, value);
    else if (modal.mode === 'delete') deleteProject(value);
    setModal(null);
  };

  const commands = useMemo(() => {
    const tabCmds = [
      { id: 'go-dashboard', icon: '▦', label: 'Go to Dashboard', group: 'navigate', run: () => setActiveTab('dashboard') },
      { id: 'go-scope', icon: '🎯', label: 'Go to Scope', group: 'navigate', run: () => setActiveTab('scope') },
      { id: 'go-subdomains', icon: '🌐', label: 'Go to Subdomains', group: 'navigate', run: () => setActiveTab('subdomains') },
      { id: 'go-ports', icon: '🖧', label: 'Go to Port Scan', group: 'navigate', run: () => setActiveTab('ports') },
      { id: 'go-urlparser', icon: '🔗', label: 'Go to URL Parser', group: 'navigate', run: () => setActiveTab('urlparser') },
      { id: 'go-jsrecon', icon: '🔎', label: 'Go to JS Recon', group: 'navigate', run: () => setActiveTab('jsrecon') },
      { id: 'go-surface', icon: '🕸', label: 'Go to Attack Surface', group: 'navigate', run: () => setActiveTab('surface') },
      { id: 'go-httpanalyzer', icon: '🧪', label: 'Go to HTTP Analyzer', group: 'navigate', run: () => setActiveTab('httpanalyzer') },
      { id: 'go-techstack', icon: '🧱', label: 'Go to Tech Stack', group: 'navigate', run: () => setActiveTab('techstack') },
      { id: 'go-findings', icon: '📝', label: 'Go to Findings', group: 'navigate', run: () => setActiveTab('findings') },
      { id: 'go-notebook', icon: '📓', label: 'Go to Notebook', group: 'navigate', run: () => setActiveTab('notebook') },
      { id: 'go-settings', icon: '⚙', label: 'Go to Settings', group: 'navigate', run: () => setActiveTab('settings') },
      { id: 'go-assets', icon: '🗂', label: 'Go to Assets', group: 'navigate', run: () => setActiveTab('assets') },
      { id: 'go-wordlists', icon: '📚', label: 'Go to Wordlists', group: 'navigate', run: () => setActiveTab('wordlists') },
      { id: 'go-dorks', icon: '🐙', label: 'Go to GitHub Dorks', group: 'navigate', run: () => setActiveTab('dorks') },
    ];
    const actionCmds = [
      { id: 'new-project', icon: '＋', label: 'Create new project', group: 'action', run: () => setModal({ mode: 'create' }) },
      { id: 'toggle-theme', icon: '◐', label: 'Toggle theme', group: 'action', run: toggleTheme },
    ];
    const projCmds = projects.map((p) => ({
      id: `switch-${p.id}`,
      icon: '●',
      label: `Switch to ${p.name}`,
      hint: `${(p.subdomainCount || 0).toLocaleString()} hosts`,
      group: 'project',
      run: () => switchProject(p.id),
    }));
    return [...tabCmds, ...actionCmds, ...projCmds];
  }, [projects, switchProject, toggleTheme]);

  const noProjects = !projectsLoading && projects.length === 0;

  return (
    <div className="app-shell">
      <TopBar
        projects={projects}
        activeId={activeId}
        activeProject={activeProject}
        onSwitch={switchProject}
        onNew={() => setModal({ mode: 'create' })}
        onRename={(p) => setModal({ mode: 'rename', project: p })}
        onDelete={(p) => setModal({ mode: 'delete', project: p })}
        onOpenPalette={() => setPaletteOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="layout">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          hostCount={subs.records.length}
        />

        <main className="main">
          {projectsLoading ? (
            <div className="loading-state">Loading…</div>
          ) : noProjects ? (
            <div className="app-empty">
              <h2>No projects yet</h2>
              <p>
                Create a project per bug-bounty target to keep its recon data isolated. Start with
                the program root, e.g. <span className="mono">hackerone.com</span>.
              </p>
              <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
                Create your first project
              </button>
            </div>
          ) : subs.isLoading ? (
            <div className="loading-state">Loading project data…</div>
          ) : (
            <ErrorBoundary resetKey={activeTab}>
              <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                <Dashboard
                  activeProjectId={activeId}
                  records={subs.records}
                  activity={subs.activity}
                  projectName={activeProject?.name}
                  createdAt={activeProject?.createdAt}
                  theme={theme}
                  notes={notes}
                  onNotesChange={setNotes}
                  onViewNew={viewNew}
                  portRecords={ports.records}
                  scopeRules={scopeRules}
                  assets={assets}
                  onNavigate={setActiveTab}
                  portActivity={ports.activity}
                  assetActivity={assets.activity}
                />
              </div>
              {activeTab === 'scope' && (
                <ScopeTab
                  rules={scopeRules}
                  onSaveRules={setScopeRules}
                  subRecords={subs.records}
                  portRecords={ports.records}
                  onCopyToast={showToast}
                />
              )}
              <div
                className="tab-pane-fill"
                style={{ display: activeTab === 'subdomains' ? 'flex' : 'none' }}
              >
                <SubdomainTab
                  subs={subs}
                  onCopyToast={showToast}
                  keywords={keywords}
                  onSaveKeywords={setKeywords}
                  focusNewIds={focusNewIds}
                  onClearFocusNew={clearFocusNew}
                  scopeStatus={scopeStatus}
                  hasScope={scopeRules.length > 0}
                />
              </div>
              {activeTab === 'ports' && (
                <PortTab
                  ports={ports}
                  projectName={activeProject?.name}
                  onCopyToast={showToast}
                  scopeStatus={scopeStatus}
                  hasScope={scopeRules.length > 0}
                  subRecords={subs.records}
                  onSendToSubdomains={async (hosts) => {
                    const partials = (hosts || []).map((h) => ({ host: h, status: 'unknown', tech: [] }));
                    const summary = await subs.importRecords(partials);
                    showToast(`Sent ${summary.added} new host(s) to Subdomains`);
                  }}
                />
              )}
              <div style={{ display: activeTab === 'urlparser' ? 'block' : 'none' }}>
                <ReconUrlParser activeProjectId={activeId} active={activeTab === 'urlparser'} />
              </div>
              <div style={{ display: activeTab === 'jsrecon' ? 'block' : 'none' }}>
                <JsReconTab
                  activeProjectId={activeId}
                  onCreateFinding={createFinding}
                  onSendToSubdomains={sendToSubdomains}
                />
              </div>
              {activeTab === 'surface' && (
                <SurfaceTab
                  activeProjectId={activeId}
                  subs={subs.records}
                  ports={ports.records}
                  scopeRules={scopeRules}
                />
              )}
              {activeTab === 'wordlists' && (
                <WordlistsTab techHints={[...new Set(subs.records.flatMap((r) => r.tech || []))]} />
              )}
              {activeTab === 'dorks' && <DorksTab defaultTarget={activeProject?.name || ''} />}
              {activeTab === 'httpanalyzer' && <HttpAnalyzerTab />}
              {activeTab === 'techstack' && <TechStackTab records={subs.records} activeProjectId={activeId} />}
              {activeTab === 'findings' && (
                <FindingsTab
                  activeProjectId={activeId}
                  hosts={subs.records.map((r) => r.host)}
                  initialDraft={findingDraft}
                  onDraftConsumed={() => setFindingDraft(null)}
                />
              )}
              {activeTab === 'notebook' && (
                <NotebookTab
                  hosts={subs.records.map((r) => r.host)}
                  activeProjectId={activeId}
                  onCreateFinding={(d) => { setFindingDraft(d); setActiveTab('findings'); }}
                />
              )}
              {activeTab === 'assets' && (
                <AssetsTab
                  assets={assets}
                  onSave={setAssets}
                  onCopyToast={showToast}
                  subRecords={subs.records}
                  scopeStatus={scopeStatus}
                  hasScope={scopeRules.length > 0}
                  onSendToSubdomains={async (hosts) => {
                    const partials = (hosts || []).map((h) => ({ host: h, status: 'unknown', tech: [] }));
                    const summary = await subs.importRecords(partials);
                    showToast(`Sent ${summary.added} new host(s) to Subdomains`);
                  }}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsTab
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  projects={projects}
                  activeProject={activeProject}
                  onWipeProject={() => subs.clearAll()}
                />
              )}
            </ErrorBoundary>
          )}
        </main>
      </div>

      {modal && (
        <ProjectModal
          mode={modal.mode}
          project={modal.project}
          onConfirm={confirmModal}
          onClose={() => setModal(null)}
        />
      )}

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}

      {toast && <div className="copy-toast">{toast}</div>}
    </div>
  );
}
