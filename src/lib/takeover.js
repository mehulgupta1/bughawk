// Subdomain takeover detection from CNAME + HTTP status.
//
// We don't fetch response bodies here (that's the browser's job / out of scope),
// so this is a *fingerprint* heuristic based on the CNAME target and the status
// code, modelled on the community "can-i-take-over-xyz" matrix. A host is a
// candidate when its CNAME points at a known third-party service; it's escalated
// to "likely" when the status also looks dangling (4xx/5xx/none), which is the
// classic signature of an unclaimed resource.
//
// Each rule: { service, re, severity, always }.
//   always=true  -> service is takeover-prone whenever dangling (still needs a
//                   dangling-looking status to become "likely").
//   always=false -> edge/CDN that is only sometimes claimable; stays "candidate".

export const TAKEOVER_RULES = [
  { service: 'AWS S3', re: /\.s3[.-][\w.-]*amazonaws\.com$|\.s3\.amazonaws\.com$/i, severity: 'high', always: true },
  { service: 'AWS CloudFront', re: /\.cloudfront\.net$/i, severity: 'medium', always: false },
  { service: 'GitHub Pages', re: /\.github\.io$/i, severity: 'high', always: true },
  { service: 'GitLab Pages', re: /\.gitlab\.io$/i, severity: 'medium', always: true },
  { service: 'Heroku', re: /\.herokuapp\.com$|\.herokudns\.com$/i, severity: 'high', always: true },
  { service: 'Azure', re: /\.azurewebsites\.net$|\.cloudapp\.net$|\.cloudapp\.azure\.com$|\.trafficmanager\.net$|\.azureedge\.net$|\.blob\.core\.windows\.net$/i, severity: 'high', always: true },
  { service: 'Shopify', re: /\.myshopify\.com$/i, severity: 'high', always: true },
  { service: 'Fastly', re: /\.fastly\.net$/i, severity: 'medium', always: false },
  { service: 'Zendesk', re: /\.zendesk\.com$/i, severity: 'high', always: true },
  { service: 'Desk / Salesforce', re: /\.desk\.com$/i, severity: 'medium', always: true },
  { service: 'Tumblr', re: /\.tumblr\.com$/i, severity: 'high', always: true },
  { service: 'WordPress.com', re: /\.wordpress\.com$/i, severity: 'medium', always: true },
  { service: 'Ghost', re: /\.ghost\.io$/i, severity: 'high', always: true },
  { service: 'Surge.sh', re: /\.surge\.sh$/i, severity: 'high', always: true },
  { service: 'Netlify', re: /\.netlify\.app$|\.netlify\.com$/i, severity: 'medium', always: true },
  { service: 'Bitbucket', re: /\.bitbucket\.io$/i, severity: 'high', always: true },
  { service: 'Pantheon', re: /\.pantheonsite\.io$/i, severity: 'high', always: true },
  { service: 'Unbounce', re: /\.unbouncepages\.com$/i, severity: 'high', always: true },
  { service: 'Webflow', re: /\.webflow\.io$|\.proxy\.webflow\.com$/i, severity: 'high', always: true },
  { service: 'Helpscout', re: /\.helpscoutdocs\.com$/i, severity: 'high', always: true },
  { service: 'Readme.io', re: /\.readme\.io$/i, severity: 'high', always: true },
  { service: 'Cargo', re: /\.cargocollective\.com$/i, severity: 'medium', always: true },
  { service: 'Wix', re: /\.wixdns\.net$|\.wix\.com$/i, severity: 'medium', always: true },
  { service: 'Fly.io', re: /\.fly\.dev$/i, severity: 'medium', always: true },
  { service: 'Vercel', re: /\.vercel\.app$|\.vercel-dns\.com$/i, severity: 'medium', always: false },
  { service: 'AWS Elastic Beanstalk', re: /\.elasticbeanstalk\.com$/i, severity: 'high', always: true },
  { service: 'Firebase', re: /\.firebaseapp\.com$|\.web\.app$/i, severity: 'medium', always: true },
];

// Statuses that suggest the target is dangling (nothing claimed it).
function looksDangling(status) {
  if (status == null || status === 'unknown') return true;
  const n = Number(status);
  return n === 404 || n === 410 || (n >= 500 && n <= 599);
}

function getCname(rec) {
  return (rec.fields && rec.fields.cname) || rec.cname || '';
}

// Returns { service, severity, confidence: 'likely'|'candidate', cname, reason } or null.
export function analyzeTakeover(rec) {
  const cname = getCname(rec);
  if (!cname) return null;
  const target = String(cname).trim().replace(/\.$/, '').toLowerCase();
  for (const rule of TAKEOVER_RULES) {
    if (!rule.re.test(target)) continue;
    const dangling = looksDangling(rec.status);
    const likely = rule.always && dangling;
    return {
      service: rule.service,
      severity: likely ? rule.severity : rule.severity === 'high' ? 'medium' : 'low',
      confidence: likely ? 'likely' : 'candidate',
      cname: target,
      reason: `CNAME → ${rule.service}${dangling ? ` and status looks dangling (${rec.status ?? 'none'})` : ` (status ${rec.status ?? 'none'})`}`,
    };
  }
  return null;
}

// Scan an array of records → [{ host, id, ...analysis }], likely first.
export function scanTakeovers(records) {
  const out = [];
  for (const rec of records) {
    const a = analyzeTakeover(rec);
    if (a) out.push({ host: rec.host, id: rec.id, ...a });
  }
  const rank = { likely: 0, candidate: 1 };
  return out.sort((x, y) => (rank[x.confidence] - rank[y.confidence]));
}
