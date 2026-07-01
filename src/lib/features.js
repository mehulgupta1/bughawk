// Feature catalog: per-subdomain features mapped to attack-technique categories,
// plus auto-detection of features from parsed URLs. Pure.
import { TECHNIQUES } from './techniques.js';
import { hostOf } from './graph.js';

// key -> { label, cats:[technique categories], detect: regex on URL/path }
export const FEATURES = [
  { key: 'login', label: 'Login', cats: ['auth', 'bypass403'], detect: /\/(login|signin|sign-in|auth)(\/|$|\?)/i },
  { key: 'register', label: 'Register', cats: ['auth', 'logic'], detect: /\/(register|signup|sign-up|join)(\/|$|\?)/i },
  { key: 'file-upload', label: 'File upload', cats: ['upload', 'ssrf'], detect: /\/(upload|attach|import|media|files?)(\/|$|\?)|\bfile=|\bupload=/i },
  { key: 'api', label: 'API', cats: ['api', 'idor'], detect: /\/(api|v[0-9]+|rest)(\/|$|\?)/i },
  { key: 'graphql', label: 'GraphQL', cats: ['graphql'], detect: /\/(graphql|graphiql|__graphql)(\/|$|\?)/i },
  { key: 'payment', label: 'Payment', cats: ['logic', 'idor', 'race'], detect: /\/(payment|checkout|billing|invoice|cart|order|coupon|subscribe)(\/|$|\?)/i },
  { key: 'admin', label: 'Admin', cats: ['bypass403', 'auth', 'idor'], detect: /\/(admin|dashboard|manage|console|panel|internal|superadmin)(\/|$|\?)/i },
  { key: 'password-reset', label: 'Password reset', cats: ['auth', 'hosthdr'], detect: /\/(reset|forgot|password|recover)(\/|$|\?)|\btoken=/i },
  { key: 'sso-oauth', label: 'SSO / OAuth', cats: ['auth', 'redirect', 'cors'], detect: /\/(oauth|sso|saml|authorize|openid|connect|callback)(\/|$|\?)/i },
  { key: 'search', label: 'Search', cats: ['sqli', 'xss'], detect: /\/(search|find|query)(\/|$|\?)|[?&](q|s|search|query|keyword)=/i },
  { key: 'redirect', label: 'Redirect', cats: ['redirect', 'ssrf'], detect: /[?&](redirect|redir|url|next|dest|return|returnurl|goto|continue)=/i },
  { key: 'profile', label: 'Profile / Account', cats: ['idor', 'xss'], detect: /\/(profile|account|me|user|settings|whoami)(\/|$|\?)/i },
  { key: 'webhook', label: 'Webhook', cats: ['ssrf'], detect: /\/(webhook|callback|notify|hook)(\/|$|\?)|[?&](webhook|callback|url)=/i },
  { key: 'export', label: 'Export / Download', cats: ['idor', 'lfi'], detect: /\/(export|download|report|invoice|pdf)(\/|$|\?)|\bdownload=/i },
  { key: 'comments', label: 'Comments / UGC', cats: ['xss', 'csrf'], detect: /\/(comment|post|message|review|feedback)(\/|$|\?)/i },
  { key: '2fa', label: '2FA / MFA', cats: ['auth'], detect: /\/(2fa|mfa|otp|totp|verify|verification)(\/|$|\?)/i },
];

const FEATURE_BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
export const featureLabel = (key) => (FEATURE_BY_KEY[key] ? FEATURE_BY_KEY[key].label : key);

// Categories that a category-based finding implies a feature for.
const CAT_TO_FEATURE = { redirect: 'redirect', graphql: 'graphql', upload: 'file-upload', auth: 'login', ssrf: 'webhook' };

// Detect features for a host from its parsed URL results ([{url, categories}]).
export function detectFeatures(results) {
  const found = new Set();
  for (const r of results) {
    const u = r.url || '';
    for (const f of FEATURES) if (f.detect.test(u)) found.add(f.key);
    for (const c of r.categories || []) if (CAT_TO_FEATURE[c]) found.add(CAT_TO_FEATURE[c]);
  }
  return [...found];
}

// Suggest techniques for a set of selected feature keys.
export function suggestTechniques(featureKeys) {
  const cats = new Set();
  for (const k of featureKeys) (FEATURE_BY_KEY[k]?.cats || []).forEach((c) => cats.add(c));
  return TECHNIQUES.filter((t) => cats.has(t.cat));
}

// Group a project's URL results by host for fast per-host detection.
export function featuresByHost(urlResults) {
  const byHost = new Map();
  for (const r of urlResults) {
    const h = hostOf(r.url);
    if (!h) continue;
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(r);
  }
  const out = {};
  for (const [h, rs] of byHost) out[h] = detectFeatures(rs);
  return out;
}
