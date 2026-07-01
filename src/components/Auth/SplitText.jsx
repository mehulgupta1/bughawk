// Per-character entrance: each letter rises in with an elastic overshoot,
// staggered by `delay` ms. Pure CSS animation (no GSAP) — cheap and unmounts
// with the login screen. Equivalent to a split-text elastic.out reveal.
export default function SplitText({ text, className = '', delay = 120, start = 0 }) {
  return (
    <span className={`st ${className}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} className="st-c" aria-hidden="true" style={{ animationDelay: `${start + i * delay}ms` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}
