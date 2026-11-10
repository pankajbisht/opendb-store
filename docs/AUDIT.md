# Audit findings (2026-11-09)

> **Status:** this is a snapshot of the code before the `refactor/v3` work. Fixed on that branch: every
> item except CI-06 and DOC-03, which need owner access to npm and GitHub. DOC-01 is resolved by building cookie
> support. Line numbers refer to files that have since
> been replaced. Open items are tracked in [ai-context/BUGS.md](ai-context/BUGS.md).

**Where it applies**

- `PUB`: in the published `opendb-store@2.0.1` and affecting users today.
- `WT`: only in the uncommitted working tree. Introduced by the refactor.

**How it was confirmed**

- `Ran`: reproduced by executing the code in jsdom or Node.
- `Read`: established from the source or configuration.
- `Spec`: follows from documented browser behaviour; not reproduced here.

**Baseline**

| State | Tests | Lint |
| --- | --- | --- |
| Committed `master` | 56 of 56 pass | Clean |
| Working tree | 1 of 56 pass, 7 of 7 suites fail | 88 errors, 1 warning |

## Correctness

| ID | Pri | In | Found by | Location | Problem and effect |
| --- | --- | --- | --- | --- | --- |
| BUG-01 | P0 | WT | Ran | `modules/get.js:19`, `has.js:9` | Cache is checked before expiry. `get` and `has` keep returning values after their TTL. |
| BUG-02 | P0 | WT | Ran | `get.js:19`, `core/context.js:10` | Cache is never invalidated. Other tabs, instances, or direct removals leave stale values. The Map is also unbounded. |
| BUG-03 | P0 | WT | Ran | `set.js:34`, `get.js:20` | Cache stores the caller's object. Mutating it changes reads without persisting. A `Date` is an object before reload and a string after. |
| BUG-04 | P0 | WT | Ran | `modules/operations.js:15` | `get` wrapper drops `defaultValue`, so `get('missing', 'd')` returns `null`. |
| BUG-05 | P0 | WT | Ran | `modules/index.js:26`, `operations.js:14` | Only `get`, `set`, and `has` are exposed. `remove`, `clear`, `size`, `db.config`, and others are gone. |
| BUG-06 | P0 | WT | Read | `config/config.js:57` | Default separator changed from `.` to `:`. Every key written by 2.x becomes unreadable. |
| BUG-07 | P0 | PUB | Ran | `core/storage.js:7` | `window` is read at import. Node and SSR crash with `window is not defined`. |
| BUG-08 | P0 | PUB | Spec | `core/storage.js:7`, `core/support.js:2` | Reading `window.localStorage` can throw `SecurityError` in sandboxed iframes or with storage blocked, failing the whole import. There is no write probe. |
| BUG-09 | P0 | WT | Ran | `operations.js:6`, `dist/opendb-esm.js:451` | `console.log` of storage and options runs at startup and is in the built output. |
| BUG-13 | P0 | PUB | Read | `modules/clear.js:10`, `keys.js:5`, `values.js`, `entries.js` | `clear()` empties the entire origin, including other libraries' data. Iteration ignores the namespace. |
| BUG-14 | P1 | PUB | Ran | `modules/trim.js:9` | Calls `storage.get`, which does not exist. Always throws `TypeError`. |
| BUG-15 | P1 | WT | Ran | `modules/patch.js:8` | With a schema, `pick` receives the wrong arguments and returns `{}`. **The stored value is overwritten with `{}`.** Not wired up yet. |
| BUG-16 | P1 | WT | Ran | `modules/key.js:2` | Calls `ctx.key`; should be `ctx.storage.key`. Throws `TypeError`. |
| BUG-17 | P1 | WT | Read | `remove.js:1`, `entries.js:1`, `value.js:1`, `values.js:1`, `used.js:1` | Import exports that no longer exist. The build fails as soon as these are re-enabled. |
| BUG-18 | P2 | WT | Read | `memo/cacheManager.js:2` | Calls itself with no exit, so it would overflow the stack. Dead code, but shipped in `src`. |
| BUG-19 | P1 | PUB | Ran | `utils/isNull.js:9`, `errors/isInvalidArg.js:5` | The string `"null"` counts as null, so a key named `"null"` is silently refused. |
| BUG-20 | P1 | WT | Ran | `utils/readRaw.js:3` | Number keys are rejected by `has` on a fresh instance, though `get` and `set` accept them. |
| BUG-21 | P1 | WT | Ran | `get.js:43`, `has.js:12` | Values not written by this library return `undefined` instead of the default, and `has` is inconsistent (`true` for `"plain"`, `false` for `0`). |
| BUG-22 | P1 | PUB | Ran | Published `has.js`, `tests/has.test.js` | `has()` is `false` for a stored `''` or `null`, so it does not mean "exists". Test names say `true` while assertions say `false`. |
| BUG-23 | P1 | PUB | Ran | `set.js:37`, `src/index.d.ts:12` | Write failures are handled badly in both versions. 2.0.1 has no `try/catch`, so a quota error or circular value throws to the caller. The working tree only logs a warning and returns `false`, with no error detail. |
| BUG-24 | P1 | PUB | Read | `used.js`, `size.js`, `free.js`, `const/capacity.js` | Sizes measure UTF-8 of the JSON value without the payload wrapper, while browsers limit storage by UTF-16 length. The 5 MB capacity is an assumption. |
| BUG-25 | P2 | PUB | Read | `get.js:34` | Expired entries are removed only when read, so unread entries use quota forever. |
| BUG-26 | P1 | WT | Ran | `config/config.js:69` | Namespaces can contain the separator: `a:b` + `c` collides with `a` + `b:c`. |
| BUG-27 | P1 | PUB | Ran | `set.js:19`, `tests/clear.test.js:32`, `tests/remove.test.js:26,33` | Options are not validated. `{ expires: 500 }`, a typo used three times in the test suite itself, silently stores forever. So does `expire: 0`. |
| BUG-28 | P2 | WT | Read | `config.js:58`, `core/storage.js:7` | `defaultTTL` and `slidingTTL` are accepted but ignored, and consumers have no way to set a namespace. |
| BUG-29 | P3 | WT | Ran | `operations.js:10` | The raw `storage` object is exposed. It is a useful escape hatch but bypasses all library rules, so it should be documented as such. |

