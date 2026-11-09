# Architecture

## Purpose

`opendb-store` wraps `localStorage`, `sessionStorage`, and cookies with JSON serialization, key namespacing,
and per-entry expiry, with no runtime dependencies.

## Structure

```text
 index.ts   default db, local, session, cookie, createStore, StoreError, version
    │
 store.ts   createStore: validates options, builds the context, exposes methods
    │
    ├── adapters/   web.ts (lazy lookup, write probe, fallback)   cookie.ts   memory.ts
    ├── codec/      key.ts (build, parse, owns)   entry.ts (decode, expiry)
    ├── errors.ts   StoreError and codes
    └── operations/ get set has patch remove+clear keys size subscribe events internal

 query.ts   separate entry: pick omit pluck where findWhere
 debug.ts   separate entry: inspect debug
```

`src/` compiles to `dist/`: ESM (`opendb-esm.js`), CommonJS (`opendb.cjs`), a browser global
(`opendb-umd.js`), minified versions, and generated types for ESM and CommonJS.

## Principles

1. **Import does nothing.** No global is touched until the first operation.
2. **Storage is the only source of truth.** There is no in-memory copy of values.
3. **One place for each format rule.** Only `codec/key.ts` knows key layout, and only `codec/entry.ts` knows
   the payload layout.
4. **Stores are isolated.** Operations act only on keys in their own namespace. `free` is the one
   exception, because the browser's limit is shared by the origin.
5. **Failures are visible and non-fatal.** Operations do not throw; they report through return values and
   `onError`. Only invalid `createStore` options throw.
6. **Operations are plain functions of `ctx`,** which makes them testable with a fake adapter.

## Stored format

```text
key:   <namespace><separator><key>     e.g. app.username
value: {"value":<json>,"expire":<epoch ms>,"v":<n>}     expire and v appear only when used
```

Without `version` this is identical to 2.x, so upgrading needs no data migration. Cookies use the same layout,
percent-encoded.

## Context

```ts
interface Context {
  adapter(): StorageAdapter; // resolved on first use
  keyCodec: KeyCodec;
  serializer: Serializer;
  defaultTTL?: number;
  version?: number;
  migrate?: Migrate;
  report(code, message, key?, cause?): void;
}
```

## Adapter resolution

1. If there is no `window`, use memory silently. This is the server case.
2. Get `localStorage`, `sessionStorage`, or the cookie adapter inside `try/catch`, then write and remove a probe
   key.
3. On failure, use memory and report `STORAGE_UNAVAILABLE` once.

A quota error during the probe still means storage exists, so it does not trigger the fallback. Node's own
`localStorage` global is deliberately ignored, because the check is for `window`.

Memory fallbacks are shared per kind, so two stores of the same kind see the same data, just as they would
with real storage.

## Reading an entry

```text
getItem → null?               return default
decode  → not decodable?      return default (get reports CORRUPT_VALUE)
        → no "value" field?   return default (foreign value; never modified)
        → expired?            remove entry, return default
        → older schema?       migrate, save, return upgraded value
        → return value
```

## Writing an entry

```text
serialize → fails?            report SERIALIZE_FAILED, return false
setItem   → quota error?      purge expired entries, retry once
          → still failing?    report, return false
          → notify subscribers, return true
```

## Cookies

The cookie adapter implements the same `StorageAdapter` interface, so every operation works unchanged. It adds
three things: `setItem` receives the expiry and sets `Max-Age`; writes are read back, because browsers drop bad
cookies silently; and `measure` and `capacity` report encoded bytes and the RFC 6265 minimums.

## Change notification

Writes and removals call `emit`, which tells subscribers in this tab on any store sharing the adapter. A single
`storage` listener, added with the first subscriber, covers other tabs. Browsers do not fire that event for
cookies.

The reasoning behind these choices is in [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md#3-decisions).
