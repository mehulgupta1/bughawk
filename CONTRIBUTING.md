# Contributing

Thanks for your interest in improving the BugHawk recon dashboard! Contributions of all sizes are welcome.

## Getting started

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
```

Other scripts:

- `npm run build` — production build to `dist/`
- `npm run serve` — build + serve privately at http://localhost:5050 (includes the `/__jsproxy` CORS helper)
- `npm run lint` — ESLint
- `npm test` — unit tests (`node --test`)

## Ground rules

- **Run `npm run lint` and `npm test` before opening a PR.** CI runs both.
- Keep changes focused — one feature/fix per PR.
- The engine libs in `src/lib/` are DOM-free and shared between React and Web Workers; keep them free of browser globals so they stay testable and worker-safe.
- No new runtime dependencies unless a few lines of code genuinely can't do the job.
- Match the surrounding code style; no reformatting churn.

## Scope & ethics

This is a tool for **authorized** security testing, bug-bounty recon, and education. Please don't contribute features whose primary purpose is unauthorized access, mass targeting, or evasion.

## Pull requests

1. Fork and branch from `main`.
2. Make your change with a test where it makes sense.
3. Open a PR describing what and why. Screenshots help for UI changes.
