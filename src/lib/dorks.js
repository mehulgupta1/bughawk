// Dork library. {T} = target (domain/keyword; quoted on GitHub substitution),
// {ORG} = GitHub org slug. High-signal queries tuned to surface real leaks.

// ════════════════════════════════ GitHub ════════════════════════════════
const SECRETS = [
  '{T} password', '{T} "password"', '{T} passwd', '{T} "db_password"', '{T} "DB_PASSWORD"',
  '{T} "database_password"', '{T} "admin_password"', '{T} "root_password"', '{T} "secret"',
  '{T} "client_secret"', '{T} "secret_key"', '{T} "SECRET_KEY"', '{T} "api_secret"',
  '{T} "passphrase"', '{T} "hardcoded"', '{T} "do not commit"', '{T} "remove before"',
  '{T} "pwd ="', '{T} "pass ="', '{T} "credentials ="', '{T} "login" "password"',
  '{T} "user" "password" NOT example', '{T} "sa_password"', '{T} "ftp_password"',
  '{T} "smtp_password"', '{T} "ldap_password"', '{T} "vnc password"', '{T} "BasicAuth"',
  '{T} "x-functions-key"', '{T} "shared_secret"', '{T} "master_key"', '{T} "encryption_key"',
  '{T} "signing_key"', '{T} "cookie_secret"', '{T} "session_secret"', '{T} "jwt_secret"',
];

const APIKEYS = [
  '{T} "api_key"', '{T} "apikey"', '{T} "x-api-key"', '{T} "API_KEY="', '{T} "access_token"',
  '{T} "auth_token"', '{T} "refresh_token"', '{T} "bearer "', '{T} "Authorization: Bearer"',
  '{T} "token ="', '{T} "accessKeyId"', '{T} "ConsumerKey"', '{T} "consumer_secret"',
  '{T} "personal_access_token"', '{T} "PRIVATE-TOKEN"', '{T} "X-Auth-Token"', '{T} "id_token"',
  '{T} "client_id" "client_secret"', '{T} "oauth_token"', '{T} "oauth" secret', '{T} "BEARER_TOKEN"',
  '{T} "Token token="', '{T} "ApiToken"', '{T} "service account" key',
];

const PRIVATE_KEYS = [
  '{T} "BEGIN RSA PRIVATE KEY"', '{T} "BEGIN OPENSSH PRIVATE KEY"', '{T} "BEGIN DSA PRIVATE KEY"',
  '{T} "BEGIN EC PRIVATE KEY"', '{T} "BEGIN PGP PRIVATE KEY"', '{T} "BEGIN PRIVATE KEY"',
  '{T} "BEGIN ENCRYPTED PRIVATE KEY"', '{T} "ssh-rsa AAAA"', '{T} "id_rsa"', '{T} "id_dsa"',
  '{T} "id_ed25519"', '{T} "PRIVATE KEY" extension:pem', '{T} extension:ppk', '{T} extension:pfx',
  '{T} extension:p12', '{T} extension:keystore', '{T} extension:jks', '{T} extension:asc PGP',
  '{T} "-----BEGIN CERTIFICATE-----" extension:key', '{T} "BEGIN OPENSSH" filename:id_rsa',
];

const AWS = [
  '{T} "AKIA"', '{T} "ASIA"', '{T} "aws_access_key_id"', '{T} "aws_secret_access_key"',
  '{T} "aws_session_token"', '{T} "AWS_ACCESS_KEY_ID"', '{T} "AWS_SECRET_ACCESS_KEY"',
  '{T} "s3.amazonaws.com"', '{T} ".s3.amazonaws.com" key', '{T} "amazonaws.com" secret',
  '{T} "aws cognito"', '{T} "AmazonS3" credentials', '{T} filename:credentials aws',
  '{T} "arn:aws:iam"', '{T} "AWS_SESSION_TOKEN"', '{T} "X-Amz-Security-Token"',
  '{T} "dkr.ecr" password', '{T} "rds.amazonaws.com" password',
];

