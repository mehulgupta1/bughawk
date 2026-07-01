import { useReveal } from '../../hooks/useReveal.js';
import { useCountUp } from '../../hooks/useCountUp.js';

// Count-up animated stat card. Animates once it scrolls into view.
export default function StatCard({ label, value, accent }) {
  const [ref, inView] = useReveal();
  const display = useCountUp(value, { active: inView });

  return (
    <div
      ref={ref}
      className={`stat-card reveal${inView ? ' in-view' : ''}`}
      style={accent ? { '--card-accent': accent } : undefined}
    >
      <div className="stat-card-value mono">{display}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
