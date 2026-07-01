import { useMemo } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;

// GitHub-style activity calendar for ~12 months, derived from the activity log
// (hosts added per day). Binary-ish intensity scaled by volume.
export default function Heatmap({ activity, createdAt }) {
  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = today.getTime();
    // Start ~52 weeks back, aligned to the start of that week (Sunday).
    let start = end - 363 * DAY_MS;
    if (createdAt) start = Math.max(start, new Date(createdAt).setHours(0, 0, 0, 0));
    const startDate = new Date(start);
    start -= startDate.getDay() * DAY_MS; // back up to Sunday

    const perDay = new Map(); // dayKey -> hosts added
    for (const a of activity) {
      if (!a.at) continue;
      const d = new Date(a.at);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      perDay.set(key, (perDay.get(key) || 0) + (a.added || 0));
    }
    let max = 0;
    for (const v of perDay.values()) if (v > max) max = v;

    const cols = [];
    const labels = [];
    let cursor = start;
    let lastMonth = -1;
    while (cursor <= end) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const key = cursor;
        const added = perDay.get(key) || 0;
        week.push({ date: new Date(key), added });
        cursor += DAY_MS;
      }
      const m = week[0].date.getMonth();
      labels.push(m !== lastMonth ? week[0].date.toLocaleString('default', { month: 'short' }) : '');
      lastMonth = m;
      cols.push(week);
    }
    return { weeks: cols, monthLabels: labels };
  }, [activity, createdAt]);

  const level = (added) => {
    if (!added) return 0;
    if (added >= 1000) return 4;
    if (added >= 250) return 3;
    if (added >= 50) return 2;
    return 1;
  };

  return (
    <div className="cal-heatmap">
      <div className="cal-months">
        {monthLabels.map((m, i) => (
          <span className="cal-month" key={i}>{m}</span>
        ))}
      </div>
      <div className="cal-weeks">
        {weeks.map((week, wi) => (
          <div className="cal-week" key={wi}>
            {week.map((cell, di) => (
              <div
                key={di}
                className="cal-cell"
                data-level={cell.date.getTime() > Date.now() ? '' : level(cell.added)}
                title={`${cell.date.toLocaleDateString()} — ${cell.added.toLocaleString()} added`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