const GCP_AZURE = [
  '{T} "AIza"', '{T} "GOOGLE_API_KEY"', '{T} "firebaseio.com"', '{T} "FIREBASE_"',
  '{T} "type": "service_account"', '{T} "private_key_id" "service_account"',
  '{T} "googleusercontent.com" client_secret', '{T} "GCP" "service_account"',
  '{T} "AZURE_CLIENT_SECRET"', '{T} "AZURE_CLIENT_ID"', '{T} "DefaultEndpointsProtocol"',
  '{T} "core.windows.net"', '{T} "AccountKey=" "blob.core.windows.net"', '{T} "SharedAccessSignature"',
  '{T} "TENANT_ID" "CLIENT_SECRET"', '{T} "azure" "connectionstring"', '{T} " vault.azure.net"',
  '{T} "DIGITALOCEAN_ACCESS_TOKEN"', '{T} "dop_v1_"', '{T} "HEROKU_API_KEY"',
];

const THIRDPARTY = [
  '{T} "xoxb-"', '{T} "xoxp-"', '{T} "slack_token"', '{T} "hooks.slack.com/services"',
  '{T} "ghp_"', '{T} "gho_"', '{T} "ghs_"', '{T} "github_token"', '{T} "GH_TOKEN"',
  '{T} "glpat-"', '{T} "gitlab" "PRIVATE-TOKEN"', '{T} "SG."', '{T} "SENDGRID_API_KEY"',
  '{T} "TWILIO_AUTH_TOKEN"', '{T} "TWILIO_ACCOUNT_SID"', '{T} "MAILGUN_API_KEY"',
  '{T} "mailchimp" "us" apikey', '{T} "npm_"', '{T} "_authToken"', '{T} "DISCORD_TOKEN"',
  '{T} "discord.com/api/webhooks"', '{T} "telegram" bot token', '{T} "ALGOLIA_ADMIN_KEY"',
  '{T} "SENTRY_DSN"', '{T} "@sentry.io"', '{T} "PAGERDUTY_TOKEN"', '{T} "DATADOG_API_KEY"',
  '{T} "NEW_RELIC_LICENSE_KEY"', '{T} "shppa_"', '{T} "shpat_"', '{T} "CONTENTFUL_" token',
  '{T} "AIRTABLE_API_KEY"', '{T} "MAPBOX" "sk."', '{T} "CLOUDFLARE_API_TOKEN"',
];

const AI = [
  '{T} "OPENAI_API_KEY"', '{T} "sk-proj-"', '{T} "T3BlbkFJ"', '{T} "ANTHROPIC_API_KEY"',
  '{T} "sk-ant-"', '{T} "HUGGINGFACE" token', '{T} "hf_"', '{T} "COHERE_API_KEY"',
  '{T} "REPLICATE_API_TOKEN"', '{T} "r8_"', '{T} "GROQ_API_KEY"', '{T} "gsk_"',
  '{T} "PERPLEXITY_API_KEY"', '{T} "pplx-"', '{T} "PINECONE_API_KEY"', '{T} "AZURE_OPENAI_KEY"',
  '{T} "STABILITY_API_KEY"', '{T} "ELEVENLABS_API_KEY"',
];

const PAYMENT = [
  '{T} "sk_live_"', '{T} "rk_live_"', '{T} "STRIPE_SECRET_KEY"', '{T} "STRIPE_API_KEY"',
  '{T} "whsec_"', '{T} "PAYPAL_CLIENT_SECRET"', '{T} "BRAINTREE" private_key',
  '{T} "RAZORPAY_KEY_SECRET"', '{T} "rzp_live_"', '{T} "PAYSTACK_SECRET_KEY"',
  '{T} "SQUARE_ACCESS_TOKEN"', '{T} "sq0csp-"', '{T} "ADYEN" apiKey', '{T} "PLAID_SECRET"',
  '{T} "COINBASE" api secret', '{T} "BINANCE" "secretKey"',
];

