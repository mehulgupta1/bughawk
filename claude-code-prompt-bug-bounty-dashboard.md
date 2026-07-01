# Build: Bug Bounty Recon Dashboard

You are building a local-first, desktop-focused React web app for security researchers doing bug bounty recon. It manages isolated "projects" (one per target program, e.g. hackerone.com) and includes a subdomain recon tab that ingests pasted scan results (from tools like httpx) and lets the researcher triage them at scale (up to 50,000 rows) without lag.

This is a legitimate, defensive recon/organization tool — it does **not** send live requests to targets or do any scanning itself. It only parses and organizes results the researcher already collected locally with their own tools.

## Tech stack — non-negotiable

- **Vite + React** (JavaScript, functional components + hooks)
- **Plain CSS** in separate files — no Tailwind, no CSS-in-JS, no UI kit. Hand-written CSS using a token system (see Design System below).
- **No backend.** Persistence is `localStorage` only.
- Keep logic, markup/JSX, and styles in **separate files** — do not put component JSX, styling, and business logic all in one file. See required structure below.

## Required file structure

```
src/
├── main.jsx
├── App.jsx
├── styles/
│   ├── variables.css        # design tokens only
│   ├── base.css              # resets, typography defaults
│   ├── layout.css            # app shell, sidebar, tabs
│   └── components.css        # buttons, inputs, modals, badges, table
├── components/
│   ├── Sidebar/
│   │   ├── Sidebar.jsx
│   │   ├── ProjectSwitcher.jsx
│   │   └── ProjectModal.jsx          # create/rename project dialog
│   └── SubdomainTab/
│       ├── SubdomainTab.jsx          # composition only
│       ├── ImportModal.jsx           # paste box + parse preview
│       ├── FilterBar.jsx             # search + status chips
│       ├── StatusSpectrum.jsx        # signature visual (see below)
│       ├── StatsBar.jsx
│       ├── VirtualTable.jsx          # windowed rendering, generic
│       └── StatusBadge.jsx
├── hooks/
│   ├── useProjects.js        # CRUD + active project state
│   └── useSubdomains.js      # load/save/filter/sort for active project
├── lib/
│   ├── storage.js            # localStorage get/set wrapper, namespacing
│   ├── parser.js             # paste-text → subdomain records
│   └── exporter.js           # filtered records → .txt / .csv download
└── utils/
    └── debounce.js
```

## Design system — follow exactly

Do not substitute a default Tailwind-style palette or Inter-everywhere typography. This is a precision "operator console" aesthetic for security researchers — dark, dense, calm, with color reserved for meaning (status codes), not decoration.

**Color tokens** (`variables.css`):
```css
--bg-base: #0B0D10;
--bg-surface: #14171C;
--bg-surface-raised: #1B1F26;
--border-subtle: #262B33;

--text-primary: #E8EAED;
--text-secondary: #8B92A0;
--text-tertiary: #5A6170;

--accent-primary: #6E6BFF;        /* indigo, not neon green — primary actions, active states, focus rings */
--accent-primary-dim: rgba(110,107,255,0.15);

--status-2xx: #34D399;  /* emerald */
--status-3xx: #38BDF8;  /* sky */
--status-4xx: #FBBF24;  /* amber */
--status-5xx: #FB7185;  /* rose */
--status-other: #8B92A0; /* unknown/timeout */
```

**Typography:**
- Display/UI face (headings, nav labels, buttons): **Space Grotesk**
- Body face (descriptions, modals, empty states): **Inter**
- Data face (every domain, status code, count, timestamp, anything that is *data*): **JetBrains Mono** — this is the tool's instrument and should feel like a terminal/IDE, not a marketing page.

Load all three via Google Fonts or self-hosted `@font-face`.

**Layout concept:**
- Left rail (~72px, icon-based) with the project switcher pinned at the top (current project name/avatar, click to open a dropdown of all projects + "New project"), then tab navigation below it (Subdomains tab now; structure it so more tabs can be added later).
- Top bar in main content: active project name, total host count, global "Import" button.
- Main content area: tab content.

**Signature element — Status Spectrum bar:**
A thin (6–8px) horizontal bar directly under the filter bar, divided proportionally into segments colored by `--status-2xx/3xx/4xx/5xx/other` representing the current filtered dataset's status code distribution. It should re-render live as filters change. This is the one bold/memorable visual element — keep everything else restrained around it.

**Restraint:** No gradients-as-decoration, no glow/neon effects, no glassmorphism. Borders are 1px `--border-subtle`. Motion is limited to: modal fade/scale-in (150ms), row hover background transition, spectrum bar segment width transitions (200ms ease). Respect `prefers-reduced-motion`.

## Feature 1: Project Switcher

