import { isValidCookieOptions } from './adapters/cookie';
import { resolveWebStorage } from './adapters/web';
import { isValidTTL, jsonSerializer } from './codec/entry';
import { createKeyCodec } from './codec/key';
import type { Context } from './context';
import { StoreError } from './errors';
import { get } from './operations/get';
import { has } from './operations/has';
import { entries, keyAt, keys, values } from './operations/keys';
import { patch } from './operations/patch';
import { clear, remove } from './operations/remove';
import { purgeExpired } from './operations/internal';
import { set } from './operations/set';
import { capacity, free, size, ttl, used } from './operations/size';
import { subscribe } from './operations/subscribe';
import type { StorageAdapter, Store, StoreOptions } from './types';

function assertOption(valid: boolean, name: string): void {
  if (!valid) throw new TypeError(`Invalid option: ${name}`);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value !== '';
}

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

  assertOption(isNonEmptyString(separator), 'separator');
  assertOption(
    isNonEmptyString(namespace) && !namespace.includes(separator),
    'namespace'
  );
  assertOption(isStorageOption(storage), 'storage');
  assertOption(!cookie || isValidCookieOptions(cookie), 'cookie');
  assertOption(
    defaultTTL === undefined || isValidTTL(defaultTTL),
    'defaultTTL'
  );
  assertOption(
    version === undefined || (Number.isInteger(version) && version > 0),
    'version'
  );
  assertOption(!migrate || version !== undefined, 'migrate needs version');

  const report: Context['report'] = (code, message, key, cause) => {
    const error = new StoreError(code, message, key, cause);

    // A faulty handler must not turn a reported failure into a thrown one.
    try {
      // A fixed first argument stops keys being read as console format codes.
      if (onError) onError(error);
      else console.warn('[opendb-store]', `${code}: ${message}`);
    } catch {
      // Nothing further can be done with the failure.
    }
  };

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
