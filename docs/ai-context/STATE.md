# State (updated 2026-11-09)

**Project:** `opendb-store`, a zero-dependency wrapper for localStorage, sessionStorage, cookies, and IndexedDB: JSON,
namespaces, TTL, cross-tab events, migrations, debug tool. Core 4.4 kB gzipped; IndexedDB 5.0 kB; compression 1.1 kB; cache 1 kB; React 0.5 kB.

**Goal:** production-grade `3.0.0`. Plan: `docs/PRODUCTION_PLAN.md`.

## Where things are

| State | Facts |
| --- | --- |
| npm `2.0.1` | Compatibility baseline. Separator `.`, 15 methods, 0 deps. `set` throws on failure |
| `master` | Old 2.x code |
| `refactor/v3` | All code for 3.0, committed locally. Not pushed |
| Tag `v2.0.1` | Created locally. Must be pushed, or semantic-release computes 2.0.0 and fails |

Verified on `refactor/v3`: see `npm test`, `npm run test:browser`, `npm run check:package`;
`publint`, `attw`, size budget, smoke tests (Node 20 and current); packed tarball in real Vite and Next.js apps
in all three browsers. GitHub workflows have never run.

Backups of the pre-rewrite tree are in `.git/backups/`.

## Hazards

- Pushing to `master` can auto-publish to npm.
- The core is at 4.4 of 4.6 kB. New features must be subpath exports or need a budget decision.

## Next task

Owner-only release steps: `docs/DEVELOPMENT.md`, "First release of 3.0". Nothing else is planned.