const CICD = [
  '{T} filename:.npmrc _auth', '{T} filename:.dockercfg', '{T} filename:.docker/config.json',
  '{T} "DOCKER_PASSWORD"', '{T} "DOCKERHUB_TOKEN"', '{T} "CIRCLECI_TOKEN"', '{T} "TRAVIS_TOKEN"',
  '{T} "JENKINS_API_TOKEN"', '{T} filename:Jenkinsfile credentials', '{T} "ACTIONS_RUNTIME_TOKEN"',
  '{T} "${{ secrets." NOT name', '{T} filename:.gitlab-ci.yml token', '{T} "CODECOV_TOKEN"',
  '{T} "SONAR_TOKEN"', '{T} "VERCEL_TOKEN"', '{T} "NETLIFY_AUTH_TOKEN"', '{T} "RAILWAY_TOKEN"',
  '{T} "FLY_API_TOKEN"', '{T} "ARGOCD" password', '{T} "ANSIBLE_VAULT"',
];

const IAC = [
  '{T} extension:tfstate', '{T} filename:terraform.tfvars', '{T} filename:terraform.tfstate secret',
  '{T} "TF_VAR_" secret', '{T} filename:main.tf access_key', '{T} filename:.terraformrc credentials',
  '{T} filename:vars.tf password', '{T} filename:ansible.cfg password', '{T} filename:hosts ansible_password',
  '{T} filename:kubeconfig', '{T} filename:.kube/config', '{T} "kind: Secret" "data:"',
  '{T} "helm" "values.yaml" password', '{T} filename:docker-compose.yml password',
  '{T} filename:Vagrantfile password', '{T} filename:serverless.yml secret', '{T} filename:.pulumi',
];

const FILES = [
  '{T} filename:.env', '{T} filename:.env.local', '{T} filename:.env.production',
  '{T} filename:.env.development', '{T} filename:.env.staging', '{T} filename:.env.backup',
  '{T} filename:credentials', '{T} filename:.git-credentials', '{T} filename:.s3cfg',
  '{T} filename:wp-config.php', '{T} filename:config.php password', '{T} filename:settings.py SECRET_KEY',
  '{T} filename:database.yml password', '{T} filename:.htpasswd', '{T} filename:.pgpass',
  '{T} filename:.netrc', '{T} filename:.bash_history', '{T} filename:.zsh_history',
  '{T} filename:secrets.yml', '{T} filename:secrets.json', '{T} filename:credentials.json',
  '{T} filename:application.properties password', '{T} filename:application.yml password',
  '{T} filename:web.config', '{T} filename:appsettings.json ConnectionStrings',
  '{T} filename:config.json apiKey', '{T} filename:local.settings.json', '{T} filename:.env.vault',
  '{T} filename:sftp-config.json', '{T} filename:.aws/credentials', '{T} filename:.boto',
  '{T} filename:proftpdpasswd', '{T} filename:filezilla.xml', '{T} filename:.ovpn auth',
];

const BACKUPS = [
  '{T} extension:sql password', '{T} extension:sql "INSERT INTO users"', '{T} extension:sql "GRANT ALL"',
  '{T} extension:bak', '{T} extension:dump', '{T} extension:backup', '{T} extension:old config',
  '{T} extension:kdbx', '{T} extension:log password', '{T} extension:log "api_key"',
  '{T} "mysqldump" password', '{T} "pg_dump"', '{T} "database backup"', '{T} extension:gz dump',
  '{T} extension:csv "password"', '{T} extension:xlsx password',
];

const DB = [
  '{T} "jdbc:mysql://"', '{T} "jdbc:postgresql://"', '{T} "jdbc:oracle:"', '{T} "jdbc:sqlserver"',
  '{T} "mongodb://"', '{T} "mongodb+srv://"', '{T} "postgres://"', '{T} "postgresql://"',
  '{T} "mysql://"', '{T} "redis://"', '{T} "rediss://"', '{T} "amqp://"', '{T} "amqps://"',
  '{T} "Data Source=" "Password="', '{T} "connectionString"', '{T} "DATABASE_URL"',
  '{T} "SQLALCHEMY_DATABASE_URI"', '{T} "MONGO_URI"', '{T} "REDIS_URL"', '{T} "cassandra" password',
  '{T} "neo4j://"', '{T} "snowflakecomputing.com" password', '{T} "supabase" "service_role"',
  '{T} "PLANETSCALE" "pscale_"', '{T} "elasticsearch" "http://" "@"',
];

