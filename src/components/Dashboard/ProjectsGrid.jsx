import { useReveal } from '../../hooks/useReveal.js';
import { STATUS_GROUPS, STATUS_COLORS } from '../../lib/status.js';
import { relativeTime } from '../../utils/time.js';

// Deterministic accent strip color per project index.
const STRIP_COLORS = [
  'var(--status-2xx)',
  'var(--status-3xx)',
  'var(--status-4xx)',
  'var(--status-5xx)',
  'var(--accent-primary)',
];

function MiniBar({ breakdown, total }) {
  if (!total) return <div className="mini-bar mini-bar-empty" />;
  return (
    <div className="mini-bar">
      {STATUS_GROUPS.map((g) => {
        const c = (breakdown && breakdown[g]) || 0;
        if (!c) return null;
        return (
          <span
            key={g}
            style={{ width: `${(c / total) * 100}%`, background: STATUS_COLORS[g] }}
          />
        );
      })}
    </div>
  );
}

function ProjectCard({ project, index, active, onSwitch }) {
  const [ref, inView] = useReveal();
  const strip = STRIP_COLORS[index % STRIP_COLORS.length];
  const total = project.subdomainCount || 0;

  return (
    <button
      ref={ref}
      className={`project-card reveal${inView ? ' in-view' : ''}${active ? ' active' : ''}`}
      style={{ '--strip': strip }}
      onClick={() => onSwitch(project.id)}
    >
      <span className="project-strip" />
      <div className="project-card-top">
        <span className="project-card-name">{project.name}</span>
        {active && <span className="project-card-tag">active</span>}
      </div>
      <div className="project-card-count mono">{total.toLocaleString()} subdomains</div>
      <MiniBar breakdown={project.breakdown} total={total} />
      <div className="project-card-foot mono">
        last imported {relativeTime(project.lastImportedAt)}
      </div>
    </button>
  );
}

export default function ProjectsGrid({ projects, activeId, onSwitch }) {
  return (
    <section className="projects-section">
      <h3 className="section-title">Your Projects</h3>
      <div className="projects-grid">
        {projects.map((p, i) => (
          <ProjectCard
            key={p.id}
            project={p}
            index={i}
            active={p.id === activeId}
            onSwitch={onSwitch}
          />
        ))}
      </div>
    </section>
  );
}
