// urls.subdomains.js — many https:// hosts/subdomains for domain harvesting (safe test data)
window.__ENDPOINTS__ = [
  "https://account.example.com/profile",
  "https://admin.example.com/login",
  "https://api-gateway.example.com/route",
  "https://billing.example.com/invoices",
  "https://dev.example.com/debug",
  "https://staging.example.com/feature-flags",
  "https://internal.example.com/metrics",
  "https://vpn.example.com/portal",
  "https://git.example.com/explore",
  "https://jenkins.example.com/job/build",
  "https://grafana.example.com/d/abc/dashboard",
  "https://kibana.example.com/app/discover",
  "https://vault.example.com/v1/secret/data/app",
  "https://registry.example.com/v2/_catalog",
  "https://mail.example.com/api/send",
  "https://files.example.com/download/report.pdf",
  "https://legacy.example.net/old-portal",
  "https://partner.acme-vendor.com/webhook",
  "https://test.example.io/sandbox",
  "https://beta.example.co/early-access"
];

const CONFIG_URL = "https://config.example.com/app/settings.json";
const OAUTH_REDIRECT = "https://example.com/oauth/callback?code=AUTHCODE&state=xyz";
const WEBHOOK = "https://example.com/webhooks/stripe?secret=whsec_test123";

export default { CONFIG_URL, OAUTH_REDIRECT, WEBHOOK };
