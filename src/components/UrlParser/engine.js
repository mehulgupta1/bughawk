// URL Parser engine — pure, DOM-free logic shared by the React component and
// the Web Worker. Keeping it here means the heavy scan can run off the main
// thread without duplicating the category definitions.

export const CATEGORIES = [
  {
    id: 'xss', label: 'XSS', sev: 'critical', pts: 10,
    // Tightened: dropped extremely common generic params (type/format/mode/
    // action/event) that fired false positives with the broad valueCheck.
    params: /[?&](q|s|search|query|keyword|lang|v|view|cat|id|page|name|term|val|text|input|data|ref|redirect|next|url|src|dest|img|source|href|content|value|callback|jsonp|html|code|style|class|onload|onerror|onclick|onmouseover|onfocus|message|msg|output|return|path|to|from|subject|body|comment|description|title|note|label|caption|summary|tag|filter|sort|order|display|render|template|layout|theme)=/i,
    valueCheck: /[?&][^=]+=([^&]*(<script|javascript:|data:|vbscript:|onload=|onerror=|onclick=|onmouseover=|onfocus=|<img|<svg|<iframe|<body|<input|<details|<video|<audio|%3C|%3E|%22|%27|%60|%28|%29|%7B|%7D|&#x|&#\d|\\u003|\\u003c|\\x3c|\\x22)[^&]*)/i
  },
  {
    id: 'idor', label: 'IDOR', sev: 'critical', pts: 10,
    params: /[?&](id|user_id|account|uid|userid|pid|profile|num|no|order|item|record|doc|object|target|key|uuid|guid|oid|ref_id|resource|cid|fid|bid|invoice|ticket|token_id|member|account_id|customer_id|org_id|group_id|role_id|post_id|comment_id|message_id|thread_id|project_id|task_id|file_id|report_id|owner|owner_id|parent_id|entity_id)=/i,
    valueCheck: /[?&][^=]+=(\d{3,15}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})([&\s]|$)/i
  },
  {
    id: 'sqli', label: 'SQLi', sev: 'critical', pts: 10,
    params: /[?&](id|select|report|role|update|query|user|name|sort|where|search|params|process|row|view|table|from|sel|results|sleep|fetch|order|keyword|column|field|delete|string|number|filter|account|chr|union|cat|type|category|page|group|limit|offset|start|end|min|max|between|having|like|match|against)=/i,
    valueCheck: /[?&][^=]+=[^&]*(\b(select|union|insert|update|delete|drop|create|alter|exec|execute|xp_|sp_|information_schema|sysobjects|syscolumns)\b|sleep\s*\(|benchmark\s*\(|pg_sleep|waitfor\s+delay|having\s+1=1|order\s+by\s+\d|group\s+by\s+\d|\bor\b\s+['"\d]+\s*=\s*['"\d]+|\band\b\s+['"\d]+\s*=\s*['"\d]+|'--|--\s|#\s*$|%27--|%23|1=1|1%3D1|'\s*or\s*'1'\s*=\s*'1|%27\s*or\s*%27|0x[0-9a-f]{2,}|\bchar\s*\(|\bconcat\s*\(|\bhex\s*\(|\bunhex\s*\(|\bload_file\s*\(|\binto\s+outfile\b|\bversion\s*\(\s*\))/i
  },
  {
    id: 'ssrf', label: 'SSRF', sev: 'critical', pts: 10,
    params: /[?&](url|uri|path|src|dest|redirect|next|data|ref|site|html|target|open|load|endpoint|feed|host|domain|proxy|img|image|link|page|request|return|go|callback|from|window|resource|to|continue|u|fetch|wsdl|service|api|backend|server|forward|webhook|notify|ping|mirror|pull|remote|origin|location|download|transfer|retrieve|import|connect|source|base_url|api_url|return_url|next_url|redirect_url)=/i,
    strict: /[?&][^=]+=[^&]*(https?:\/\/|ftp:\/\/|file:\/\/|dict:\/\/|gopher:\/\/|ldap:\/\/|ldaps:\/\/|tftp:\/\/|sftp:\/\/|netdoc:\/\/|jar:\/\/|\/\/[^/]|%2F%2F|%2f%2f|@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|%40[a-zA-Z0-9.-]+\.[a-zA-Z]|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0|::1|0x7f[0-9a-f]{6}|0177\.|017[0-7]\.|2130706433|localhost|%6c%6f%63%61%6c|%6C%6F%63%61%6C|l%6fcalhost)/i
  },
  {
    id: 'rce', label: 'RCE', sev: 'critical', pts: 10,
    params: /[?&](cmd|exec|command|execute|ping|query|jump|code|reg|do|func|arg|option|load|process|step|read|function|req|feature|exe|module|payload|run|print|sp|js|shell|bash|sh|invoke|call|dispatch|eval|system|passthru|popen|proc|subprocess|action|method|handler|hook|script|expression|formula|calc|operator|pipe|input|stdin|argv|args|param)=/i,
    valueCheck: /[?&][^=]+=[^&]*(;|\||&&|\|\||`|\$\(|\$\{|%3B|%7C|%26%26|%7C%7C|%60|\$%28|\$%7B|\bnslookup\b|\bwhoami\b|\bid\b|\bcat\s+\/|\bls(\s+-|\s*$)|\bpwd\b|\becho\b|\bwget\s+|\bcurl\s+|\bchmod\b|\bchown\b|\brm\s+-[rf]|\buname\b|\bnetstat\b|\bifconfig\b|\bipconfig\b|\benv\b|\bprintenv\b|\/etc\/passwd|\/etc\/shadow|\/etc\/hosts\b|\/bin\/sh|\/bin\/bash|\/usr\/bin\/python|cmd\.exe|powershell\.exe|powershell\s+-|\beval\s*\(|\bassert\s*\(|\bsystem\s*\(|\bpassthru\s*\(|\bexec\s*\(|\bshell_exec\s*\(|\bproc_open\s*\(|\bpopen\s*\(|\bcreate_function\s*\(|\bcall_user_func\s*\(|\bpreg_replace\s*\(\s*['"]\/.+\/e|\barray_map\s*\(\s*['"]|\bobject_id\s*\()/i
  },
  {
    id: 'lfi', label: 'LFI', sev: 'critical', pts: 10,
    params: /[?&](file|document|folder|root|path|pg|style|pdf|template|php_path|doc|page|name|cat|dir|action|board|date|lang|download|include|archive|load|layout|view|theme|inc|read|content|resource|location|src|href|url|open|retrieve|fetch|get|show|display|render|print|base|home|prefix|suffix|extension|module|plugin|component|config|conf|setting|option|param|type|format)=/i,
    strict: /[?&][^=]+=[^&]*(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%2e\.\/|\.%2e\/|%252e%252e|%252e%252e%252f|%c0%af|%c1%9c|%ef%bc%8f|\.\.%5c|%2e%2e%5c|%252e%252e%255c|\.\.%255c|\/etc\/|\/proc\/self\/|\/var\/|\/root\/|\/home\/|\/windows\/system32\/|\/winnt\/|c:\\|c:%5c|%2fetc%2f|%5cetc%5c|boot\.ini|win\.ini|system\.ini|system32|passwd\b|shadow\b|\/etc\/hosts\b|authorized_keys|id_rsa|\.php\b|\.asp\b|\.aspx\b|\.jsp\b|\.env\b|\.git\/|\.ssh\/|\.aws\/credentials|\.npmrc|\.dockerenv|proc\/self\/environ|proc\/self\/cmdline)/i
  },
  {
    id: 'redirect', label: 'Open Redirect', sev: 'high', pts: 6,
    params: /[?&](url|redirect|redir|return|r|next|dest|destination|goto|link|to|out|target|exit|q|path|continue|forward|data|ref|go|u|uri|prev|return_url|callback|location|l|jump|returnUrl|returnPath|successUrl|back|fallback|follow|service|auth_redirect|login_redirect|logout_redirect|after_login|post_login|after_logout|final_redirect|cancel_url|error_url|fallback_url)=/i,
    strict: /[?&][^=]+=[^&]*(https?:|ftp:|\/\/|%2F%2F|%2f%2f|\\\\|%5C%5C|\/\/\/|%2F%2F%2F|\/{3,}|\/\\|\\\/|%2F\\|\\%2F|https?%3A|%68%74%74%70|javascript:|data:|vbscript:|%0d|%0a|%0D|%0A|@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/)/i
  },
  {
    id: 'ssti', label: 'SSTI', sev: 'high', pts: 6,
    params: /[?&](template|preview|render|view|content|page|lang|locale|layout|format|style|theme|type|name|label|header|footer|body|include|load|display|print|out|show|output|text|html|markup|expression|value|var|variable|msg|message|subject|title|description|caption|note)=/i,
    valueCheck: /[?&][^=]+=[^&]*(\{\{|\}\}|\{%|%\}|\$\{[^}]+\}|\{\{[^}]+\}\}|<%[=\-]?|[=\-]?%>|#\{[^}]+\}|\[#[^\]]+\]|\[=[^\]]+\]|<#[^>]+>|@\{[^}]+\}|__class__|__mro__|__subclasses__|__import__|__globals__|__builtins__|config\[|self\.|request\.|application\.|session\.|lipsum\b|cycler\b|joiner\b|namespace\b|get_flashed_messages|url_for\b|Jinja2|Twig|Smarty|Velocity|Freemarker|Pebble|Mustache|Handlebars|Nunjucks|\$\{7\*7\}|\{\{7\*7\}\}|#\{7\*7\})/i
  },
  {
    id: 'jwt', label: 'JWT in URL', sev: 'high', pts: 6,
    matchFn: (c, full, pairs) => pairs.some((p) => c.params.test(p)) || c.paths.test(full),
    params: /[?&][^=]+=(ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}(\.[A-Za-z0-9_-]{5,})?)/,
    paths: /[?&\/#](ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}(\.[A-Za-z0-9_-]{20,})?)/
  },
  {
    id: 'auth', label: 'Auth/OAuth', sev: 'high', pts: 6,
    matchFn: (c, full, pairs) => (c.paths.test(full) && pairs.some((p) => c.params.test(p))) || pairs.some((p) => c.params.test(p) && c.valueCheck.test(p)),
    params: /[?&](token|access_token|auth|oauth|client_secret|grant_type|api_key|secret|key|pass|password|passwd|authorization|session|sid|jwt|bearer|code|client_id|scope|state|nonce|csrf|_token|auth_token|id_token|refresh_token|x-api-key|appkey|app_secret|app_key|api_secret|private_token|personal_token|device_token|push_token|session_key|session_token|auth_code|verification_code|confirmation_token|magic_link|one_time_token|ott|otp|totp|mfa_token)=/i,
    valueCheck: /[?&][^=]+=[^&]*(Bearer|ey[A-Za-z0-9_-]{15,}|ghp_[A-Za-z0-9]{36,}|glpat-[A-Za-z0-9_\-]{20,})/i,
    paths: /\/(oauth|authorize|callback|sso|saml|login|signout|logout|token|auth|openid|connect|refresh|session|identity|account|profile|me|whoami|credentials|authenticate|verification|validate|verify|confirm|2fa|mfa|webauthn|passkey)(\/|$|\?)/i
  },
  {
    id: 'cors', label: 'CORS/JSONP', sev: 'high', pts: 6,
    params: /[?&](callback|cb|jsonp|origin|cors|referer|access_control|xorigin|cross|format|type|response_type|output|wrap|padding|pad|fn|func|method|handler|on|oncomplete|onload|onsuccess|onerror)=/i,
    valueCheck: /[?&](callback|cb|jsonp|fn|func)=(?!(jQuery|angular|jsonp)\d*)[a-zA-Z_$][a-zA-Z0-9_$.]*|[?&]origin=(https?:\/\/[^&]+)/i
  },
  {
    id: 'upload', label: 'File Upload', sev: 'high', pts: 6,
    matchFn: (c, full, pairs) => c.paths.test(full) && pairs.some((p) => c.params.test(p)),
    params: /[?&](file|upload|attach|img|photo|avatar|image|media|document|doc|logo|icon|thumb|pdf|attachment|blob|data|content|asset|resource|object|binary|multipart|chunk|part|segment|payload|body|stream|buffer|raw|bytes|base64|encoded|file_data|file_content|file_path|file_name|filename|mime|type|ext|extension|format|size|checksum|hash|digest)=/i,
    paths: /\/(upload|attach|import|ingest|media|files|documents|assets|blob|storage|cdn|static|public|private|secure|protected|temp|tmp|cache|upload_chunk|chunked|multipart|resumable|dropzone|filepond)(\/|$|\?)/i
  },
  {
    id: 'endpoints', label: 'Hot Endpoints', sev: 'medium', pts: 3,
    paths: /\/(api|v[0-9]+|admin|dashboard|internal|dev|staging|debug|console|panel|portal|manage|backstage|staff|superadmin|system|config|settings|setup|install|phpinfo|server-status|server-info|wp-admin|wp-login|wp-json|phpmyadmin|adminer|actuator|metrics|health|healthz|ready|readyz|live|livez|swagger|swagger-ui|api-docs|openapi|graphql|graphiql|playground|altair|voyager|__graphql|explorer|redoc|rapidoc|backup|bak|old|test|tmp|temp|trace|heap-dump|thread-dump|dump|info|status|ping|pong|version|build|\.git|\.env|\.htaccess|\.htpasswd|\.svn|\.DS_Store|\.aws|\.ssh|\.bash_history|\.bash_profile|\.zshrc|\.npmrc|\.yarnrc|\.dockerenv|dockerfile|Makefile|web\.config|applicationHost\.config|\.travis\.yml|\.circleci|jenkins|Jenkinsfile|\.github|\.gitlab-ci)(\/|$|\?|\.)/i
  },
  {
    id: 'publicDiscovery', label: 'Public Discovery', sev: 'low', pts: 1,
    paths: /\/(robots\.txt|sitemap\.xml|crossdomain\.xml|security\.txt|\.well-known\/)/i
  },
  {
    id: 'jsfiles', label: 'JS/JSON Files', sev: 'medium', pts: 3,
    paths: /\.(js|jsx|ts|tsx|json|map|env|config\.js|config\.json|settings\.json|swagger\.json|openapi\.json|api-docs\.json|package\.json|composer\.json|Gemfile\.lock|requirements\.txt|yarn\.lock|package-lock\.json|\.babelrc|\.eslintrc|tsconfig\.json|webpack\.config\.js|next\.config\.js|nuxt\.config\.js|vite\.config\.js|angular\.json|manifest\.json|app\.js|bundle\.js|main\.js|index\.js|runtime\.[a-f0-9]+\.js|chunk\.[a-f0-9]+\.js|[a-f0-9]{8,}\.[a-z0-9]+\.js)(\?|$)/i
  },
  {
    id: 's3', label: 'S3/Cloud', sev: 'medium', pts: 3,
    paths: /(s3\.amazonaws\.com|s3-[a-z0-9-]+\.amazonaws\.com|s3\.[a-z0-9-]+\.amazonaws\.com|\.s3\.amazonaws\.com|storage\.googleapis\.com|blob\.core\.windows\.net|digitaloceanspaces\.com|backblazeb2\.com|r2\.cloudflarestorage\.com|objects\.githubusercontent\.com|aliyuncs\.com\/|oss-[a-z0-9-]+\.aliyuncs\.com|cos\.[a-z0-9-]+\.myqcloud\.com|obs\.[a-z0-9-]+\.myhuaweicloud\.com|[a-z0-9-]+\.nyc3\.digitaloceanspaces\.com|[a-z0-9-]+\.sfo2\.digitaloceanspaces\.com|[a-z0-9-]+\.sgp1\.digitaloceanspaces\.com)/i
  },
  {
    id: 'secrets', label: 'Secrets Leak', sev: 'critical', pts: 10,
    params: /[?&](api_key|apikey|api_secret|client_secret|secret_key|private_key|signing_key|access_key|aws_access|aws_secret|password|passwd|pass|token|bearer|authorization|auth_token|session_token|x-api-key|appkey|app_secret|db_pass|db_password|database_password|smtp_pass|smtp_password|ftp_pass|redis_password|mongo_password|mysql_password|postgres_password|encryption_key|decryption_key|hmac_key|jwt_secret|webhook_secret|stripe_key|twilio_token|sendgrid_key|mailchimp_key|slack_token|github_token|gitlab_token|bitbucket_token|heroku_api_key|firebase_token|google_api_key|azure_key|gcp_key|openai_key|anthropic_key|huggingface_token)=/i,
    valueCheck: /[?&][^=]+=[^&]*(AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_\-]{35}|sk-[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{20,}|pk_live_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_\-]{20,}|xox[baprs]-[A-Za-z0-9\-]{10,}|gh[pousr]_[A-Za-z0-9]{36,}|glpat-[A-Za-z0-9_\-]{20,}|SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}|key-[a-z0-9]{32}|AC[a-z0-9]{32}|AP[a-z0-9]{32}|EAAB[A-Za-z0-9]{100,}|eyJhbGciO[A-Za-z0-9_\-]{20,}|r0\.[A-Za-z0-9_\-]{28}|Bearer\s+[A-Za-z0-9_\-\.]{20,})([&\s]|$)/
  },
  {
    id: 'awsKeys', label: 'AWS Keys', sev: 'critical', pts: 10,
    matchFn: (c, full, pairs) => c.paths.test(full) || pairs.some((p) => c.params.test(p) && c.valueCheck.test(p)),
    paths: /(AKIA|AGPA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
    params: /[?&](aws_access_key|aws_access_key_id|aws_secret|aws_secret_access_key|aws_token|aws_session_token|x-amz-security-token|X-Amz-Credential|x-amz-date|AWSAccessKeyId|aws_key|aws_id)=/i,
    valueCheck: /[?&](aws_access_key|aws_access_key_id|AWSAccessKeyId)=[^&]*(AKIA|AGPA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/
  },
  {
    id: 'firebase', label: 'Firebase', sev: 'high', pts: 6,
    matchFn: (c, full, pairs) => c.paths.test(full) || pairs.some((p) => c.params.test(p)),
    paths: /(firebaseio\.com|firestore\.googleapis\.com|firebase\.google\.com|appspot\.com\/.*\b(rtdb|firestore|storage)\b|\.firebaseapp\.com|firebasestorage\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)/i,
    params: /[?&](auth|token|key)=[^&]*(AIza[A-Za-z0-9_\-]{35}|[A-Za-z0-9_\-]{100,})/
  },
  {
    id: 'takeover', label: 'Sub Takeover', sev: 'high', pts: 6,
    paths: /(NoSuchBucket|NoSuchKey|herokucdn\.com|azurewebsites\.net|github\.io|\.s3\.amazonaws\.com|unbouncepages\.com|helpscoutdocs\.com|freshdesk\.com|desk\.com|zendesk\.com|statuspage\.io|uservoice\.com|ghost\.io|strikingly\.com|webflow\.io|cargo\.site|launchrock\.com|tumblr\.com|wordpress\.com|pantheonsite\.io|wpengine\.com|kinstacdn\.com|myshopify\.com|squarespace\.com|fastly\.net\/errors|there-is-no-such-a-user|Invalid\+request|Repository not found|project not found|This UserVoice subdomain is currently available|is not a registered InCloud YouTrack)/i
  },
  {
    id: 'xxe', label: 'XXE', sev: 'critical', pts: 10,
    params: /[?&](xml|data|body|input|payload|content|document|doc|feed|soap|wsdl|request|query|upload|import|load|source|message|packet|envelope|stream|text|raw|schema|dtd|xsl|xslt|transform|svg|rss|atom|opml|sitemap)=/i,
    valueCheck: /[?&][^=]+=[^&]*(<\?xml|<!DOCTYPE|<!ENTITY|SYSTEM\s+["']|PUBLIC\s+["']|%[a-zA-Z][a-zA-Z0-9_-]*;|&#x[0-9a-fA-F]+;|<!\[CDATA\[|%xxe|xxe_test|file:\/\/|expect:\/\/|php:\/\/|jar:\/\/|netdoc:\/\/|%2F%2F[a-zA-Z]|\/etc\/passwd|\/etc\/shadow|\/windows\/win\.ini)/i
  },
  {
    id: 'crlf', label: 'CRLF Injection', sev: 'medium', pts: 3,
    params: /[?&](url|redirect|redir|next|dest|return|location|path|uri|ref|src|href|data|content|text|value|input|name|title|header|subject|body|msg|message|lang|locale|format|output|callback|from|to|host|origin|referer|q|search|query|term|keyword|param|page|view|type|action|id|sort|order|filter|mode|event|tag|label|note|comment|description|summary|caption)=/i,
    valueCheck: /[?&][^=]+=[^&]*(%0d%0a|%0D%0A|%0d|%0a|%0D|%0A|\r\n|\r|\n|%23|%00|\\r|\\n|\\r\\n|%5Cr|%5Cn|%E5%98%8A|%E5%98%8D|U\+000A|U\+000D|\u000a|\u000d)/i
  },
  {
    id: 'protoPollution', label: 'Prototype Pollution', sev: 'medium', pts: 3,
    matchFn: (c, full, pairs) => pairs.some((p) => c.params.test(p)),
    params: /[?&]([^=]*\[__proto__\]|[^=]*\[constructor\]|[^=]*\[prototype\]|__proto__|constructor\[prototype\]|__proto__\[|prototype\[|constructor\.|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__|hasOwnProperty|isPrototypeOf|propertyIsEnumerable|__proto__\.constructor)=/i,
    valueCheck: /[?&][^=]*(\[__proto__\]|\[constructor\]|\[prototype\])[^=]*=[^&]*([^&]{1,})/i
  },
  {
    id: 'graphql', label: 'GraphQL Introspect', sev: 'critical', pts: 10,
    params: /[?&]query=/i,
    valueCheck: /[?&]query=[^&]*(\{|%7B)[^&]*(__schema|__type)/i
  },
  {
    id: 'massAssign', label: 'Mass Assignment', sev: 'high', pts: 6,
    params: /[?&](role|is_admin|admin|user\[role\]|user\[is_admin\]|user\[is_active\]|permissions|privilege)=/i
  },
  {
    id: 'headerInject', label: 'Header Inject', sev: 'high', pts: 6,
    params: /[?&](x-forwarded-for|x-original-url|x-rewrite-url|x-forwarded-host|x-host|x-custom-ip-authorization|client-ip|true-client-ip|cluster-client-ip)=/i
  },
  {
    id: 'deserialization', label: 'Deserialization', sev: 'critical', pts: 10,
    params: /[?&](data|obj|object|state|payload|session|token|viewstate)=/i,
    valueCheck: /[?&][^=]+=[^&]*(rO0AB|O:[0-9]+:"|%4f%3a[0-9]+%3a%22|Tzo[0-9]+|AAEAAAD\/\/\/\/\/)/i
  },
  {
    id: 'git', label: 'Git Exposure', sev: 'critical', pts: 10,
    matchFn: (c, full, pairs) => c.paths.test(full) || pairs.some((p) => c.valueCheck.test(p)),
    paths: /\/\.git\/(config|HEAD|index|logs\/|objects\/|refs\/)/i,
    valueCheck: /[?&][^=]+=[^&]*(ghp_[A-Za-z0-9]{36,}|glpat-[A-Za-z0-9_\-]{20,})/i
  },
  {
    id: 'sensitivePaths', label: 'Sensitive Paths', sev: 'high', pts: 6,
    paths: /\/(reset\/confirm|password\/reset|invite|payment|unsubscribe|verify\/token|auth\/callback|checkout|billing|invoices|card_update|webhook)(\/|$|\?)/i
  },
  {
    id: 'custom_regex', label: 'Custom Regex', sev: 'custom', pts: 5
  }
];

export const SOURCES = ['GAU', 'Waymore', 'WaybackURLs', 'Katana', 'GoSpider', 'Hakrawler', 'Custom'];

// Explicit severity ranking — never infer severity from points (a custom rule
// at 5pts must not outrank a 6pt 'high').
export const SEV_RANK = { critical: 5, high: 4, medium: 3, low: 2, custom: 1, info: 0 };

// Defensive: if a category regex ever gets a /g flag, .test() carries lastIndex
// between calls and silently alternates. Reset before use.
function resetCat(cat) {
  if (cat.params) cat.params.lastIndex = 0;
  if (cat.paths) cat.paths.lastIndex = 0;
  if (cat.strict) cat.strict.lastIndex = 0;
  if (cat.valueCheck) cat.valueCheck.lastIndex = 0;
}

// Per-param matching: a value category matches only when the SAME param's name
// and value both match (kills cross-param false positives). `pairs` is the list
// of single `?key=value` targets; `full` is the whole URL (for path checks).
const anyName = (cat, pairs) => pairs.some((p) => cat.params.test(p));
const anyNameValue = (cat, pairs) => pairs.some((p) => cat.params.test(p) && cat.valueCheck.test(p));
const anyNameStrict = (cat, pairs) => pairs.some((p) => cat.params.test(p) && cat.strict.test(p));

// Generic matcher used for any category without its own matchFn.
function genericMatch(cat, full, pairs) {
  if (cat.strict) return anyNameStrict(cat, pairs);
  if (cat.valueCheck) return anyNameValue(cat, pairs);
  if (cat.params && cat.paths) return anyName(cat, pairs) || cat.paths.test(full);
  if (cat.params) return anyName(cat, pairs);
  if (cat.paths) return cat.paths.test(full);
  return false;
}

export function entropy(s) {
  if (!s || s.length < 2) return 0;
  const freq = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  return -Object.values(freq).reduce((acc, v) => {
    const p = v / s.length;
    return acc + p * Math.log2(p);
  }, 0);
}

export function escapeHtml(unsafe) {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const getSevColor = (sev) => {
  switch (sev) {
    case 'critical': return '#ef4444';
    case 'high': return '#f59e0b';
    case 'medium': return '#3b82f6';
    case 'low': return '#6b7280';
    case 'custom': return '#8b5cf6';
    default: return '#6b7280';
  }
};

// Full-URL target for path/host checks (encoded + decoded copy, \x00-separated
// so a `.*` can't bleed across the boundary).
function fullTargetOf(normUrl, decode) {
  return decode ? `${normUrl}\x00${safeDecode(normUrl)}` : normUrl;
}

// Per-param targets: one `?key=value` string per param (encoded + decoded),
// excluding pure tracking params. Value categories test these individually so a
// name in param A and a payload in param B can never combine into a false hit.
function pairTargetsOf(normUrl, decode) {
  const qi = normUrl.indexOf('?');
  if (qi === -1) return [];
  const out = [];
  for (const pair of normUrl.slice(qi + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
    if (TRACKING_PARAMS.has(key)) continue;
    out.push(decode ? `?${pair}\x00?${safeDecode(pair)}` : `?${pair}`);
  }
  return out;
}

// --- Confidence layer (Tier 1: kills "false certainty") ---

export const CONF_RANK = { high: 3, medium: 2, low: 1 };
const higherConf = (a, b) => (CONF_RANK[b] > CONF_RANK[a] ? b : a);

// Params commonly present on benign URLs — used to DEMOTE confidence (broad set,
// includes some generic names, so only used for scoring, not to skip matching).
export const SAFE_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid', 'dclid', 'mc_cid', 'mc_eid', '_ga', '_gl',
  'ref_src', 'igshid', 'spm', 'cb', 'v', '_', 'ts', 't', 'rnd', 'cache',
]);

// Pure tracking params — safe to EXCLUDE from matching entirely (a payload in
// utm_source is not a real finding). Conservative subset of SAFE_PARAMS.
export const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid', 'dclid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'igshid',
]);

// Well-known CDN / analytics hosts — an SSRF param pointing here is almost
// always intended, so it stays low confidence.
const KNOWN_SAFE_HOST = /(googleapis\.com|gstatic\.com|cloudfront\.net|akamai|fastly\.net|jsdelivr\.net|cdnjs|unpkg\.com|bootstrapcdn|gravatar\.com|googletagmanager|google-analytics|fbcdn\.net|ytimg\.com|cdn\.)/i;

// Date / timestamp shapes that masquerade as numeric ids.
const looksLikeDate = (s) => /^(?:19|20)\d{6}$/.test(s) || /^\d{10}$/.test(s) || /^\d{13}$/.test(s);

// Classify a (decoded) parameter value into a coarse type.
export function classifyValue(v) {
  if (v === '') return 'empty';
  if (/^(true|false)$/i.test(v)) return 'bool';
  if (/^-?\d+$/.test(v)) return 'int';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return 'uuid';
  if (/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)) return 'jwt';
  if (/^https?:\/\//i.test(v) || /^\/\//.test(v) || /^https?%3a/i.test(v) || /^%2f%2f/i.test(v)) return 'url';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'email';
  if (/^[0-9a-f]{16,}$/i.test(v)) return 'hex';
  if (v.length >= 16 && v.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v)) return 'base64';
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(v)) return 'slug';
  if (/^[\w.\- ]+$/.test(v)) return 'text';
  return 'other';
}

// Extract decoded params with their classified types from a normalized URL.
function paramsOf(normUrl) {
  const qi = normUrl.indexOf('?');
  if (qi === -1) return [];
  const out = [];
  try {
    for (const [key, value] of new URLSearchParams(normUrl.slice(qi))) {
      out.push({ key, value, type: classifyValue(value) });
    }
  } catch { /* ignore */ }
  return out;
}

const META_HOST = /(169\.254\.169\.254|metadata\.google|metadata|127\.|0\.0\.0\.0|::1|localhost|169\.254\.|192\.168\.|10\.\d|172\.(?:1[6-9]|2\d|3[01])\.|2130706433|0x7f[0-9a-f]{6}|0177\.)/i;
const DANGER_SCHEME = /\b(file|gopher|dict|ldap|ldaps|jar|netdoc|ftp|tftp|sftp):/i;

// How confident are we this matched category is a *real* candidate (not noise)?
// `params` is the classified param list for the URL.
export function computeConfidence(catId, params) {
  switch (catId) {
    case 'ssrf': {
      for (const p of params) if (META_HOST.test(p.value) || DANGER_SCHEME.test(p.value)) return 'high';
      let best = 'low';
      for (const p of params) {
        if (p.type === 'url') best = higherConf(best, KNOWN_SAFE_HOST.test(p.value) ? 'low' : 'medium');
      }
      return best;
    }
    case 'idor': {
      let best = 'low';
      for (const p of params) {
        if (p.type === 'uuid') best = higherConf(best, 'medium');
        else if (p.type === 'int') {
          if (looksLikeDate(p.value)) continue; // date/timestamp, not an object id
          const n = p.value.replace('-', '').length;
          if (n >= 7) best = higherConf(best, 'high');
          else if (n >= 4) best = higherConf(best, 'medium');
        }
      }
      return best;
    }
    case 'redirect': {
      for (const p of params) {
        if (p.type === 'url' || /javascript:|data:|vbscript:/i.test(p.value)) return 'high';
      }
      for (const p of params) if (p.type === 'bool' || p.type === 'int' || p.type === 'empty') return 'low';
      return 'medium';
    }
    case 'sqli': {
      for (const p of params) {
        if (/('|%27|--|\bunion\b|\bselect\b[\s\S]*\bfrom\b|\b(or|and)\b\s*['"\d]+\s*=|sleep\s*\(|benchmark\s*\(|;)/i.test(p.value)) return 'high';
      }
      return 'medium';
    }
    case 'xss': {
      for (const p of params) {
        if (/(<\s*(script|img|svg|iframe|body|details|input)|javascript:|on\w+\s*=|%3c\s*script|&#x)/i.test(p.value)) return 'high';
      }
      return 'medium';
    }
    // Payload/path categories that are specific enough to trust when matched.
    case 'secrets': case 'awsKeys': case 'git': case 'graphql': case 'jwt':
    case 'lfi': case 'rce': case 'xxe': case 'deserialization': case 'firebase':
      return 'high';
    case 'endpoints': case 'jsfiles': case 's3': case 'publicDiscovery':
      return 'low';
    default:
      return 'medium';
  }
}

// Main engine — synchronous and DOM-free. `onProgress(percent, text)` is
// optional. Returns { results, stats }.
export function runEngine(lines, opts, onProgress) {
  const { checks, minLen, entThresh, customRegexes } = opts;

  const compiledCustom = (customRegexes || [])
    .map((cr) => { try { return new RegExp(cr.pattern, 'i'); } catch { return null; } })
    .filter(Boolean);

  let processedCount = 0;
  let skippedCount = 0;
  const normalizedMap = new Map();

  // Time-throttle progress so a tight loop over 100k+ URLs can't fire dozens of
  // synchronous React state updates.
  let lastProgressAt = 0;
  const report = (pct, text) => {
    if (!onProgress) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - lastProgressAt < 100) return;
    lastProgressAt = now;
    onProgress(pct, text);
  };

  // 1. Normalization
  for (let i = 0; i < lines.length; i++) {
    if (i % 2000 === 0) {
      report(Math.round((i / lines.length) * 50), `Normalizing: ${i.toLocaleString()} / ${lines.length.toLocaleString()}`);
    }
    const probe = parseInputLine(lines[i]);
    const raw = probe.url;
    processedCount++;
    let current = raw;
    let skip = false;

    let parsedObj;
    if (checks.isURL || checks.hasHost || checks.noLocal || checks.noBlank || checks.minLen || checks.noFrag || checks.normParam) {
      try {
        parsedObj = new URL(current);
      } catch {
        if (checks.isURL) skip = true;
      }
    }

    if (!skip && parsedObj) {
      if (checks.hasHost && !parsedObj.hostname) skip = true;
      if (
        checks.noLocal &&
        (parsedObj.hostname === 'localhost' ||
          parsedObj.hostname.startsWith('127.') ||
          parsedObj.hostname === '0.0.0.0' ||
          parsedObj.hostname === '[::1]' ||
          parsedObj.hostname === '::1')
      ) {
        skip = true;
      }
      if (!skip && checks.noFrag) { parsedObj.hash = ''; current = parsedObj.toString(); }

      if (!skip && (checks.noBlank || checks.minLen || checks.normParam)) {
        const params = new URLSearchParams(parsedObj.search);
        const paramArr = [];
        for (const [key, value] of params.entries()) {
          if (checks.noBlank && value === '') continue;
          if (checks.minLen && value.length < minLen) continue;
          paramArr.push([key, value]);
        }
        if (checks.normParam) paramArr.sort((a, b) => a[0].localeCompare(b[0]));
        const newParams = new URLSearchParams();
        paramArr.forEach(([k, v]) => newParams.append(k, v));
        parsedObj.search = newParams.toString();
        current = parsedObj.toString();
      }
    }

    if (!skip && checks.noImg && /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|bmp|mp4|mp3)(\?|$)/i.test(current)) skip = true;
    if (!skip && checks.noExt && /\.(css|map)(\?|$)/i.test(current)) skip = true;

    if (skip) { skippedCount++; continue; }
    if (checks.uniq && normalizedMap.has(current)) {
      // Same normalized form seen before — record dupes + any new method/status
      // observation (so the verb / env-drift matrices see every observation).
      const e = normalizedMap.get(current);
      e.dupeCount++;
      e.methods.add(probe.method);
      if (probe.status != null) e.statuses.add(probe.status);
      skippedCount++;
      continue;
    }

    let highEntropy = false;
    if (checks.entropy && parsedObj) {
      const params = new URLSearchParams(parsedObj.search);
      for (const [, value] of params.entries()) {
        if (entropy(value) >= entThresh) { highEntropy = true; break; }
      }
      // Also catch high-entropy PATH segments (JWTs / hashes embedded in path).
      if (!highEntropy) {
        for (const seg of parsedObj.pathname.split('/')) {
          if (seg.length > 8 && entropy(seg) >= entThresh) { highEntropy = true; break; }
        }
      }
    }

    // Store hostname now so phase 2 doesn't re-run `new URL()` on every entry.
    normalizedMap.set(current, {
      url: current, highEntropy, original: raw, hostname: parsedObj ? parsedObj.hostname : '', dupeCount: 0,
      methods: new Set([probe.method]),
      statuses: new Set(probe.status != null ? [probe.status] : []),
    });
  }

  // 2. Scoring
  const stats = {
    total: processedCount,
    skipped: skippedCount,
    matched: 0,
    criticals: 0,
    conf_high: 0,
    conf_medium: 0,
    conf_low: 0,
    domainBreakdown: {},
    ...Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])),
  };
  const results = [];

  const MAX_DOMAINS = 500;
  let domainCount = 0;
  const normalizedArr = [...normalizedMap.values()];
  for (let i = 0; i < normalizedArr.length; i++) {
    if (i % 2000 === 0) {
      report(50 + Math.round((i / normalizedArr.length) * 50), `Scanning: ${i.toLocaleString()} / ${normalizedArr.length.toLocaleString()}`);
    }
    const data = normalizedArr[i];
    const normUrl = data.url;
    // Reuse the hostname captured in phase 1; cap the breakdown so a scan with
    // tens of thousands of unique subdomains can't bloat the result payload.
    if (data.hostname) {
      if (data.hostname in stats.domainBreakdown) stats.domainBreakdown[data.hostname]++;
      else if (domainCount < MAX_DOMAINS) { stats.domainBreakdown[data.hostname] = 1; domainCount++; }
    }

    const fullTarget = fullTargetOf(normUrl, checks.decodePct);
    const pairTargets = pairTargetsOf(normUrl, checks.decodePct);

    let score = 0;
    const matchedCats = [];
    let isCritical = false;

    for (const cat of CATEGORIES) {
      if (cat.id === 'custom_regex') continue;
      resetCat(cat);
      const matched = cat.matchFn
        ? cat.matchFn(cat, fullTarget, pairTargets)
        : genericMatch(cat, fullTarget, pairTargets);

      if (matched) {
        matchedCats.push(cat);
        score += cat.pts;
        stats[cat.id]++;
        if (cat.sev === 'critical') isCritical = true;
      }
    }

    if (compiledCustom.some((re) => re.test(normUrl))) {
      matchedCats.push({ id: 'custom_regex', sev: 'custom', pts: 5 });
      score += 5;
      stats.custom_regex++;
    }

    if (matchedCats.length > 0) {
      if (isCritical) stats.criticals++;
      stats.matched++;
      let highestSev = 'low';
      matchedCats.forEach((c) => {
        if ((SEV_RANK[c.sev] ?? -1) > (SEV_RANK[highestSev] ?? -1)) highestSev = c.sev;
      });

      // Confidence: per-category signal strength, then take the strongest.
      const params = paramsOf(normUrl);
      const onlySafeParams = params.length > 0 && params.every((p) => SAFE_PARAMS.has(p.key));
      let confidence = 'low';
      for (const c of matchedCats) {
        confidence = higherConf(confidence, computeConfidence(c.id, params));
      }
      // A URL whose only params are tracking/cache params is almost never the bug.
      if (onlySafeParams && confidence === 'high') confidence = 'medium';
      stats[`conf_${confidence}`] = (stats[`conf_${confidence}`] || 0) + 1;

      results.push({
        url: normUrl,
        original: data.original,
        score,
        severity: highestSev,
        confidence,
        categories: matchedCats.map((c) => c.id),
        highEntropy: data.highEntropy,
        dupeCount: data.dupeCount,
        methods: [...data.methods],
        statuses: [...data.statuses],
      });
    }
  }

  // Deterministic ordering: score, then severity rank, then URL (stable across
  // JS engines so re-runs and exports are reproducible).
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const sr = (SEV_RANK[b.severity] ?? -1) - (SEV_RANK[a.severity] ?? -1);
    if (sr !== 0) return sr;
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
  });
  return { results, stats };
}

// Collapse a single path segment to a placeholder if it looks dynamic.
function templateSegment(seg) {
  if (!seg) return seg;
  if (/^\d+$/.test(seg)) return '{num}';
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(seg)) return '{uuid}';
  if (/^\d{4}-\d{2}-\d{2}$/.test(seg)) return '{date}';
  if (seg.length >= 16 && /^[a-f0-9]+$/i.test(seg)) return '{hash}';
  if (seg.length >= 24 && /^[A-Za-z0-9_-]+$/.test(seg) && entropy(seg) >= 3.5) return '{hash}';
  return seg;
}

// Derive the attack-surface template for a single URL (host + path with dynamic
// segments replaced, sorted param keys with values as {val}). Returns '' if the
// URL can't be parsed. Used by both templating and drill-down filtering.
export function urlTemplate(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { return ''; }
  const path = u.pathname.split('/').map(templateSegment).join('/');
  const keys = [...new URLSearchParams(u.search).keys()].sort();
  const query = keys.length ? '?' + keys.map((k) => `${k}={val}`).join('&') : '';
  return `${u.host}${path}${query}`;
}

// Endpoint templating: collapse scored results into unique attack-surface
// templates. Returns rows sorted by URL count desc.
export function buildTemplates(results) {
  const map = new Map();
  for (const r of results) {
    const template = urlTemplate(r.url);
    if (!template) continue;
    let e = map.get(template);
    if (!e) { e = { template, count: 0, score: 0, severity: 'low', cats: new Set(), sample: r.url }; map.set(template, e); }
    e.count++;
    if (r.score > e.score) e.score = r.score;
    if ((SEV_RANK[r.severity] ?? -1) > (SEV_RANK[e.severity] ?? -1)) e.severity = r.severity;
    r.categories.forEach((c) => e.cats.add(c));
  }
  const arr = Array.from(map.values()).map((e) => ({
    template: e.template,
    count: e.count,
    score: e.score,
    severity: e.severity,
    categories: Array.from(e.cats),
    sample: e.sample,
  }));
  // Rarity (IDF): a path/param segment seen in few templates is more interesting.
  const N = arr.length || 1;
  const df = new Map();
  const segsOf = (t) => [...new Set(t.split(/[/?&=]/).filter((s) => s && !s.startsWith('{')))];
  for (const e of arr) for (const s of segsOf(e.template)) df.set(s, (df.get(s) || 0) + 1);
  for (const e of arr) {
    let r = 0;
    for (const s of segsOf(e.template)) r += Math.log(N / (df.get(s) || 1));
    e.rarity = Math.round(r * 10) / 10;
  }
  arr.sort((a, b) => (b.count - a.count) || (b.score - a.score) || (a.template < b.template ? -1 : 1));
  return arr;
}

// Build an ffuf-ready URL from a template (placeholders -> FUZZ / sane values).
export function fuzzUrl(template) {
  const filled = template
    .replace(/\{val\}/g, 'FUZZ')
    .replace(/\{num\}/g, '1')
    .replace(/\{uuid\}/g, '00000000-0000-0000-0000-000000000000')
    .replace(/\{hash\}/g, 'abc123')
    .replace(/\{date\}/g, '2024-01-01');
  return `https://${filled}`;
}
export function fuzzCommand(template) {
  return `ffuf -u '${fuzzUrl(template)}' -w wordlist.txt -mc all -fc 404`;
}

// Parameter dossier: per param → how widely used, value types, categories.
export function buildParamDossier(results) {
  const map = new Map();
  for (const r of results) {
    let u;
    try { u = new URL(r.url); } catch { continue; }
    const t = urlTemplate(r.url);
    for (const [k, v] of new URLSearchParams(u.search)) {
      let e = map.get(k);
      if (!e) { e = { param: k, endpoints: new Set(), hosts: new Set(), types: {}, cats: new Set(), sample: v }; map.set(k, e); }
      e.endpoints.add(t);
      e.hosts.add(u.host);
      const ty = classifyValue(v);
      e.types[ty] = (e.types[ty] || 0) + 1;
      r.categories.forEach((c) => e.cats.add(c));
      if (!e.sample && v) e.sample = v;
    }
  }
  const rows = [...map.values()].map((e) => ({
    param: e.param,
    endpoints: e.endpoints.size,
    hosts: e.hosts.size,
    types: Object.entries(e.types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`),
    categories: [...e.cats],
    sample: e.sample,
  }));
  rows.sort((a, b) => (b.endpoints - a.endpoints) || (b.hosts - a.hosts) || (a.param < b.param ? -1 : 1));
  return rows;
}

// --- HTTP-probe input parsing (so the matrices get method + status) ---
// Accepts: httpx -json lines, "METHOD https://..." lines, "https://... 200"
// lines, or a bare URL. Returns { url, method, status }.
export function parseInputLine(line) {
  const s = (line || '').trim();
  if (s[0] === '{') {
    try {
      const o = JSON.parse(s);
      const url = o.url || o.input || o.endpoint;
      if (url) return { url, method: (o.method || 'GET').toUpperCase(), status: o.status_code ?? o.status ?? null };
    } catch { /* not json, fall through */ }
  }
  const m = s.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)/i);
  if (m) return { url: m[2], method: m[1].toUpperCase(), status: null };
  const m2 = s.match(/^(\S+)\s+\[?(\d{3})\]?(?:\s|$)/);
  if (m2 && /^https?:\/\//i.test(m2[1])) return { url: m2[1], method: 'GET', status: Number(m2[2]) };
  return { url: s, method: 'GET', status: null };
}

// --- JWT analyzer ---
function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try { return atob(s); } catch { return ''; }
}

// Decode + judge a JWT. Returns null if it isn't a real JWT.
export function analyzeJwt(token) {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const parse = (b) => { try { return JSON.parse(b64urlDecode(b)); } catch { return null; } };
  const header = parse(parts[0]);
  const payload = parse(parts[1]);
  if (!header && !payload) return null;
  const alg = header && header.alg;
  const issues = [];
  if (alg && /^none$/i.test(alg)) issues.push('alg:none — forgeable without a key');
  if (header && 'kid' in header) issues.push('kid present — possible injection/path traversal');
  if (alg && /^hs/i.test(alg)) issues.push('HS* — forgeable if the secret is weak');
  let expired = false;
  if (payload && typeof payload.exp === 'number') {
    expired = payload.exp * 1000 < Date.now();
    issues.push(expired ? 'expired' : 'still valid');
  } else {
    issues.push('no exp — never expires');
  }
  return {
    alg: alg || '?',
    exp: (payload && payload.exp) || null,
    expired,
    iss: (payload && payload.iss) || null,
    sub: (payload && payload.sub) || null,
    issues,
  };
}

const JWT_RE = /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]+)?/g;

// Pull every JWT out of the result URLs and analyze it (deduped by token).
export function collectJwts(results) {
  const out = [];
  const seen = new Set();
  for (const r of results) {
    const matches = r.url.match(JWT_RE);
    if (!matches) continue;
    for (const tok of matches) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      const a = analyzeJwt(tok);
      if (a) out.push({ url: r.url, token: tok, ...a });
    }
  }
  out.sort((x, y) => y.issues.filter((i) => !/still valid/.test(i)).length - x.issues.filter((i) => !/still valid/.test(i)).length);
  return out;
}

// --- IDOR resource × verb matrix ---
const DESTRUCTIVE = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
export function buildVerbMatrix(results) {
  const map = new Map();
  for (const r of results) {
    const t = urlTemplate(r.url);
    if (!t) continue;
    let e = map.get(t);
    if (!e) { e = { template: t, methods: new Set(), count: 0, sample: r.url }; map.set(t, e); }
    e.count++;
    (r.methods && r.methods.length ? r.methods : ['GET']).forEach((m) => e.methods.add(m));
  }
  const rows = [...map.values()].map((e) => {
    const methods = [...e.methods].sort();
    return { template: e.template, methods, count: e.count, sample: e.sample, destructive: methods.some((m) => DESTRUCTIVE.has(m)) };
  });
  rows.sort((a, b) => (Number(b.destructive) - Number(a.destructive)) || (b.methods.length - a.methods.length) || (b.count - a.count));
  return rows;
}

// --- Auth-boundary / env-drift matrix ---
// Same path across >=2 hosts; flags drift when some host serves it open
// (2xx/3xx) while another blocks it (401/403).
export function buildEnvMatrix(results) {
  const map = new Map();
  for (const r of results) {
    let u;
    try { u = new URL(r.url); } catch { continue; }
    const t = urlTemplate(r.url);
    const slash = t.indexOf('/');
    const pathKey = slash === -1 ? '/' : t.slice(slash);
    let e = map.get(pathKey);
    if (!e) { e = { path: pathKey, hosts: new Map() }; map.set(pathKey, e); }
    const set = e.hosts.get(u.host) || new Set();
    (r.statuses || []).forEach((s) => set.add(s));
    e.hosts.set(u.host, set);
  }
  const rows = [];
  for (const e of map.values()) {
    if (e.hosts.size < 2) continue;
    const hosts = [...e.hosts.entries()].map(([host, set]) => ({ host, statuses: [...set].sort((a, b) => a - b) }));
    const all = new Set(hosts.flatMap((h) => h.statuses));
    const hasOpen = [...all].some((s) => s >= 200 && s < 400);
    const hasBlocked = [...all].some((s) => s === 401 || s === 403);
    rows.push({ path: e.path, hosts, drift: hasOpen && hasBlocked, statuses: [...all].sort((a, b) => a - b) });
  }
  rows.sort((a, b) => (Number(b.drift) - Number(a.drift)) || (b.hosts.length - a.hosts.length));
  return rows;
}