const ENDPOINTS = [
  '{T} "swagger.json"', '{T} "openapi.json"', '{T} "/api/v1" key', '{T} "graphql" "__schema"',
  '{T} "introspectionQuery"', '{T} "/actuator/env"', '{T} "/actuator/heapdump"', '{T} ".git/config"',
  '{T} "/.well-known"', '{T} "internal-api" key', '{T} "staging" "api"', '{T} "X-Forwarded-For" bypass',
  '{T} "admin" endpoint token', '{T} "wp-json" "users"', '{T} "/debug/pprof"', '{T} "phpinfo()"',
  '{T} "127.0.0.1" "password"', '{T} "169.254.169.254"',
];

const INTERNAL = [
  '{T} internal', '{T} staging password', '{T} "dev" password', '{T} "TODO" password',
  '{T} "FIXME" key', '{T} "vault" token', '{T} "VPN" config', '{T} "smtp" password',
  '{T} "ftp" password', '{T} "ldap" password', '{T} "confidential"', '{T} "do not share"',
  '{T} "test" credentials NOT example', '{T} "sandbox" secret', '{T} "poc" password',
];

const ORG = [
  'org:{ORG} filename:.env', 'org:{ORG} "password"', 'org:{ORG} "api_key"', 'org:{ORG} "secret"',
  'org:{ORG} "client_secret"', 'org:{ORG} "AKIA"', 'org:{ORG} "AIza"', 'org:{ORG} "sk_live_"',
  'org:{ORG} "sk-ant-"', 'org:{ORG} "T3BlbkFJ"', 'org:{ORG} filename:.npmrc', 'org:{ORG} "ghp_"',
  'org:{ORG} "glpat-"', 'org:{ORG} "BEGIN RSA PRIVATE KEY"', 'org:{ORG} "BEGIN OPENSSH PRIVATE KEY"',
  'org:{ORG} extension:sql password', 'org:{ORG} extension:tfstate', 'org:{ORG} "token"',
  'org:{ORG} filename:credentials', 'org:{ORG} "internal"', 'org:{ORG} "DATABASE_URL"',
  'org:{ORG} "connectionString"', 'org:{ORG} "xoxb-"', 'org:{ORG} "whsec_"',
];

const GROUPS = [
  ['Secrets & Passwords', SECRETS],
  ['API Keys & Tokens', APIKEYS],
  ['Private Keys & Certs', PRIVATE_KEYS],
  ['AWS Keys', AWS],
  ['GCP / Azure / DO', GCP_AZURE],
  ['Third-party Tokens', THIRDPARTY],
  ['AI / LLM Keys', AI],
  ['Payment & Commerce', PAYMENT],
  ['CI / CD & DevOps', CICD],
  ['Infrastructure as Code', IAC],
  ['Config & Env Files', FILES],
  ['Backups & Dumps', BACKUPS],
  ['DB / Connection Strings', DB],
  ['Endpoints & API', ENDPOINTS],
  ['Internal / Misc', INTERNAL],
  ['Org-scoped', ORG],
];

export const DORKS = GROUPS.flatMap(([cat, qs]) => qs.map((q) => ({ cat, q })));
export const DORK_CATEGORIES = GROUPS.map(([cat]) => cat);

// ════════════════════════════════ Google ════════════════════════════════
const G_FILES = [
  'site:{T} ext:sql', 'site:{T} ext:env', 'site:{T} ext:log', 'site:{T} ext:bak', 'site:{T} ext:old',
  'site:{T} ext:backup', 'site:{T} ext:conf', 'site:{T} ext:cnf', 'site:{T} ext:ini', 'site:{T} ext:yml',
  'site:{T} ext:yaml', 'site:{T} ext:json password', 'site:{T} ext:xml', 'site:{T} ext:txt password',
  'site:{T} ext:csv password', 'site:{T} ext:xls', 'site:{T} ext:xlsx', 'site:{T} ext:doc',
  'site:{T} ext:docx', 'site:{T} ext:pdf confidential', 'site:{T} ext:pem', 'site:{T} ext:key',
  'site:{T} ext:crt', 'site:{T} ext:p12', 'site:{T} ext:ovpn', 'site:{T} ext:reg', 'site:{T} ext:cfg',
  'site:{T} ext:dump', 'site:{T} ext:sqlite', 'site:{T} ext:db', 'site:{T} ext:passwd',
];