IDs 10, 11, and 12 are intentionally unused; those items are tracked as `PKG-01`, `PKG-02`, and `PKG-04`.

## Packaging and build

| ID | Pri | In | Found by | Location | Problem and effect |
| --- | --- | --- | --- | --- | --- |
| PKG-01 | P0 | WT | Read | `package.json` | About 450 build-tool packages are listed as runtime `dependencies`. The published 2.0.1 has none. `npm audit --omit=dev` reports 60 vulnerabilities, all because of this block. |
| PKG-02 | P0 | PUB | Ran | `package.json` `type`, `exports` | `type: module` makes the UMD `.js` load as ESM. `require('opendb-store')` returns an empty object with no error and sets `globalThis.db`. |
| PKG-03 | P1 | PUB | Ran | `package.json` `build:types` | There is no `tsconfig.json`, so `build:types` only prints help. `dist/index.d.ts` is a hand-made copy. |
| PKG-04 | P0 | PUB | Ran | `package.json` `exports` | No `types` condition. TypeScript under `bundler` and `nodenext` fails with TS7016. |
| PKG-05 | P2 | PUB | Read | `package.json` `files` | Raw `src/` ships to consumers, while source maps do not. |
| PKG-06 | P2 | PUB | Read | `rollup.config.js`, `rollup.common.js` | `treeshake: false` and no `sideEffects` field. The `intro` read from `src/index.js` is always empty. |
| PKG-07 | P1 | PUB | Read | Repository root | `package.json` says ISC but there is no `LICENSE` file. |
| PKG-08 | P3 | PUB | Read | `package.json` | No `engines` field or stated browser baseline. Output uses ES2020 syntax untranspiled. |
| PKG-09 | P3 | PUB | Read | `webpack.*.js`, `src/package.json`, `@rollup/plugin-babel` | Unused build config and a stray manifest. |

## Types

| ID | Pri | In | Found by | Location | Problem and effect |
| --- | --- | --- | --- | --- | --- |
| TYP-01 | P1 | WT | Read | `src/index.d.ts:11-44` | Declares `db.config` and about 12 methods that the working tree does not have. |
| TYP-02 | P2 | PUB | Read | `src/index.d.ts:12-13` | `options` falls back to `any`, and the `key?` parameters are optional. In the working tree `set` also returns a boolean while typed `void`. |

## Testing and CI

| ID | Pri | In | Found by | Location | Problem and effect |
| --- | --- | --- | --- | --- | --- |
| CI-01 | P1 | PUB | Ran | `tests/*.js` | Tests import `dist/`, so running Jest alone tests whatever was last built. |
| CI-02 | P1 | PUB | Read | `jest.config.js` | No coverage threshold. Failure paths such as quota and corrupt data are untested. |
| CI-03 | P1 | PUB | Read | `jest.config.js` | jsdom only; no real browser. Quota and access errors cannot be exercised. |
| CI-04 | P3 | PUB | Read | `.husky/pre-commit` | The full build and test suite runs on every commit. `git add` in `lint-staged` is obsolete. |
| CI-05 | P3 | PUB | Read | `release.yml` | A debug `npm whoami` step remains. |
| CI-06 | P1 | PUB | Read | `release.yml`, `.releaserc` | Long-lived `NPM_TOKEN` and no provenance. |
| CI-07 | P1 | PUB | Read | `release.yml` | Every push to `master` can publish, with no pre-release channel. |
| CI-08 | P2 | PUB | Ran | Tags, `CHANGELOG.md` | npm is at 2.0.1, but the latest git tag and changelog entry are 1.5.0. Versions 1.3 to 1.5 were tagged but never published. |
| CI-09 | P3 | PUB | Ran | `eslint.config.js`, `package.json` `lint` | `recommended` is applied last and overrides `no-unused-vars: warn`. The unquoted glob misses `src/index.js`. |

## Documentation

