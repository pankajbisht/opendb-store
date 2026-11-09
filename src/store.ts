import { isValidCookieOptions } from './adapters/cookie';
import { resolveWebStorage } from './adapters/web';
import { jsonSerializer } from './codec/entry';
import { createKeyCodec } from './codec/key';
import type { Context } from './context';
import { get } from './operations/get';
import { has } from './operations/has';
import { entries, keyAt, keys, values } from './operations/keys';
import { patch } from './operations/patch';
import { clear, remove } from './operations/remove';
import { purgeExpired } from './operations/internal';
import { set } from './operations/set';
import { capacity, free, size, ttl, used } from './operations/size';
import { subscribe } from './operations/subscribe';
import { assertCommonOptions, assertOption, createReporter } from './options';
import type { StorageAdapter, Store, StoreOptions } from './types';

function isStorageOption(storage: StoreOptions['storage']): boolean {
  return (
    storage === 'local' ||
    storage === 'session' ||
    storage === 'cookie' ||
    typeof (storage as StorageAdapter | null)?.getItem === 'function'
  );
}

export function createStore(options: StoreOptions = {}): Store {
  const {
    namespace = 'app',
    separator = '.',
    storage = 'local',
    cookie,
    defaultTTL,
    version,
    migrate,
    serializer = jsonSerializer,
    onError,
  } = options;

  assertCommonOptions(namespace, separator, defaultTTL, version, migrate);
  assertOption(isStorageOption(storage), 'storage');
  assertOption(!cookie || isValidCookieOptions(cookie), 'cookie');

  const report = createReporter(onError);

  let resolved: StorageAdapter | undefined;
  const adapter = (): StorageAdapter => {
    if (resolved) return resolved;
    if (typeof storage !== 'string') return (resolved = storage);

    return (resolved = resolveWebStorage(storage, cookie, () =>
      report('STORAGE_UNAVAILABLE', `No ${storage} storage; using memory`)
    ));
  };

  const ctx: Context = {
    adapter,
    keyCodec: createKeyCodec(namespace, separator),
    serializer,
    defaultTTL,
    version,
    migrate,
    report,
  };

  const store = {
    namespace,
    get storage() {
      return adapter();
    },
    get count() {
      return keys(ctx).length;
    },
    get: (key, defaultValue) => get(ctx, key, defaultValue),
    set: (key, value, opts) => set(ctx, key, value, opts),
    has: (key) => has(ctx, key),
    patch: (key, partial) => patch(ctx, key, partial),
    remove: (key) => remove(ctx, key),
    clear: () => clear(ctx),
    key: (index) => keyAt(ctx, index),
    keys: () => keys(ctx),
    values: () => values(ctx),
    entries: () => entries(ctx),
    size: (key, opts) => size(ctx, key, opts),
    used: (opts) => used(ctx, opts),
    free: (opts) => free(ctx, opts),
    capacity: (opts) => capacity(ctx, opts),
    ttl: (key) => ttl(ctx, key),
    purgeExpired: () => purgeExpired(ctx),
    subscribe: (key, listener) => subscribe(ctx, key, listener),
    from: (name: string) => createStore({ ...options, namespace: name }),
  } as Store;

  return Object.freeze(store);
}
