<div align="center">

# 🦅 BugHawk

**A private, in-browser bug-bounty recon workspace.**

Organize an entire recon engagement — subdomains, ports, assets, JavaScript secrets, URLs, dorks, wordlists, findings — in one fast local dashboard. No backend, no accounts, no telemetry. Every byte lives in your own browser.

</div>

---

## What is BugHawk?

BugHawk is a single-page web app that runs on your machine and acts as the **central notebook + toolkit for a bug-bounty or pentest recon workflow**. Instead of juggling dozens of text files, spreadsheets, and terminal outputs, you paste your tool output (httpx, subfinder, nmap, katana, gau, …) into BugHawk and it parses, dedupes, organizes, cross-links, and lets you export it — all offline.

**Core ideas:**

- **Local-first & private.** All data is stored in your browser's IndexedDB. Nothing is uploaded anywhere. There is no server that holds your data.
- **Project-based.** Each target/program is a "project". Switch between them; each keeps its own subdomains, findings, notes, etc.
- **Import what you already have.** BugHawk doesn't run scanners for you — it ingests the output of the tools you already use and makes it usable.
- **Cross-linked.** Data flows between tabs: JS secrets become Findings, discovered domains become Subdomains, IPs group by status, and so on.

> ⚠️ **Ethics & scope.** BugHawk is for **authorized** security testing, bug-bounty programs, CTFs, and education. Only test assets you have explicit permission to test.

---

## Quick start

```bash
git clone https://github.com/mehulgupta1/bughawk.git
cd bughawk
npm install
npm run dev        # opens the dev server (http://localhost:5173)
```

