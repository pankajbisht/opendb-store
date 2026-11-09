# Migrating from 2.x to 3.0

> **Status:** 3.0 is built and not yet published.

**Your stored data does not need migrating.** 3.0 reads and writes the same key and value format as 2.x
with the default namespace (`app`) and separator (`.`). A test using exact 2.0.1 payloads enforces this.

## Behaviour changes

| Area | 2.x | 3.0 | What to do |
| --- | --- | --- | --- |
| `clear()` | Removes everything for the origin | Removes this namespace only | For a full wipe, call `window.localStorage.clear()` |
| `count`, `keys()`, `key()` | Whole origin; keys include the prefix | Live entries in this namespace; no prefix | Remove any prefix-stripping code |
| `has()` on a stored `''` or `null` | `false` | `true` | To test for a usable value, check the result of `get` |
| `set()` when storage is full or the value is circular | Throws | Returns `false` | Replace `try/catch` with a check of the return value, or use `onError` |
| `set()` with `undefined`, a function, or a symbol | Writes an empty entry | Returns `false` | Use `remove` to delete a value |
| Invalid `expire`, e.g. `0` | Stored with no expiry | Returns `false`, nothing written | Pass a positive number of milliseconds |
| Key named `"null"` | Silently refused | Works | Nothing |
| `used()` | Whole origin | This namespace | Use `free()` for origin-wide room |
| `size()`, `used()`, `free()` numbers | UTF-8 of the value alone | UTF-16 length of key and stored text | Expect slightly different numbers |
| Namespace containing the separator | Allowed | Throws `TypeError` | Use a different separator |

## API changes

| 2.x | 3.0 |
| --- | --- |
| `db.config.createNamespace('x')` | `createStore({ namespace: 'x' })` |
| `db.config.switchNamespace('x')` | Keep one store per namespace |
| `db.local.from('x')`, which changed global state | `const x = db.local.from('x')`, which returns a new store |
| `db.config.setSeparator('-')` | `createStore({ separator: '-' })` |
| `db.config.version` | `import { version } from 'opendb-store'` |
| `getFormattedData`, `setFormattedData` | Store one object under one key and use `patch` |
| `trim(key)` | Removed; it always threw |

If you changed the namespace or separator in 2.x, pass the same values to `createStore` so existing keys
are still found.

## Newly working

- Cookies, with the same API as `local` and `session`, as `db.cookie`.
- Import in Node and SSR no longer throws.
- `require('opendb-store')` returns the library.
- TypeScript resolves the types under `bundler` and `nodenext`.
- Blocked storage falls back to memory instead of breaking the import.

## Failure handling

To find out why a write failed, pass `onError`:

```ts
createStore({ onError: (error) => report(error.code) });
```
