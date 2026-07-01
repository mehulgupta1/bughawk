// urls.api.js — lots of https:// URLs in different shapes (safe test data)
const SERVICES = {
  api:      "https://api.example.com/v3/graphql",
  auth:     "https://auth.example.com/oauth2/token",
  payments: "https://payments.example.com/v1/charges",
  search:   "https://search.example.com/_search?q=*",
  cdn:      "https://cdn.example.com/static/app.min.js",
  uploads:  "https://uploads.example.com/files",
  ws:       "wss://realtime.example.com/socket"
};

// third-party endpoints
const THIRD_PARTY = [
  "https://www.googleapis.com/oauth2/v3/userinfo",
  "https://maps.googleapis.com/maps/api/geocode/json?address=x",
  "https://graph.facebook.com/v18.0/me",
  "https://api.stripe.com/v1/payment_intents",
  "https://api.github.com/user/repos",
  "https://hooks.slack.com/services/T000/B000/xyz",
  "https://sentry.io/api/0/projects/acme/web/",
  "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
  "https://s3.amazonaws.com/acme-prod-backups/db.sql",
  "https://acme-internal.s3.us-west-2.amazonaws.com/secrets.json"
];

fetch("https://api.example.com/v3/users/me?include=roles", { credentials: "include" });
fetch(`https://api.example.com/v3/orders/${orderId}?expand=line_items`);
axios.get("https://staging-api.example.com/internal/health");

const docs   = "https://docs.example.com/api/reference";
const status = "https://status.example.com/api/v2/summary.json";
const swagger = "https://api.example.com/swagger/v3/openapi.json";

// URLs embedded in strings/templates
const redirect = "https://login.example.com/sso?return_to=https://app.example.com/dashboard";
const img = '<img src="https://media.example.com/u/123/avatar.png">';
const css = "background:url('https://cdn.example.com/img/bg.jpg')";

export { SERVICES, THIRD_PARTY, docs, status, swagger, redirect, img, css };
