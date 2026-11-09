# API reference

> **Status:** this describes 3.0, which is built but not yet published. The [README](../README.md) has worked
> examples. For what is on npm today, see [Using 2.0.1](#using-201).

CommonJS and script tags expose the same names: `require('opendb-store').local` and `window.db.local`.

## createStore(options?)

| Option | Default | Meaning |
| --- | --- | --- |
| `namespace` | `'app'` | Prefix for every key. Must not contain the separator |
| `separator` | `'.'` | Text between namespace and key |
| `storage` | `'local'` | `'local'`, `'session'`, `'cookie'`, or a custom adapter |
| `cookie` | | `{ path, domain, sameSite, secure }`, for `storage: 'cookie'` |
| `defaultTTL` | none | Lifetime in milliseconds for entries set without `expire` |
| `version` | none | Schema version, a positive integer, recorded on each entry |
| `migrate` | none | `(value, fromVersion, key) => newValue`. Requires `version` |
| `serializer` | JSON | `{ serialize, deserialize }`; receives the whole entry |
| `onError` | `console.warn` | Receives every failure as a `StoreError` |

Invalid options, including `cookie` attributes containing `;` or control characters, throw `TypeError`
immediately. Nothing else throws, even if `onError` itself does.

## Store members

| Member | Returns | Notes |
| --- | --- | --- |
| `get(key, default = null)` | Value or default | |
| `set(key, value, { expire }?)` | `boolean` | `false` on failure; `expire` is positive milliseconds |
| `has(key)` | `boolean` | True for any live entry, including stored `''`, `0`, and `null` |
| `patch(key, partial)` | `boolean` | Merges into a stored object and keeps its expiry; creates it if absent; refuses non-objects |
| `remove(key)` | Previous value or `null` | |
| `clear()` | nothing | This namespace only |
| `count` | `number` | Live entries in this namespace |
| `keys()` | `string[]` | Without the prefix |
| `key(index)` | `string` or `null` | Same order as `keys()` |
| `values()`, `entries()` | arrays | `entries()` returns `[key, value]` pairs |
| `ttl(key)` | `number` or `null` | Milliseconds left; `null` if permanent or absent |
| `purgeExpired()` | `number` | Deletes expired entries and returns how many |
| `subscribe(key, listener)` | unsubscribe function | Listener gets the new value, or `null` once gone |
| `size(key, format?)` | number or string | Key plus stored text; `0` if absent |
| `used(format?)` | number or string | This namespace |
| `free(format?)` | number or string | Estimated room left for the whole origin |
| `capacity(format?)` | number or string | An estimate; pass `{ capacity }` to override |
| `from(namespace)` | new store | Same options, different namespace |
| `namespace` | `string` | |
| `storage` | adapter | The underlying storage. Using it bypasses namespaces and expiry |

**Sizes.** `format` is `{ format: 'B' | 'KB' | 'MB', unit: boolean }`; without it you get a number. Local and
session stores measure UTF-16 code units, the unit browsers limit. Cookie stores measure encoded bytes.

**Capacity.** Local and session assume 5 MB. Cookies assume 200 KB, the RFC 6265 guaranteed minimum of 50
cookies of 4096 bytes. Real limits vary by browser and cannot be queried.

**Iteration** (`keys`, `values`, `entries`, `count`) skips values this library did not write and removes
expired entries as it goes.

## subscribe

| Source of change | local | session | cookie |
| --- | --- | --- | --- |
| Same tab, any store instance | Yes | Yes | Yes |
| Other tabs | Yes | No, sessions are per tab | No |

Stored migrations triggered by reads do not notify. Expiry notifies when the entry is discovered to be gone.
A listener is not called again for a change it makes to its own key while running.

## Rules

- Keys are non-empty strings or finite numbers. Numbers are stored as strings.
- Values go through JSON by default. `set` refuses `undefined`, functions, and symbols.
- An invalid `expire`, such as `0`, makes `set` return `false` without writing.
- An unknown option, such as `expires`, is reported but the value is still stored.
- Expired entries are removed when next read or iterated, by `purgeExpired`, or when a write hits the quota.
- A stored value this library did not write reads as missing and is left untouched.

## Cookies

- Attributes default to `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS.
- Keys and values are percent-encoded. A value over 4096 encoded bytes returns `QUOTA_EXCEEDED`.
- `expire` sets a browser `Max-Age` as well as the library's own check. Browsers cap this at 400 days, so
  a cookie can end sooner than a longer `expire`.
- Without `expire` or `defaultTTL`, a cookie lasts until the browser closes.
- A write is read back, so a cookie the browser rejects returns `false`.
- `HttpOnly` is not possible from JavaScript, and `HttpOnly` cookies are invisible to this library.

## Migrations

```ts
createStore({
  version: 2,
  migrate: (value, fromVersion, key) => upgraded,
});
```

Entries upgrade on first read and are saved. Those from before versioning have `fromVersion` 0. Returning
`undefined` deletes the entry. If `migrate` throws, `MIGRATION_FAILED` is reported, the read returns the
default, and the stored data is kept. Stores without `version` write the plain 2.x format.

## Errors

`onError` receives a `StoreError` with `code`, `message`, `key`, and `cause`.

| Code | Raised when |
| --- | --- |
| `QUOTA_EXCEEDED` | Storage is full, or a cookie is over 4 KB |
| `SERIALIZE_FAILED` | The value cannot be serialized |
| `CORRUPT_VALUE` | `get` found a value it cannot decode |
| `STORAGE_UNAVAILABLE` | Storage is blocked and memory is in use, a storage call failed, or a write happened on a server |
| `INVALID_KEY` | `set`, `patch`, `remove`, or `subscribe` got an invalid key |
| `INVALID_ARGUMENT` | A bad `expire`, an unknown option, or a `patch` on a non-object |
| `MIGRATION_FAILED` | `migrate` threw |
| `LISTENER_FAILED` | A `subscribe` listener threw |

## Debug tools

A separate entry point, `opendb-store/debug`. Script tags use `dist/debug-umd.min.js` and the global `dbDebug`.

```ts
import { debug, inspect } from 'opendb-store/debug';

inspect(store); // figures only
debug(store, { warnAt: 80, label: 'Cart' }); // prints and returns figures
debug(db); // several stores
```

`inspect` returns `{ namespace, count, used, free, capacity, percentUsed, entries }`. Each entry is
`{ key, size, share, expiresIn }`, largest first. `percentUsed` covers the whole origin, because browsers apply
the limit per origin.

## Query helpers

A separate entry point, `opendb-store/query`.

```ts
import { where, findWhere, pluck, pick, omit } from 'opendb-store/query';

where(db.local, 'users', { active: true });
findWhere(db.local, 'users', { id: 1 });
pluck(db.local, 'users', 'name');
pick(db.local, 'user', ['id']);
omit(db.local, 'user', ['password']);
```

## Custom adapters

An adapter needs `length`, `key`, `getItem`, `setItem`, and `removeItem`. Optional: `capacity`, and
`measure(key, value)` for size reporting. `setItem` receives `{ expire }` as a third argument.

## Server-side rendering

Importing and calling the library without a `window` is safe. Nothing is stored: reads return defaults, and
writes return `false` and report `STORAGE_UNAVAILABLE`. This stops one request's data reaching another. See
[SECURITY.md](SECURITY.md#on-a-server).

For Node scripts and tests, use `createStore({ storage: createMemoryAdapter() })`.

## Using 2.0.1

The npm release offers `set`, `get`, `has`, `remove`, `clear`, `key`, `keys`, `trim`, `size`, `used`,
`free`, `capacity`, `from`, `getFormattedData`, `setFormattedData`, `count`, and `db.config`.

Known limits of 2.0.1:

- Import fails in Node and SSR. Load it only in browser code.
- `require()` returns an empty object. Use `import`.
- TypeScript with `moduleResolution: bundler` or `nodenext` cannot find the types.
- `clear()` deletes everything for the origin, not only this library's keys.
- `set()` throws if storage is full or the value cannot be serialized.
- `trim()` always throws.
