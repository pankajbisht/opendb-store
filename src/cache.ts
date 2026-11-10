import type { Key, SetOptions, Store } from './types';

export interface CacheOptions {
  /** Most entries to keep. The least recently used are removed beyond this. */
  maxEntries: number;
  /** Whether reading an entry counts as using it. Defaults to true. */
  touchOnRead?: boolean;
}

/** A store that never holds more than `maxEntries` values. */
export interface Cache {
  readonly namespace: string;
  /** Number of live entries. */
  readonly count: number;
  get<T = unknown>(key: Key): T | null;
  get<T>(key: Key, defaultValue: T): T;
  set(key: Key, value: unknown, options?: SetOptions): boolean;
  has(key: Key): boolean;
  remove<T = unknown>(key: Key): T | null;
  clear(): void;
  /** Keys from least to most recently used. */
  keys(): string[];
}

const MISSING = {};

/**
 * Limits a local, session, or cookie store to `maxEntries` values, removing
 * the least recently used. Write through the cache so it can track use. The
 * usage order is kept beside the store, under `<namespace>~order`.
 */
export function createCache(store: Store, options: CacheOptions): Cache {
  const { maxEntries, touchOnRead = true } = options;

  if (!(Number.isInteger(maxEntries) && maxEntries > 0)) {
    throw new TypeError('Invalid option: maxEntries');
  }

  // Outside the namespace prefix, so it never appears among the store's keys.
  const orderKey = `${store.namespace}~order`;

  function order(): string[] {
    try {
      const saved: unknown = JSON.parse(
        store.storage.getItem(orderKey) ?? '[]'
      );
      return Array.isArray(saved)
        ? saved.filter((key): key is string => typeof key === 'string')
        : [];
    } catch {
      return [];
    }
  }

  function save(keys: string[]): void {
    try {
      store.storage.setItem(orderKey, JSON.stringify(keys));
    } catch {
      // Losing the order only makes eviction less precise.
    }
  }

  function touch(key: string): void {
    const keys = order();
    if (keys[keys.length - 1] !== key) {
      save([...keys.filter((other) => other !== key), key]);
    }
  }

  function evict(keys: string[]): string[] {
    if (keys.length <= maxEntries) return keys;

    // Forget keys that expired or were removed elsewhere before evicting.
    const live = keys.filter((key) => store.has(key));
    while (live.length > maxEntries) store.remove(live.shift() as string);
    return live;
  }

  return Object.freeze({
    namespace: store.namespace,
    get count() {
      return store.count;
    },
    get(key: Key, defaultValue: unknown = null) {
      const value = store.get(key, MISSING);
      if (value === MISSING) return defaultValue;
      if (touchOnRead) touch(String(key));
      return value;
    },
    set(key: Key, value: unknown, opts?: SetOptions) {
      if (!store.set(key, value, opts)) return false;

      const name = String(key);
      save(evict([...order().filter((other) => other !== name), name]));
      return true;
    },
    has: (key: Key) => store.has(key),
    remove(key: Key) {
      const name = String(key);
      save(order().filter((other) => other !== name));
      return store.remove(key);
    },
    clear() {
      store.clear();
      try {
        store.storage.removeItem(orderKey);
      } catch {
        // Nothing else to clean up.
      }
    },
    keys: () => order().filter((key) => store.has(key)),
  }) as Cache;
}
