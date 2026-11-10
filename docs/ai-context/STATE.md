# State (updated 2026-11-10)

**Project:** `opendb-store`, a zero-dependency wrapper for localStorage, sessionStorage, cookies, and IndexedDB: JSON,
namespaces, TTL, cross-tab events, migrations, debug tool. Core 4.4 kB gzipped; IndexedDB 5.0 kB; compression 1.1 kB; cache 1 kB; React 0.5 kB.

**Goal:** production-grade `3.0.0`. Plan: `docs/PRODUCTION_PLAN.md`.

## Where things are

| State | Facts |
| --- | --- |
| npm `2.0.1` | `latest`. Compatibility baseline. Separator `.`, 15 methods, 0 deps. `set` throws on failure |
| `master` | 3.0 code (PRs #3, #5). Release run tagged `v3.0.0` but npm publish failed |
| `next` (remote) | All 3.0 code, pushed from `refactor/v3`. Pushes run the release workflow (`3.0.0-next.N`, npm tag `next`) |
| Tag `v2.0.1` | Pushed |

Failed releases (2026-11-10): attempt 1 of runs 42756363747 (`next`) and 42757690342 (`master`) pushed release
commits and tags `v3.0.0-next.2` and `v3.0.0`, then `npm publish` failed (cause only in the run log, likely npm
auth). The re-runs passed but published nothing: the branch was ahead, so semantic-release exited 0.

Branch `fix/release-sync` (from `master`): reverts the unpublished `3.0.0` commit, adds `scripts/release.sh`
(stale-run guard, rollback when npm lacks the version, post-release check of every version), commits
`src/version.ts` in releases, and deploys Pages from the release tag after a `master` release.

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

Fix npm auth (read the attempt 1 log), delete the stale tags `v3.0.0` and `v3.0.0-next.2`, enable Pages, then
merge `fix/release-sync` to `master` to publish `3.0.0`. Owner steps are in `docs/ai-context/TASKS.md`.
