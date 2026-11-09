# opendb-store

**One small, typed API for `localStorage`, `sessionStorage`, and cookies.** Namespaces, expiry, cross-tab
updates, schema migrations, and a storage size inspector, with no dependencies.

[![npm](https://img.shields.io/npm/v/opendb-store)](https://www.npmjs.com/package/opendb-store)
[![license](https://img.shields.io/npm/l/opendb-store)](LICENSE)

```js
import db from 'opendb-store';

db.local.set('user', { name: 'Ada' });
db.local.get('user'); // { name: 'Ada' }, not a string to parse

db.local.set('offer', 'SAVE10', { expire: 60 * 60 * 1000 }); // gone in one hour
db.cookie.set('consent', { ads: false }, { expire: 365 * 86_400_000 });
db.session.set('checkoutStep', 2);
```

## Why use it

| Native storage | opendb-store |
| --- | --- |
| Strings only; `JSON.parse` everywhere | Objects, arrays, and numbers just work |
| No expiry | `{ expire: ms }` on any value, in every storage type |
| Keys collide with other scripts | Every key is namespaced; `clear()` only touches yours |
| Crashes during server rendering | Safe to import and call anywhere |
| Throws when full, or when storage is blocked | Returns `false` and tells you why |
| A different cookie API, with manual encoding | The same API for cookies |
| No idea how much space is left | `debug(db)` shows usage per key |

The core is about 3.5 kB gzipped. Query helpers and the debug tool are separate imports, so they cost
nothing unless you use them.

## Install

```sh
npm install opendb-store
```

Or use a script tag, which creates a global `db`:

```html
<script src="https://cdn.jsdelivr.net/npm/opendb-store@3/dist/opendb-umd.min.js"></script>
<script>
  db.local.set('name', 'opendb store');
</script>
```

## Real-world recipes

These examples assume `import db, { createStore } from 'opendb-store'`.

### Keep preferences in sync across tabs

```js
const applyTheme = (theme) => (document.documentElement.dataset.theme = theme);

applyTheme(db.local.get('theme', 'light'));

// Fires for changes in this tab and in the user's other tabs.
db.local.subscribe('theme', (theme) => applyTheme(theme ?? 'light'));

toggle.onclick = () => db.local.set('theme', 'dark');
```

### Cache API responses

Serve repeat visits instantly and refetch only when the data is stale.

```js
const FIVE_MINUTES = 5 * 60 * 1000;

async function getProducts() {
  const cached = db.local.get('products');
  if (cached) return cached;

  const products = await fetch('/api/products').then((r) => r.json());
  db.local.set('products', products, { expire: FIVE_MINUTES });
  return products;
}
```

### Autosave a form so a refresh loses nothing

`sessionStorage` keeps the draft for this tab only, and `patch` updates one field at a time.

```js
const draft = createStore({ storage: 'session', namespace: 'draft' });

form.elements.title.value = draft.get('post', {}).title ?? '';

form.addEventListener('input', (event) => {
  draft.patch('post', { [event.target.name]: event.target.value });
});

form.addEventListener('submit', () => draft.remove('post'));
```

### Cookie consent the server can read

Cookies are sent with requests, so a server can act on the choice before rendering.

```js
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

db.cookie.set('consent', { analytics: true, ads: false }, { expire: ONE_YEAR });

if (db.cookie.get('consent', {}).analytics) loadAnalytics();
```

Read it on the server. Cookie libraries decode the value for you:

```js
// Express with cookie-parser
const { value: consent } = JSON.parse(req.cookies['app.consent'] ?? '{"value":{}}');
```

Share a cookie across subdomains with `createStore`:

```js
const shared = createStore({
  storage: 'cookie',
  namespace: 'acme',
  cookie: { domain: '.acme.com', sameSite: 'Lax', secure: true },
  defaultTTL: ONE_YEAR,
});
```

### Keep each user's data separate, and clear it on logout

```js
const userStore = (userId) => createStore({ namespace: `user-${userId}` });

const store = userStore(session.id);
store.set('recentSearches', ['shoes', 'bags']);

function logout() {
  store.clear(); // removes this user's keys and nothing else
}
```

### Shopping cart with queries

```js
import { where, pluck } from 'opendb-store/query';

const cart = createStore({ namespace: 'shop' });

cart.set('items', [
  { sku: 'A1', qty: 2, inStock: true },
  { sku: 'B7', qty: 1, inStock: false },
]);

where(cart, 'items', { inStock: false }); // [{ sku: 'B7', ... }]
pluck(cart, 'items', 'sku'); // ['A1', 'B7']
```

### Change your data shape without breaking returning users

Old entries upgrade the first time they are read.

```js
const settings = createStore({
  namespace: 'settings',
  version: 2,
  migrate(value, fromVersion) {
    // Older entries look like { dark: true }. Version 2 stores a theme name.
    return fromVersion < 2 ? { theme: value.dark ? 'dark' : 'light' } : value;
  },
});
```

### React hook, safe with server rendering

The first render uses the fallback so it matches the server, and the stored value follows after hydration.
This works with Next.js.

```tsx
import { useEffect, useState } from 'react';
import type { Store } from 'opendb-store';

export function useStored<T>(store: Store, key: string, fallback: T) {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    setValue(store.get(key, fallback));
    return store.subscribe<T>(key, (next) => setValue(next ?? fallback));
  }, [store, key]);

  return [value, (next: T) => store.set(key, next)] as const;
}

// const [prefs, setPrefs] = useStored(db.local, 'prefs', { theme: 'light' });
```

### Handle full or blocked storage

Writes never throw. Check the result, or handle every failure in one place.

```js
const store = createStore({
  onError(error) {
    if (error.code === 'QUOTA_EXCEEDED') showToast('Storage is full');
    else reportToSentry(error);
  },
});

if (!store.set('report', hugeObject)) useServerCopy();
```

When storage is full, expired entries are cleared and the write is retried before it fails.

## See how much storage you are using

The debug tool prints every key, its size, and when it expires.

```js
import db from 'opendb-store';
import { debug } from 'opendb-store/debug';

debug(db.local);
```

```text
[opendb-store] local: 1.75 KB in 3 entries, origin 0.03% of ~5.00 MB
┌─────────┬────────────┬───────────┬──────────┬─────────┐
│ (index) │ key        │ size      │ share    │ expires │
├─────────┼────────────┼───────────┼──────────┼─────────┤
│ 0       │ 'products' │ '1.66 KB' │ '94.69%' │ '5m'    │
│ 1       │ 'theme'    │ '48 B'    │ '2.68%'  │ '30d'   │
│ 2       │ 'user'     │ '47 B'    │ '2.63%'  │ 'never' │
└─────────┴────────────┴───────────┴──────────┴─────────┘
```

- `debug(db)` reports local, session, and cookies together.
- `debug(store, { warnAt: 70 })` warns when the origin is 70% full. The default is 80.
- `inspect(store)` returns the same figures without printing, for your own dashboard or alert.

```js
import { inspect } from 'opendb-store/debug';

const { percentUsed, entries } = inspect(db.local);
if (percentUsed > 90) trackEvent('storage-nearly-full', { largest: entries[0].key });
```

With a script tag, load `dist/debug-umd.min.js` and call `dbDebug.debug(db)`, even from the browser console.

For quick numbers, every store also has `size(key)`, `used()`, `free()`, and `capacity()`.

## API

### Stores

`db.local`, `db.session`, and `db.cookie` are ready to use. Create your own for a separate namespace or
settings:

```ts
import { createStore } from 'opendb-store';

const store = createStore({ namespace: 'myapp' });
```

| Option | Default | Description |
| --- | --- | --- |
| `namespace` | `'app'` | Prefix for every key |
| `separator` | `'.'` | Text between namespace and key |
| `storage` | `'local'` | `'local'`, `'session'`, `'cookie'`, or a custom adapter |
| `cookie` | | `{ path, domain, sameSite, secure }` for cookie stores |
| `defaultTTL` | | Lifetime in milliseconds when `set` has no `expire` |
| `version` | | Schema version, a positive integer |
| `migrate` | | `(value, fromVersion, key) => newValue`; return `undefined` to discard |
| `serializer` | JSON | `{ serialize, deserialize }`, for example to encrypt |
| `onError` | `console.warn` | Receives each failure |

### Methods

| Method | Returns | Description |
| --- | --- | --- |
| `get(key, default?)` | value | The value, or the default (`null` if none given) |
| `set(key, value, { expire }?)` | `boolean` | Store a value; `expire` is milliseconds from now |
| `has(key)` | `boolean` | Whether a live entry exists, including `''`, `0`, and `null` |
| `patch(key, partial)` | `boolean` | Merge into a stored object, keeping its expiry |
| `remove(key)` | value | Delete and return the previous value |
| `clear()` | | Delete everything in this namespace |
| `keys()`, `values()`, `entries()` | arrays | Live entries in this namespace |
| `count` | `number` | Number of live entries |
| `key(index)` | key | The key at a position |
| `ttl(key)` | `number \| null` | Milliseconds until expiry; `null` if permanent or absent |
| `purgeExpired()` | `number` | Delete expired entries now and return how many |
| `subscribe(key, fn)` | function | Watch a key; call the result to stop |
| `size(key, format?)` | number or string | Size of one entry |
| `used(format?)` | number or string | Size of this namespace |
| `free(format?)` | number or string | Estimated room left for the whole site |
| `capacity(format?)` | number or string | Estimated total capacity |
| `from(namespace)` | store | A separate store in another namespace |

Pass `{ format: 'KB', unit: true }` to size methods to get text like `"12.40 KB"`.

### Error codes

| Code | Meaning |
| --- | --- |
| `QUOTA_EXCEEDED` | Storage is full, or a cookie is over 4 KB |
| `SERIALIZE_FAILED` | The value cannot be stored, such as a circular object or `undefined` |
| `CORRUPT_VALUE` | A stored value cannot be decoded |
| `STORAGE_UNAVAILABLE` | Storage is blocked (memory is used instead) or a browser refused a write |
| `INVALID_KEY` | The key is empty or not a string or number |
| `INVALID_ARGUMENT` | A bad `expire`, an unknown option, or a `patch` on a non-object |
| `MIGRATION_FAILED` | `migrate` threw; the stored data is kept |
| `LISTENER_FAILED` | A `subscribe` callback threw |

## Good to know

**Cookies**

- A cookie holds about 4 KB. Larger values return `false` with `QUOTA_EXCEEDED` instead of being silently
  dropped as the browser would.
- Without `expire` or `defaultTTL`, a cookie ends when the browser closes.
- Defaults are `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS.
- Every cookie is sent with every request to your server, so keep them small.
- JavaScript cannot create `HttpOnly` cookies. Authentication sessions should be set by your server.
- `subscribe` sees cookie changes from the current tab only.

**Values** use JSON by default, so `Date` becomes a string and `Map` and `Set` do not survive.

**Server rendering:** without a browser, stores use process-wide memory. Do not write per-user data on the
server, because other requests could read it.

**Security:** anything in browser storage is readable by any script on your page. Do not store passwords,
tokens, or sensitive personal data. See [docs/SECURITY.md](docs/SECURITY.md).

**Browser support:** any browser with ES2020. Tested in Chromium, Firefox, and WebKit.

**TypeScript:** types are included.

```ts
const user = db.local.get<User>('user'); // User | null
const theme = db.local.get('theme', 'light'); // string
```

## Documentation

- [API reference](docs/API.md)
- [Migrating from 2.x](docs/MIGRATION.md): your stored data keeps working
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)

## License

[ISC](LICENSE)
