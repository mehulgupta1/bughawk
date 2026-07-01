import { useCallback, useEffect, useRef, useState } from 'react';
import * as storage from '../lib/storage.js';

const { KEYS } = storage;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Owns the project list + active project id, backed by IndexedDB. All storage
// access for projects flows through here — components never touch storage.
export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const loaded = useRef(false);

  // Initial async load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, active] = await Promise.all([
        storage.get(KEYS.projects, []),
        storage.get(KEYS.activeProjectId, null),
      ]);
      if (cancelled) return;
      setProjects(Array.isArray(list) ? list : []);
      setActiveId(active);
      loaded.current = true;
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist whenever the list changes (after the first load).
  useEffect(() => {
    if (!loaded.current) return;
    storage.set(KEYS.projects, projects);
  }, [projects]);

  useEffect(() => {
    if (!loaded.current) return;
    storage.set(KEYS.activeProjectId, activeId);
  }, [activeId]);

  // Keep activeId valid if the active project disappears / is first added.
  useEffect(() => {
    if (!loaded.current) return;
    if (activeId && !projects.some((p) => p.id === activeId)) {
      setActiveId(projects[0]?.id ?? null);
    } else if (!activeId && projects.length > 0) {
      setActiveId(projects[0].id);
    }
  }, [projects, activeId]);

  const createProject = useCallback((name) => {
    const project = {
      id: uid(),
      name: name.trim() || 'Untitled',
      createdAt: Date.now(),
      subdomainCount: 0,
      breakdown: null,
      lastImportedAt: null,
    };
    setProjects((prev) => [...prev, project]);
    setActiveId(project.id);
    return project;
  }, []);

  const renameProject = useCallback((id, name) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
    );
  }, []);

  const deleteProject = useCallback((id) => {
    storage.del(KEYS.subdomains(id)); // wipe its isolated dataset
    storage.del(KEYS.activity(id));
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const switchProject = useCallback((id) => {
    setActiveId(id);
  }, []);

  // Merge metadata (count / breakdown / lastImportedAt) into a project.
  const updateProjectMeta = useCallback((id, meta) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        // Avoid a state churn if nothing actually changed.
        let changed = false;
        for (const k of Object.keys(meta)) {
          if (p[k] !== meta[k]) {
            changed = true;
            break;
          }
        }
        return changed ? { ...p, ...meta } : p;
      })
    );
  }, []);

  const activeProject = projects.find((p) => p.id === activeId) || null;

  return {
    projects,
    activeId,
    activeProject,
    isLoading,
    createProject,
    renameProject,
    deleteProject,
    switchProject,
    updateProjectMeta,
  };
}