const G_DIRS = [
  'intitle:"index of" site:{T}', 'intitle:"index of" "parent directory" site:{T}',
  'intitle:"index of" backup site:{T}', 'intitle:"index of" .git site:{T}',
  'intitle:"index of" .env site:{T}', 'intitle:"index of" wp-content site:{T}',
  'intitle:"index of" "config" site:{T}', 'intitle:"index of" "uploads" site:{T}',
  'intitle:"index of" "db" site:{T}', 'intitle:"index of" "private" site:{T}',
  'intitle:"index of" "logs" site:{T}', 'intitle:"index of" "*.sql" site:{T}',
  'intitle:"index of" "credentials" site:{T}', 'intitle:"index of" "admin" site:{T}',
  'intitle:"index of" "secret" site:{T}', 'intitle:"index of" ".ssh" site:{T}',
];

const G_PANELS = [
  'site:{T} inurl:admin', 'site:{T} inurl:login', 'site:{T} inurl:dashboard', 'site:{T} inurl:portal',
  'site:{T} inurl:signin', 'site:{T} inurl:cpanel', 'site:{T} inurl:wp-admin', 'site:{T} inurl:phpmyadmin',
  'site:{T} intitle:"admin login"', 'site:{T} inurl:/admin/login', 'site:{T} inurl:auth',
  'site:{T} inurl:console', 'site:{T} inurl:manage', 'site:{T} intitle:"Dashboard" login',
  'site:{T} inurl:adminer.php', 'site:{T} intitle:"Grafana"', 'site:{T} intitle:"Kibana"',
  'site:{T} intitle:"Jenkins"', 'site:{T} intitle:"RabbitMQ Management"', 'site:{T} intitle:"phpMyAdmin"',
  'site:{T} inurl:/manager/html', 'site:{T} intitle:"Login" "Citrix"', 'site:{T} inurl:owa/auth',
  'site:{T} intitle:"Outlook Web App"', 'site:{T} inurl:remote/login fortinet',
];

const G_PATHS = [
  'site:{T} inurl:redirect=', 'site:{T} inurl:url=', 'site:{T} inurl:next=', 'site:{T} inurl:return=',
  'site:{T} inurl:returnUrl=', 'site:{T} inurl:dest=', 'site:{T} inurl:continue=', 'site:{T} inurl:redir=',
  'site:{T} inurl:debug=true', 'site:{T} inurl:test', 'site:{T} inurl:tmp', 'site:{T} inurl:backup',
  'site:{T} inurl:old', 'site:{T} inurl:?id=', 'site:{T} inurl:&id=', 'site:{T} inurl:file=',
  'site:{T} inurl:path=', 'site:{T} inurl:page= ext:php', 'site:{T} inurl:cmd=', 'site:{T} inurl:exec=',
  'site:{T} inurl:download=', 'site:{T} inurl:doc=', 'site:{T} inurl:callback=',
  'site:{T} inurl:q= ext:php', 'site:{T} inurl:search=', 'site:{T} inurl:lang=', 'site:{T} inurl:dir=',
  'site:{T} inurl:load=', 'site:{T} inurl:template=', 'site:{T} inurl:view=', 'site:{T} inurl:include=',
  'site:{T} inurl:src=', 'site:{T} inurl:r= http', 'site:{T} inurl:u= http', 'site:{T} inurl:to=',
  'site:{T} inurl:out=', 'site:{T} inurl:image= http', 'site:{T} inurl:proxy=',
];

