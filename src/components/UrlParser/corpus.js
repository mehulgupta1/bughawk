// Labeled corpus for measuring detection precision/recall.
// `expect` = the set of TARGET categories the URL SHOULD trigger ([] = benign).
// Only the high-false-positive "target" categories are scored (see corpus.test.js);
// broad path categories like `endpoints` are intentionally ignored here.
// Grow this over time — every real-world false positive you hit should become a row.

export const TARGET_CATS = ['xss', 'idor', 'sqli', 'ssrf', 'rce', 'lfi', 'redirect', 'secrets'];

export const CORPUS = [
  // --- XSS true positives ---
  { url: 'https://t.com/search?q=<script>alert(1)</script>', expect: ['xss'] },
  { url: 'https://t.com/p?name=<img src=x onerror=alert(1)>', expect: ['xss'] },
  { url: 'https://t.com/v?html=%3Cscript%3Ealert(1)%3C/script%3E', expect: ['xss'] },
  { url: 'https://t.com/p?redirect=javascript:alert(1)', expect: ['xss', 'redirect'] },
  // --- XSS benign ---
  { url: 'https://t.com/search?q=hello world', expect: [] },
  { url: 'https://t.com/articles?title=How to bake bread', expect: [] },
  { url: 'https://t.com/p?name=John Smith', expect: [] },
  { url: 'https://t.com/p?type=data:&format=javascript', expect: [] },

  // --- IDOR true positives ---
  { url: 'https://t.com/account?id=1029384', expect: ['idor'] },
  { url: 'https://t.com/profile?user_id=58213', expect: ['idor'] },
  { url: 'https://t.com/doc?uuid=550e8400-e29b-41d4-a716-446655440000', expect: ['idor'] },
  { url: 'https://t.com/invoice?invoice=99312', expect: ['idor'] },
  // --- IDOR benign ---
  { url: 'https://t.com/list?page=12', expect: [] },
  { url: 'https://t.com/p?id=7', expect: [] },
  { url: 'https://t.com/blog?id=20231107', expect: [] },
  { url: 'https://t.com/items?limit=20&offset=40', expect: [] },

  // --- SQLi true positives ---
  { url: "https://t.com/p?id=1' OR '1'='1", expect: ['sqli'] },
  { url: 'https://t.com/p?id=1 UNION SELECT username,password FROM users', expect: ['sqli'] },
  { url: "https://t.com/q?search=1; DROP TABLE users--", expect: ['sqli'] },
  { url: 'https://t.com/p?id=1 AND sleep(5)', expect: ['sqli'] },
  // --- SQLi benign ---
  { url: 'https://t.com/p?q=select your seat', expect: [] },
  { url: 'https://t.com/p?name=Robert', expect: [] },
  { url: 'https://t.com/order?sort=ascending', expect: [] },

  // --- SSRF true positives ---
  // url/target/u are also Open Redirect param names with URL values -> both.
  { url: 'https://t.com/fetch?url=http://169.254.169.254/latest/meta-data', expect: ['ssrf', 'redirect'] },
  { url: 'https://t.com/proxy?target=http://127.0.0.1:8080/admin', expect: ['ssrf', 'redirect'] },
  { url: 'https://t.com/load?u=file:///etc/passwd', expect: ['ssrf', 'lfi', 'redirect'] },
  { url: 'https://t.com/img?src=http://192.168.0.1/x', expect: ['ssrf'] },
  // --- SSRF benign ---
  { url: 'https://t.com/page?next=/dashboard', expect: [] },
  { url: 'https://t.com/p?lang=en', expect: [] },
  { url: 'https://t.com/p?ref=newsletter', expect: [] },

  // --- RCE true positives ---
  { url: 'https://t.com/p?cmd=;cat /etc/passwd', expect: ['rce'] },
  { url: 'https://t.com/run?exec=`whoami`', expect: ['rce'] },
  { url: 'https://t.com/p?command=ls -la | grep secret', expect: ['rce'] },
  // --- RCE benign ---
  { url: 'https://t.com/p?action=save', expect: [] },
  { url: 'https://t.com/p?run=daily', expect: [] },

  // --- LFI true positives ---
  { url: 'https://t.com/p?file=../../../../etc/passwd', expect: ['lfi'] },
  { url: 'https://t.com/download?path=..%2f..%2f..%2fetc%2fshadow', expect: ['lfi'] },
  { url: 'https://t.com/view?template=/var/www/config.php', expect: ['lfi'] },
  // --- LFI benign ---
  { url: 'https://t.com/p?file=report.pdf', expect: [] },
  { url: 'https://t.com/p?path=home', expect: [] },

  // --- Open Redirect true positives ---
  // next/url/dest are also SSRF param names with URL values -> both.
  { url: 'https://t.com/login?next=https://evil.com', expect: ['redirect', 'ssrf'] },
  { url: 'https://t.com/go?url=//evil.com', expect: ['redirect', 'ssrf'] },
  { url: 'https://t.com/out?dest=https://attacker.example/phish', expect: ['redirect', 'ssrf'] },
  // --- Open Redirect benign ---
  { url: 'https://t.com/login?next=/account/home', expect: [] },
  { url: 'https://t.com/p?redirect=true', expect: [] },
  { url: 'https://t.com/p?return=dashboard', expect: [] },

  // --- Secrets true positives ---
  { url: 'https://t.com/cb?api_key=AKIAIOSFODNN7EXAMPLE', expect: ['secrets'] },
  { url: 'https://t.com/x?token=sk_live_' + '4eC39HqLyjWDarjtT1zdp7dcabcdefg', expect: ['secrets'] },
  { url: 'https://t.com/x?google_api_key=AIzaSyA1234567890abcdefghijklmnopqrstuvw', expect: ['secrets'] },
  // --- Secrets benign ---
  { url: 'https://t.com/x?api_key=demo', expect: [] },
  { url: 'https://t.com/x?token=short', expect: [] },

  // --- Generally benign (tracking, static, ordinary) ---
  { url: 'https://t.com/?utm_source=newsletter&utm_campaign=spring', expect: [] },
  { url: 'https://t.com/article/how-to-cook?lang=en&page=2', expect: [] },
  { url: 'https://t.com/p?gclid=Cj0KCQiA1234567890abcdef', expect: [] },
  { url: 'https://t.com/products?category=shoes&color=red', expect: [] },
];
