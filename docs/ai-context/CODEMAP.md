# Code map (`refactor/v3`, 2026-11-09)

## src/
| File | Purpose |
| --- | --- |
| `index.ts` | Public entry: default db, `local`, `session`, `cookie`, `createStore`, `createMemoryAdapter`, `StoreError`, `version`, types |
| `query.ts` | Public entry `opendb-store/query`: `pick omit pluck where findWhere`; takes a store first |
| `debug.ts` | Public entry `opendb-store/debug`: `inspect`, `debug`, large-entry warning |
| `compress.ts` | Public entry `opendb-store/compress`: `compressed` serializer, `compress`, `decompress` |
| `cache.ts` | Public entry `opendb-store/cache`: `createCache(store, { maxEntries })`, order under raw key `<ns>~order` |
| `react.ts` | Public entry `opendb-store/react`: `useStored`; React is an optional peer |
| `options.ts` | Shared option checks and `createReporter` |
| `index.ts` also | `requestPersistence()` |
| `indexeddb/index.ts` | Public entry `opendb-store/indexeddb`: `indexed`, `createIndexedStore` |
| `indexeddb/store.ts` | Async operations against a `Backend` |
| `indexeddb/backend.ts` | Real IndexedDB, memory fallback, server no-op; `update` is the atomic primitive; `SCHEMA_VERSION` + `UPGRADES` |
| `indexeddb/events.ts` | Subscribers, `BroadcastChannel` |
| `indexeddb/estimate.ts` | `estimateSize` |
| `store.ts` | `createStore`: validates options, lazy adapter, default reporter, builds frozen store |
| `types.ts` | All public interfaces (`Store`, `StoreOptions`, `StorageAdapter`, `CookieOptions`, …) |
| `context.ts` | `Context` type passed to operations |
| `errors.ts` | `StoreError`, `StoreErrorCode` |
| `version.ts` | Generated at build |
| `adapters/web.ts` | `resolveWebStorage` (lookup, one-time probe, server no-op adapter, browser memory fallback), `isQuotaError` |
| `adapters/cookie.ts` | `createCookieAdapter`, `isValidCookieOptions`: encoding, attributes, 4 KB limit, read-back, parse reuse, `measure`, `capacity` |
| `adapters/memory.ts` | `createMemoryAdapter` |
| `codec/key.ts` | `normalizeKey`, `createKeyCodec` (`build`, `owns`, `parse`) |
| `codec/entry.ts` | `Entry`, `decodeEntry`, `sanitizeEntry`, `peekMeta` (metadata without decoding), `isExpired`, `isValidTTL`, `jsonSerializer` |

## src/operations/
| File | Exports |
| --- | --- |
| `internal.ts` | `requireKey`, `allRawKeys`, `rawKeys`, `rawLength`, `removeRaw`, `readEntry` (expiry + migration), `readMeta` (fast path), `liveKeys`, `liveEntries`, `purgeExpired`, `writeEntry` (quota retry, emit) |
| `events.ts` | Subscriptions grouped by key, `emit`, cross-tab `storage` listener |
| `subscribe.ts` | `subscribe` |
| `get.ts`, `has.ts`, `set.ts`, `patch.ts` | One operation each |
| `remove.ts` | `remove`, `clear` |
| `keys.ts` | `keys`, `keyAt`, `values`, `entries` |
| `size.ts` | `size`, `used`, `free`, `capacity`, `ttl`, formatting |

## tests/
`contract` (all backends) · `expiry` · `compat` (2.0.1 payloads) · `failures` · `ssr` · `query` · `cookie` ·
`events` · `migrate` · `debug` · `security` · `peek` · `compress` · `indexeddb` · `indexeddb-failures` · `indexeddb-ssr` · `browser/quota` · `browser/real-browser`.
The `browser` project runs contract, expiry, compat, query, migrate, indexeddb, and `browser/*`.

## Other
| Path | Notes |
| --- | --- |
| `rollup.config.js` | ESM, CJS, UMD for core; ESM, CJS for query; ESM, CJS, UMD for debug; `.d.ts`, `.d.cts` |
| `vitest.config.ts` | Projects `unit` and `browser`; coverage thresholds |
| `scripts/smoke.mjs` | Consumes the built package: no deps, ESM, CJS, script tag, TS `bundler` and `nodenext` |
| `scripts/api-report.mjs` | Compares `dist/*.d.ts` with `api/`; `--update` accepts |
| `scripts/examples-check.mjs` | Every example, three browsers, emulated phones, demo-server path rules |
| `scripts/csp-check.mjs` | Bundles under strict CSP and Trusted Types |
| `bench/` | Benchmarks; `npm run bench` |
| `api/` | Committed public type declarations |
| `docs/DIAGRAMS.md` | Mermaid flow diagrams |
| `.github/workflows/` | `ci.yml` (reusable), `release.yml` (`master`, `next`), `codeql.yml` |
| `.releaserc` | `master` and prerelease `next` |
| `scripts/serve.mjs` | Local demo server; only exposes `public/` and `dist/` |
| `public/` | `examples/<name>/{index.html,main.js}`, `shared/`; import maps point at `dist/`. See `public/README.md` |
