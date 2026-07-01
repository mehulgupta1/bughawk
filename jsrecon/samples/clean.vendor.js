// clean.vendor.js — a "normal" file with NO secrets, used to check false positives.
// jsrecon should find some endpoints/urls but report ZERO real secrets here.
export function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

const DOCS = "https://docs.example.com/guide/getting-started";
const HEALTH = "/healthz";
const VERSION = "/api/v1/version";

// placeholder values that look like secrets but are not — entropy gate should drop them
const api_key = "your_api_key_here";
const token = "xxxxxxxxxxxxxxxx";
const password = "changeme";

export function ping() {
  return fetch(VERSION).then((r) => r.json());
}

export const links = { DOCS, HEALTH, VERSION };