const G_API = [
  'site:{T} inurl:api', 'site:{T} inurl:v1', 'site:{T} inurl:v2', 'site:{T} inurl:graphql',
  'site:{T} inurl:graphiql', 'site:{T} inurl:swagger', 'site:{T} inurl:swagger-ui', 'site:{T} inurl:openapi',
  'site:{T} inurl:api-docs', 'site:{T} inurl:redoc', 'site:{T} inurl:actuator', 'site:{T} inurl:/wp-json',
  'site:{T} inurl:rest', 'site:{T} ext:json inurl:api', 'site:{T} "swagger" intitle:"UI"',
  'site:{T} inurl:.well-known', 'site:{T} inurl:postman', 'site:{T} inurl:wsdl',
];

const G_SECRETS = [
  'site:{T} "api_key"', 'site:{T} "secret_key"', 'site:{T} "access_token"', 'site:{T} "password"',
  'site:{T} "BEGIN RSA PRIVATE KEY"', 'site:{T} "AKIA"', 'site:{T} "AIza"', 'site:{T} "client_secret"',
  'site:{T} "DB_PASSWORD"', 'site:{T} "aws_secret_access_key"', 'site:{T} intext:"-----BEGIN"',
  'site:{T} "Authorization: Bearer"', 'site:{T} "sk_live_"', 'site:{T} "xoxb-"',
  'site:{T} "Index of" "id_rsa"', 'site:{T} "secret_token"', 'site:{T} "ROOT_PASSWORD"',
];

const G_CONFIG = [
  'site:{T} inurl:.git', 'site:{T} inurl:.env', 'site:{T} inurl:.svn', 'site:{T} inurl:wp-config',
  'site:{T} inurl:config.json', 'site:{T} inurl:.DS_Store', 'site:{T} ext:js inurl:.map',
  'site:{T} ".js.map"', 'site:{T} inurl:phpinfo', 'site:{T} inurl:server-status',
  'site:{T} inurl:web.config', 'site:{T} inurl:appsettings.json', 'site:{T} filetype:env',
  'site:{T} inurl:robots.txt', 'site:{T} inurl:sitemap.xml', 'site:{T} inurl:.well-known/security.txt',
];

const G_ERRORS = [
  'site:{T} "SQL syntax"', 'site:{T} "Warning: mysql_connect()"', 'site:{T} "Fatal error"',
  'site:{T} "stack trace"', 'site:{T} "Uncaught exception"', 'site:{T} "Notice: Undefined"',
  'site:{T} intitle:"phpinfo()"', 'site:{T} "Whoops, looks like something went wrong"',
  'site:{T} "Application Error"', 'site:{T} "Apache Status"', 'site:{T} "Traceback (most recent call last)"',
  'site:{T} "DEBUG = True"', 'site:{T} "Django" "DisallowedHost"', 'site:{T} "ORA-" error',
  'site:{T} "Microsoft OLE DB Provider"', 'site:{T} "Internal Server Error" intext:exception',
];

const G_STORAGE = [
  'site:s3.amazonaws.com {T}', 'site:storage.googleapis.com {T}', 'site:blob.core.windows.net {T}',
  'site:digitaloceanspaces.com {T}', 'site:*.s3.amazonaws.com {T}', 'site:firebaseio.com {T}',
  'site:firebasestorage.googleapis.com {T}', 'site:appspot.com {T}', 'site:cloudfront.net {T}',
  'site:r2.dev {T}', 'site:backblazeb2.com {T}', 'site:oss.aliyuncs.com {T}',
  // S3
  'site:s3.amazonaws.com "{T}"', 'site:s3.amazonaws.com intitle:"index of" "{T}"',
  'site:s3.amazonaws.com "backup" "{T}"', 'site:s3.amazonaws.com "prod" "{T}"',
  'site:s3.amazonaws.com "dev" "{T}"', 'site:s3.amazonaws.com "private" "{T}"',
  'site:s3.amazonaws.com ext:sql "{T}"', 'site:s3.amazonaws.com ext:zip "{T}"',
  // Azure Blob
  'site:blob.core.windows.net "{T}"', 'site:blob.core.windows.net intitle:"index of" "{T}"',
  'site:blob.core.windows.net "backup" "{T}"', 'site:blob.core.windows.net ext:zip "{T}"',
  'site:blob.core.windows.net ext:sql "{T}"', 'site:blob.core.windows.net ext:json "{T}"',
  // Google Cloud Storage
  'site:storage.googleapis.com "{T}"', 'site:storage.googleapis.com intitle:"index of" "{T}"',
  'site:storage.googleapis.com "backup" "{T}"', 'site:storage.googleapis.com ext:zip "{T}"',
  'site:storage.googleapis.com ext:sql "{T}"', 'site:storage.googleapis.com ext:env "{T}"',
  // Google APIs / app data
  'site:googleapis.com "{T}"', 'site:googleapis.com "bucket" "{T}"', 'site:googleapis.com "storage" "{T}"',
  // Google Drive
  'site:drive.google.com "{T}"', 'site:drive.google.com/file "{T}"',
  'site:drive.google.com "backup" "{T}"', 'site:drive.google.com "confidential" "{T}"',
];

