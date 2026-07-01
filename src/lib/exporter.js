// exporter.js — turn a set of records into a downloadable .txt or .csv file.
import { statusLabel } from './status.js';

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

function csvField(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export function exportTxt(records, base = 'subdomains') {
  const text = records.map((r) => r.host).join('\n') + '\n';
  download(`${base}-${stamp()}.txt`, text, 'text/plain');
}

export function exportCsv(records, base = 'subdomains') {
  const header = 'host,status,title';
  const rows = records.map(
    (r) =>
      `${csvField(r.host)},${csvField(statusLabel(r.status))},${csvField(r.title || '')}`
  );
  download(`${base}-${stamp()}.csv`, [header, ...rows].join('\n') + '\n', 'text/csv');
}

// JS-recon result → submission-ready Markdown report.
export function jsReconMarkdown(data, projectName = 'target') {
  const L = [];
  L.push(`# JS Recon — ${projectName}`);
  L.push(`_generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')}_`);
  L.push(`\n**Risk ${data.summary?.riskScore ?? 0}/100** · ${data.summary?.criticalCount ?? 0} critical · ${data.bySource?.length ?? 0} file(s) with findings\n`);

  if (data.secrets?.length) {
    L.push(`## Secrets (${data.secrets.length})`);
    L.push('| Severity | Confidence | Type | Value | Source |', '|---|---|---|---|---|');
    for (const s of data.secrets.slice(0, 500)) {
      L.push(`| ${s.severity} | ${s.confidence || ''} | ${s.type} | \`${(s.value || '').replace(/\|/g, '\\|')}\` | ${(s.files || [])[0] || ''} |`);
    }
    L.push('');
  }
  if (data.misconfigs?.length) {
    L.push(`## Security Misconfigurations (${data.misconfigs.length})`);
    L.push('| Severity | Type | Evidence |', '|---|---|---|');
    for (const m of data.misconfigs.slice(0, 300)) L.push(`| ${m.severity} | ${m.type} | \`${(m.evidence || '').replace(/\|/g, '\\|').slice(0, 100)}\` |`);
    L.push('');
  }
  const list = (title, arr) => { if (arr?.length) { L.push(`## ${title} (${arr.length})`); L.push('```'); L.push(arr.slice(0, 1000).join('\n')); L.push('```\n'); } };
  list('Endpoints', data.endpoints);
  list('URLs', data.urls);
  list('Paths', data.paths);
  list('Domains', data.domains);
  list('Source maps', data.sourcemaps);
  list('GraphQL', data.graphql);
  if (data.params?.length) list('Parameters', data.params);
  return L.join('\n') + '\n';
}

export function exportJsReconReport(data, projectName = 'target') {
  download(`jsrecon-${projectName}-${stamp()}.md`, jsReconMarkdown(data, projectName), 'text/markdown');
}

export function exportJson(obj, base = 'jsrecon') {
  download(`${base}-${stamp()}.json`, JSON.stringify(obj, null, 2), 'application/json');
}
