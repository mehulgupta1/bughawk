// portexporter.js — CSV / JSON / Markdown / playbook export for port records.
import { enrich, attackSurfaceScore, scoreBand, nextCommands } from './portintel.js';

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export function exportCsv(records, base = 'ports') {
  const header = 'host,ip,port,proto,state,service,product,version,severity,cves,kev,dangerous';
  const rows = records.map((r) => {
    const e = enrich(r);
    return [
      r.host, r.ip, r.port, r.proto, r.state, r.service, r.product, r.version,
      e.severity, (r.cves || []).map((c) => c.id).join(' '), r.kev ? 'yes' : '',
      e.dangerousFlags.join('; '),
    ].map(csvField).join(',');
  });
  download(`${base}-${stamp()}.csv`, [header, ...rows].join('\n') + '\n', 'text/csv');
}

export function exportJson(records, base = 'ports') {
  const out = records.map((r) => ({ ...r, derived: enrich(r) }));
  download(`${base}-${stamp()}.json`, JSON.stringify(out, null, 2), 'application/json');
}

// Professional Markdown finding report, grouped by host, severity-sorted.
export function exportMarkdown(records, projectName = 'target', base = 'port-report') {
  const enriched = records.map((r) => ({ r, e: enrich(r) }));
  const score = attackSurfaceScore(enriched.map((x) => x.e));
  const band = scoreBand(score);

  const byHost = new Map();
  for (const x of enriched) {
    if (!byHost.has(x.r.host)) byHost.set(x.r.host, []);
    byHost.get(x.r.host).push(x);
  }

  const lines = [];
  lines.push(`# Port Scan Findings — ${projectName}`);
  lines.push('');
  lines.push(`_Generated ${new Date().toISOString()}_`);
  lines.push('');
  lines.push(`**Attack surface score:** ${score}/100 (${band.label})`);
  lines.push(`**Hosts:** ${byHost.size}  •  **Open ports:** ${enriched.filter((x) => x.r.state.startsWith('open')).length}`);
  lines.push('');

  const sevCount = {};
  for (const x of enriched) sevCount[x.e.severity] = (sevCount[x.e.severity] || 0) + 1;
  lines.push('## Severity summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | --- |');
  for (const s of ['critical', 'high', 'medium', 'low', 'info']) {
    if (sevCount[s]) lines.push(`| ${s} | ${sevCount[s]} |`);
  }
  lines.push('');

  const rank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  for (const [host, items] of byHost) {
    items.sort((a, b) => rank[b.e.severity] - rank[a.e.severity] || a.r.port - b.r.port);
    lines.push(`## ${host}`);
    lines.push('');
    for (const { r, e } of items) {
      const svc = [r.service, r.product, r.version].filter(Boolean).join(' ') || '—';
      lines.push(`### ${r.port}/${r.proto} — ${svc}  \`[${e.severity}]\``);
      lines.push('');
      lines.push(`- **State:** ${r.state}`);
      if (e.dangerousFlags.length) lines.push(`- **⚠ Dangerous config:** ${e.dangerousFlags.join('; ')}`);
      if (e.anomalies.length) lines.push(`- **Anomaly:** ${e.anomalies.join('; ')}`);
      if (r.kev) lines.push(`- **🔥 CISA KEV:** actively exploited in the wild`);
      if (r.cves && r.cves.length) {
        const top = r.cves.slice(0, 5).map((c) => `${c.id}${c.cvss ? ` (CVSS ${c.cvss})` : ''}`).join(', ');
        lines.push(`- **CVEs:** ${top}`);
      }
      if (e.exploits.length) lines.push(`- **Known exploits:** ${e.exploits.map((x) => x.label).join('; ')}`);
      if (e.nuclei.length) lines.push(`- **Nuclei templates:** \`${e.nuclei.join(', ')}\``);
      if (e.recon.length) {
        lines.push(`- **Recon steps:**`);
        for (const step of e.recon) lines.push(`  - ${step}`);
      }
      lines.push('');
    }
  }
  download(`${base}-${stamp()}.md`, lines.join('\n'), 'text/markdown');
}

// Runnable recon playbook: every suggested follow-up command across all open
// ports, grouped by host, de-duplicated. Severity-ordered so the juicy targets
// come first in the script.
export function exportPlaybook(records, projectName = 'target', base = 'recon-playbook') {
  const open = records.filter((r) => (r.state || '').startsWith('open'));
  const rank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

  const byHost = new Map();
  for (const r of open) {
    if (!byHost.has(r.host)) byHost.set(r.host, []);
    byHost.get(r.host).push(r);
  }

  const lines = [
    '#!/usr/bin/env bash',
    `# Recon playbook for ${projectName}`,
    `# Generated ${new Date().toISOString()} — review before running. Authorized targets only.`,
    'set -uo pipefail',
    '',
  ];

  // Hosts with the worst ports first.
  const hosts = [...byHost.entries()].sort((a, b) => {
    const w = (items) => items.reduce((m, r) => Math.max(m, rank[enrich(r).severity]), 0);
    return w(b[1]) - w(a[1]) || a[0].localeCompare(b[0]);
  });

  const seen = new Set();
  for (const [host, items] of hosts) {
    items.sort((a, b) => rank[enrich(b).severity] - rank[enrich(a).severity] || a.port - b.port);
    lines.push(`# ===== ${host} =====`);
    for (const r of items) {
      const e = enrich(r);
      const tags = [`[${e.severity}]`];
      if (r.kev) tags.push('KEV');
      if (e.dangerousFlags.length) tags.push('MISCONFIG');
      lines.push(`# ${r.port}/${r.proto} ${[r.service, r.product, r.version].filter(Boolean).join(' ')} ${tags.join(' ')}`);
      for (const c of nextCommands(r)) {
        if (seen.has(c.cmd)) continue;
        seen.add(c.cmd);
        lines.push(c.cmd);
      }
    }
    lines.push('');
  }

  download(`${base}-${stamp()}.sh`, lines.join('\n'), 'text/x-shellscript');
}