const G_THIRDPARTY = [
  'site:pastebin.com {T}', 'site:gist.github.com {T}', 'site:github.com {T} password',
  'site:gitlab.com {T}', 'site:bitbucket.org {T}', 'site:trello.com {T}', 'site:atlassian.net {T}',
  'site:jira.{T}', 'site:stackoverflow.com {T}', 'site:jsfiddle.net {T}', 'site:codepen.io {T}',
  'site:npmjs.com {T}', 'site:hub.docker.com {T}', 'site:apkpure.com {T}', 'site:scribd.com {T}',
  'site:coggle.it {T}', 'site:papaly.com {T}', 'site:replit.com {T}', 'site:notion.site {T}',
  'site:docs.google.com {T}', 'site:drive.google.com {T}',
];

const G_AUTH = [
  'site:{T} inurl:oauth', 'site:{T} inurl:sso', 'site:{T} inurl:saml', 'site:{T} inurl:openid',
  'site:{T} inurl:.well-known/openid-configuration', 'site:{T} inurl:logout', 'site:{T} inurl:reset',
  'site:{T} inurl:forgot', 'site:{T} inurl:verify', 'site:{T} inurl:token=', 'site:{T} inurl:apikey=',
  'site:{T} inurl:auth_token', 'site:{T} inurl:jwt',
];

const G_DOCS = [
  'site:{T} confidential', 'site:{T} "internal use only"', 'site:{T} "not for distribution"',
  'site:{T} "do not distribute"', 'site:{T} filetype:pdf internal', 'site:{T} inurl:internal',
  'site:{T} inurl:staging', 'site:{T} "proprietary"', 'site:{T} "private and confidential"',
  'site:{T} filetype:pdf "employee"', 'site:{T} "invoice" filetype:pdf', 'site:{T} "salary" filetype:xlsx',
];

const G_RECON = [
  'site:*.{T}', 'site:*.{T} -www', 'site:{T} -site:www.{T}', 'site:{T} inurl:dev',
  'site:{T} inurl:beta', 'site:{T} inurl:uat', 'site:{T} inurl:qa', 'site:{T} inurl:test.',
  'site:{T} filetype:txt inurl:robots', 'site:*.dev.{T}', 'site:*.staging.{T}',
  'site:*.internal.{T}', 'site:*.api.{T}',
];

const G_CMS = [
  'site:{T} inurl:wp-content/uploads', 'site:{T} inurl:wp-content/debug.log', 'site:{T} inurl:wp-json/wp/v2/users',
  'site:{T} inurl:/?author=1', 'site:{T} inurl:xmlrpc.php', 'site:{T} inurl:wp-content/plugins',
  'site:{T} inurl:/sites/default/files', 'site:{T} "Powered by Drupal" inurl:user',
  'site:{T} inurl:/administrator Joomla', 'site:{T} inurl:/typo3', 'site:{T} inurl:/umbraco',
  'site:{T} inurl:/ghost/', 'site:{T} inurl:/magento_version', 'site:{T} inurl:/sitecore/login',
  'site:{T} inurl:/bitrix/admin', 'site:{T} inurl:/wp-login.php', 'site:{T} inurl:/.env wp',
  'site:{T} inurl:/episerver/cms',
];

