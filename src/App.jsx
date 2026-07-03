import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import TopBar from './components/Shell/TopBar.jsx';
import Sidebar from './components/Shell/Sidebar.jsx';
import CommandPalette from './components/Shell/CommandPalette.jsx';
import ErrorBoundary from './components/Shell/ErrorBoundary.jsx';
import ProjectModal from './components/Sidebar/ProjectModal.jsx';
// Eager: the four tabs that stay mounted (display:none) so their worker/state
// survives tab switches — lazy-loading them would defeat that.
import Dashboard from './components/Dashboard/Dashboard.jsx';
import SubdomainTab from './components/SubdomainTab/SubdomainTab.jsx';
import ReconUrlParser from './components/UrlParser/ReconUrlParser.jsx';
import JsReconTab from './components/JsRecon/JsReconTab.jsx';
// Lazy: conditionally-rendered tabs. Each gets its own <Suspense> at the render
// site so loading one never unmounts the always-mounted JS Recon worker.
const PortTab = lazy(() => import('./components/PortTab/PortTab.jsx'));
const ScopeTab = lazy(() => import('./components/ScopeTab/ScopeTab.jsx'));
const AssetsTab = lazy(() => import('./components/AssetsTab/AssetsTab.jsx'));
const SurfaceTab = lazy(() => import('./components/Surface/SurfaceTab.jsx'));
const WordlistsTab = lazy(() => import('./components/Wordlists/WordlistsTab.jsx'));
const DorksTab = lazy(() => import('./components/Dorks/DorksTab.jsx'));
const HttpAnalyzerTab = lazy(() => import('./components/HttpAnalyzer/HttpAnalyzerTab.jsx'));
const FindingsTab = lazy(() => import('./components/Findings/FindingsTab.jsx'));
const TechStackTab = lazy(() => import('./components/TechStack/TechStackTab.jsx'));
const NotebookTab = lazy(() => import('./components/Notebook/NotebookTab.jsx'));
const SettingsTab = lazy(() => import('./components/Settings/SettingsTab.jsx'));
import { useProjects } from './hooks/useProjects.js';
import { useSubdomains } from './hooks/useSubdomains.js';
import { usePorts } from './hooks/usePorts.js';
import { useTheme } from './hooks/useTheme.js';
import { useProjectValue } from './hooks/useProjectValue.js';
import { KEYS } from './lib/storage.js';
import { DEFAULT_KEYWORDS } from './lib/smartflag.js';
import { scopeOf } from './lib/scope.js';
import { setPerfTab, logPerf } from './lib/telemetry.js';

