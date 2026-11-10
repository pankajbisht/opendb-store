# Architecture

> Diagrams of these flows are in [DIAGRAMS.md](DIAGRAMS.md).

## Purpose

`opendb-store` wraps `localStorage`, `sessionStorage`, cookies, and IndexedDB with JSON serialization, key namespacing,
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
 indexeddb/ separate entry: indexed createIndexedStore (asynchronous)
 compress.ts separate entry: compressed serializer, compress, decompress
 cache.ts    separate entry: createCache, wraps an existing store
 react.ts    separate entry: useStored
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

1. If there is no `window`, use an adapter that keeps nothing. Shared server memory would leak data between
   requests.
2. Get `localStorage`, `sessionStorage`, or the cookie adapter inside `try/catch`, then write and remove a probe
   key.
3. On failure, use memory and report `STORAGE_UNAVAILABLE` once. A browser tab has one user, so this is safe.

Real `localStorage` and `sessionStorage` objects are probed once per page, however many stores use them.

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

## Reading only the metadata

Most operations that touch every entry need only its expiry and version. `peekMeta` in `codec/entry.ts` reads
those from the last 96 characters of the stored text, which this library always writes in the order
`value`, `z`, `expire`, `v`. Values are never decoded for `keys`, `count`, `has`, `ttl`, `size`, or
`purgeExpired`.

It falls back to full decoding whenever the result is not certain: text that does not start with `{"value":`,
an ending it does not recognise, a number it cannot read, or a value with its own `expire` or `v` key near the
end. The fallback is exact, so the fast path only ever saves time. Entries that need a migration are always
decoded.

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

Parsing `document.cookie` is reused while its text is unchanged. The text is read on every call, so the browser
stays the source of truth.

## Change notification

Writes and removals call `emit`, which tells subscribers in this tab on any store sharing the adapter. Each
subscriber remembers the last stored text it saw and stays quiet if it has not changed. Adapters can report
changes from elsewhere through an optional `watch` method; the cookie adapter uses the CookieStore API for it.
Subscribers are grouped by key, so a write costs nothing for listeners on other keys. A single
`storage` listener, added with the first subscriber, covers other tabs. Browsers do not fire that event for
cookies.

## IndexedDB

IndexedDB is asynchronous, so it cannot implement the synchronous `StorageAdapter`. It has its own store in
`src/indexeddb/`, reusing the key rules, entry validation, option checks, and error reporting.

```text
store.ts     operations, written against the Backend interface
backend.ts   real IndexedDB, browser memory fallback, server no-op
events.ts    subscribers, and BroadcastChannel for other tabs
estimate.ts  approximate sizes
```

Records use the same `{ value, expire, v }` shape under the same raw keys, in one object store with an index on
`expire`, which lets `purgeExpired` find expired entries without loading any values.

Anything that reads and then writes runs inside one `readwrite` transaction. Otherwise two concurrent `patch` calls
could lose an update, or an old expired read could delete a newer value. Callbacks passed to such a transaction,
including `migrate`, must be synchronous, because a transaction closes when it has nothing left to wait for.

The layout is versioned. `SCHEMA_VERSION` and the `UPGRADES` list in `backend.ts` take an older database forward
one step at a time. If a newer release has already upgraded a database, this code opens it at that version,
because later layouts must stay readable by earlier code.

Opening the database gives up after 5 seconds and falls back to memory, because some browsers can leave the
request unanswered. A write resolves only after its transaction commits, because quota errors can appear at commit. Connections close on
`versionchange`, so this library never blocks another tab upgrading or deleting the database.

## Size-limited cache

`cache.ts` wraps a store the caller already has, rather than creating one, so the core is not bundled twice and
there is one set of subscribers and fallbacks. It keeps the usage order as a JSON array under a raw key outside
the store's prefix, written through `store.storage`, so the order never appears among the store's keys.

## Compression

`compress.ts` is a serializer, so the core knows nothing about it. It compresses the value's JSON with LZW and
packs the codes into 15-bit characters offset past the control characters, which keeps them below the
surrogate range. Each stored character therefore carries 15 bits instead of about 7, which is why even modest
compression saves a lot of quota in Chromium and Firefox.

The dictionary is keyed by number rather than by string, so compression stays linear on repetitive data, and it
stops growing at about a million entries. Decompression validates every character and code and stops at
`maxLength`, so damaged or hostile input fails instead of exhausting memory.

## Performance and security review (2026-11-10)

| Concern | Design |
| --- | --- |
| Reading one key in full storage | Costs only that key; measured at about 0.01 ms with 4.5 MB stored |
| Listing, counting, expiry at scale | Metadata read from the end of each value, no decoding |
| Large values blocking the page | Debug tool warns over 512 KB; IndexedDB and compression documented as the fix |
| Running out of space | Optional compression; expired entries purged and the write retried once |
| Repeated probes and events | Real storage is probed once per page; subscribers are grouped by key |
| Data leaking between server requests | Servers keep nothing |
| Injection through cookie attributes | Rejected when the store is created |
| Tampered stored data | Metadata must be numeric; foreign values are ignored; `__proto__` cannot change prototypes |
| Hostile compressed data | Validated while decoding, capped at `maxLength` |
| Hangs | IndexedDB opening gives up after 5 seconds; listener re-entrancy is guarded |
| Supply chain | No runtime dependencies; CI installs without scripts; actions pinned by commit |

A value cache was considered again and rejected. The browser already holds storage in memory, and returning a
cached object safely would need a copy, which costs about as much as decoding.

The reasoning behind these choices is in [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md#3-decisions).