const G_EXPOSED = [
  'site:{T} intext:"sql syntax near"', 'site:{T} intext:"API_KEY"', 'site:{T} intext:"client_secret"',
  'site:{T} intext:"-----BEGIN PRIVATE KEY-----"', 'site:{T} intext:"mongodb://"',
  'site:{T} intext:"redis://"', 'site:{T} intext:"smtp" "password"', 'site:{T} intext:"BEGIN OPENSSH"',
  'site:{T} "Set-Cookie:" "session"', 'site:{T} "phpinfo" "PHP Version"', 'site:{T} intitle:"Index of /" ".git"',
  'site:{T} intitle:"Index of /" "node_modules"', 'site:{T} intext:"Whoops" "stack"',
  'site:{T} inurl:/server-info', 'site:{T} inurl:/metrics prometheus', 'site:{T} inurl:/debug/vars',
  'site:{T} intext:"AWS_SECRET"', 'site:{T} intext:"slack_api_token"',
];

const G_JUICY = [
  'site:{T} intext:"password" filetype:log', 'site:{T} intext:"username" intext:"password" ext:txt',
  'site:{T} "DB_USERNAME" "DB_PASSWORD"', 'site:{T} "JDBC" intext:password', 'site:{T} ext:json "private_key"',
  'site:{T} "authorization_code" inurl:callback', 'site:{T} intitle:"index of" "wp-config.php.bak"',
  'site:{T} ext:yml intext:"token"', 'site:{T} intext:"BEGIN CERTIFICATE" ext:pem',
  'site:{T} "ftp://" intext:"@{T}"', 'site:{T} inurl:/.env intext:"APP_KEY"', 'site:{T} ext:bak inurl:wp-config',
  'site:{T} "Dumping data for table" "users"', 'site:{T} "phpMyAdmin SQL Dump"',
  'site:{T} ext:txt intext:"@gmail.com" "password"', 'site:{T} intitle:"index of" "vendor" ".env"',
  'site:{T} "GITHUB_TOKEN" ext:yml', 'site:{T} "kubeconfig" ext:yaml', 'site:{T} inurl:/wp-content/uploads ext:sql',
  'site:{T} "Index of" "/backup"',
];

const G_GROUPS = [
  ['Files & Extensions', G_FILES],
  ['Directory Listing', G_DIRS],
  ['Login / Admin Panels', G_PANELS],
  ['Sensitive Paths & Params', G_PATHS],
  ['API / Swagger / GraphQL', G_API],
  ['Secrets in Pages', G_SECRETS],
  ['Config & Source', G_CONFIG],
  ['Errors & Debug', G_ERRORS],
  ['Cloud Storage Buckets', G_STORAGE],
  ['Third-party Leaks', G_THIRDPARTY],
  ['Auth / SSO / OAuth', G_AUTH],
  ['CMS Exposure', G_CMS],
  ['Exposed Services & Secrets', G_EXPOSED],
  ['Juicy / Misconfig', G_JUICY],
  ['Docs / Internal', G_DOCS],
  ['Subdomains / Recon', G_RECON],
];

export const GOOGLE_DORKS = G_GROUPS.flatMap(([cat, qs]) => qs.map((q) => ({ cat, q })));
export const GOOGLE_CATEGORIES = G_GROUPS.map(([cat]) => cat);

// ════════════════════════════════ builders ════════════════════════════════
export function googleQuery(template, target) {
  return template.replaceAll('{T}', target || '').trim();
}
export function googleUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
export function buildGoogleDorks(target) {
  return GOOGLE_DORKS.map((d) => {
    const query = googleQuery(d.q, target);
    return { cat: d.cat, q: d.q, query, url: googleUrl(query) };
  });
}

export function dorkQuery(template, target, org) {
  return template.replaceAll('{T}', target ? `"${target}"` : '').replaceAll('{ORG}', org || '').trim();
}
export function dorkUrl(query) {
  return `https://github.com/search?q=${encodeURIComponent(query)}&type=code`;
}
export function buildDorks(target, org) {
  return DORKS
    .filter((d) => (d.q.includes('{ORG}') ? !!org : true))
    .map((d) => {
      const query = dorkQuery(d.q, target, org);
      return { cat: d.cat, q: d.q, query, url: dorkUrl(query) };
    });
}
