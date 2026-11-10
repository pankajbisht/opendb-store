# Production readiness plan

> **Progress (2026-11-09):** All engineering is done on branch `refactor/v3`. What remains needs npm or GitHub
> account access; see [DEVELOPMENT.md](DEVELOPMENT.md#first-release-of-30).

**Goal:** ship `opendb-store@3.0.0`, a small, zero-dependency, correctly typed browser storage library
that never loses data silently and is safe to import anywhere.

Defect IDs such as `BUG-04` refer to [AUDIT.md](AUDIT.md).

## 1. Assessment

The idea is sound and the footprint is small (about 1.5 kB gzipped for 2.0.1). The move away from `this`-bound
methods and a global config toward an explicit context (`src/core/context.js`) is the right direction.
It is not production grade yet, for four reasons:

1. **The refactor is half finished.** Only 3 of about 20 methods are wired up, and the new in-memory
   cache introduced most of the serious bugs.
2. **Packaging is broken for two large groups of consumers.** `require()` silently returns an empty
   object, and TypeScript cannot find the types under modern module resolution. Both affect the
   published 2.0.1.
3. **The library cannot be imported on a server.** Any SSR framework crashes at import time.
4. **Tests do not guard behaviour.** They run against a previously built `dist`, cover the happy path,
   and have no coverage gate or real-browser run.

### Scorecard

| Area | Now | Target | Main gap |
| --- | --- | --- | --- |
| Correctness | Poor | Strong | Stale cache, dropped arguments, whole-origin `clear()` |
| Packaging | Poor | Strong | `exports` map, CJS output, type resolution |
| Environment safety | Poor | Strong | Crash on import without `window` |
| Types | Poor | Strong | Hand-written `.d.ts` that disagrees with the code |
| Tests | Fair | Strong | Tests `dist`; no edge cases, gate, or browsers |
| CI and release | Fair | Strong | Long-lived token, no provenance, no package checks |
| Documentation | Poor | Strong | README claims unbuilt features and is out of date |

Usage is about 193 npm downloads a month, so a clean major version is affordable. A compatibility layer
for every old behaviour is not worth its weight.

## 2. Do this first

Commits to `master` trigger an automatic npm release, and the refactor is sitting on `master`.

1. Create a branch before committing anything: `git switch -c refactor/v3`.
2. Remove the `dependencies` block from `package.json`. It holds about 450 build-tool packages by
   mistake (`PKG-01`). If it shipped, every consumer of this zero-dependency library would install them.

## 3. Decisions

These are recommendations. Each changes the shape of the work, so overrule any you disagree with before
Phase 1 starts.

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Release as 3.0.0.** | Correct `has()` and namespace-scoped `clear()` change published behaviour. |
| D2 | **Keep the stored format and default key.** Namespace `app`, separator `.`, payload `{ value, expire }`. | The refactor's `:` would orphan all existing user data. Keeping `.` means no data migration at all. |
| D3 | **Remove the in-memory cache.** Reconsider only as an opt-in feature backed by a benchmark. | It caused BUG-01, 02, and 03, and no measurement shows it is needed. Stale reads are worse than a `getItem` call. |
| D4 | **Add `createStore(options)` as the main entry;** keep `db.local` and `db.session` as defaults. | Per-store configuration replaces the global mutable config. |
| D5 | **Make import side-effect free.** Resolve storage on first use and fall back to memory. | Fixes SSR and blocked-storage crashes, and enables tree-shaking. |
| D6 | **Write the source in TypeScript** and generate declarations. | The hand-written types have already drifted from the code. Only about 400 live lines need porting. |
| D7 | **Move `pick`, `omit`, `pluck`, `where`, `findWhere` to `opendb-store/query`, and debug tools to `opendb-store/debug`.** | They are optional; most production users should not pay for them. |
| D8 | **Support cookies with the same API,** as `db.cookie`. (Reversed by the owner; the first plan dropped them.) | One API across storage types. Cookie limits are enforced and reported rather than hidden. |
| D12 | **Add IndexedDB as `opendb-store/indexeddb`, with promise-returning methods.** (Added by the owner.) | It is asynchronous by nature. A separate entry keeps the core small and keeps `debug(db)` synchronous. |
| D13 | **Read expiry from the end of stored text instead of decoding values.** | Listing and counting at full storage were dominated by decoding values they did not need. |
| D14 | **Offer compression as `opendb-store/compress`, a serializer.** | It trades milliseconds for several times more room, so it must be a choice, and the core stays unaware of it. |
| D9 | **Keep zero runtime dependencies** and enforce it in CI. | It is the library's main selling point. |
| D10 | **Keep Rollup; replace Jest with Vitest.** Remove Webpack and Babel. | Vitest runs TypeScript natively and has a real-browser mode. The Webpack configs are unused. |

## 4. Phases

Estimates assume one developer and are rough.

### Phase 0: Stabilise (0.5 day)

- [x] Do the two steps in section 2.
- [x] Remove `console.log` from `operations.js:6` (BUG-09).
- [x] Delete commented-out code (about 147 comment lines, mostly dead code), `src/memo/`, `count.js`,
      `utils/map.js`, `utils/extend.js` (move its one build-time use inline), `src/package.json`, and
      the `webpack.*` files.
- [x] Stop tracking `dist/`, and fix `.gitignore` so it no longer lists the tracked lockfile.
- [x] Point tests at `src/`, so they exercise current code rather than the last build (CI-01).

**Exit:** the branch builds, and every remaining test failure is explained by a Phase 1 task.

### Phase 1: Correct core (2 to 3 days)

- [x] Remove the cache from `get`, `set`, and `has` (BUG-01, 02, 03).
- [x] Forward `defaultValue` (BUG-04) and restore the `.` separator (BUG-06).
- [x] Add a storage adapter resolved lazily, with safe probing and a memory fallback (BUG-07, 08).
- [x] Centralise key handling in one codec: build, parse, belongs-to-namespace. Reject namespaces that
      contain the separator (BUG-26).
- [x] Centralise payload handling in one codec: encode, decode, expiry, and foreign-value detection
      (BUG-21).
- [x] Port every method to the `ctx` style and scope all iteration to the namespace (BUG-05, 13, 14, 15,
      16, 17).
- [x] Define key rules: non-empty strings and numbers, with numbers normalised to strings. Stop treating
      the string `"null"` as null (BUG-19, 20).
- [x] Make `has()` mean "a live entry exists", including stored `''` and `null` (BUG-22).
- [x] Validate options and warn on unknown ones, or implement `defaultTTL` and `slidingTTL` (BUG-27, 28).
- [x] Report write failures: `set` returns a boolean and never throws, with an `onError` hook and typed
      error codes such as `QUOTA_EXCEEDED` (BUG-23).

**Exit:** every BUG item at P0 or P1 is closed, each with a regression test.

### Phase 2: Packaging and types (1 to 2 days)

- [x] Port `src/` to TypeScript with `strict` on, and add a `tsconfig.json` (PKG-03).
- [x] Build ESM (`.js`), CJS (`.cjs`), and a minified browser global. Keep the path
      `dist/opendb-umd.min.js` so existing CDN links still work.
- [x] Publish a correct `exports` map with `types` first, for `.` and `./query` (PKG-02, PKG-04).
- [x] Set `sideEffects: false`, enable tree-shaking, and ship source maps with `dist` only (PKG-05, 06).
- [x] Add `LICENSE` and `engines` (PKG-07, 08).
- [x] Add `publint` and `@arethetypeswrong/cli` to the build checks.

**Exit:** `publint` and `attw` pass, and a smoke test passes for ESM import, CJS require, a TypeScript
compile under `bundler` and `nodenext`, and a plain import in Node without `window`.

### Phase 3: Quality gates (2 days)

- [x] Move to Vitest, and rewrite the tests whose names contradict their assertions.
- [x] Add edge-case suites: expiry boundaries with fake timers, quota errors, corrupt and foreign values,
      Unicode keys, namespace isolation, storage access denied, SSR.
- [x] Add a contract suite run against every adapter (local, session, memory).
- [x] Run the suite in real Chromium, Firefox, and WebKit through Playwright.
- [x] Enforce coverage of at least 95% lines and 90% branches.
- [x] Add a bundle budget with `size-limit`: 4.2 kB gzipped for the core. (The first guess was 2 kB. The full API with cookies, subscriptions, migrations, and security hardening measures 3.79 kB, and a pre-release version string adds a few bytes, so the budget was 3.9 kB. Reading metadata without decoding added about 250 bytes, so it is now 4.2 kB.)

**Exit:** CI fails on a coverage drop, a size overrun, or a failure in any browser.

### Phase 4: CI, release, and supply chain (1 day)

- [x] Split CI from release, and test on supported Node LTS versions.
- [x] Add the workflow permissions for trusted publishing and remove the `npm whoami` debug step (CI-05).
- [ ] Configure trusted publishing on npm, then delete the `NPM_TOKEN` secret (CI-06). (Owner.)
- [x] Use a `next` pre-release channel so 3.0 can be tried before it becomes `latest`.
- [x] Add Renovate or Dependabot, CodeQL, and actions pinned by commit SHA.
- [x] Fail CI if `dependencies` is ever non-empty (guards D9).
- [x] Reconcile history: there are no `v2.x` git tags and `CHANGELOG.md` stops at 1.5.0 (CI-08).
- [x] Move the full `npm test` out of pre-commit into pre-push (CI-04).

**Exit:** a dry-run release from the branch produces the expected version and tarball.

### Phase 5: Features for production use (3 days)

- [x] `subscribe(key, listener)` with cross-tab updates via the `storage` event.
- [x] `purgeExpired()`, plus an optional sweep when a quota error occurs (BUG-25).
- [x] Accurate `size`, `used`, and `free` based on UTF-16 length of keys and raw values (BUG-24).
- [x] Pluggable serializer as public API, which is also the hook for encryption.
- [x] Schema version with a `migrate(old, fromVersion)` callback.

Each feature must fit inside the size budget. If one does not, it becomes a separate subpath export.

**Exit:** the API in [API.md](API.md) matches the implementation.

### Phase 6: Launch (1 day)

- [x] Rewrite the root `README.md`: accurate features, TypeScript and SSR examples, current CDN link.
- [x] Add `CONTRIBUTING.md`.
- [ ] Enable GitHub private vulnerability reporting. (Owner.)
- [x] Verify the packed package in a real Next.js app and a real Vite app, in three browsers.
- [ ] Publish `3.0.0-next.x`. (Owner.)
- [ ] Promote to `latest` and deprecate older ranges with a pointer to [MIGRATION.md](MIGRATION.md).

**Exit:** `3.0.0` is on npm with provenance, and the Definition of Done below holds.

**Total:** roughly 10 to 13 working days.

## 5. Definition of done

- Zero runtime dependencies, and at most 4.2 kB gzipped for the core.
- Importing in Node without `window` does not throw.
- ESM, CJS, the browser global, and TypeScript all resolve, verified in CI.
- Tests pass in Chromium, Firefox, and WebKit, with the coverage gate on.
- No P0 or P1 item remains open in [AUDIT.md](AUDIT.md).
- Data written by 2.0.1 reads correctly under 3.0, proven by a fixture test.
- Releases carry npm provenance, and no long-lived publish token exists.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Refactor is committed to `master` and auto-publishes | Branch first; the release job also needs `next` before `latest` |
| Existing data becomes unreadable | D2, plus a fixture test using real 2.0.1 payloads |
| `clear()` scoping surprises someone relying on a full wipe | Called out in the migration guide; the raw `storage` object remains available |
| Scope creep from Phase 5 delays the fixes | Phases 0 to 4 and 6 can ship as 3.0 alone; Phase 5 can follow as 3.1 |
| Browser quota behaviour differs | Real-browser tests; quota is never hard-coded as fact, only reported from observed errors |

## 7. Post-review backlog (2026-11-10)

The senior review produced 24 items. Status:

| # | Item | Status |
| --- | --- | --- |
| 1 | Commit pending work | Done |
| 2 | npm trusted publishing, vulnerability reporting, branch protection | Owner: see DEVELOPMENT.md |
| 3 | Publish `3.0.0-next.1` | Pending owner approval to push |
| 4 | Real devices | Emulated iPhone and Pixel checks added; real devices remain for the owner |
| 5 | Tests for medium-risk coverage gaps | Done |
| 6 | Mutation testing | Done: `npm run test:mutation`, weekly in CI |
| 7 | Coverage in real browsers | Done: `npm run test:coverage:all` |
| 8 | Property-based tests | Done: `tests/properties.test.ts` |
| 9 | Type tests and API report | Done: `tests/types.test.ts`, `api/` |
| 10 | Committed benchmarks | Done: `bench/`, weekly in CI |
| 11 | Flaky-test protection | Done: CI retries browser tests twice |
| 12 | IndexedDB batches | Done: `setMany`, `getMany`, `removeMany` |
| 13 | Native compression for IndexedDB | Declined: needs async work inside transactions, which would break atomic `patch` and migrations; IndexedDB space is rarely the constraint |
| 14 | Size-limited cache | Done: `opendb-store/cache` |
| 15 | Validation on read | Done: `validate` option |
| 16 | Repository hardening | Scorecard workflow added; account settings are the owner's |
| 17 | Content Security Policy check | Done: `npm run test:csp` |
| 18 | IndexedDB encryption | Declined: Web Crypto is async, which breaks atomic `patch` the same way as item 13, and the key would live on the same origin as any attacker script |
| 19 | React hook | Done: `opendb-store/react` |
| 20 | Cookie changes across tabs | Done: CookieStore API where available |
| 21 | `requestPersistence()` | Done |
| 22 | Generated API docs and hosted examples | Done: `npm run docs:api`, `pages.yml`; the owner enables Pages |
| 23 | IndexedDB layout upgrades | Done: versioned upgrade steps, and newer layouts open read-compatibly |
| 24 | Older-browser build | Declined: ES2020 covers every browser released since 2020; checked by parsing the build |