| ID | Pri | In | Found by | Location | Problem and effect |
| --- | --- | --- | --- | --- | --- |
| DOC-01 | P1 | PUB | Read | `README.md`, `package.json` | Advertises cookie support, which does not exist. |
| DOC-02 | P2 | PUB | Read | `README.md` | Pins the CDN example to 1.1.0, and most methods and all namespace usage are undocumented. |
| DOC-03 | P2 | PUB | Read | Repository root | No `CONTRIBUTING`, no security policy, no guidance on what is unsafe to store. |

## Performance and security review (2026-11-09, `refactor/v3`)

All items below are fixed, each with a regression test in `tests/security.test.ts` or `tests/ssr.test.ts`.

### Security

| Severity | Issue | Confirmed by | Fix |
| --- | --- | --- | --- |
| High | Without a `window`, data was kept in process-wide memory, so one server request could read another's | Ran | Servers keep nothing; memory is opt-in |
| High | `cookie.path`, `domain`, and `sameSite` could inject extra attributes | Ran | Rejected by `createStore` |
| Medium | A cookie named `app%2Ekey` could pose as `app.key` | Ran | Names must match this library's own encoding |
| Medium | `pick` with `__proto__` set the prototype of its result from stored data | Ran | Plain properties only |
| Low | A very long `expire` produced an invalid `Max-Age`, so the cookie silently became a session cookie | Ran | Capped at the 400-day browser limit |
| Low | Non-numeric `expire` and `v` from edited storage were used | Ran | Ignored when decoding |
| Low | `pluck` and `where` read inherited fields such as `constructor` | Ran | Own fields only |
| Low | Stored keys reached `console.warn` as format strings | Read | Fixed first argument |
| Low | A throwing `onError`, or storage failing while listing, escaped as an exception despite the no-throw guarantee | Ran | Contained and reported |
| Hardening | The release job ran dependency install scripts next to the publish credentials, with a restorable cache and persisted git credentials | Read | `--ignore-scripts`, no release cache, `persist-credentials: false` |

Not applicable: global prototype pollution through `get` and `patch` was tested and does not occur. The library
has no HTML output and no runtime dependencies. The 44 remaining `npm audit` findings are moderate and in
development tools; none ship to users.

### Performance

Measured in Chromium (Firefox and WebKit moved in the same direction). `get`, `set`, and `has` were already within
about 1 microsecond of the native calls and did not change.

| Case | Before | After | Fix |
| --- | --- | --- | --- |
| `keys()` with 120 cookies | 18.4 ms | 1.4 ms | Reuse parsing while the cookie text is unchanged |
| `cookie.get` with 120 cookies | 52.6 us | 6.2 us | Same |
| `keys()` with 20,000 memory entries | 602 ms | 7.5 ms | Key order built once, not per index |
| `set` with 4,000 subscribers on other keys | 35.1 us | 5.6 us | Subscribers grouped by key |
| New store's first read | 13.1 us | 1.7 us | Real storage probed once per page |
| Listener writing its own key | 1,151 nested calls | 1 call | Re-entrancy guard |

Each store reads and parses on every `get`, by design. Repeated reads of very large values cost about 0.1 to 1 ms
per megabyte, so hold large results in a variable rather than re-reading them in a loop.


## IndexedDB performance (2026-11-09)

Measured in Chromium, Firefox, and WebKit against raw IndexedDB calls.

| Case | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Raw `put` | 0.09 ms | 0.13 ms | 0.24 ms |
| `set` | 0.12 ms | 0.17 ms | 0.17 ms |
| Raw `get` | 0.08 ms | 0.07 ms | 0.15 ms |
| `get` | 0.09 ms | 0.14 ms | 0.20 ms |
| `patch` | 0.19 ms | 0.27 ms | 0.32 ms |
| 1,000 parallel `set` calls | 109 ms | 132 ms | 181 ms |
| `keys()` with 3,001 entries | 63 ms | 12 ms | 8 ms |
| `purgeExpired()` with nothing to remove | 0.7 ms | under 0.1 ms | 0.3 ms |

`keys()` and `count` decode every record, so they stay consistent with `has` and `get`.

## Full storage and compression (2026-11-10)

With 4,400 entries filling about 4.5 MB, in Chromium (Firefox and WebKit moved the same way):

| Operation | Before | After |
| --- | --- | --- |
| `get`, `has`, `ttl` on one normal entry | about 0.01 ms | about 0.01 ms |
| `keys()` | 6.5 ms | 2.5 ms |
| `count` | 5.5 ms | 2.0 ms |
| `purgeExpired()` | 3.9 ms | 1.8 ms |
| A write that fails because storage is full | 6.6 ms | 2.8 ms |
| `has`, `ttl`, `size` on one 4.4 MB value, Firefox | 4.6 to 4.9 ms | under 0.1 ms |

The change reads expiry from the end of the stored text instead of decoding values.

Optional compression with 2,000 realistic product records: 17 times smaller. Product records that fit before
storage is full rose from about 30,000 to about 200,000 in Chromium and Firefox, and to about 100,000 in WebKit.
Writing took about 12 ms instead of 1 ms, and reading about 3.5 ms instead of 0.5 ms.

