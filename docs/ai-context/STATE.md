# State (updated 2026-11-10)

**Project:** `opendb-store`, a zero-dependency wrapper for localStorage, sessionStorage, cookies, and IndexedDB: JSON,
namespaces, TTL, cross-tab events, migrations, debug tool. Core 4.4 kB gzipped; IndexedDB 5.0 kB; compression 1.1 kB; cache 1 kB; React 0.5 kB.

**Goal:** `3.0.0` is released. Plan and backlog: `docs/PRODUCTION_PLAN.md`.

## Where things are

| State | Facts |
| --- | --- |
| npm `3.0.0` | `latest`, with provenance, via npm trusted publishing (GitHub `pankajbisht/opendb-store`, `release.yml`) |
| npm `2.0.1` | Compatibility baseline. Separator `.`, 15 methods, 0 deps. `set` throws on failure |
| `master` | Release commit `bb0cd40`, tag `v3.0.0`, GitHub Release `v3.0.0` |
| `next` (remote) | Stale (`3.0.0-next.2` was rolled back). Reset from `master` before the next pre-release |
| Docs site | https://pankajbisht.github.io/opendb-store/ (examples in `public/`, TypeDoc in `api/`), from tag `v3.0.0` |

Accounts: npm owner `pankajbisht00031`; GitHub owner `pankajbisht`. The trusted publisher must allow `npm publish`;
stage-only ("npm stage publish") makes every release fail at upload.

Release flow (`release.yml` + `scripts/release.sh`): a stale-run guard, rollback of tag and release commit when npm
lacks the version, and a check that npm, tag, GitHub Release, `package.json`, `src/version.ts`, and `CHANGELOG.md`
agree. Pages deploys after each `master` release. Retry with "Run workflow", never "Re-run".

npm discoverability: description and keywords target search terms (`localstorage`, `sessionstorage`, `cookie`,
`indexeddb`, `ttl`, ...). README has badges, a compatibility line, and "Coming from another library?". Social preview
image: `docs/assets/social-preview.png` (upload in GitHub Settings). README links the docs site; npm shows that README
and the new `homepage` from the next release.

Verified: `npm test`, `npm run test:browser`, `npm run check:package`, examples, CSP, coverage, all in CI too.

Backups of the pre-rewrite tree are in `.git/backups/`.

## Hazards

- Pushing to `master` can auto-publish to npm.
- The core is at 4.4 of 4.6 kB. New features must be subpath exports or need a budget decision.
- The release job pushes a commit to the branch it releases: fetch and rebase before pushing again.

## Next task

Owner-only steps in `docs/ai-context/TASKS.md`: remove `NPM_TOKEN`, set the GitHub About website, reset `next`,
deprecate `<3`.