- A "project" = `{ id, name, createdAt, subdomainCount }`, stored in `localStorage` under key `bbd:projects` (array).
- Active project id stored under `bbd:activeProjectId`.
- Each project's subdomain records stored under their **own** namespaced key: `bbd:project:<id>:subdomains` — this is what gives data isolation. Switching the active project must swap the entire dataset shown in the Subdomains tab; nothing from one project should ever appear while another is active.
- Operations required: **create**, **rename**, **delete** (with confirm-step, since it's destructive), **switch**. All via the `ProjectModal` + `ProjectSwitcher` components, backed by the `useProjects` hook — no direct `localStorage` calls inside components.
- Deleting a project must also delete its `bbd:project:<id>:subdomains` key.
- Empty state (no projects yet): an inviting "Create your first project" prompt, not a blank sidebar.

## Feature 2: Subdomain Recon Tab

### Import
- "Import" opens `ImportModal`: a large textarea for pasting raw scan output, plus a live count of detected rows and a small preview table (first ~5 parsed rows) before confirming import.
- `lib/parser.js` must detect and handle, line by line, **all** of these formats (try in this order, fall back gracefully, never throw on a bad line — just mark that line's status as `unknown` and keep going):
  1. httpx default bracket format: `https://sub.example.com [200]`
  2. httpx with extras: `https://sub.example.com [200] [Page Title] [tech1,tech2]`
  3. CSV: `sub.example.com,200` or `sub.example.com,200,Page Title`
  4. JSON Lines (one JSON object per line), e.g. `{"url":"https://sub.example.com","status_code":200,"title":"...","tech":["nginx"]}`
  5. Plain domain, no status: `sub.example.com` → status `unknown`
- On import, **dedupe** by hostname against existing records in the active project (merge/update rather than create duplicates), and report how many were added vs. updated vs. skipped.
- Imported record shape: `{ id, host, status, title, tech, length, tag, note, addedAt }`

### Table (performance-critical)
- `VirtualTable` must be a **generic windowed list**: only render the rows currently in/near the visible scroll viewport (calculate via `scrollTop` / fixed row height + an overscan buffer of ~10 rows above/below), using a tall spacer element to preserve correct scrollbar height. Do not render 50,000 DOM nodes. Do not use `.map()` over the full dataset to produce JSX directly — that defeats the purpose.
- Columns: status badge, host (mono, clickable/copyable), title, length, tag star, actions.
- Sortable by status, host (alphabetical), length — sorting should not block the UI on large datasets (consider sorting once into a memoized array, not on every render).
- Row click toggles a "tag" (star = interesting) and opens an inline note field.

### Filters & search
- Search box filters by hostname substring, **debounced** (150–200ms) so typing doesn't re-filter 50k rows per keystroke.
- Status filter chips: `2xx` `3xx` `4xx` `5xx` `other`, multi-selectable, toggle on/off.
- Filtering must produce a memoized derived array (`useMemo`), not re-filter inside the render of every row.

### Stats & Spectrum
- `StatsBar`: total hosts, and a count per status group, live-updating with the current filter.
- `StatusSpectrum`: see Design System above.

### Export
- "Export filtered" button in the tab toolbar: downloads the **currently filtered/visible** set as `.txt` (one host per line) or `.csv` (host, status, title), via `lib/exporter.js`.

## Performance requirements (hard constraints)

- Must stay responsive (no jank, no dropped-frame scroll) with **50,000 rows** loaded.
- No full-list re-render on search keystrokes, status filter toggles, or tag toggles — only the windowed visible slice should re-render.
- Avoid recreating large arrays unnecessarily; use `useMemo`/`useCallback` for derived data and handlers passed into the virtual list.
- Import of 50,000 pasted lines should parse without freezing the UI — consider chunked parsing (e.g. `requestIdleCallback` or batching with `setTimeout(0)`) if a naive synchronous parse is noticeably blocking.

## Explicitly out of scope — do not build

- No live HTTP requests to scanned targets from the browser (CORS makes this unreliable/meaningless anyway — this tool only organizes pre-scanned results).
- No backend/server, no API calls, no authentication.

## Build order

1. Scaffold Vite + React project, set up `styles/variables.css` and font loading.
2. `lib/storage.js` + `hooks/useProjects.js` → Sidebar + ProjectSwitcher + ProjectModal (create/rename/delete/switch working end-to-end).
3. `lib/parser.js` (write it test-first against the 5 formats above) + `hooks/useSubdomains.js`.
4. `VirtualTable.jsx` as a standalone, generic, reusable windowed-list component — verify it stays smooth with a generated 50,000-row mock dataset before wiring in real data.
5. `ImportModal` → wire parser into the import flow with the add/update/skip summary.
6. `FilterBar`, `StatsBar`, `StatusSpectrum`.
7. `exporter.js` + export button.
8. Polish pass: empty states, focus states, responsive check down to ~1024px width, reduced-motion check.

Build it section by section in this order, and pause after step 4 (the virtual table) to confirm it actually performs well at 50k rows before continuing — that component is the riskiest part of the whole app.
