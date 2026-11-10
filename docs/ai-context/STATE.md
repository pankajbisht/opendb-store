# State (updated 2026-11-10)

**Project:** `opendb-store`, a zero-dependency wrapper for localStorage, sessionStorage, cookies, and IndexedDB: JSON,
namespaces, TTL, cross-tab events, migrations, debug tool. Core 4.4 kB gzipped; IndexedDB 5.0 kB; compression 1.1 kB; cache 1 kB; React 0.5 kB.

**Goal:** production-grade `3.0.0`. Plan: `docs/PRODUCTION_PLAN.md`.

## Where things are

| State | Facts |
| --- | --- |
| npm `2.0.1` | `latest`. Compatibility baseline. Separator `.`, 15 methods, 0 deps. `set` throws on failure |
| `master` | Old 2.x code. Merging `next` here publishes `3.0.0` as `latest` |
| `next` (remote) | All 3.0 code, pushed from `refactor/v3`. Pushes run the release workflow (`3.0.0-next.N`, npm tag `next`) |
| Tag `v2.0.1` | Pushed |

First `next` release run (2026-11-10, run 42750575402): every CI job passed; `semantic-release` failed before tagging,
almost certainly npm authentication (`NPM_TOKEN` secret or trusted publishing). Nothing was published.

npm discoverability: description and keywords target search terms (`localstorage`, `sessionstorage`, `cookie`,
`indexeddb`, `ttl`, ...). README has badges, a compatibility line, and "Coming from another library?". Social preview
image: `docs/assets/social-preview.png` (upload in GitHub Settings). npm shows these only once `3.0.0` is `latest`.

Verified: `npm test`, `npm run test:browser`, `npm run check:package`, examples, CSP, coverage, all in CI too.

Backups of the pre-rewrite tree are in `.git/backups/`.

## Hazards

- Pushing to `master` can auto-publish to npm.
- The core is at 4.4 of 4.6 kB. New features must be subpath exports or need a budget decision.
- The release job pushes a commit to `next`: fetch and rebase before pushing again.

## Next task

Owner-only steps in `docs/ai-context/TASKS.md`.
