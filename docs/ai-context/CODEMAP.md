# Code map (`refactor/v3`, 2026-11-09)

## src/
| File | Purpose |
| --- | --- |
| `index.ts` | Public entry: default db, `local`, `session`, `cookie`, `createStore`, `StoreError`, `version`, types |
| `query.ts` | Public entry `opendb-store/query`: `pick omit pluck where findWhere`; takes a store first |
| `debug.ts` | Public entry `opendb-store/debug`: `inspect`, `debug` |
| `store.ts` | `createStore`: validates options, lazy adapter, default reporter, builds frozen store |
| `types.ts` | All public interfaces (`Store`, `StoreOptions`, `StorageAdapter`, `CookieOptions`, …) |
| `context.ts` | `Context` type passed to operations |
| `errors.ts` | `StoreError`, `StoreErrorCode` |
| `version.ts` | Generated at build |
| `adapters/web.ts` | `resolveWebStorage` (lookup, probe, shared memory fallback), `isQuotaError` |
| `adapters/cookie.ts` | `createCookieAdapter`: encoding, attributes, 4 KB limit, read-back, `measure`, `capacity` |
| `adapters/memory.ts` | `createMemoryAdapter` |
| `codec/key.ts` | `normalizeKey`, `createKeyCodec` (`build`, `owns`, `parse`) |
| `codec/entry.ts` | `Entry` (`value`, `expire`, `v`), `decodeEntry`, `isExpired`, `isValidTTL`, `jsonSerializer` |

## src/operations/
| File | Exports |
| --- | --- |
| `internal.ts` | `requireKey`, `allRawKeys`, `rawKeys`, `rawLength`, `removeRaw`, `readEntry` (expiry + migration), `liveEntries`, `purgeExpired`, `writeEntry` (quota retry, emit) |
| `events.ts` | Subscription registry, `emit`, cross-tab `storage` listener |
| `subscribe.ts` | `subscribe` |
| `get.ts`, `has.ts`, `set.ts`, `patch.ts` | One operation each |
| `remove.ts` | `remove`, `clear` |
| `keys.ts` | `keys`, `keyAt`, `values`, `entries` |
| `size.ts` | `size`, `used`, `free`, `capacity`, `ttl`, formatting |

## tests/
`contract` (all backends) · `expiry` · `compat` (2.0.1 payloads) · `failures` · `ssr` · `query` · `cookie` ·
`events` · `migrate` · `debug` · `browser/quota` · `browser/real-browser`.
The `browser` project runs contract, expiry, compat, query, migrate, and `browser/*`.

## Other
| Path | Notes |
| --- | --- |
| `rollup.config.js` | ESM, CJS, UMD for core; ESM, CJS for query; ESM, CJS, UMD for debug; `.d.ts`, `.d.cts` |
| `vitest.config.ts` | Projects `unit` and `browser`; coverage thresholds |
| `scripts/smoke.mjs` | Consumes the built package: no deps, ESM, CJS, script tag, TS `bundler` and `nodenext` |
| `.github/workflows/` | `ci.yml` (reusable), `release.yml` (`master`, `next`), `codeql.yml` |
| `.releaserc` | `master` and prerelease `next` |
| `public/` | Manual demo; loads `dist/` |