// Per-tab Suspense boundary: isolates a lazy tab's load so it never unmounts
// the always-mounted (display:none) tabs while its chunk is fetched.
function LazyTab({ children }) {
  return <Suspense fallback={<div className="loading-state">Loading…</div>}>{children}</Suspense>;
}

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
  // Keep heavy tabs mounted once visited (hide with display:none instead of
  // unmounting), so re-opening is an instant CSS flip rather than a re-render
  // over 50k/100k records. Still lazy — they load on first visit.
  const [visited, setVisited] = useState(() => new Set(['dashboard']));
  useEffect(() => {
    setVisited((v) => (v.has(activeTab) ? v : new Set(v).add(activeTab)));
  }, [activeTab]);
  // Tab switches render heavy tabs (tables, dork lists) — mark them as a
  // transition so React paints the click immediately instead of blocking the
  // interaction on the new tab's render. This is what fixes INP on nav clicks.
  const [, startTransition] = useTransition();
  const goTab = useCallback((tab) => startTransition(() => setActiveTab(tab)), []);
  const [findingDraft, setFindingDraft] = useState(null); // prefill carried Notebook -> Findings
  const [modal, setModal] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [focusNewIds, setFocusNewIds] = useState(null);

  // Tab switch with a perceived-latency log: time from click to two frames
  // later (i.e. after React commits + the browser paints the new tab).
  const handleTabChange = useCallback((tab) => {
    setPerfTab(tab); // attribute later jank/errors to the tab we're entering
    if (!import.meta.env?.DEV) { goTab(tab); return; }
    const t = performance.now();
    goTab(tab);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ms = performance.now() - t;
      console.log(`[tab:${tab}] visible after ${ms.toFixed(1)}ms`);
      logPerf('tab', { tab, ms: Math.round(ms) });
    }));
  }, [goTab]);

  const viewNew = useCallback((ids) => {
    setFocusNewIds(new Set(ids));
    setActiveTab('subdomains');
  }, []);
  const clearFocusNew = useCallback(() => setFocusNewIds(null), []);
  // Drop the focus filter when switching project.
  useEffect(() => { setFocusNewIds(null); }, [activeId]);

  // Auto-snapshot the attack surface after every subs/ports change (debounced),
  // so the change feed / resurrection / churn fill in without manual snapshots.
  // Runs in a worker (reads from IndexedDB) so the 100k-record scan never blocks
  // the UI. Debounced 1.2s so the record persist (400ms) lands first.
  const snapWorker = useRef(null);
  useEffect(() => {
    const w = new Worker(new URL('./lib/snapshot.worker.js', import.meta.url), { type: 'module' });
    snapWorker.current = w;
    return () => { w.terminate(); snapWorker.current = null; };
  }, []);
  useEffect(() => {
    if (!activeId || !snapWorker.current) return undefined;
    const t = setTimeout(() => { snapWorker.current.postMessage({ projectId: activeId }); }, 1200);
    return () => clearTimeout(t);
  }, [activeId, subs.records, ports.records]);

  // Full project-load timing: from an active-project change until all of its
  // data (subdomains + ports) has finished loading. Complements load-subs.
  const projLoadStart = useRef(0);
  useEffect(() => { projLoadStart.current = performance.now(); }, [activeId]);
  useEffect(() => {
    if (activeId && projLoadStart.current && !subs.isLoading && !ports.isLoading) {
      logPerf('project-load', {
        ms: Math.round(performance.now() - projLoadStart.current),
        records: subs.records.length,
        ports: ports.records.length,
      });
      projLoadStart.current = 0;
    }
  }, [activeId, subs.isLoading, ports.isLoading, subs.records.length, ports.records.length]);

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
      { id: 'go-dashboard', icon: '▦', label: 'Go to Dashboard', group: 'navigate', run: () => goTab('dashboard') },
      { id: 'go-scope', icon: '🎯', label: 'Go to Scope', group: 'navigate', run: () => goTab('scope') },
      { id: 'go-subdomains', icon: '🌐', label: 'Go to Subdomains', group: 'navigate', run: () => goTab('subdomains') },
      { id: 'go-ports', icon: '🖧', label: 'Go to Port Scan', group: 'navigate', run: () => goTab('ports') },
      { id: 'go-urlparser', icon: '🔗', label: 'Go to URL Parser', group: 'navigate', run: () => goTab('urlparser') },
      { id: 'go-jsrecon', icon: '🔎', label: 'Go to JS Recon', group: 'navigate', run: () => goTab('jsrecon') },
      { id: 'go-surface', icon: '🕸', label: 'Go to Attack Surface', group: 'navigate', run: () => goTab('surface') },
      { id: 'go-httpanalyzer', icon: '🧪', label: 'Go to HTTP Analyzer', group: 'navigate', run: () => goTab('httpanalyzer') },
      { id: 'go-techstack', icon: '🧱', label: 'Go to Tech Stack', group: 'navigate', run: () => goTab('techstack') },
      { id: 'go-findings', icon: '📝', label: 'Go to Findings', group: 'navigate', run: () => goTab('findings') },
      { id: 'go-notebook', icon: '📓', label: 'Go to Notebook', group: 'navigate', run: () => goTab('notebook') },
      { id: 'go-settings', icon: '⚙', label: 'Go to Settings', group: 'navigate', run: () => goTab('settings') },
      { id: 'go-assets', icon: '🗂', label: 'Go to Assets', group: 'navigate', run: () => goTab('assets') },
      { id: 'go-wordlists', icon: '📚', label: 'Go to Wordlists', group: 'navigate', run: () => goTab('wordlists') },
      { id: 'go-dorks', icon: '🐙', label: 'Go to GitHub Dorks', group: 'navigate', run: () => goTab('dorks') },
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
  }, [projects, switchProject, toggleTheme, goTab]);

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
          ) : (
            <ErrorBoundary resetKey={activeTab}>
              <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                {subs.isLoading ? (
                  <div className="loading-state">Loading project data…</div>
                ) : (
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
                )}
              </div>
              {visited.has('scope') && (
                <div style={{ display: activeTab === 'scope' ? 'block' : 'none' }}>
                  <LazyTab>
                    <ScopeTab
                      rules={scopeRules}
                      onSaveRules={setScopeRules}
                      subRecords={subs.records}
                      portRecords={ports.records}
                      onCopyToast={showToast}
                    />
                  </LazyTab>
                </div>
              )}
              <div
                className="tab-pane-fill"
                style={{ display: activeTab === 'subdomains' ? 'flex' : 'none' }}
              >
                <SubdomainTab
                  subs={subs}
                  active={activeTab === 'subdomains'}
                  onCopyToast={showToast}
                  keywords={keywords}
                  onSaveKeywords={setKeywords}
                  focusNewIds={focusNewIds}
                  onClearFocusNew={clearFocusNew}
                  scopeStatus={scopeStatus}
                  hasScope={scopeRules.length > 0}
                />
              </div>
              {visited.has('ports') && (
                <div style={{ display: activeTab === 'ports' ? 'block' : 'none' }}>
                  <LazyTab>
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
                  </LazyTab>
                </div>
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
              {visited.has('surface') && (
                <div style={{ display: activeTab === 'surface' ? 'block' : 'none' }}>
                  <LazyTab>
                    <SurfaceTab
                      activeProjectId={activeId}
                      subs={subs.records}
                      ports={ports.records}
                    />
                  </LazyTab>
                </div>
              )}
              {activeTab === 'wordlists' && (
                <LazyTab>
                  <WordlistsTab techHints={[...new Set(subs.records.flatMap((r) => r.tech || []))]} />
                </LazyTab>
              )}
              {activeTab === 'dorks' && <LazyTab><DorksTab defaultTarget={activeProject?.name || ''} /></LazyTab>}
              {activeTab === 'httpanalyzer' && <LazyTab><HttpAnalyzerTab /></LazyTab>}
              {visited.has('techstack') && (
                <div style={{ display: activeTab === 'techstack' ? 'block' : 'none' }}>
                  <LazyTab><TechStackTab records={subs.records} activeProjectId={activeId} /></LazyTab>
                </div>
              )}
              {activeTab === 'findings' && (
                <LazyTab>
                  <FindingsTab
                    activeProjectId={activeId}
                    hosts={subs.records.map((r) => r.host)}
                    initialDraft={findingDraft}
                    onDraftConsumed={() => setFindingDraft(null)}
                  />
                </LazyTab>
              )}
              {activeTab === 'notebook' && (
                <LazyTab>
                  <NotebookTab
                    hosts={subs.records.map((r) => r.host)}
                    activeProjectId={activeId}
                    onCreateFinding={(d) => { setFindingDraft(d); setActiveTab('findings'); }}
                  />
                </LazyTab>
              )}
              {visited.has('assets') && (
                <div style={{ display: activeTab === 'assets' ? 'block' : 'none' }}>
                  <LazyTab>
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
                  </LazyTab>
                </div>
              )}
              {activeTab === 'settings' && (
                <LazyTab>
                  <SettingsTab
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    projects={projects}
                    activeProject={activeProject}
                    onWipeProject={() => subs.clearAll()}
                    onCopyToast={showToast}
                  />
                </LazyTab>
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