**First launch:** you'll be asked to create a **username + password**. This locks the workspace on this browser. (It's a local convenience lock, not server-grade auth — see [Security model](#security-model).)

### Run it privately (no dev server)

For day-to-day private use, one command builds the app and serves it on a fixed local port:

```bash
npm run serve     # builds, then serves at http://localhost:5050
```

On Windows you can just double-click **`start-app.bat`** — it builds, launches the server, and opens your browser. Use this fixed URL (`:5050`) as your permanent home so your saved data doesn't get split across ports (see [FAQ](#faq)).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload (development) |
| `npm run build` | Production build into `dist/` |
| `npm run serve` | Build + serve privately at `http://localhost:5050` |
| `npm start` | Serve an existing `dist/` build |
| `npm test` | Run the engine unit tests (`node --test`) |
| `npm run lint` | Run ESLint |

---

## Feature guide

Each of these is a tab in the left sidebar. Open the **command palette** any time with **`Ctrl/⌘ + K`** to jump between them or run actions.

### 📊 Dashboard
Your at-a-glance overview for the active project: total subdomains, status-code breakdown (donut + spectrum), tech distribution, activity feed, flagged hosts, a recon-progress overview, "new since last visit", a heatmap, trend chart, and a quick notes scratchpad. Nothing to configure — it summarizes whatever data your other tabs contain.

### 🎯 Scope
Define what's **in scope** and **out of scope** for the program (root domains, wildcards like `*.example.com`, explicit excludes). Once scope is set, other tabs become scope-aware: out-of-scope subdomains/URLs can be hidden or flagged so you never waste time (or break rules) on something you shouldn't touch. Includes a diff view to see what changed when a program updates its scope.

### 🌐 Subdomains
The heart of the tool. **Paste or import** subdomain data in several formats:
- **httpx JSONL** (recommended — carries status, title, tech, IP, CNAME, length, redirect location, …)
- Bracket format (`host [200] [title] [tech]`)
- Space/CSV-separated, or a plain list of hosts

Features:
- **Virtualized table** that stays smooth at 100k+ rows.
- **Dynamic columns** — the table adapts to whatever fields your data actually has (Title, CNAME, IP, Tech, Length, plus any extra httpx fields). Toggle columns via the **Columns** menu.
- **Status filtering** (2xx/3xx/4xx/5xx pills), full-text search, and sorting.
- **Status history** per host (◷) — track when a host's status changed across imports.
- **Smart-flagging** by keyword (e.g. flag anything matching `admin`, `dev`, `staging`).
- **Audit state** per host (untested / testing / vulnerable / safe).
- **Clickable hosts** open in a new tab; **CNAME column** surfaces takeover candidates (e.g. a dead host still pointing at an S3 bucket).
- **Bulk operations**, **export by status** (`.txt`/`.csv`), and **in-app saved sessions** you can reload later.

### 🖧 Port Scan
Import **nmap** (XML) or masscan-style output. Parses hosts, open ports, services, versions, and banners into a browsable table with per-host detail. Includes port **diffing** between two scans (what opened/closed), saved sessions, and CVE hints derived from detected service versions.

### 🗂 Assets
A raw-asset vault with three buckets — **Subdomains**, **URLs**, **JS Files** — plus a derived **IPs** view:
- **Smart import** auto-routes a mixed dump into the right bucket.
- Dedupes, tags sources, tracks "new since last seen", and can detect **dead endpoints** (URLs whose host returns 404/5xx in your Subdomains data).
- **🖥 IPs tab**: pulls every unique IP from your subdomains and **groups them by HTTP status** (all your `200` IPs, all your `301` IPs, …), with per-group copy/export. Great for spotting infrastructure to probe directly.
- Full vault export/import as JSON.

### 🔗 URL Parser
Paste a large list of URLs (gau/katana/waymore output). It parses them in a **Web Worker** and extracts: interesting parameters, secrets in query strings (API keys/tokens), file extensions, endpoints, and other juicy signals — without freezing the UI. Export results as **CSV** or **TXT**.

### 🔎 JS Recon
Deep JavaScript analysis. Give it raw JS, a list of `.js` URLs, or local `.js` files and it extracts:
- **Secrets & API keys** (~260 rules across cloud, third-party, DB, private-key categories) with a confidence score.
- **Security misconfigurations**, **endpoints**, **webpack chunks**, **source maps**, **framework fingerprints**, **parameters**, **domains**, **GraphQL operations**, and **juicy paths**.
- An **AST pass** (acorn) recovers runtime-built endpoints that regex misses — e.g. `"/api/" + v`, `` `/api/${id}` ``, `fetch(u)`.

It's **CORS-free**: the browser calls a same-origin `/__jsproxy?url=…` helper and the Node process fetches the target server-side, so you can pull remote JS without a browser extension or external proxy. A **worker pool** parallelizes across CPU cores.

Extras: By-file / Merged views with pagination, per-file **risk score**, **recursive** scanning of discovered chunks/source maps, **diff mode** (only new since last scan), Markdown/JSON report export, ready-to-run **nuclei/httpx/ffuf/curl** commands, and cross-tab actions (send a secret → Findings, send domains → Subdomains).

### 🕸 Attack Surface
A visual graph tying your data together — domains, hosts, endpoints, and their relationships — so you can see the shape of the target's exposed surface rather than a flat list.

### 🧪 HTTP Analyzer
Paste a raw HTTP request/response (or headers) and it flags security-relevant issues: missing/weak security headers, permissive CORS, cookie flags, information disclosure, secrets in the body, and more — each with a severity.

### 🧱 Tech Stack
Aggregates the technologies detected across all your hosts into a searchable breakdown (which tech, how many hosts, which hosts). Handy for "show me everything running Tomcat/WordPress/GraphQL."

### 📝 Findings
Your vulnerability tracker. Log findings with title, host, severity, and notes; filter and search them; and receive findings pushed in from other tabs (e.g. a secret found in JS Recon). Export for reporting.

### 📓 Notebook
Free-form markdown notes per project — methodology, payloads that worked, credentials to remember, next steps.

### 🐙 Dorks
A large library of **GitHub** and **Google** dork templates (350+ each) across categories — secrets, private keys, cloud keys, third-party tokens, sensitive files, DB strings, login panels, cloud-storage buckets (S3/Azure/GCS/Drive), and more. Type your target once and every dork becomes a **one-click search link** with the target substituted in. You can also **add your own dorks** and **create new categories**.

### 📚 Wordlists
Store and manage fuzzing wordlists in-app. Add lists (paste or drag-drop a `.txt`), tag them by category/variant, filter by name/content, and **export/import all lists as JSON** — useful for backup or moving them between browsers/ports.

### ⚙️ Settings
- **Security** — change your username/password (requires the current password) and log out.
- **API Keys vault** — store keys for common recon tools (subfinder's 20+ providers, chaos, findomain, github, shodan, virustotal) in a tabbed vault, and export them as a ready-to-use config (subfinder YAML / `.env`). Keys are stored locally in your browser only.
- Theme toggle (light/dark) and other preferences.

---

## Security model

Please read this before relying on BugHawk for anything sensitive:

- **The login is a local lock, not real authentication.** Your password is hashed (salted SHA-256) and checked in-browser to gate the UI. Anyone with access to the machine/browser profile can reach the underlying IndexedDB. Treat BugHawk as a personal, single-user tool on a machine you control.
- **`/__jsproxy` is an open, localhost-only fetch helper.** It will fetch any URL it's handed. It's bound to `127.0.0.1` by design — **do not expose the dev/serve port to an untrusted network**, or you turn your machine into an open proxy.
- **API keys and stored data are not encrypted at rest** beyond the browser's own storage. Don't use this on a shared/public computer.
- **No data leaves your machine** — there is no backend, analytics, or phone-home.

---

## Tech stack

- **Vite 5** + **React 18** (single-page app)
- **IndexedDB** via [`idb`](https://github.com/jakearchibald/idb) for all persistence (per-project)
- **Web Workers** for heavy parsing/scanning (URL parser, JS recon, wordlist cleaning) so the UI never blocks
- **acorn** for AST-based endpoint recovery in JS Recon
- Zero runtime backend — a tiny zero-dependency Node server (`server.mjs`) only serves the built files + the `/__jsproxy` helper for private use

### Project layout

```
src/
  components/*   one folder per tab (Subdomains, JsRecon, Assets, …)
  lib/*          pure, DOM-free engines + IndexedDB storage (storage.js)
  hooks/*        project/data React hooks
  **/<x>.worker.js  Web Workers for heavy scans
  styles/*       CSS (BugHawk theme via CSS variables)
server.mjs       zero-dep production server (dist/ + /__jsproxy)
vite.config.js   dev/preview server + jsProxyPlugin (CORS-free fetch)
jsrecon/samples/ sample .js files & URL lists for manual testing
```

---

## FAQ

**Where is my data? Can I move it to another computer?**
It's in your browser's IndexedDB, scoped to the exact origin (`protocol://host:port`). That means data saved on `localhost:5173` is **not** visible on `localhost:5050` — different port = different storage. Use each tab's **Export/Import** (Wordlists, Assets vault, Subdomain sessions, Findings) to move data between origins or machines, and pick **one URL** (e.g. the `:5050` private server) as your permanent home.

**Does it run the scanners (subfinder, nmap, httpx) for me?**
No. BugHawk organizes and analyzes the **output** of those tools. You run the tools; you paste/import the results.

**Can I use it alongside Burp Suite?**
Yes — Burp on `127.0.0.1:8080` and BugHawk on `127.0.0.1:5050` don't conflict.

**Is it safe to make my repo/dev server public?**
The *code* is fine to open-source. Do **not** expose the running **dev/serve port** to the internet (see [Security model](#security-model)).

---

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run lint` and `npm test` before opening a PR.

## License

[MIT](LICENSE) © 2026 Mehul Gupta
