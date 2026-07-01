// Turn JS-recon output into ready-to-run recon commands. Pure & testable.
// `data` is the aggregated analyzeJs/worker result (has urls, paths, endpoints, params).

const uniq = (a) => [...new Set(a)];

// absolute http(s) URLs only
function absUrls(data) {
  return uniq((data.urls || []).filter((u) => /^https?:\/\//i.test(u)));
}
// path-shaped strings worth fuzzing (drop the {x} AST placeholders → FUZZ-able stems)
function fuzzPaths(data) {
  return uniq([...(data.paths || []), ...(data.endpoints || [])]
    .map((p) => p.replace(/\{x\}/g, '').replace(/\/{2,}/g, '/').replace(/\/+$/, ''))
    .filter((p) => p.startsWith('/') && p.length > 1));
}

export function reconCommands(data, base = '') {
  const urls = absUrls(data);
  const paths = fuzzPaths(data);
  const params = (data.params || []).map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean);
  const cmds = [];

  if (urls.length) {
    cmds.push({ label: 'URLs (save as urls.txt)', text: urls.join('\n') });
    cmds.push({ label: 'nuclei — scan discovered URLs', text: 'nuclei -l urls.txt -severity low,medium,high,critical -o nuclei.txt' });
    cmds.push({ label: 'httpx — probe + tech/title/status', text: 'httpx -l urls.txt -sc -title -tech-detect -cl -location' });
    cmds.push({ label: 'curl — first 10 URLs', text: urls.slice(0, 10).map((u) => `curl -sk -A 'Mozilla/5.0' '${u}'`).join('\n') });
  }
  if (paths.length) {
    cmds.push({ label: 'Paths (save as paths.txt)', text: paths.join('\n') });
    if (base) cmds.push({ label: 'ffuf — fuzz discovered paths', text: `ffuf -u '${base.replace(/\/$/, '')}/FUZZ' -w paths.txt -mc all -fc 404` });
  }
  if (params.length && base) {
    cmds.push({ label: 'ffuf — param discovery on a known path', text: `ffuf -u '${base.replace(/\/$/, '')}/?FUZZ=test' -w params.txt -mc all` });
    cmds.push({ label: 'Params (save as params.txt)', text: params.join('\n') });
  }
  if (params.length) {
    cmds.push({ label: 'arjun — probe these params', text: `arjun -u '${base || 'https://TARGET/PATH'}' --import params.txt` });
  }
  return cmds;
}
