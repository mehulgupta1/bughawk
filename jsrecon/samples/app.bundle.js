/*! app.bundle.js — minified-ish sample (fake creds, safe for testing) */
(function () {
  "use strict";

  var CONFIG = {
    apiBase: "https://api.example.com/v2",
    cdn: "https://assets.example.com.s3.amazonaws.com",
    wsUrl: "wss://realtime.example.com/socket",
    region: "us-east-1"
  };

  // --- credentials accidentally shipped in the bundle ---
  var AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
  var AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  var GOOGLE_MAPS_KEY = "AIzaSyB1cQ3kFAKE0aBcDeFgHiJkLmNoPqRsTuVw";
  var STRIPE_LIVE = "sk_live_" + "51HfakeKEY00aBcDeFgHiJkLmNoPqRsTuVwXyZ012345";
  var GITHUB_PAT = "ghp_0123456789abcdef0123456789abcdef0123";
  var SLACK_WEBHOOK = "https://hooks.slack.com/services/T00000000/B00000000/" + "XXXXXXXXXXXXXXXXXXXXXXXX";
  var api_key = "1a2b3c4d5e6f7g8h9i0jKLMNOPqrst42Uv";
  var firebaseSecret = "secret_aB3xZ9kLm2QpR7sT4uV6wY8nC1dE5fG0hJ";

  function authHeaders(token) {
    return { Authorization: "Bearer " + token, "X-Api-Key": api_key };
  }

  // --- endpoints used across the app ---
  var ROUTES = {
    login: "/api/v2/auth/login",
    logout: "/api/v2/auth/logout",
    me: "/api/v2/users/me",
    order: "/api/v2/orders?id=123&token=abc&debug=true",
    upload: "/api/v2/files/upload",
    admin: "/admin/dashboard",
    adminUsers: "/admin/users/manage?role=superadmin",
    internalMetrics: "/internal/metrics/prometheus",
    heapdump: "/internal/debug/heapdump",
    backup: "/static/backups/db_backup.sql",
    swagger: "/api/v2/swagger.json",
    graphql: "/graphql"
  };

  function fetchOrder(id) {
    return fetch(CONFIG.apiBase + "/orders/" + id + "?expand=items&apiKey=" + api_key, {
      headers: authHeaders(STRIPE_LIVE)
    });
  }

  var introspection = `query IntrospectionQuery { __schema { queryType { name } types { name fields { name } } } }`;
  var getUser = `query GetUser($id: ID!) { user(id: $id) { email role token } }`;

  window.__APP__ = { CONFIG, ROUTES, fetchOrder, authHeaders, introspection, getUser };
})();
