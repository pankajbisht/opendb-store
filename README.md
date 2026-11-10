# opendb-store

**One small, typed API for `localStorage`, `sessionStorage`, cookies, and IndexedDB.** Namespaces, expiry, cross-tab
updates, schema migrations, and a storage size inspector, with no dependencies.

[![npm version](https://img.shields.io/npm/v/opendb-store)](https://www.npmjs.com/package/opendb-store)
[![types included](https://img.shields.io/npm/types/opendb-store)](https://www.npmjs.com/package/opendb-store)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/npm/l/opendb-store)](LICENSE)

**[Live examples](https://pankajbisht.github.io/opendb-store/public/)** · **[API reference](https://pankajbisht.github.io/opendb-store/api/)** · [Migrating from 2.x](docs/MIGRATION.md)

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
| Crashes during server rendering | Safe to import and call anywhere; nothing is kept on the server |
| Throws when full, or when storage is blocked | Returns `false` and tells you why |
| A different cookie API, with manual encoding | The same API for cookies |
| No idea how much space is left | `debug(db)` shows usage per key |
| Full at about 5 MB | Optional compression fits several times more |

The core is about 4.5 kB gzipped. IndexedDB, compression, the cache, React, query helpers, and the debug tool
are separate imports, so they cost nothing unless you use them.

Works in every modern browser, with React, Angular, Vue, Next.js, and plain JavaScript. Tested in Chromium,
Firefox, and WebKit.

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

Safari keeps cookies set from JavaScript for at most 7 days. For a choice that must last longer there, set the
cookie from your server.

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

### Store large or binary data with IndexedDB

`localStorage` holds about 5 MB of text. IndexedDB holds far more, and keeps real objects such as `Date`, `Map`,
`ArrayBuffer`, and `Blob`. It has the same methods and options as the other stores, but each returns a promise.

```js
import { indexed, createIndexedStore } from 'opendb-store/indexeddb';

await indexed.set('report', { generated: new Date(), rows }, { expire: 86_400_000 });
const report = await indexed.get('report'); // report.generated is still a Date

const files = createIndexedStore({ namespace: 'files' });
await files.set('avatar', imageBlob);

// Safe under concurrency: every patch is applied.
await Promise.all([files.patch('meta', { a: 1 }), files.patch('meta', { b: 2 })]);
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

### Keep a cache from growing too big

```js
import { createCache } from 'opendb-store/cache';

const recent = createCache(createStore({ namespace: 'recent' }), { maxEntries: 50 });

recent.set(`/api/products/${id}`, product, { expire: 10 * 60 * 1000 });
recent.get(`/api/products/${id}`); // reading counts as use
```

Once there are more than 50 entries, the least recently used is removed. Write through the cache so it can track use.

### Check data you read back

Anything in browser storage can be edited by the user or by other scripts. Validate it before you trust it:

```js
import { z } from 'zod';

const Settings = z.object({ theme: z.enum(['light', 'dark']), fontSize: z.number() });

const settings = createStore({
  namespace: 'settings',
  validate: (value) => Settings.safeParse(value).success,
});

settings.get('current', defaults); // edited or malformed data reads as missing
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

## Use with React and Angular

Every store, including IndexedDB, works the same way in a component. The value starts as your fallback, which
matches what a server renders. The stored value follows in the browser, and changes made in other tabs update
the component.

### React

Use the built-in hook. It needs React 18 or later, and only loads if you import it.

```tsx
'use client'; // Next.js App Router: storage only exists in the browser.

import db from 'opendb-store';
import { indexed } from 'opendb-store/indexeddb';
import { useStored } from 'opendb-store/react';

export function ThemeToggle() {
  const [theme, setTheme] = useStored(db.local, 'theme', 'light');

  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      {theme}
    </button>
  );
}

export function Drafts() {
  // IndexedDB works the same way; the hook handles the promises.
  const [drafts, setDrafts, clearDrafts] = useStored(indexed, 'drafts', [] as string[]);

  return (
    <>
      <button onClick={() => setDrafts([...drafts, `Draft ${drafts.length + 1}`])}>Add</button>
      <button onClick={clearDrafts}>Clear</button>
      <ul>{drafts.map((draft) => <li key={draft}>{draft}</li>)}</ul>
    </>
  );
}
```

`useStored(store, key, fallback)` returns `[value, setValue, remove]`. The value is typed from the fallback.

### Angular

There is no Angular package to install. Copy this helper, which turns a stored value into a signal. It needs
Angular 17 or later and TypeScript 5.4 or later.

```ts
// stored-signal.ts
import { DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import type { Key } from 'opendb-store';

/** What the helper needs. Every opendb-store store, including IndexedDB, has it. */
interface StoreLike<T> {
  get(key: Key, fallback: T): T | Promise<T>;
  set(key: Key, value: T): unknown;
  remove(key: Key): unknown;
  subscribe(key: Key, listener: (value: T | null) => void): () => void;
}

/**
 * A signal that mirrors one stored value, including changes from other tabs.
 * Call it in an injection context, such as a component field.
 */
export function storedSignal<T>(store: StoreLike<NoInfer<T>>, key: Key, fallback: T) {
  const value = signal<T>(fallback); // Matches the server render.

  // Runs in the browser only, after hydration.
  afterNextRender(async () => value.set(await store.get(key, fallback)));

  const stop = store.subscribe(key, (next) => value.set(next ?? fallback));
  inject(DestroyRef).onDestroy(stop);

  return {
    value: value.asReadonly(),
    set: (next: T) => void store.set(key, next),
    remove: () => void store.remove(key),
  };
}
```

Use it as a component field:

```ts
import { Component } from '@angular/core';
import db from 'opendb-store';
import { indexed } from 'opendb-store/indexeddb';
import { storedSignal } from './stored-signal';

@Component({
  selector: 'app-theme-toggle',
  template: `<button (click)="toggle()">{{ theme.value() }}</button>`,
})
export class ThemeToggle {
  theme = storedSignal(db.local, 'theme', 'light');
  drafts = storedSignal(indexed, 'drafts', [] as string[]);

  toggle() {
    this.theme.set(this.theme.value() === 'light' ? 'dark' : 'light');
  }
}
```

The subscription ends when the component is destroyed, and server rendering keeps the fallback, so hydration
matches. If you prefer RxJS:

```ts
import { Observable } from 'rxjs';
import db from 'opendb-store';

/** The current value, then every change. */
export function stored$<T>(key: string, fallback: T): Observable<T> {
  return new Observable<T>((subscriber) => {
    subscriber.next(db.local.get(key, fallback));
    return db.local.subscribe<T>(key, (next) => subscriber.next(next ?? fallback));
  });
}
```

### Other frameworks

Any framework can use the same three steps: read the value with `get`, follow changes with `subscribe`, and call
the function `subscribe` returns when the component goes away.

## How much each store holds

| Store | How much it holds | Shared by | How long data lasts |
| --- | --- | --- | --- |
| `db.local` | 5 MB per site | Every tab and window of your site | Until removed or the user clears site data |
| `db.session` | 5 MB per site | One tab only | Until the tab closes |
| `db.cookie` | About 4 KB per cookie, and at least 50 cookies per site | Your site, and sent to your server with every request | Until `expire`, which browsers cap at 400 days; without `expire`, until the browser closes |
| `indexed` | Usually gigabytes, set by the browser from free disk space | Every tab and window of your site | Until removed or the user clears site data |

How these limits work:

- **Local and session storage** count characters, not bytes: 5,242,880 characters for keys and values together.
  This was measured as the same in Chromium, Firefox, and WebKit. Most emoji count as 2 characters.
- **Cookies:** Chromium keeps about 150 per site, and Firefox and WebKit allow more. Many servers reject
  requests whose headers exceed 8 to 16 KB, so keep cookies small.
- **IndexedDB:** the limit depends on the browser and the free disk space. Ask for the real figure with
  `await indexed.capacity()`. It is much smaller in private windows.
- **Per site:** limits apply to each origin, meaning the scheme, host, and port. `https://app.example.com` and
  `https://example.com` have separate space.
- **Safari** caps cookies set by JavaScript at 7 days. It can also delete all script-written storage for a site
  the user has not visited in 7 days of browser use. Installed home-screen web apps are exempt.
- **Private windows** delete everything when they close.

`capacity()` returns these estimates, which `free()` and the debug tool also use: 5 MB for local and session
storage, 200 KB for cookies, and the browser's own figure for IndexedDB.

## Store more with compression

Local and session storage hold plain text. For large values, add compression:

```js
import { createStore } from 'opendb-store';
import { compressed } from 'opendb-store/compress';

const catalog = createStore({ namespace: 'catalog', serializer: compressed() });

catalog.set('products', products); // stored compressed if that is smaller
catalog.get('products'); // decompressed automatically
```

Measured with 2,000 realistic product records, about 383 K characters of JSON:

| | Plain JSON | Compressed |
| --- | --- | --- |
| Stored size | 383,044 characters | 22,225 characters |
| Products that fit, Chromium and Firefox | about 30,000 | about 200,000 |
| Products that fit, Safari (WebKit) | about 30,000 | about 100,000 |
| Time to write them | about 1 ms | about 12 ms |
| Time to read them | about 0.5 ms | about 3.5 ms |

- Values under 1,024 characters of JSON are stored as they are. Set `compressed({ minLength })` to change that.
- A value is stored compressed only when that is actually smaller.
- Listing keys, `has`, `ttl`, and expiry never decompress anything.
- Gains depend on how repetitive your data is. Random data and images barely shrink.
- Safari gains less, because its limit counts these compressed characters as more expensive.
- Use it with local and session stores only. Compressed text grows when made safe for a cookie, and IndexedDB
  already has plenty of room.
- Plain and compressed entries can share a store, so you can turn it on at any time.

## Performance

Reading or writing one key costs the same whether storage is empty or full. With about 4.5 MB stored, `get`,
`set`, and `has` on a normal entry take about 0.01 ms.

Operations that look at every entry read only the expiry at the end of each stored value, so they do not decode
it. With 4,400 entries filling about 4.5 MB, in Chromium:

| Operation | Time |
| --- | --- |
| `get`, `set`, `has`, `ttl` on one entry | about 0.01 ms |
| `keys()` or `count` | about 2.5 ms |
| `purgeExpired()` | about 2 ms |
| `values()` or `entries()`, which must decode everything | about 5 ms |

The one cost that grows with size is reading a single large value: `get` on a 4.4 MB value takes 0.6 to 4.6 ms,
depending on the browser, and that time blocks the page. For values over a few hundred kilobytes, use IndexedDB,
which does its work off the page, or compression. The debug tool warns about any entry over 512 KB.

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
- It warns about any local or session entry over 512 KB, because reading it blocks the page.
- `await debug(indexed)` and `await inspect(indexed)` work for IndexedDB too.
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
| `serializer` | JSON | `{ serialize, deserialize }`, for example `compressed()` |
| `validate` | | `(value, key) => boolean`; rejected values read as missing |
| `onError` | `console.warn` | Receives each failure |

`createIndexedStore` takes the same options, except `storage` and `cookie`, and adds `database`.

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

IndexedDB stores have the same methods, each returning a promise that never rejects. Use `await store.count`.
They also have `setMany`, `getMany`, and `removeMany`, which do many keys in one transaction.

`requestPersistence()` asks the browser not to clear your site's storage when the disk fills up. It resolves to
whether the browser agreed.

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
| `VALIDATION_FAILED` | The `validate` option rejected a value |

## Good to know

**Cookies**

- A cookie holds about 4 KB. Larger values return `false` with `QUOTA_EXCEEDED` instead of being silently
  dropped as the browser would.
- Without `expire` or `defaultTTL`, a cookie ends when the browser closes.
- Defaults are `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS.
- Every cookie is sent with every request to your server, so keep them small.
- JavaScript cannot create `HttpOnly` cookies. Authentication sessions should be set by your server.
- `subscribe` sees cookie changes from other tabs in browsers with the CookieStore API, and from the current tab
  everywhere.

**IndexedDB**

- Every method is asynchronous, unlike the other stores.
- Other tabs are told about changes through `BroadcastChannel`.
- Sizes are estimates, because browsers do not report the size of one value. `capacity` and `free` come from the
  browser's own figures.
- Safari cannot store a `Blob` in private browsing. `set` returns `false`; an `ArrayBuffer` works instead.
- Compare errors with `error.code`. Each entry point has its own `StoreError` class.

**Values** in the other stores use JSON by default, so `Date` becomes a string and `Map` and `Set` do not survive.

**Server rendering:** without a browser there is no storage. Reads return your defaults and writes return
`false`, so one visitor's data can never reach another. For Node scripts and tests, use
`createStore({ storage: createMemoryAdapter() })`.

**Security:** anything in browser storage is readable by any script on your page. Do not store passwords,
tokens, or sensitive personal data. See [docs/SECURITY.md](docs/SECURITY.md).

**Browser support:** any browser with ES2020. Tested in Chromium, Firefox, and WebKit.

**TypeScript:** types are included.

```ts
const user = db.local.get<User>('user'); // User | null
const theme = db.local.get('theme', 'light'); // string
```

## Try the examples

The repository has 13 small working examples, each in its own folder under
[`public/examples/`](public/README.md): theme sync, API caching, form autosave, cookie consent, a shopping cart,
schema migration, error handling, IndexedDB, compression, a storage size debugger, and more.

```sh
npm install
npm run demo
```

## Coming from another library?

Each of these does one part of what opendb-store does. Here is how the same code looks.

**js-cookie**

```js
Cookies.set('theme', 'dark', { expires: 7 }); // days
Cookies.get('theme');
Cookies.remove('theme');

db.cookie.set('theme', 'dark', { expire: 7 * 24 * 60 * 60 * 1000 }); // milliseconds
db.cookie.get('theme');
db.cookie.remove('theme');
```

**localForage**

```js
await localforage.setItem('report', report);
await localforage.getItem('report');

import { indexed } from 'opendb-store/indexeddb';
await indexed.set('report', report);
await indexed.get('report');
```

**store2**

```js
store('user', user);
store.namespace('admin').set('flags', flags);

db.local.set('user', user);
createStore({ namespace: 'admin' }).set('flags', flags);
```

**lscache**

```js
lscache.set('products', products, 5); // minutes

db.local.set('products', products, { expire: 5 * 60 * 1000 }); // milliseconds
```

Values written by other libraries are not read automatically: opendb-store adds a namespace prefix and stores a
small wrapper around each value. Migrate data once with your old library's `get` and opendb-store's `set`.

## Documentation

- [How it works, in diagrams](docs/DIAGRAMS.md)
- [API reference](docs/API.md)
- [Migrating from 2.x](docs/MIGRATION.md): your stored data keeps working
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)

## License

[ISC](LICENSE)
