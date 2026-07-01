// jsrecon_advanced.js — Ultra-Advanced JS Reconnaissance Engine
// Built upon the original jsrecon base with massively expanded regex coverage,
// deeper decode layers, smarter classification, and zero-miss philosophy.
// Compatible as a drop-in replacement for the original jsrecon module.
import { astEndpoints } from './jsast.js';

// ═══════════════════════════════════════════════════════════════
// SECTION 1: HELPERS & ENTROPY
// ═══════════════════════════════════════════════════════════════

export function entropy(s) {
    if (!s || s.length < 2) return 0;
    const f = {};
    for (const c of s) f[c] = (f[c] || 0) + 1;
    return -Object.values(f).reduce((a, v) => {
      const p = v / s.length;
      return a + p * Math.log2(p);
    }, 0);
  }
  
  const uniq = (arr) => [...new Set(arr)];

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: MULTI-LAYER DECODE ENGINE
  // ═══════════════════════════════════════════════════════════════
  
  function decodeEscapes(s) {
    return s
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h) => {
        try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; }
      })
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  
  function decodePercent(s) {
    return s.replace(/(?:%[0-9a-fA-F]{2})+/g, (m) => {
      try { return decodeURIComponent(m); } catch { return m; }
    });
  }
  
  function printableRatio(s) {
    let p = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 32 && c < 127) p++;
    }
    return s.length ? p / s.length : 0;
  }
  
  function decodeBase64Blobs(s) {
    const out = [];
    // must be proper base64: length divisible by 4, real alphabet, optional padding
    const re = /(?:[A-Za-z0-9+/]{4}){8,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
    let m, n = 0, bytes = 0;
    while ((m = re.exec(s)) !== null && n < 1000 && bytes < 200_000) {
      n++;
      try {
        const d = atob(m[0]);
        if (printableRatio(d) > 0.90 &&  // raised from 0.85
            /[/:._@\-]/.test(d) &&        // URL-like chars
            !/^[a-z]+$/i.test(d) &&       // not a dictionary word
            d.length > 8) {
          out.push(d);
          bytes += d.length;
        }
      } catch { /* not base64 */ }
    }
    return out.join('\n');
  }

  // NEW: Decode HTML entities — found in JS embedded in HTML contexts
  function decodeHtmlEntities(s) {
    return s
      .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
  
  // NEW: String.fromCharCode reconstruction (obfuscator technique)
  // Handles: String.fromCharCode(104,116,116,112,...) → "http..."
  function decodeFromCharCode(s) {
    const re = /String\.fromCharCode\(([0-9,\s]{1,2000})\)/g;
    return s.replace(re, (_, nums) => {
      try {
        return nums.split(',').map(n => String.fromCharCode(parseInt(n.trim(), 10))).join('');
      } catch { return _; }
    });
  }
  
  // NEW: Template literal reconstruction — `${base}${path}` patterns
  function decodeTemplateLiterals(s) {
    // Pull apart common template string concat patterns for endpoint discovery
    const re = /`([^`]{4,500})`/g;
    const extras = [];
    let m;
    while ((m = re.exec(s)) !== null) {
      const raw = m[1];
      // Simplify ${...} to capture the static parts around them
      const simplified = raw.replace(/\$\{[^}]{0,80}\}/g, 'DYNAMIC');
      if (/\/|api|v\d|endpoint|url/i.test(simplified)) extras.push(simplified);
    }
    return extras.join('\n');
  }
  
  // Build an augmented view: original + ONE chained-decoded copy (+ small extras).
  // Chaining the decoders into a single string keeps `scan` at ~2× the file size
  // instead of ~5× (one full copy per layer) — the difference between fast and
  // pathologically slow when 190+ regexes scan it.
  function expandText(text) {
    // The chained-decoded view is a detection SUPERSET of the original (decoding only
    // makes hidden URLs/secrets visible; untouched bytes are identical), so we scan it
    // alone instead of original+decoded — keeps `scan` at ~1× size, not 2×.
    let scan = decodeEscapes(text);
    scan = decodePercent(scan);
    scan = decodeHtmlEntities(scan);
    scan = decodeFromCharCode(scan);

    const tpl = decodeTemplateLiterals(scan);  // use decoded form (template literals may hold \x/\u escapes)
    if (tpl) scan += '\n' + tpl;

    if (text.length < 1_000_000) {          // base64 sweep — costly; skip on big bundles
      const b = decodeBase64Blobs(scan);    // run on decoded scan so base64 hidden in \x strings is seen
      if (b) scan += '\n' + b;
    }

    return scan;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: PLACEHOLDER / FALSE-POSITIVE GUARD
  // ═══════════════════════════════════════════════════════════════
  
  const PLACEHOLDER_WORDS = /(your|example|sample|changeme|change_me|placeholder|redacted|dummy|lorem|foobar|insert|enter|paste|here|todo|xxxx+|test[_-]?(key|token|secret)|api[_-]?key[_-]?here|my[_-]?(secret|token|key)|s3cr3t|password123|undefined|null|none|n\/a|default|replace_me|put_your|add_your|enter_your|go_here)/i;
  
  function looksLikePlaceholder(v) {
    if (!v || v.length < 4) return true;
    if (/^(.)\1+$/.test(v)) return true;                        // all one char
    if (/[<>${}()\[\];]/.test(v)) return true;                  // code fragment (brackets catch o=V.href)) etc.)
    if (PLACEHOLDER_WORDS.test(v) && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(v)) return true;
    if (new Set(v).size / v.length < 0.30) return true;         // lowered from 0.35 (AWS keys compress)
    if (/^(true|false|null|undefined|NaN|Infinity)$/i.test(v)) return true;
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: SECRET RULES — ULTRA-EXPANDED
  // ═══════════════════════════════════════════════════════════════
  
  export const SECRET_RULES = [
  
    // ── AWS ──────────────────────────────────────────────────────
    { name: 'AWS Access Key ID', severity: 'critical', re: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'AWS Temp/STS Key', severity: 'high', re: /\b(?:ASIA|AGPA|AROA|AIPA|ANPA|ANVA|AIDA|AKIA)[0-9A-Z]{16}\b/g },
    { name: 'AWS Secret Key (assignment)', severity: 'critical', re: /aws[_\-.]?secret[_\-.]?(?:access[_\-.]?)?key["'\s:=]+([A-Za-z0-9/+]{40})(?=[^A-Za-z0-9/+]|$)/gi, group: 1 },
    { name: 'AWS Session Token', severity: 'high', re: /aws[_\-.]?session[_\-.]?token["'\s:=]+["']([A-Za-z0-9/+=]{100,})["']/gi, group: 1 },
    { name: 'AWS MWS Token', severity: 'high', re: /amzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g },
    { name: 'AWS Account ID', severity: 'medium', re: /(?:account[_-]?id|aws[_-]?account)["'\s:=]+["']?(\d{12})["']?/gi, group: 1 },
    { name: 'AWS S3 Bucket URL', severity: 'medium', pre: 'amazonaws', re: /(?:https?:\/\/)?([a-z0-9][a-z0-9.\-]{2,62})\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com/gi },
    { name: 'AWS ARN', severity: 'medium', re: /arn:aws:[a-z0-9\-*]+:[a-z0-9\-]*:\d{12}:[^\s"'`]{4,}/g },
    { name: 'AWS Lambda ARN', severity: 'medium', re: /arn:aws:lambda:[a-z0-9\-]+:\d{12}:function:[^\s"'`]+/g },
    { name: 'AWS Cognito Pool ID', severity: 'medium', re: /\b(?:us-(?:east|west|gov-(?:east|west))-[12]|eu-(?:west-[1-3]|central-1|north-1|south-1)|ap-(?:east-1|south(?:east-[12]|south-1)?|northeast-[1-3]|north-1)|ca-(?:central|west)-1|sa-east-1|me-(?:south|central)-1|af-south-1)_[A-Za-z0-9]{9}\b/g },
    { name: 'AWS ECR URL', severity: 'low', re: /\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/g },
  
    // ── Google / GCP ───────────────────────────────────────────
    { name: 'Google API Key', severity: 'high', re: /AIza[0-9A-Za-z_\-]{35}/g },
    { name: 'Google OAuth2 Token', severity: 'high', re: /ya29\.[0-9A-Za-z_\-]+/g },
    { name: 'Google OAuth Client ID', severity: 'medium', re: /[0-9]+-[0-9a-z]+\.apps\.googleusercontent\.com/g },
    { name: 'GCP Service Account JSON', severity: 'critical', re: /"type":\s*"service_account"/g },
    { name: 'GCP Service Account Email', severity: 'high', re: /[a-z0-9_.-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/g },
    { name: 'GCP Project ID', severity: 'low', re: /(?:project[_-]?id|gcp[_-]?project)["'\s:=]+["']([a-z][a-z0-9-]{4,28}[a-z0-9])["']/gi, group: 1 },
    { name: 'Firebase Cloud Messaging (FCM)', severity: 'high', re: /AAAA[A-Za-z0-9_\-]{134,}:[A-Za-z0-9_\-]{140,175}/g },
    { name: 'Firebase URL', severity: 'medium', re: /[a-z0-9-]+\.firebaseio\.com/gi },
    { name: 'Firebase API Key', severity: 'high', re: /firebase[^]{0,50}apiKey["'\s:=]+["']([A-Za-z0-9_\-]{39})["']/gi, group: 1 },
    { name: 'Firebase App ID', severity: 'medium', re: /1:\d{12}:(?:android|ios|web):[a-f0-9]{16,}/g },
    { name: 'Google Maps Key', severity: 'high', re: /(?:maps|gmaps)[^]{0,20}["']AIza[0-9A-Za-z_\-]{35}["']/gi },
    { name: 'Google Recaptcha Secret', severity: 'high', re: /(?:recaptcha[_-]?secret|secret[_-]?key)["'\s:=]+["']([A-Za-z0-9_\-]{40})["']/gi, group: 1 },
    { name: 'GCP Storage Bucket', severity: 'low', re: /(?:storage\.googleapis\.com|storage\.cloud\.google\.com)\/([a-z0-9_\-]+)/gi },
  
    // ── GitHub / GitLab / Bitbucket ───────────────────────────
    { name: 'GitHub Personal Access Token', severity: 'critical', re: /gh[pousr]_[0-9A-Za-z]{36,}/g },
    { name: 'GitHub Fine-grained PAT', severity: 'critical', re: /github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}/g },
    { name: 'GitHub App Token', severity: 'high', re: /ghs_[0-9A-Za-z]{36}/g },
    { name: 'GitHub Refresh Token', severity: 'high', re: /ghr_[0-9A-Za-z]{36}/g },
    { name: 'GitHub OAuth Token', severity: 'high', re: /gho_[0-9A-Za-z]{36}/g },
    { name: 'GitLab PAT', severity: 'critical', re: /glpat-[0-9A-Za-z_\-]{20}/g },
    { name: 'GitLab CI Token', severity: 'high', re: /CI_(?:JOB_TOKEN|DEPLOY_TOKEN|REGISTRY_TOKEN)["'\s:=]+["']([A-Za-z0-9_\-]{20,})["']/gi, group: 1 },
    { name: 'Bitbucket App Password', severity: 'high', re: /(?:bitbucket[^]{0,20})(?:app[_-]?password|token)["'\s:=]+["']([A-Za-z0-9_\-]{20,})["']/gi, group: 1 },
    { name: 'GitHub Repository URL (with token)', severity: 'critical', re: /https:\/\/[A-Za-z0-9_\-]{10,}@github\.com\/[^\s"'`]+/g },
  
    // ── Slack ────────────────────────────────────────────────────
    { name: 'Slack Bot/App/User Token', severity: 'high', re: /xox[baprs]-[0-9A-Za-z\-]{10,48}/g },
    { name: 'Slack Webhook', severity: 'high', re: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Za-z_]{8,}\/B[0-9A-Za-z_]{8,}\/[0-9A-Za-z]{24}/g },
    { name: 'Slack Workflow Webhook', severity: 'high', re: /https:\/\/hooks\.slack\.com\/workflows\/[A-Za-z0-9_\/\-]+/g },
    { name: 'Slack Legacy Token', severity: 'high', re: /xoxp-[0-9A-Za-z\-]{70,}/g },
  
    // ── Payment Processors ────────────────────────────────────
    { name: 'Stripe Live Secret Key', severity: 'critical', re: /sk_live_[0-9a-zA-Z]{24,}/g },
    { name: 'Stripe Test Secret Key', severity: 'low', re: /sk_test_[0-9a-zA-Z]{24,}/g },
    { name: 'Stripe Restricted Key', severity: 'high', re: /rk_live_[0-9a-zA-Z]{24,}/g },
    { name: 'Stripe Publishable Key (live)', severity: 'low', re: /pk_live_[0-9a-zA-Z]{24,}/g },
    { name: 'Stripe Webhook Secret', severity: 'high', re: /whsec_[A-Za-z0-9]{32,}/g },
    { name: 'Square Access Token', severity: 'high', re: /sq0atp-[0-9A-Za-z_\-]{22}/g },
    { name: 'Square OAuth Secret', severity: 'high', re: /sq0csp-[0-9A-Za-z_\-]{43}/g },
    { name: 'PayPal Braintree Token', severity: 'high', re: /access_token\$production\$[0-9a-z]{16}\$[0-9a-f]{32}/g },
    { name: 'PayPal Client ID', severity: 'medium', re: /(?:paypal[^]{0,20})client[_-]?id["'\s:=]+["']([A-Za-z0-9_\-]{10,80})["']/gi, group: 1 },
    { name: 'Adyen API Key', severity: 'critical', context: /adyen/i, re: /\bAQE[a-zA-Z0-9]{40,}={0,2}/g },
    { name: 'Razorpay Key', severity: 'high', re: /rzp_(?:live|test)_[A-Za-z0-9]{14}/g },
    { name: 'Paystack Secret Key', severity: 'high', re: /sk_(?:live|test)_[A-Za-z0-9]{32,}/g },
    { name: 'WePay Client Secret', severity: 'high', re: /(?:wepay[^]{0,20})client[_-]?secret["'\s:=]+["']([A-Za-z0-9]{32,})["']/gi, group: 1 },
    { name: 'Shopify Access Token', severity: 'critical', re: /shpat_[a-fA-F0-9]{32}/g },
    { name: 'Shopify App Secret', severity: 'critical', re: /shpca_[a-fA-F0-9]{32}/g },
    { name: 'Shopify Partner/Private', severity: 'critical', re: /shp(?:pa|ss)_[a-fA-F0-9]{32}/g },
    { name: 'Shopify OAuth Token', severity: 'high', re: /(?:shopify[^]{0,20})(?:api[_-]?key|token)["'\s:=]+["']([A-Za-z0-9_]{32,})["']/gi, group: 1 },
  
    // ── Email Services ────────────────────────────────────────
    { name: 'Mailgun API Key', severity: 'high', context: /mailgun/i, re: /\bkey-[0-9a-zA-Z]{32}\b/g },
    { name: 'Mailgun Domain Key', severity: 'high', re: /(?:mailgun[^]{0,20})api[_-]?key["'\s:=]+["']([A-Za-z0-9_\-]{32,})["']/gi, group: 1 },
    { name: 'Mailchimp API Key', severity: 'high', re: /["']([0-9a-f]{32}-us[0-9]{1,3})["'](?=[\s\S]{0,80}(?:mailchimp|mc_api|mc_key))/gi, group: 1 },
    { name: 'Mailchimp API Key (context-first)', severity: 'high', re: /(?:mailchimp|mc_api|mc_key)[\s\S]{0,80}["']([0-9a-f]{32}-us[0-9]{1,3})["']/gi, group: 1 },
    { name: 'SendGrid API Key', severity: 'high', re: /SG\.[\w\-]{22}\.[\w\-]{43}/g },
    { name: 'Postmark Server Token', severity: 'high', re: /(?:postmark[^]{0,40})(?:server[_-]?token|api[_-]?token|token|X-Postmark-Server-Token)["'\s:=]+["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/gi, group: 1 },
    { name: 'SparkPost API Key', severity: 'high', re: /(?:sparkpost[^]{0,20})api[_-]?key["'\s:=]+["']([A-Za-z0-9]{30,})["']/gi, group: 1 },
    { name: 'Mandrill API Key', severity: 'high', re: /(?:mandrill[^]{0,20})api[_-]?key["'\s:=]+["']([A-Za-z0-9_\-]{20,})["']/gi, group: 1 },
    { name: 'Amazon SES SMTP', severity: 'high', re: /email-smtp\.[a-z0-9-]+\.amazonaws\.com/g },
    { name: 'SMTP Credentials in URL', severity: 'critical', re: /smtps?:\/\/[^/\s:@"']+:[^/\s:@"']+@[^\s"'<>]+/gi },
  
    // ── Communication / Messaging ─────────────────────────────
    { name: 'Twilio Account SID', severity: 'medium', context: /twilio/i, re: /\bAC[a-f0-9]{32}\b/g },
    { name: 'Twilio API Key', severity: 'high', context: /twilio/i, re: /\bSK[a-f0-9]{32}\b/g },
    { name: 'Twilio Auth Token', severity: 'critical', re: /(?:twilio[^]{0,20})auth[_-]?token["'\s:=]+["']([a-f0-9]{32})["']/gi, group: 1 },
    { name: 'Vonage/Nexmo API Key', severity: 'high', re: /(?:nexmo|vonage)[^]{0,30}(?:api[_-]?key|secret)["'\s:=]+["']([A-Za-z0-9]{8,32})["']/gi, group: 1 },
    { name: 'Telegram Bot Token', severity: 'high', re: /\d{8,10}:AA[A-Za-z0-9_\-]{32,}/g },
    { name: 'Discord Bot Token', severity: 'high', context: /discord/i, re: /(?<![A-Za-z0-9_\-])[A-Za-z0-9_\-]{24,32}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27,38}(?![A-Za-z0-9_\-])/g },
    { name: 'Discord Webhook URL', severity: 'medium', re: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+/g },
    { name: 'Discord Client Secret', severity: 'high', re: /(?:discord[^]{0,20})client[_-]?secret["'\s:=]+["']([A-Za-z0-9_\-]{30,})["']/gi, group: 1 },
    { name: 'Pusher Key', severity: 'medium', re: /(?:pusher[^]{0,30})(?:app[_-]?key|key)["'\s:=]+["']([a-z0-9]{20})["']/gi, group: 1 },
    { name: 'Pusher Secret', severity: 'high', re: /(?:pusher[^]{0,30})(?:app[_-]?secret|secret)["'\s:=]+["']([a-z0-9]{20})["']/gi, group: 1 },
    { name: 'Ably API Key', severity: 'high', context: /\bably\b/i, re: /[a-zA-Z0-9]{8}\.[a-zA-Z0-9]{6}:[a-zA-Z0-9_\-]{43}/g },
  
    // ── Social / OAuth ────────────────────────────────────────
    { name: 'Facebook Access Token', severity: 'high', re: /EAACEdEose0cBA[0-9A-Za-z]+/g },
    { name: 'Facebook App Secret', severity: 'critical', re: /(?:facebook|fb)[^]{0,30}(?:app[_-]?secret|secret)["'\s:=]+["']([0-9a-f]{32})["']/gi, group: 1 },
    { name: 'Facebook OAuth', severity: 'medium', re: /[fF][aA][cC][eE][bB][oO][oO][kK].{0,20}['"][0-9a-f]{32}['"]/g },
    { name: 'Twitter/X Bearer Token', severity: 'high', context: /twitter|twttr|api\.twitter/i, entropyMin: 4.2, re: /AAAAAAAAAA[0-9A-Za-z%]{40,}/g },
    { name: 'Twitter API Key', severity: 'high', re: /(?:twitter[^]{0,20})(?:api[_-]?key|consumer[_-]?key)["'\s:=]+["']([A-Za-z0-9]{25,})["']/gi, group: 1 },
    { name: 'Instagram Token', severity: 'medium', re: /(?:instagram[^]{0,30})(?:access[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{20,})["']/gi, group: 1 },
    { name: 'LinkedIn OAuth Token', severity: 'medium', re: /(?:linkedin[^]{0,30})(?:access[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{20,})["']/gi, group: 1 },
    { name: 'Pinterest Token', severity: 'medium', re: /(?:pinterest[^]{0,30})(?:access[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{20,})["']/gi, group: 1 },
    { name: 'TikTok Client Key', severity: 'medium', re: /(?:tiktok|tik_tok)[^]{0,30}(?:client[_-]?key|app[_-]?id)["'\s:=]+["']([A-Za-z0-9_]{10,})["']/gi, group: 1 },
  
    // ── AI / LLM / ML ─────────────────────────────────────────
    { name: 'OpenAI API Key (Legacy)', severity: 'critical', re: /\bsk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}\b/g },
    { name: 'OpenAI API Key (Project)', severity: 'critical', pre: 'sk-proj-', re: /\bsk-proj-[A-Za-z0-9_\-]{48,}\b/g },
    { name: 'OpenAI API Key (Service Account)', severity: 'critical', pre: 'sk-svcacct-', re: /\bsk-svcacct-[A-Za-z0-9_\-]{48,}\b/g },
    { name: 'OpenAI Org ID', severity: 'medium', re: /org-[A-Za-z0-9]{24}/g },
    { name: 'Anthropic API Key', severity: 'critical', pre: 'sk-ant-', re: /sk-ant-(?:api03-)?[A-Za-z0-9_\-]{20,}/g },
    { name: 'HuggingFace Token', severity: 'high', re: /hf_[A-Za-z0-9]{34,}/g },
    { name: 'Cohere API Key', severity: 'high', re: /(?:cohere[^]{0,20})api[_-]?key["'\s:=]+["']([A-Za-z0-9_\-]{40,})["']/gi, group: 1 },
    { name: 'Replicate API Token', severity: 'high', re: /r8_[A-Za-z0-9]{38}/g },
    { name: 'Stability AI Key', severity: 'high', context: /stability/i, re: /\bsk-(?!proj-|ant-)[A-Za-z0-9]{48}\b/g },
    { name: 'DeepL Auth Key', severity: 'medium', context: /deepl/i, re: /[A-Za-z0-9-]{36}:fx/g },
    { name: 'Azure OpenAI Key', severity: 'critical', re: /(?:azure[^]{0,20})(?:openai|cognitive)[^]{0,20}key["'\s:=]+["']([a-f0-9]{32})["']/gi, group: 1 },
  
    // ── Cloud Providers (Azure / GCP / Alibaba / Oracle) ──────
    { name: 'Azure Storage Connection String', severity: 'critical', re: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{88};/g },
    { name: 'Azure SAS Token', severity: 'high', re: /sv=\d{4}-\d{2}-\d{2}&s[a-z]=.{20,200}&sig=[A-Za-z0-9%+/=]{20,}/g },
    { name: 'Azure Client Secret', severity: 'critical', re: /(?:azure|aad)[^]{0,30}client[_-]?secret["'\s:=]+["']([A-Za-z0-9~._@\-]{30,})["']/gi, group: 1 },
    { name: 'Azure AD App Secret', severity: 'critical', context: /azure|microsoft|aad|entra|tenant[_-]?id|client[_-]?id/i, re: /(?:client[_-]?secret|app[_-]?secret|azure[_-]?secret)["'\s:=]+["']([A-Za-z0-9~._@\-]{34,44})["']/gi, group: 1 },
    { name: 'Azure IoT Hub Connection', severity: 'high', re: /HostName=[a-zA-Z0-9._\-]+\.azure-devices\.net;SharedAccessKeyName=[^;]+;SharedAccessKey=[A-Za-z0-9+/=]{44}/g },
    { name: 'Azure Cosmos DB Key', severity: 'critical', re: /(?:cosmos|documentdb)[^]{0,30}(?:primary|secondary)?[_-]?key["'\s:=]+["']([A-Za-z0-9+/=]{88})["']/gi, group: 1 },
    { name: 'Alibaba Cloud Access Key', severity: 'critical', re: /LTAI[A-Za-z0-9]{20}/g },
    { name: 'Alibaba Cloud Secret', severity: 'critical', re: /(?:alibaba|aliyun)[^]{0,30}access[_-]?key[_-]?secret["'\s:=]+["']([A-Za-z0-9]{30})["']/gi, group: 1 },
    { name: 'Oracle Cloud Key', severity: 'high', re: /ocid1\.[a-z]+\.[a-z0-9]+\.[a-z0-9]*\.[a-z0-9]{60}/g },
    { name: 'IBM Cloud API Key', severity: 'high', re: /(?:ibm[^]{0,20})(?:api[_-]?key|apikey)["'\s:=]+["']([A-Za-z0-9_\-]{44})["']/gi, group: 1 },
    { name: 'Cloudflare API Token', severity: 'high', re: /(?:cloudflare[^]{0,60})(?:api[_-]?token|token|auth[_-]?key)["'\s:=]+["']([A-Za-z0-9_\-]{40})["']/gi, group: 1 },
    { name: 'Cloudflare API Token (CF_ env)', severity: 'high', re: /CF_API_TOKEN["'\s:=]+["']([A-Za-z0-9_\-]{40})["']/g, group: 1 },
    { name: 'Cloudflare Global API Key', severity: 'critical', re: /(?:cloudflare[^]{0,30})(?:global[_-]?api[_-]?key|api[_-]?key)["'\s:=]+["']([a-f0-9]{37})["']/gi, group: 1 },
    { name: 'DigitalOcean Personal Token', severity: 'critical', re: /dop_v1_[a-f0-9]{64}/g },
    { name: 'DigitalOcean OAuth Token', severity: 'high', re: /doo_v1_[a-f0-9]{64}/g },
    { name: 'DigitalOcean Refresh Token', severity: 'high', re: /dor_v1_[a-f0-9]{64}/g },
    { name: 'Hetzner API Token', severity: 'high', re: /(?:hetzner[^]{0,20})api[_-]?token["'\s:=]+["']([A-Za-z0-9]{64})["']/gi, group: 1 },
    { name: 'Linode/Akamai API Key', severity: 'high', re: /(?:linode[^]{0,20})(?:api[_-]?key|token)["'\s:=]+["']([A-Za-z0-9]{64})["']/gi, group: 1 },
    { name: 'Vultr API Key', severity: 'high', context: /vultr/i, re: /\b[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\b/g },
  
    // ── DevOps / CI / CD ─────────────────────────────────────
    { name: 'NPM Token (legacy)', severity: 'high', re: /npm_[0-9A-Za-z]{36}/g },
    { name: 'NPM Auth Token', severity: 'high', re: /_authToken["'\s:=]+["']([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})["']/gi, group: 1 },
    { name: 'PyPI Token', severity: 'high', re: /pypi-[A-Za-z0-9_\-]{40,}/g },
    { name: 'Docker Hub Token', severity: 'high', re: /(?:docker[^]{0,20})(?:token|password|pat)["'\s:=]+["']([A-Za-z0-9_\-]{30,})["']/gi, group: 1 },
    { name: 'Heroku API Key', severity: 'high', re: /[hH]eroku.{0,20}[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g },
    { name: 'CircleCI Token', severity: 'high', re: /(?:circleci[^]{0,20})(?:token|api[_-]?key)["'\s:=]+["']([A-Za-z0-9]{40})["']/gi, group: 1 },
    { name: 'Travis CI Token', severity: 'high', re: /(?:travis[^]{0,20})(?:token|api[_-]?key)["'\s:=]+["']([A-Za-z0-9_\-]{22,})["']/gi, group: 1 },
    { name: 'Jenkins API Token', severity: 'high', re: /(?:jenkins[^]{0,20})(?:token|api[_-]?key)["'\s:=]+["']([A-Za-z0-9_]{32,})["']/gi, group: 1 },
    { name: 'Terraform Cloud Token', severity: 'high', re: /(?:terraform[^]{0,20})?(?:TF_API_TOKEN|atlas[_-]?token)["'\s:=]+["']([A-Za-z0-9.]{14,})["']/gi, group: 1 },
    { name: 'Vault Token', severity: 'critical', re: /(?:vault[_-]?token|VAULT_TOKEN)["'\s:=]+["']([a-zA-Z0-9.\-_]{24,})["']/gi, group: 1 },
    { name: 'HashiCorp Vault Token (hvs.)', severity: 'critical', pre: 'hvs.', re: /hvs\.[A-Za-z0-9]{24,}/g },
    { name: 'Ansible Vault Password', severity: 'high', re: /\$ANSIBLE_VAULT;[0-9.]+;AES256/g },
    { name: 'Kubernetes Service Account Token', severity: 'critical', re: /eyJhbGciOiJSUzI1NiIsImtpZCI6/g },
    { name: 'Kubernetes Config (kubeconfig)', severity: 'critical', re: /apiVersion:\s*v1\s*clusters:\s*-\s*cluster:\s*server/g },
    { name: 'SSH Private Key', severity: 'critical', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?:\s*BLOCK)?-----/g },
    { name: 'SSH Public Key (authorized)', severity: 'medium', re: /ssh-(?:rsa|dss|ed25519|ecdsa) AAAA[A-Za-z0-9+/=]{40,}/g },
  
    // ── Monitoring / Analytics ────────────────────────────────
    { name: 'Sentry DSN', severity: 'medium', re: /https:\/\/[a-f0-9]{32}@[a-z0-9.\-]+\.ingest\.(?:[a-z]+\.)?sentry\.io\/\d+/g },
    { name: 'Sentry Auth Token', severity: 'high', re: /(?:sentry[^]{0,20})auth[_-]?token["'\s:=]+["']([a-f0-9]{64})["']/gi, group: 1 },
    { name: 'Datadog API Key', severity: 'high', re: /(?:dd|datadog)[^]{0,20}["']([a-f0-9]{32})["']/gi, group: 1 },
    { name: 'Datadog App Key', severity: 'high', re: /(?:dd|datadog)[^]{0,20}app[_-]?key["'\s:=]+["']([a-f0-9]{40})["']/gi, group: 1 },
    { name: 'New Relic License Key', severity: 'high', re: /NRAK-[A-Z0-9]{27}/g },
    { name: 'New Relic Account ID', severity: 'medium', re: /(?:new[_-]?relic[^]{0,20})account[_-]?id["'\s:=]+["']?(\d{7,9})["']?/gi, group: 1 },
    { name: 'Splunk Auth Token', severity: 'high', re: /(?:splunk[^]{0,20})(?:auth[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{30,})["']/gi, group: 1 },
    { name: 'Elastic APM Token', severity: 'high', re: /(?:elastic[^]{0,20})(?:apm[_-]?secret|token)["'\s:=]+["']([A-Za-z0-9_\-]{20,})["']/gi, group: 1 },
    { name: 'Grafana API Key', severity: 'high', re: /(?:grafana[^]{0,20})api[_-]?key["'\s:=]+["']([A-Za-z0-9_\-=]{30,})["']/gi, group: 1 },
    { name: 'Mixpanel Token', severity: 'medium', re: /(?:mixpanel[^]{0,30})(?:token|api[_-]?key)["'\s:=]+["']([A-Za-z0-9]{32})["']/gi, group: 1 },
    { name: 'Amplitude API Key', severity: 'medium', re: /(?:amplitude[^]{0,30})api[_-]?key["'\s:=]+["']([A-Za-z0-9]{32})["']/gi, group: 1 },
    { name: 'Segment Write Key', severity: 'medium', re: /(?:segment[^]{0,30})write[_-]?key["'\s:=]+["']([A-Za-z0-9]{32,})["']/gi, group: 1 },
    { name: 'Loggly Token', severity: 'medium', re: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.@logs\.loggly\.com/g },
  
    // ── Database / Data Services ──────────────────────────────
    { name: 'DB Connection String', severity: 'critical', re: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis(?:s)?|amqp(?:s)?|couchdb|cassandra|neo4j):\/\/[^\s"'`<>]+/gi },
    { name: 'MySQL Connection String', severity: 'critical', re: /mysql:\/\/[^:]+:[^@]+@[^\s"'`<>/]+(?:\/[^\s"'`<>]*)?/gi },
    { name: 'PostgreSQL Connection String', severity: 'critical', re: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s"'`<>/]+(?:\/[^\s"'`<>]*)?/gi },
    { name: 'MongoDB Connection String', severity: 'critical', re: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s"'`<>]+/gi },
    { name: 'Redis Connection String', severity: 'high', re: /redis(?:s)?:\/\/(?:[^:]*:[^@]*@)?[^\s"'`<>]+/gi },
    { name: 'Elasticsearch URL with creds', severity: 'critical', re: /https?:\/\/[^:]+:[^@]+@[^\s"'`<>]+\.es\.io/gi },
    { name: 'Firebase Realtime DB (private rule)', severity: 'high', re: /[a-z0-9-]+\.firebaseio\.com\/[^\s"'`<>]+\?auth=[^\s"'`&]+/gi },
    { name: 'Supabase Key', severity: 'high', context: /supabase/i, re: /eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{43,}/g },
    { name: 'PlanetScale Token', severity: 'high', re: /pscale_tkn_[A-Za-z0-9_]{43}/g },
    { name: 'Turso DB Token', severity: 'high', re: /(?:turso[^]{0,20})token["'\s:=]+["']([A-Za-z0-9._\-]{40,})["']/gi, group: 1 },
    { name: 'Neon DB Connection', severity: 'high', re: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s"'`<>]+\.neon\.tech/gi },
    { name: 'Xata DB Key', severity: 'high', re: /xau_[A-Za-z0-9]{80,}/g },
  
    // ── Search / CDN / Infrastructure ─────────────────────────
    { name: 'Algolia Admin API Key', severity: 'high', re: /(?:algolia[^]{0,60})(?:admin[_-]?api[_-]?key|api[_-]?key)["'\s:=]+["']([a-f0-9]{32})["']/gi, group: 1 },
    { name: 'Algolia Application ID', severity: 'medium', re: /(?:algolia[^]{0,60})(?:app(?:lication)?[_-]?id)["'\s:=]+["']([A-Z0-9]{10})["']/gi, group: 1 },
    { name: 'Algolia Search-Only Key', severity: 'low', re: /(?:algolia[^]{0,30})?search[_-]?(?:api[_-]?)?key["'\s:=]+["']([a-f0-9]{32})["']/gi, group: 1 },
    { name: 'Typesense API Key', severity: 'high', re: /(?:typesense[^]{0,20})api[_-]?key["'\s:=]+["']([A-Za-z0-9]{24,})["']/gi, group: 1 },
    { name: 'Mapbox Token', severity: 'medium', re: /(?:pk|sk|tk)\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/g },
    { name: 'Cloudinary URL', severity: 'high', re: /cloudinary:\/\/[0-9]{15}:[A-Za-z0-9_\-]+@[a-z0-9\-]+/g },
    { name: 'Fastly Token', severity: 'high', re: /(?:fastly)[^]{0,20}["']([A-Za-z0-9_\-]{32})["']/gi, group: 1 },
    { name: 'Imgix Token', severity: 'medium', re: /(?:imgix[^]{0,20})token["'\s:=]+["']([A-Za-z0-9]{20,})["']/gi, group: 1 },
    { name: 'Contentful Management Token', severity: 'critical', re: /(?:contentful[^]{0,20})management[_-]?token["'\s:=]+["']([A-Za-z0-9_\-]{43,})["']/gi, group: 1 },
    { name: 'Contentful Delivery API Key', severity: 'medium', re: /(?:contentful[^]{0,30})?delivery[_-]?(?:api[_-]?)?(?:key|token)["'\s:=]+["']([A-Za-z0-9_\-]{40,})["']/gi, group: 1 },
  
    // ── SaaS / Productivity ───────────────────────────────────
    { name: 'Postman API Key', severity: 'high', re: /PMAK-[a-f0-9]{24}-[a-f0-9]{34}/g },
    { name: 'Linear API Key', severity: 'high', re: /lin_api_[A-Za-z0-9]{40,}/g },
    { name: 'Notion Token', severity: 'high', re: /(?:secret_|ntn_)[A-Za-z0-9]{40,}/g },
    { name: 'Notion OAuth Token', severity: 'high', re: /notion_oauth_[A-Za-z0-9_\-]{50,}/g },
    { name: 'Airtable API Key', severity: 'high', context: /airtable/i, re: /\bkey[A-Za-z0-9]{14}\b/g },
    { name: 'Airtable Personal Access Token', severity: 'high', re: /pat[A-Za-z0-9]{14}\.[a-f0-9]{64}/g },
    { name: 'Asana PAT', severity: 'high', re: /\b\d\/\d{16}:[a-f0-9]{32}\b/g },
    { name: 'Jira API Token', severity: 'high', re: /(?:jira[^]{0,20})(?:api[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{24,})["']/gi, group: 1 },
    { name: 'Confluence API Token', severity: 'high', re: /(?:confluence[^]{0,20})api[_-]?token["'\s:=]+["']([A-Za-z0-9_\-]{24,})["']/gi, group: 1 },
    { name: 'Zendesk API Token', severity: 'high', re: /(?:zendesk[^]{0,20})(?:api[_-]?token|token)["'\s:=]+["']([A-Za-z0-9\/=+]{40,})["']/gi, group: 1 },
    { name: 'Intercom Access Token', severity: 'high', re: /(?:intercom[^]{0,20})(?:access[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{50,})["']/gi, group: 1 },
    { name: 'HubSpot API Key', severity: 'high', re: /(?:hubspot[^]{0,20})(?:api[_-]?key|token)["'\s:=]+["']([A-Za-z0-9_\-]{36,})["']/gi, group: 1 },
    { name: 'Salesforce Access Token', severity: 'critical', re: /00D[A-Za-z0-9]{15}![A-Za-z0-9._\-]{80,}/g },
    { name: 'Doppler Token', severity: 'high', re: /dp\.(?:pt|st|ct|sa)\.[A-Za-z0-9]{40,}/g },
    { name: 'Pulumi Token', severity: 'high', re: /pul-[a-f0-9]{40}/g },
    { name: 'LaunchDarkly SDK Key', severity: 'high', re: /sdk-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g },
    { name: 'Split.io SDK Key', severity: 'medium', re: /(?:split[^]{0,20})(?:sdk|browser)[_-]?key["'\s:=]+["']([A-Za-z0-9]{32,})["']/gi, group: 1 },
  
    // ── Tokens / Auth (Generic High-Quality) ─────────────────
    { name: 'JWT Token', severity: 'medium', re: /eyJ[A-Za-z0-9_\-]{8,500}\.eyJ[A-Za-z0-9_\-]{8,2000}\.[A-Za-z0-9_\-]{8,700}/g },
    { name: 'GitHub Actions Secret Reference (leaked)', severity: 'medium', re: /\$\{\{\s*secrets\.[A-Z_][A-Z0-9_]+\s*\}\}/g },
    { name: 'CI Secret Env Leak', severity: 'high', re: /(?:GITHUB_TOKEN|GH_TOKEN|ACTIONS_RUNTIME_TOKEN)["'\s:=]+["']([A-Za-z0-9_\-]{20,})/g, group: 1 },
    { name: 'Authorization Bearer', severity: 'high', re: /(?:Authorization|authorization|auth(?:orization)?[_-]?header)\s*[:=]\s*["'](?:[Bb]earer\s+)([a-zA-Z0-9_\-.=:+/]{20,300})["']/g, group: 1 },
    { name: 'Authorization Bearer (headers obj)', severity: 'high', re: /["']Authorization["']\s*:\s*["'][Bb]earer\s+([a-zA-Z0-9_\-.=:+/]{20,300})["']/g, group: 1 },
    { name: 'Authorization Basic', severity: 'high', re: /[Bb]asic\s+[a-zA-Z0-9=:_+/\-]{10,100}/g },
    { name: 'Private Key Block (all types)', severity: 'critical', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ED25519 |PGP |CERTIFICATE )?(?:PRIVATE KEY|SECRET KEY)(?:\s*BLOCK)?-----/g },
    { name: 'Certificate Block', severity: 'medium', re: /-----BEGIN CERTIFICATE-----/g },
    { name: 'Basic Auth in URL', severity: 'critical', re: /[a-zA-Z][a-zA-Z0-9+.\-]{0,15}:\/\/[^/\s:@"']{1,64}:[^/\s:@"']{1,64}@[^\s"'<>]{1,256}/g },
    { name: 'HMAC Secret', severity: 'high', re: /hmac[_\-.]?(?:key|secret)["'\s:=]+["']([A-Za-z0-9+/=_\-]{20,})["']/gi, group: 1 },
    { name: 'OAuth Client Secret', severity: 'high', re: /client[_\-.]?secret["'\s:=]+["']([A-Za-z0-9_\-.~]{20,64})["']/gi, group: 1 },
    { name: 'Cookie Secret / Session Key', severity: 'high', re: /(?:cookie[_-]?secret|session[_-]?secret|session[_-]?key)["'\s:=]+["']([A-Za-z0-9_\-!@#$%^&*]{16,})["']/gi, group: 1 },
    { name: 'Encryption Key (AES/etc)', severity: 'critical', re: /(?:encrypt(?:ion)?[_-]?key|aes[_-]?key|cipher[_-]?key)["'\s:=]+["']([A-Za-z0-9+/=]{32,})["']/gi, group: 1 },
    { name: 'Internal API Token (high entropy)', severity: 'medium', loose: true, re: /(?:api[_-]?token|auth[_-]?token|access[_-]?token|bearer[_-]?token)["'\s:=]+["']?([0-9a-zA-Z_\-.]{32,})["']?/gi, group: 1, entropyMin: 3.5 },
  
    // ── Section D: additional providers ───────────────────────
    { name: 'Databricks Personal Access Token', severity: 'critical', pre: 'dapi', re: /\bdapi[a-f0-9]{32}\b/g },
    { name: 'Vercel API Token', severity: 'critical', re: /\bvercel[^]{0,30}token["'\s:=]+["']([A-Za-z0-9]{24,})/gi, group: 1 },
    { name: 'Vercel Personal Access Token', severity: 'critical', re: /(?:VERCEL_TOKEN|vercel[_-]?(?:api[_-]?)?token)["'\s:=]+["']([A-Za-z0-9]{40,})["']/gi, group: 1 },
    { name: 'Auth0 Client Secret', severity: 'critical', context: /auth0/i, re: /(?:clientSecret|client_secret|AUTH0_CLIENT_SECRET)["'\s:=]+["']([A-Za-z0-9_\-]{32,64})["']/gi, group: 1 },
    { name: 'Auth0 Management API Token', severity: 'critical', context: /auth0/i, re: /(?:management[_-]?token|AUTH0_MGMT_TOKEN)["'\s:=]+["'](eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{43,})["']/gi, group: 1 },
    { name: 'Okta API Token', severity: 'critical', re: /(?:okta[^]{0,30})(?:api[_-]?token|OKTA_API_TOKEN)["'\s:=]+["']([A-Za-z0-9_\-]{42,})/gi, group: 1 },
    { name: 'Okta SSWS Token', severity: 'critical', re: /SSWS\s+[A-Za-z0-9_\-]{42,}/g },
    { name: 'PagerDuty API Key', severity: 'high', re: /(?:pagerduty[^]{0,40})(?:api[_-]?key|token|integration[_-]?key)["'\s:=]+["']([A-Za-z0-9+_\-]{20,})/gi, group: 1 },
    { name: 'PagerDuty Integration Key', severity: 'high', re: /(?:pagerduty[^]{0,80})["']([a-f0-9]{32})["']/gi, group: 1 },
    { name: 'Snowflake Account Identifier', severity: 'medium', re: /["']([a-zA-Z0-9_\-]+\.snowflakecomputing\.com)["']/gi },
    { name: 'Snowflake Private Key File', severity: 'critical', pre: 'private key', re: /-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----[^-]+-----END (?:ENCRYPTED )?PRIVATE KEY-----/g },
    { name: 'Snowflake Connection String', severity: 'critical', re: /snowflake:\/\/[^:]+:[^@]+@[^\s"'`<>]+/gi },
    { name: 'LaunchDarkly Relay Proxy Key', severity: 'high', re: /(?:relay[_-]?proxy[^]{0,30})(?:key|token|secret)["'\s:=]+["']([A-Za-z0-9_\-]{40,})/gi, group: 1 },
    { name: '1Password Service Account Token', severity: 'critical', pre: 'ops_eyj', re: /ops_eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{43,}/g },
    { name: 'Shopify Custom App Token', severity: 'critical', re: /shpusr_[a-fA-F0-9]{32}/g },
    { name: 'Buildkite Agent Token', severity: 'high', re: /(?:buildkite[^]{0,30})(?:agent[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{20,})/gi, group: 1 },
    { name: 'Fly.io Access Token', severity: 'high', re: /\bFlyV1\s+[A-Za-z0-9_\-]{100,}/g },
    { name: 'Fly.io Deploy Token', severity: 'high', re: /FLY_API_TOKEN["'\s:=]+["']([A-Za-z0-9_\-]{40,})/gi, group: 1 },
    { name: 'Railway API Token', severity: 'high', re: /(?:railway[^]{0,30})(?:api[_-]?token|token)["'\s:=]+["']([A-Za-z0-9_\-]{32,})/gi, group: 1 },
    { name: 'New Relic User API Key', severity: 'high', re: /NRAA-[A-Z0-9]{27}/g },
    { name: 'New Relic Browser Key', severity: 'medium', re: /NRBB-[A-Z0-9]{27}/g },
    { name: 'Brex API Token', severity: 'critical', re: /(?:brex[^]{0,30})(?:api[_-]?key|token)["'\s:=]+["']([A-Za-z0-9_\-]{50,})/gi, group: 1 },
    { name: 'Plaid Secret Key', severity: 'critical', re: /(?:plaid[^]{0,30})(?:secret|client[_-]?secret)["'\s:=]+["']([a-z0-9]{30,})/gi, group: 1 },
    { name: 'Plaid Client ID', severity: 'medium', re: /(?:plaid[^]{0,30})client[_-]?id["'\s:=]+["']([a-z0-9]{24,})/gi, group: 1 },
    { name: 'Resend API Key', severity: 'high', pre: 're_', re: /\bre_[A-Za-z0-9_\-]{32,}/g },
    { name: 'Render API Key', severity: 'high', re: /(?:render[^]{0,30})(?:api[_-]?key|token)["'\s:=]+["']([A-Za-z0-9_\-]{32,})/gi, group: 1 },
    { name: 'OpenRouter API Key', severity: 'critical', re: /\bsk-or-v1-[A-Za-z0-9]{64}\b/g },
    { name: 'Groq API Key', severity: 'critical', pre: 'gsk_', re: /\bgsk_[A-Za-z0-9]{52}\b/g },
    { name: 'Perplexity API Key', severity: 'critical', pre: 'pplx-', re: /\bpplx-[a-f0-9]{48}\b/g },
    { name: 'xAI API Key', severity: 'critical', pre: 'xai-', re: /\bxai-[A-Za-z0-9]{58,}\b/g },
    { name: 'ElevenLabs API Key', severity: 'high', re: /(?:elevenlabs|eleven_labs|xi[_-]?api)[^]{0,40}(?:api[_-]?key|key)["'\s:=]+["']([a-f0-9]{32})["']/gi, group: 1 },
    { name: 'Clerk Secret Key', severity: 'critical', context: /clerk/i, re: /\bsk_(?:live|test)_[A-Za-z0-9]{64,}\b/g },
    { name: 'Clerk Publishable Key', severity: 'medium', context: /clerk/i, re: /\bpk_(?:live|test)_[A-Za-z0-9]{64,}\b/g },
    { name: 'Pinecone API Key', severity: 'high', context: /pinecone/i, re: /(?:pinecone[^]{0,40})(?:api[_-]?key|PINECONE_API_KEY)["'\s:=]+["']([A-Za-z0-9_\-]{36,})/gi, group: 1 },
    { name: 'Nango Secret Key', severity: 'critical', pre: 'nango_sk_', re: /\bnango_sk_[A-Za-z0-9_\-]{30,}\b/g },
    { name: 'Loops API Key', severity: 'high', context: /loops/i, re: /(?:loops[^]{0,30})(?:api[_-]?key|LOOPS_API_KEY)["'\s:=]+["']([A-Za-z0-9]{40,})/gi, group: 1 },
    { name: 'Courier API Key', severity: 'high', context: /courier/i, re: /(?:courier[^]{0,30})(?:api[_-]?key|auth[_-]?token|COURIER_AUTH_TOKEN)["'\s:=]+["']([A-Za-z0-9_\-]{30,})/gi, group: 1 },
    { name: 'Infisical Service Token', severity: 'critical', pre: 'st.', re: /\bst\.[a-f0-9]{24}\.[a-f0-9]{64}\.[a-f0-9]{24}\b/g },
    { name: 'Temporal Cloud API Key', severity: 'high', context: /temporal/i, re: /(?:temporal[^]{0,30})(?:api[_-]?key|TEMPORAL_API_KEY)["'\s:=]+["']([A-Za-z0-9_\-]{30,})/gi, group: 1 },
    { name: 'Gitea Personal Access Token', severity: 'high', context: /gitea/i, re: /(?:gitea[^]{0,30})(?:token|api[_-]?token|GITEA_TOKEN)["'\s:=]+["']([A-Za-z0-9_]{40,})/gi, group: 1 },
    // ── Round 3 missing coverage ──────────────────────────────
    { name: 'Mistral API Key', severity: 'critical', pre: 'sk-mistral-', re: /\bsk-mistral-[A-Za-z0-9]{20,}\b/g },
    { name: 'Cohere API Key (co-)', severity: 'high', pre: 'co-', re: /\bco-[A-Za-z0-9]{40}\b/g },
    { name: 'WakaTime API Key', severity: 'high', pre: 'waka_', re: /\bwaka_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g },
    { name: 'Sentry Auth Token (sntrys_)', severity: 'high', pre: 'sntrys_', re: /\bsntrys_[A-Za-z0-9]{64}\b/g },
    { name: 'Doppler Service Token (dp.st)', severity: 'critical', pre: 'dp.st.', re: /\bdp\.st\.[a-z0-9\-_]{2,}\.[A-Za-z0-9]{40,}\b/g },
    { name: 'ngrok Auth Token', severity: 'high', context: /ngrok/i, re: /\b[0-9a-zA-Z]{32}_[0-9a-zA-Z]{16}\b/g },
    { name: 'Telegram Webhook with Bot Token', severity: 'high', re: /https:\/\/api\.telegram\.org\/bot\d{8,10}:AA[A-Za-z0-9_\-]{32,}\//g },
    { name: 'NEXT_PUBLIC secret (leaked env)', severity: 'medium', re: /NEXT_PUBLIC_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)["'\s:=]+["']([^"'\s]{12,})["']/g, group: 1 },
    // ── Round 4 missing coverage ──────────────────────────────
    { name: 'Anthropic API Key (env var)', severity: 'critical', re: /ANTHROPIC_API_KEY["'\s:=]+["']([^"'\s]{40,})["']/g, group: 1 },
    { name: 'Mapbox Secret Token', severity: 'critical', pre: 'sk.eyj', re: /\bsk\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\b/g },
    { name: 'atob() base64 literal', severity: 'low', loose: true, entropyMin: 3.0, re: /atob\s*\(\s*["']([A-Za-z0-9+/]{20,}={0,2})["']\s*\)/g, group: 1 },
    { name: 'process.env hardcoded assignment', severity: 'high', re: /process\.env\.([A-Z_]{5,})\s*=\s*["']([^"'\s]{12,})["']/g, group: 2 },
    { name: 'Webpack DefinePlugin constant', severity: 'medium', re: /__([A-Z_]{5,})__\s*[:=]\s*["']([^"'\s]{12,})["']/g, group: 2 },
    { name: 'import.meta.env secret (Vite client leak)', severity: 'medium', re: /import\.meta\.env\.([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)/g, group: 1 },
    { name: 'Kubernetes inlined secret (base64)', severity: 'high', re: /(?:password|token|\.dockerconfigjson|tls\.key)\s*:\s*([A-Za-z0-9+/]{40,}={0,2})(?=[\s\S]{0,120}(?:kind:\s*Secret|apiVersion))/g, group: 1 },

    // ── Generic (Context-keyed, placeholder-guarded) ──────────
    { name: 'Generic API Key', severity: 'medium', loose: true, re: /(?:api[_-]?key|apikey|x-api-key)["'\s:=]+["']?([0-9a-zA-Z_\-]{16,64})["']?/gi, group: 1, entropyMin: 3.2 },
    { name: 'Generic Secret', severity: 'medium', loose: true, re: /(?:secret|client[_-]?secret|app[_-]?secret)["'\s:=]+["']?([0-9a-zA-Z_\-]{16,64})["']?/gi, group: 1, entropyMin: 3.3 },
    { name: 'Generic Password', severity: 'medium', loose: true, re: /(?:password|passwd|pwd|pass)["'\s:=]+["']([^"'\s]{8,60})["']/gi, group: 1 },
    { name: 'Generic Token', severity: 'low', loose: true, re: /(?:auth[_-]?token|secret[_-]?token|refresh[_-]?token)["'\s:=]+["']?([0-9a-zA-Z_\-.]{24,})["']?/gi, group: 1, entropyMin: 3.3 },
    // Catch-all for high-entropy blobs, but strictly filtered: must be mixed (letters+digits),
    // not a pure-hex hash, not a pure-base64 asset, and assigned to a secret-ish key.
    { name: 'High-Entropy Secret', severity: 'low', loose: true, group: 1, entropyMin: 4.6,
      re: /(?:secret|token|key|passwd|password|auth|credential|sign|private)[A-Za-z_]{0,20}["'\s:=]+["']([A-Za-z0-9+/=_\-]{32,88})["']/gi,
      reject: /^[a-f0-9]+$|^[A-F0-9]+$|^[0-9]+$/ },
  ];
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: ENDPOINT / LINK EXTRACTION (ADVANCED)
  // ═══════════════════════════════════════════════════════════════
  
  // Original LinkFinder-style regex
  const LINK_RE = /(?:"|'|`)((?:[a-zA-Z]{1,10}:\/\/|\/\/)[^"'`/]{1,}\.[a-zA-Z]{2,}[^"'`]{0,}|(?:\/|\.\.\/|\.\/)[^"'`><,;| *()\(%$^/\\\[\]][^"'`><,;|()\s]{1,}|[\w\-./]{1,}\/[\w\-/.]{1,}\.(?:[a-zA-Z]{1,4}|action)(?:[?#][^"'|]{0,})?|[\w\-/]{1,}\/[\w\-/]{3,}(?:[?#][^"'|]{0,})?)(?:"|'|`)/g;
  
  // NEW: fetch() call patterns
  const FETCH_RE = /fetch\s*\(\s*["'`]([^"'`\s]{4,300})["'`]/gi;
  
  // NEW: axios patterns
  const AXIOS_RE = /axios\s*\.\s*(?:get|post|put|patch|delete|request|head|options)\s*\(\s*["'`]([^"'`\s]{4,300})["'`]/gi;
  
  // NEW: XMLHttpRequest patterns
  const XHR_RE = /\.open\s*\(\s*["'`](?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)["'`]\s*,\s*["'`]([^"'`\s]{4,300})["'`]/gi;
  
  // NEW: jQuery AJAX
  const JQUERY_AJAX_RE = /\$\.(?:ajax|get|post|getJSON|getScript)\s*\(\s*["'`]([^"'`\s]{4,300})["'`]/gi;
  
  // NEW: Apollo/GraphQL query endpoints
  const APOLLO_RE = /uri\s*:\s*["'`]([^"'`\s]{4,300})["'`]/gi;
  
  // NEW: import() dynamic imports
  const DYNAMIC_IMPORT_RE = /import\s*\(\s*["'`]([^"'`\s]{4,300})["'`]\s*\)/gi;
  
  // NEW: require() calls that look like URLs or paths
  const REQUIRE_RE = /require\s*\(\s*["'`]((?:\/|https?:\/\/|\.\.?\/)[^"'`\s]{2,200})["'`]\s*\)/gi;
  
  // NEW: window.location assignments
  const LOCATION_RE = /(?:window\.)?location(?:\.href)?\s*=\s*["'`]([^"'`\s]{4,300})["'`]/gi;
  
  // NEW: href/src/action attributes baked into JS strings
  const HREF_RE = /(?:href|src|action|endpoint|url|uri|path|route|baseURL|baseUrl|apiUrl|apiEndpoint)\s*[:=]\s*["'`]([^"'`\s]{4,300})["'`]/gi;
  
  // NEW: next.js / nuxt route definitions
  const NEXTJS_ROUTE_RE = /(?:path|pathname|route|href)\s*:\s*["'`](\/[^"'`\s]{1,200})["'`]/gi;
  
  // NEW: express-style route definitions (app.get/post/etc)
  const EXPRESS_ROUTE_RE = /(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|use|all)\s*\(\s*["'`](\/[^"'`\s]{1,200})["'`]/gi;
  
  // NEW: URL constructor patterns: new URL('/api/v1/users', base)
  const NEW_URL_RE = /new\s+URL\s*\(\s*["'`](\/[^"'`]{1,200})["'`]/gi;
  
  // NEW: string concatenation endpoint patterns
  const STR_CONCAT_RE = /["'`](\/(?:api|v\d+|rest|graphql|gql|rpc|ws|wss|internal|external|private|public|admin|auth|oauth|user|account|data|service|endpoint|webhook|callback)[^"'`\s]{0,100})["'`]/gi;
  
  // NEW: framework data-fetch helpers (Vue/Nuxt useFetch/$fetch, RTK Query baseUrl)
  const FW_FETCH_RE = /(?:useFetch|useSWR|\$fetch|useAsyncData|baseUrl|baseURL)\s*[(:]\s*["'`]([^"'`\s]{2,300})["'`]/gi;

  // Absolute URL regex (incl. ws/wss/grpc schemes)
  const ABS_URL_RE = /(?:https?|wss?|grpcs?):\/\/[^\s"'`<>()\{\}]{4,}/gi;
  
  // FQDN regex (improved to catch more domains)
  const FQDN_RE = /["'`]((?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.){1,6}[a-z]{2,20})["'`]/gi;
  
  // GraphQL operations
  const GRAPHQL_RE = /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/g;
  const GRAPHQL_FIELD_RE = /gql`[\s\S]{0,2000}`/g;
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: JUICY KEYWORD PATTERNS (MASSIVELY EXPANDED)
  // ═══════════════════════════════════════════════════════════════
  
  export const JUICY_PATTERNS = [
    // Admin / Management
    [/admin|superadmin|backoffice|dashboard|manage|panel|control|cms|cpanel|moderator|staff|operator/i, 'admin'],
    // Internal / Private / Sensitive
    [/internal|private|secret|confidential|hidden|restricted|protected|sensitive|classified|embargo/i, 'internal'],
    // Dev / Debug / Test
    [/debug|test|dev|staging|sandbox|local|demo|preview|beta|qa|uat|preprod|smoke|canary/i, 'non-prod'],
    // Auth / Token / Session
    [/token|apikey|api_key|auth|oauth|session|jwt|sso|saml|oidc|bearer|credential|login|signin|signout|logout|password|reset|2fa|mfa|otp|verify|validate/i, 'auth'],
    // File Upload / Import
    [/upload|import|file|attachment|media|image|video|document|export|download|blob|presigned|multipart/i, 'upload'],
    // API Docs / Schema
    [/graphql|graphiql|swagger|openapi|api-docs|playground|introspect|schema|wsdl|wadl|raml|redoc/i, 'api-docs'],
    // Sensitive Files
    [/\.git|\.env|\.json|\.config|backup|\.sql|\.bak|\.old|\.pem|\.key|\.cert|\.crt|\.p12|\.pfx|\.htpasswd|\.htaccess|shadow|passwd/i, 'sensitive-file'],
    // Account / User
    [/password|reset|forgot|register|signup|login|account|profile|me\b|delete|update|role|user|member|customer|subscriber|invite/i, 'account'],
    // Payment / Billing
    [/payment|billing|invoice|checkout|refund|subscription|plan|pricing|order|cart|wallet|transaction|charge|stripe|paypal/i, 'payment'],
    // Redirect / Callback (SSRF / Open Redirect)
    [/redirect|callback|return[_-]?url|next|continue|goto|forward|url=|uri=|dest=|destination|redir/i, 'redirect'],
    // IDOR / Object References
    [/user[_-]?id|account[_-]?id|order[_-]?id|profile[_-]?id|customer[_-]?id|document[_-]?id|record[_-]?id|\bid=\d/i, 'idor'],
    // Credentials / Crypto
    [/key|cred|cert|private|ssh|pgp|gpg|secret|token|seed|mnemonic/i, 'creds'],
    // Cloud / Infrastructure
    [/s3|blob|bucket|storage|cdn|lambda|function|container|kubernetes|docker|ecs|eks|gke/i, 'cloud'],
    // Webhook / Integration
    [/webhook|hook|event|listener|trigger|notification|subscribe|publish|queue|topic|stream/i, 'webhook'],
    // SSRF-friendly
    [/http[s]?:\/\/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost|0\.0\.0\.0|metadata\.google\.internal|169\.254\.169\.254)/i, 'ssrf-target'],
    // GraphQL specific
    [/__typename|__schema|__type|introspectionQuery/i, 'graphql-introspect'],
    // Path traversal indicators
    [/\.\.\//, 'path-traversal'],
    // Version / Legacy endpoints
    [/v[0-9]+\/|\/api\/[0-9]+\/|legacy|deprecated|old|v[0-9]+-|version[0-9]/i, 'versioned-api'],
    // Health / Status / Metrics (info leak)
    [/health|status|metrics|actuator|monitor|ping|alive|ready|info|diagnostics|probe/i, 'health-info'],
    // Source Map (code leak)
    [/\.map$|\.js\.map|sourcemappingurl/i, 'source-map'],
    // Backup / Archive
    [/backup|archive|dump|snapshot|copy|\.tar|\.zip|\.gz|\.bz2|\.7z|\.rar/i, 'backup'],
    // Config
    [/config|configuration|settings|options|preferences|setup|initialize|bootstrap/i, 'config'],
    // Crypto / Wallet / Web3
    [/wallet|blockchain|crypto|ethereum|bitcoin|web3|nft|defi|contract|solidity/i, 'web3'],
    // Feature Flags
    [/feature[_-]?flag|flag|toggle|experiment|variant|ab[_-]?test|rollout/i, 'feature-flag'],
  ];
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: ADVANCED TECHNOLOGY FINGERPRINTING
  // ═══════════════════════════════════════════════════════════════
  
  export const FRAMEWORK_MARKERS = [
    // Frontend frameworks
    ['Next.js', /\/_next\/static\/|__NEXT_DATA__|self\.__next_f|__NEXT_P\b|"__N_SSP"|"__N_SSG"/],
    ['Nuxt.js', /\/_nuxt\/|window\.__NUXT__|__nuxt\b|"nuxt-link"|NUXT_ENV/],
    ['SvelteKit', /\/_app\/immutable\/|__sveltekit|data-sveltekit-|\$app\/navigation/],
    ['Angular', /isAngularZone\(\)|"isAngularZone"|ngDevMode|platformBrowser|"routerLink"|@angular\/core/],
    ['Vue.js', /__vue__|Vue\.component\(|__VUE_(?:DEVTOOLS|HMR)|createElementVNode|defineComponent/],
    ['React', /__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED|__REACT_DEVTOOLS_GLOBAL_HOOK__|react-dom\.production|react-jsx-runtime\.production|__reactRouterVersion|ReactDOM\.render/],
    ['Remix', /RemixBrowser|RemixServer|__remix_manifest|remix-run\/react/],
    ['Astro', /astro-island|astro-root|__ASTRO_ASSETS__|window\.astro/],
    ['Gatsby', /___gatsby|gatsby-image|window\.___GCM|gatsby-plugin/],
    ['Ember.js', /Ember\.Application|ember-cli|ember-component|Ember\.VERSION/],
    ['Backbone.js', /Backbone\.Model|Backbone\.View|Backbone\.Router/],
    ['Alpine.js', /x-data=|x-bind:|Alpine\.start\(\)|x-show|x-if=/],
  
    // Build tools
    ['Webpack', /__webpack_require__|webpackChunk|webpackJsonp|__webpack_modules__/],
    ['Vite', /__vite__mapDeps|\/@vite\/client|import\.meta\.hot|vite\/dist/],
    ['Parcel', /parcel-manifest|parcel-bundle-url/],
    ['esbuild', /\/\/ BUNDLE: esbuild|__esbuild_/],
    ['Rollup', /\/\/ ROLLUP|createCommonjsModule|_rollupPluginBabelHelpers/],
    ['Turbopack', /__turbopack__|TURBOPACK_/],
  
    // State management
    ['Redux', /__redux__|createSlice|configureStore|Redux DevTools/],
    ['Zustand', /zustand\/middleware|create\(\(set,\s*get\)/],
    ['MobX', /makeObservable|makeAutoObservable|mobx-state-tree/],
    ['Recoil', /RecoilRoot|atom\(\{key:|selector\(\{key:/],
    ['Jotai', /jotai\/|useAtom\(|atom\(/],
  
    // API clients
    ['Apollo Client', /ApolloClient|InMemoryCache|useQuery\(|useMutation\(/],
    ['React Query', /useQuery\(|useMutation\(|QueryClient|@tanstack\/react-query/],
    ['SWR', /useSWR\(|SWRConfig|stale-while-revalidate/],
    ['tRPC', /createTRPCReact|createTRPCClient|@trpc\/client/],
  
    // UI libraries
    ['Tailwind CSS', /tailwind(?:css)?\/|tw-|className.*(?:flex|grid|text-|bg-|p-\d|m-\d)/],
    ['Material UI', /@mui\/|MuiButton|MuiTextField|makeStyles|withStyles/],
    ['Ant Design', /antd\/|ant-design|@ant-design/],
    ['Chakra UI', /@chakra-ui\/|ChakraProvider/],
    ['shadcn\/ui', /@radix-ui\/|cmdk|vaul/],
  
    // Backend / Server-side
    ['Express.js', /express\(\)|Router\(\)|app\.listen\(|express\.static/],
    ['Fastify', /fastify\(\)|fastify\.register|@fastify\//],
    ['NestJS', /@nestjs\/core|@Module\(|@Controller\(|@Injectable\(/],
    ['Next.js API Routes', /\/api\/.*\.js|getServerSideProps|getStaticProps/],
  
    // Testing
    ['Jest', /jest\.config\.|expect\(.*\)\.toBe|describe\(|beforeEach\(|afterEach\(/],
    ['Cypress', /cy\.visit|cy\.get\(|cypress\/|Cypress\.env/],
    ['Playwright', /playwright\/|page\.goto|page\.click/],
  
    // Cloud SDKs
    ['AWS SDK', /aws-sdk\/|@aws-sdk\/|AWS\.config\./],
    ['Firebase SDK', /firebase\/app|initializeApp\(|getFirestore|getAuth\(/],
    ['Supabase', /@supabase\/|createClient\(.*supabase/],
  
    // Analytics
    ['Google Analytics 4', /gtag\(|G-[A-Z0-9]{10}|googletagmanager\.com\/gtag/],
    ['Google Analytics UA', /ga\('create|analytics\.js|UA-\d{5,9}-\d/],
    ['Segment', /analytics\.identify|analytics\.track|segment\.com\/analytics/],
    ['Mixpanel', /mixpanel\.init|mixpanel\.track|cdn\.mxpnl\.com/],
    ['Hotjar', /hj\(|hotjar\.com|hjBootstrap|window\.hj/],
    ['Amplitude', /amplitude\.getInstance|amplitude\.logEvent|amplitude\.com\/libs/],
    ['PostHog', /posthog\.identify|posthog\.capture|posthog-js/],
  
    // Feature flags
    ['LaunchDarkly', /LDClient|launchdarkly-js-client-sdk|ldClient\.variation/],
    ['Split.io', /SplitFactory\(|getTreatment\(|split\.io/],
    ['Unleash', /unleash-proxy-client|isEnabled\(/],
  ];
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: SECURITY MISCONFIGURATION PATTERNS (NEW)
  // ═══════════════════════════════════════════════════════════════
  
  export const SECURITY_MISCONFIG_RULES = [
    { name: 'CORS Wildcard (Access-Control header)', severity: 'high', re: /Access-Control-Allow-Origin\s*[:=,]?\s*["']?\*["']?/g },
    { name: 'CORS Credentials + Wildcard (dangerous combo)', severity: 'critical', re: /Access-Control-Allow-Credentials\s*[:=]\s*["']?true["']?/gi },
    { name: 'eval() usage', severity: 'high', re: /\beval\s*\(\s*(?!["'][^'"]{0,50}["']\s*\))[^)]{0,300}\)/g },
    { name: 'innerHTML assignment (dynamic)', severity: 'medium', re: /\.innerHTML\s*[+]?=\s*(?!["'][^"'<]{0,80}["'])[^;]{0,200}/g },
    { name: 'document.write()', severity: 'medium', re: /document\.write\s*\(/g },
    { name: 'dangerouslySetInnerHTML', severity: 'medium', re: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html/g },
    { name: 'postMessage without origin check', severity: 'medium', re: /window\.addEventListener\s*\(\s*["']message["']\s*,[^)]{0,400}\)/g },
    { name: 'postMessage to wildcard origin', severity: 'high', re: /\.postMessage\s*\([^,)]{0,200},\s*["']\*["']\s*\)/g },
    { name: 'Token in localStorage', severity: 'high', re: /localStorage\.setItem\s*\(\s*["'][^"']{0,50}(?:token|key|secret|password|auth|jwt|session)[^"']{0,50}["']/gi },
    { name: 'Token in sessionStorage', severity: 'medium', re: /sessionStorage\.setItem\s*\(\s*["'][^"']{0,50}(?:token|key|secret|password|auth|jwt|session)[^"']{0,50}["']/gi },
    { name: 'Hardcoded Private IP (RFC1918)', severity: 'low', re: /["'`]((?:10\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|172\.(?:1[6-9]|2\d|3[01])\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|192\.168\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)))["'`]/g },
    { name: 'Localhost reference', severity: 'low', re: /["'`](?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?["'`]/g },
    { name: 'AWS IMDS / Cloud Metadata endpoint', severity: 'critical', re: /169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.internal|169\.254\.170\.2/g },
    { name: 'Source Map Exposed', severity: 'medium', re: /\/\/[#@]\s*sourceMappingURL\s*=\s*([^\s]+\.map)/g },
    { name: 'Debug Mode Enabled', severity: 'medium', re: /(?:\bDEBUG\b|debug\s*[:=])\s*(?:true|1|["']true["']|["']1["'])/g },
    { name: 'Console log with secrets', severity: 'low', re: /console\.(?:log|warn|info|debug|error)\s*\([^)]{0,300}(?:token|key|secret|password|auth|credential)[^)]{0,300}\)/gi },
    { name: 'SSL Verification Disabled', severity: 'critical', re: /(?:rejectUnauthorized|verify|ssl_verify|tls_verify|checkServerIdentity)\s*[:=]\s*(?:false|0|"false"|'false')/gi },
    { name: 'Insecure HTTP for External API', severity: 'medium', re: /["'`]http:\/\/(?!localhost|127\.|0\.0\.0\.0|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)(?:[^\s"'`<>]{10,})["'`]/g },
    { name: 'Prototype Pollution Vector', severity: 'high', re: /(?:\[["']__proto__["']\]|\.__proto__\s*=|Object\.(?:assign|defineProperty)\s*\([^,]{0,50},\s*["']__proto__["'])/g },
    { name: 'XSS via jQuery location selector', severity: 'high', re: /\$\s*\(\s*(?:window\.)?location\.(?:hash|search|href)/g },
    { name: 'Open Redirect via location assignment', severity: 'high', re: /(?:window\.)?location(?:\.href)?\s*=\s*(?:[a-zA-Z_$][a-zA-Z0-9_$.]*\.)?(?:params\.|query\.|searchParams\.|hash|search|req\.query|req\.body|req\.params)[^\s;]{0,100}/g },
    { name: 'WebSocket without TLS (ws://)', severity: 'medium', re: /new\s+WebSocket\s*\(\s*["'`]ws:\/\/(?!localhost|127\.)[^"'`]+["'`]\s*\)/g },
    { name: 'Timing Attack (secrets in setTimeout)', severity: 'low', re: /setTimeout\s*\([^,)]{0,200}(?:token|auth|secret|password)[^,)]{0,200},\s*\d{1,6}\s*\)/gi },
    { name: 'hardcoded JWT secret (short)', severity: 'high', re: /jwt\.sign\s*\([^,)]{0,200},\s*["']([^"']{8,50})["']/g },
    { name: 'disabled content security policy', severity: 'medium', re: /Content-Security-Policy[^]{0,50}["']?unsafe-(?:inline|eval)["']?/gi },
    { name: 'Arbitrary file read pattern', severity: 'high', re: /(?:readFile|readFileSync|createReadStream)\s*\([^)]{0,100}(?:req\.|request\.|params\.|query\.)[^)]{0,100}\)/g },
    { name: 'Command injection vector', severity: 'critical', re: /(?:exec|execSync|spawn|spawnSync|execFile)\s*\([^)]{0,200}(?:req\.|request\.|params\.|query\.|body\.)[^)]{0,200}\)/g },
    { name: 'Path traversal via user input', severity: 'high', re: /(?:path\.join|path\.resolve|__dirname)\s*\([^)]{0,200}(?:req\.|request\.|params\.|query\.)[^)]{0,200}\)/g },
    { name: 'eval(atob()) obfuscation chain', severity: 'high', re: /eval\s*\(\s*atob\s*\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)\s*\)/g },
    { name: 'Function() constructor (eval-like)', severity: 'medium', re: /new\s+Function\s*\(\s*["'][^"']{0,200}["']\s*\)/g },
    { name: 'Indirect eval assignment', severity: 'high', re: /(?:const|let|var)\s+\w+\s*=\s*eval\s*[;,)]/g },
    { name: '.constructor() sandbox escape', severity: 'high', re: /\.constructor\s*\(\s*["'][^"']{0,200}["']\s*\)/g },
    { name: 'Token in document.cookie', severity: 'medium', re: /document\.cookie\s*=\s*[^;]{0,120}(?:token|session|auth|jwt|secret|key)/gi },
    { name: 'document.cookie token read', severity: 'low', re: /document\.cookie\s*\.(?:match|split|replace|indexOf)\s*\([^)]{0,80}(?:token|session|auth|jwt)/gi },
    { name: 'localStorage token read (XSS surface)', severity: 'low', re: /localStorage\.getItem\s*\(\s*["'][^"']{0,50}(?:token|key|secret|auth|jwt|session)[^"']{0,50}["']/gi },
    { name: 'fetch credentials: include', severity: 'medium', re: /credentials\s*:\s*["'](?:include|same-origin)["']/g },
    { name: 'SSR state injection (may contain secrets)', severity: 'medium', re: /window\.__(?:INITIAL_STATE|PRELOADED_STATE|NUXT|APOLLO_STATE|NEXT_DATA)__/g },
    { name: 'eval-like string setTimeout/setInterval', severity: 'high', re: /set(?:Timeout|Interval)\s*\(\s*["'][^"']{4,200}["']\s*,/g },
  ];
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: EXTRACTORS
  // ═══════════════════════════════════════════════════════════════
  
  // Derive a cheap mandatory-literal prefilter from a rigid regex (no alternation,
  // no optional parts). If present, we can skip the whole rule with one indexOf when
  // the literal is absent — the standard secret-scanner speedup (ripgrep-style).
  const PREFILTER = new Map(); // rule -> cached prefilter literal ('' = none)
  function prefilterOf(re) {
    const src = re.source;
    if (src.includes('|')) return null;   // alternation → no single literal is mandatory
    // longest literal run (≥5) outside char-classes/escapes is effectively mandatory
    // for a non-alternation pattern → cheap indexOf gate before the (possibly
    // catastrophic) full regex ever runs.
    const lits = src.replace(/\\.|\[[^\]]*\]/g, ' ').match(/[A-Za-z0-9_]{5,}/g);
    if (lits) return lits.sort((a, b) => b.length - a.length)[0].toLowerCase();
    return null;
  }

  export function extractSecrets(text, expanded) {
    expanded = expanded || expandText(text);   // reuse caller's decoded view when provided
    const lc = expanded.toLowerCase();         // for cheap prefilter / context checks
    const out = [];
    const seen = new Set();

    for (const r of SECRET_RULES) {
      // cheap literal prefilter: skip the rule unless its mandatory keyword is present
      let pre = PREFILTER.get(r);
      if (pre === undefined) { pre = r.pre || prefilterOf(r.re) || ''; PREFILTER.set(r, pre); }
      if (pre && !lc.includes(pre)) continue;
      // file-level context gate: an ambiguous pattern only fires if its provider
      // keyword appears somewhere in the file (kills cross-library false positives)
      if (r.context && !r.context.test(expanded)) continue;
      // ponytail: reset shared lastIndex (sequential-safe). Each Web Worker is an isolated
      // module instance, so the "parallel corruption" case never occurs — cloning 210
      // regexes per file just doubled analysis time for zero benefit.
      const re = r.re;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(expanded)) !== null) {
        const val = (r.group != null ? m[r.group] : m[0]) || '';
        const v = val.trim();
        if (m.index === re.lastIndex) re.lastIndex++;
        if (!v || v.length < 4) continue;
        if (r.entropyMin && entropy(v) < r.entropyMin) continue;
        if (r.loose && looksLikePlaceholder(v)) continue;
        if (r.reject && r.reject.test(v)) continue;       // strict negative filter
        const k = r.name + '|' + v;
        if (seen.has(k)) continue;
        seen.add(k);
        // confidence: loose generics = possible; context/pre-gated = likely; strict standalone = confirmed
        const confidence = r.loose ? 'possible' : (r.context || r.pre) ? 'likely' : 'confirmed';
        out.push({
          type: r.name,
          value: v.length > 200 ? v.slice(0, 200) + '…' : v,
          severity: r.severity,
          confidence,
          entropy: Math.round(entropy(v) * 100) / 100,
        });
      }
    }

    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    out.sort((a, b) => rank[b.severity] - rank[a.severity]);
    // cross-type dedup: same value matched by several rules → keep the strongest only
    const byVal = new Map();
    for (const s of out) {
      const cur = byVal.get(s.value);
      if (!cur || rank[s.severity] > rank[cur.severity]) byVal.set(s.value, s);
    }
    return [...byVal.values()].sort((a, b) => rank[b.severity] - rank[a.severity]);
  }

  export function extractSecurityMisconfigs(text, expanded) {
    expanded = expanded || expandText(text);   // run on decoded view → catches obfuscated eval/innerHTML
    const out = [];
    const seen = new Set();

    for (const r of SECURITY_MISCONFIG_RULES) {
      const re = new RegExp(r.re.source, r.re.flags); // clone → parallel-safe
      let m;
      while ((m = re.exec(expanded)) !== null) {
        const v = m[0].slice(0, 150);
        if (m.index === re.lastIndex) re.lastIndex++;
        const k = r.name + '|' + v;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ type: r.name, evidence: v, severity: r.severity });
      }
    }

    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    return out.sort((a, b) => rank[b.severity] - rank[a.severity]);
  }
  
  export function extractLinks(text, expanded) {
    expanded = expanded || expandText(text);   // reuse caller's decoded view when provided
    const links = new Set();
  
    const runRe = (tmpl) => {
      const re = new RegExp(tmpl.source, tmpl.flags); // clone (only 16/file) → parallel-safe
      let m;
      while ((m = re.exec(expanded)) !== null) {
        const v = (m[1] || m[0] || '').trim();
        if (m.index === re.lastIndex) re.lastIndex++;
        if (v && v.length >= 2 && v.length < 500 && !v.includes('*') && !/^\.+$/.test(v)) links.add(v);
      }
    };
  
    runRe(LINK_RE);
    runRe(FETCH_RE);
    runRe(AXIOS_RE);
    runRe(XHR_RE);
    runRe(JQUERY_AJAX_RE);
    runRe(APOLLO_RE);
    runRe(DYNAMIC_IMPORT_RE);
    runRe(REQUIRE_RE);
    runRe(LOCATION_RE);
    runRe(HREF_RE);
    runRe(NEXTJS_ROUTE_RE);
    runRe(EXPRESS_ROUTE_RE);
    runRe(NEW_URL_RE);
    runRe(STR_CONCAT_RE);
    runRe(FW_FETCH_RE);
    runRe(ABS_URL_RE);
  
    return [...links];
  }
  
  export function classify(links) {
    const urls = []; const endpoints = []; const paths = [];
    for (const l of links) {
      if (/^[a-z][a-z0-9+.\-]*:\/\/|^\/\//i.test(l)) urls.push(l);  // any scheme (http/ws/wss/grpc/…)
      else if (/^(?:\/|\.\.?\/)/.test(l)) paths.push(l);
      else if (/^@?[a-z0-9._\-]+\/[a-z0-9._\-]+$/i.test(l)) continue; // npm module specifier (react/jsx-runtime, @scope/pkg), not an endpoint
      else endpoints.push(l);
    }
    return {
      urls: uniq(urls).sort(),
      endpoints: uniq(endpoints).sort(),
      paths: uniq(paths).sort(),
    };
  }
  
  // React/CSS/JS-object noise keys that are not API parameters
  const UI_KEYS = new Set(['className', 'children', 'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus', 'onKeyDown', 'style', 'ref', 'render', 'component', 'class', 'dangerouslySetInnerHTML', 'display', 'position', 'margin', 'padding', 'color', 'fontSize', 'width', 'height', 'flex', 'border']);
  export function extractParams(links, text) {
    const params = new Map();
    const add = (k, v) => {
      if (!k || !/^[\w.\-]{1,60}$/.test(k)) return;
      if (!params.has(k)) params.set(k, []);
      if (v) params.get(k).push(v);
    };
    for (const l of links) {
      const qi = l.indexOf('?');
      if (qi === -1) continue;
      for (const pair of l.slice(qi + 1).split('&')) { const [k, v] = pair.split('='); add(k, v); }
    }
    // POST/JSON body + GraphQL variables: pull keys from `body|data|variables: {...}` objects
    // (matches one nested level so {user:{id,name}} captures user/id/name).
    if (text) {
      const bodyRe = /(?:body|data|variables)\s*:\s*(?:JSON\.stringify\s*\(\s*)?(\{(?:[^{}]|\{[^{}]*\}){1,1500}\})/g;
      const keyRe = /["']?([A-Za-z_$][\w$]{0,59})["']?\s*:/g;
      let bm;
      while ((bm = bodyRe.exec(text)) !== null) {
        let km;
        keyRe.lastIndex = 0;
        while ((km = keyRe.exec(bm[1])) !== null) { if (!UI_KEYS.has(km[1])) add(km[1]); }
      }
    }
    return [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, vals]) => ({
      name: k,
      example: vals[0] || '',
      count: vals.length,
    }));
  }
  
  export function extractDomains(text, links) {
    const d = new Set();
    for (const l of links) {
      if (/^[a-z][a-z0-9+.\-]*:\/\//i.test(l) || l.startsWith('//')) {
        try { d.add(new URL(l.startsWith('//') ? 'https:' + l : l).hostname); } catch { /* bad url */ }
      } else {
        try { d.add(new URL('https://' + l).hostname); } catch { /* not a domain */ }
      }
    }
    const fqdnRe = new RegExp(FQDN_RE.source, FQDN_RE.flags); // clone → parallel-safe
    let m;
    while ((m = fqdnRe.exec(text)) !== null) {
      const h = m[1].toLowerCase();
      if (/^\d+\.\d+(?:\.\d+)?(?:[-.]|$)/.test(h)) continue;     // version string, not a domain (1.0.0, 2.3.1-beta)
      if (!/\.(js|css|png|jpg|jpeg|gif|svg|json|html|php|min|map|woff2?|ttf|eot|ico)$/i.test(h)) d.add(h);
    }
    // NEW: Also extract from URLs with credentials / auth patterns
    const AUTH_URL_RE = /[a-zA-Z][a-zA-Z0-9+.\-]{0,15}:\/\/[^/\s:@"']{1,64}:[^/\s:@"']{1,64}@([^\s"'/<>:]{1,128})/g;
    AUTH_URL_RE.lastIndex = 0;
    while ((m = AUTH_URL_RE.exec(text)) !== null) d.add(m[1]);
  
    return [...d].filter(h => h.includes('.') && h.length > 3).sort();
  }
  
  export function extractGraphql(text) {
    const ops = new Set();
    let m;

    const gqlRe = new RegExp(GRAPHQL_RE.source, GRAPHQL_RE.flags);          // clones → parallel-safe
    const gqlFieldRe = new RegExp(GRAPHQL_FIELD_RE.source, GRAPHQL_FIELD_RE.flags);
    while ((m = gqlRe.exec(text)) !== null) ops.add(m[1]);

    // NEW: extract field names from gql template literals
    while ((m = gqlFieldRe.exec(text)) !== null) {
      const block = m[0];
      // Extract operation names and top-level fields
      const opMatch = block.match(/(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/g) || [];
      opMatch.forEach(op => ops.add(op.replace(/(?:query|mutation|subscription)\s+/, '')));
    }
  
    if (/__schema|__typename|IntrospectionQuery/.test(text)) ops.add('⚠️ introspection present');
    if (/graphiql|GraphiQL/.test(text)) ops.add('⚠️ GraphiQL interface detected');
  
    return [...ops].sort();
  }
  
  // weight reasons so /admin/reset-password outranks /config/non-prod
  const JUICY_WEIGHT = {
    admin: 5, internal: 5, creds: 5, 'ssrf-target': 5, auth: 4, account: 4, idor: 4,
    'sensitive-file': 4, payment: 4, redirect: 3, upload: 3, 'api-docs': 3, webhook: 3,
    'graphql-introspect': 3, backup: 3, 'source-map': 2, cloud: 2, 'versioned-api': 2,
    'non-prod': 2, 'health-info': 2, config: 1, web3: 2, 'feature-flag': 1, 'path-traversal': 4,
  };
  export function juicy(links) {
    const out = [];
    for (const l of links) {
      const reasons = uniq(JUICY_PATTERNS.filter(([re]) => re.test(l)).map(([, r]) => r));
      if (reasons.length) {
        const score = reasons.reduce((s, r) => s + (JUICY_WEIGHT[r] || 1), 0);
        out.push({ path: l, reasons, score });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 10: ADVANCED FINGERPRINTING
  // ═══════════════════════════════════════════════════════════════
  
  export function detectFramework(text) {
    const lc = text.toLowerCase();
    const out = [];
    for (const [name, re] of FRAMEWORK_MARKERS) {
      let pre = PREFILTER.get(re);
      if (pre === undefined) { pre = prefilterOf(re) || ''; PREFILTER.set(re, pre); }
      if (pre && !lc.includes(pre)) continue;
      const m = new RegExp(re.source, re.flags).exec(text); // clone → parallel-safe
      if (m) out.push({ framework: name, evidence: m[0].slice(0, 80) });
    }
    return out;
  }
  
  // NEW: Detect hardcoded environment / stage
  export function detectEnvironment(text) {
    const envs = [];
    const patterns = [
      [/NODE_ENV\s*[:=]\s*["']?(production)["']?/i, 'production'],
      [/NODE_ENV\s*[:=]\s*["']?(staging)["']?/i, 'staging'],
      [/NODE_ENV\s*[:=]\s*["']?(development)["']?/i, 'development'],
      [/NODE_ENV\s*[:=]\s*["']?(test)["']?/i, 'test'],
      [/NEXT_PUBLIC_ENV\s*[:=]\s*["']?([a-z]+)["']?/gi, null],
      [/VITE_APP_ENV\s*[:=]\s*["']?([a-z]+)["']?/gi, null],
      [/REACT_APP_ENV\s*[:=]\s*["']?([a-z]+)["']?/gi, null],
    ];
    for (const [re, label] of patterns) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) envs.push(label || m[1] || m[0]);
    }
    return uniq(envs);
  }
  
  // NEW: Extract all hardcoded IDs (UUIDs, numeric IDs etc.)
  export function extractHardcodedIDs(text) {
    const out = [];
    const seen = new Set();

    const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
    let m;
    UUID_RE.lastIndex = 0;
    while ((m = UUID_RE.exec(text)) !== null) {
      const key = 'UUID|' + m[0].toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push({ type: 'UUID', value: m[0] }); }
    }

    const NUMERIC_ID_RE = /(?:user[_-]?id|account[_-]?id|org[_-]?id|team[_-]?id|customer[_-]?id)\s*[:=]\s*["']?(\d{4,18})["']?/gi;
    NUMERIC_ID_RE.lastIndex = 0;
    while ((m = NUMERIC_ID_RE.exec(text)) !== null) {
      const key = 'NumericID|' + m[1];
      if (!seen.has(key)) { seen.add(key); out.push({ type: 'NumericID', value: m[1] }); }
    }

    return out;
  }
  
  // NEW: Detect version strings
  export function extractVersionStrings(text) {
    const versions = new Set();
    // require full MAJOR.MINOR.PATCH (3 parts) → drops the "1.0" 2-part noise
    const re = /["'`](\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)["'`]/g;
    let m;
    while ((m = re.exec(text)) !== null) versions.add(m[1]);
    return [...versions].sort();
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SECTION 11: WEBPACK CHUNK EXTRACTOR (IMPROVED)
  // ═══════════════════════════════════════════════════════════════
  
  function resolveChunk(rel, baseUrl) {
    if (!baseUrl) return rel;
    try {
      if (rel.startsWith('static/') && baseUrl.includes('/_next/')) {
        return new URL(baseUrl).origin + '/_next/' + rel;
      }
      return new URL(rel, baseUrl).href;
    } catch { return null; }
  }
  
  export function extractChunks(text, baseUrl) {
    const out = new Set();
    const OBJ_MAP_RE = /\{((?:\s*(?:\d+|"\d+")\s*:\s*"[^"]*"\s*,?){3,})\}/g;  // local → no shared lastIndex
    const PAIR_RE = /(\d+)\s*:\s*"([^"]*)"/g;
    const DOTJS_RE = /["'`]\.js["'`]/g;
    let m;
    while ((m = DOTJS_RE.exec(text)) !== null) {
      const end = m.index + m[0].length;
      let seg = text.slice(Math.max(0, end - 1500), end);
      const start = Math.max(seg.lastIndexOf('return'), seg.lastIndexOf('=>'));
      if (start > 0) seg = seg.slice(start);
      if (!/\[\s*\w\s*\]/.test(seg)) continue;
  
      const pfx = seg.match(/["'`]([^"'`]*\/)["'`]/);
      const prefix = pfx ? pfx[1] : '';
  
      const maps = [];
      OBJ_MAP_RE.lastIndex = 0;
      let om;
      while ((om = OBJ_MAP_RE.exec(seg)) !== null) {
        const map = {};
        PAIR_RE.lastIndex = 0;
        let pm;
        while ((pm = PAIR_RE.exec(om[1])) !== null) map[pm[1]] = pm[2];
        if (Object.keys(map).length) maps.push(map);
      }
      if (!maps.length) continue;
  
      const hashMap = maps[maps.length - 1];
      const nameMap = maps.length >= 2 ? maps[0] : null;
      for (const id of Object.keys(hashMap)) {
        const name = nameMap && nameMap[id] != null ? nameMap[id] : id;
        const rel = prefix + name + '.' + hashMap[id] + '.js';
        const u = resolveChunk(rel, baseUrl);
        if (u) out.add(u);
      }
    }
    return [...out].sort();
  }
  
  // NEW: source maps carry the ORIGINAL (unminified) source — biggest recall win
  const SOURCEMAP_RE = /(?:\/\/|\/\*)[#@]\s*sourceMappingURL=([^\s'")*]+)/g;
  export function extractSourceMaps(text, baseUrl) {
    const out = new Set();
    let m;
    const smRe = new RegExp(SOURCEMAP_RE.source, SOURCEMAP_RE.flags); // clone → parallel-safe
    while ((m = smRe.exec(text)) !== null) {
      const u = m[1].trim();
      if (u.startsWith('data:')) continue;
      out.add(baseUrl ? (() => { try { return new URL(u, baseUrl).href; } catch { return u; } })() : u);
    }
    return [...out].sort();
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 12: TOP-LEVEL ANALYZE FUNCTION
  // ═══════════════════════════════════════════════════════════════

  export function analyzeJs(text, baseUrl) {
    const expanded = expandText(text);          // decode ONCE, share with both extractors
    const regexLinks = extractLinks(text, expanded);
    // AST pass recovers runtime-built endpoints regex can't see ("/api/"+v, `/api/${v}`, fetch(u))
    const links = [...new Set([...regexLinks, ...astEndpoints(text)])];
    const { urls, endpoints, paths } = classify(links);
    const secrets = extractSecrets(text, expanded);
    const misconfigs = extractSecurityMisconfigs(text, expanded);
    const params = extractParams(links, expanded);
    const domains = extractDomains(text, links);
    const graphql = extractGraphql(text);
    const juicyHits = juicy(links);
    const framework = detectFramework(text);
    const chunks = extractChunks(text, baseUrl);
    const sourcemaps = extractSourceMaps(text, baseUrl);
    const environment = detectEnvironment(text);
    const hardcodedIds = extractHardcodedIDs(text);
    const versions = extractVersionStrings(text);

    return {
      secrets,
      misconfigs,
      urls,
      endpoints,
      paths,
      params,
      domains,
      graphql,
      juicy: juicyHits,
      framework,
      chunks,
      sourcemaps,
      environment,
      hardcodedIds,
      versions,
      counts: {
        secrets: secrets.length,
        misconfigs: misconfigs.length,
        urls: urls.length,
        endpoints: endpoints.length,
        paths: paths.length,
        params: params.length,
        domains: domains.length,
        graphql: graphql.length,
        juicy: juicyHits.length,
        framework: framework.length,
        chunks: chunks.length,
        sourcemaps: sourcemaps.length,
        environment: environment.length,
        hardcodedIds: hardcodedIds.length,
        versions: versions.length,
      },
      summary: summarize(secrets, misconfigs),
    };
  }

  // weighted triage summary; criticalCount preserves signal that riskScore loses at the 100 cap
  function summarize(secrets, misconfigs) {
    const W = { critical: 40, high: 15, medium: 5, low: 1 };
    let s = 0, criticalCount = 0, highCount = 0, criticalMisconfigCount = 0;
    for (const x of secrets) { s += W[x.severity] || 0; if (x.severity === 'critical') criticalCount++; else if (x.severity === 'high') highCount++; }
    for (const x of misconfigs) { s += (W[x.severity] || 0) / 2; if (x.severity === 'critical') criticalMisconfigCount++; } // misconfigs weigh less than live secrets
    // logarithmic: ~50 for one critical, ~80 for five, ~95 for twenty — stays meaningful at scale
    return { riskScore: Math.min(100, Math.round(Math.log1p(s) * 12)), criticalCount, highCount, misconfigCount: misconfigs.length, criticalMisconfigCount };
  }