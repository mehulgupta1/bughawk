import { useEffect, useRef } from 'react';

// Lightweight canvas "galaxy" for the login screen only. One rAF loop, modest
// particle count, capped DPR, pauses when the tab is hidden, and renders a single
// static frame when the user prefers reduced motion. Unmounts with the login gate
// → zero cost once you're in the app.
export default function Galaxy({ speed = 1.7, density = 1.5 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let w = 0, h = 0, cx = 0, cy = 0, stars = [], raf = 0, last = 0, running = true;

    const build = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2; cy = h / 2;
      const maxR = Math.hypot(w, h) / 2;
      const count = Math.min(420, Math.round(160 * density)); // hard cap for safety
      stars = Array.from({ length: count }, () => {
        const radius = Math.pow(Math.random(), 0.7) * maxR;     // denser toward center
        return {
          angle: Math.random() * Math.PI * 2,
          radius,
          z: 0.3 + Math.random() * 0.7,                          // depth → size/brightness
          // inner stars orbit faster (differential rotation = spiral feel)
          spin: (0.00006 * speed) * (1 - radius / maxR * 0.6),
          tw: Math.random() * Math.PI * 2,
          hue: 210 + Math.random() * 80,                         // blue→violet
        };
      });
    };

    const draw = (dt) => {
      ctx.clearRect(0, 0, w, h);
      // nebula core glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.55);
      g.addColorStop(0, 'rgba(139,92,246,0.18)');
      g.addColorStop(0.4, 'rgba(99,102,241,0.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        if (!reduce) { s.angle += s.spin * dt; s.tw += 0.004 * dt; }
        const x = cx + Math.cos(s.angle) * s.radius;
        const y = cy + Math.sin(s.angle) * s.radius * 0.62; // elliptical disk
        const a = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.tw))) * s.z;
        const r = s.z * 1.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 80%, 80%, ${a})`;
        ctx.fill();
      }
    };

    const loop = (t) => {
      if (!running) return;
      const dt = Math.min(50, t - (last || t)); last = t;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };

    const onResize = () => build();
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!reduce) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    };

    build();
    if (reduce) { draw(0); } else { raf = requestAnimationFrame(loop); }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [speed, density]);

  return <canvas ref={ref} className="lg-galaxy" aria-hidden="true" />;
}
