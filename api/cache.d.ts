type Key = string | number;
interface WriteMeta {
    /** Absolute expiry time in epoch milliseconds, if the entry has one. */
    expire?: number;
}
/** The subset of the Web Storage API that a store needs. */
interface StorageAdapter {
    readonly length: number;
    /** Estimated total capacity, used by `free` and `capacity`. */
    readonly capacity?: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string, meta?: WriteMeta): void;
    removeItem(key: string): void;
    /**
     * Calls `onChange` with a raw key, or `null` for everything, when another
     * tab changes storage. Returns a function that stops watching.
     */
    watch?(onChange: (rawKey: string | null) => void): () => void;
    /** Size of one entry. Defaults to the UTF-16 length of key and value. */
    measure?(key: string, value: string): number;
}
interface SetOptions {
    /** Lifetime in milliseconds from now. Must be a positive number. */
    expire?: number;
}
interface FormatOptions {
    format?: 'B' | 'KB' | 'MB' | (string & {});
    unit?: boolean;
    /** Overrides the assumed capacity used by `free` and `capacity`. */
    capacity?: number;
}
interface Store {
    /** The underlying storage. Using it directly bypasses namespacing and expiry. */
    readonly storage: StorageAdapter;
    readonly namespace: string;
    /** Number of live entries in this namespace. */
    readonly count: number;
    get<T = unknown>(key: Key): T | null;
    get<T>(key: Key, defaultValue: T): T;
    set(key: Key, value: unknown, options?: SetOptions): boolean;
    has(key: Key): boolean;
    /** Merges into a stored object, keeping its expiry. Creates it if absent. */
    patch(key: Key, partial: Record<string, unknown>): boolean;
    /** Removes the entry and returns its previous value, or `null`. */
    remove<T = unknown>(key: Key): T | null;
    /** Removes every key in this namespace. */
    clear(): void;
    key(index: number): string | null;
    keys(): string[];
    values<T = unknown>(): T[];
    entries<T = unknown>(): [string, T][];
    size(key: Key): number;
    size(key: Key, options: FormatOptions): number | string;
    used(): number;
    used(options: FormatOptions): number | string;
    free(): number;
    free(options: FormatOptions): number | string;
    capacity(): number;
    capacity(options: FormatOptions): number | string;
    /** Milliseconds until expiry, or `null` if absent or permanent. */
    ttl(key: Key): number | null;
    /** Deletes every expired entry and returns how many were removed. */
    purgeExpired(): number;
    /**
     * Calls `listener` with the new value (`null` once gone) whenever the key
     * changes. Local storage also reports changes from other tabs. Returns an
     * unsubscribe function.
     */
    subscribe<T = unknown>(key: Key, listener: (value: T | null) => void): () => void;
    /** Returns a separate store with the same options and another namespace. */
    from(namespace: string): Store;
}

interface CacheOptions {
    /** Most entries to keep. The least recently used are removed beyond this. */
    maxEntries: number;
    /** Whether reading an entry counts as using it. Defaults to true. */
    touchOnRead?: boolean;
}
/** A store that never holds more than `maxEntries` values. */
interface Cache {
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
/**
 * Limits a local, session, or cookie store to `maxEntries` values, removing
 * the least recently used. Write through the cache so it can track use. The
 * usage order is kept beside the store, under `<namespace>~order`.
 */
declare function createCache(store: Store, options: CacheOptions): Cache;

export { createCache };
export type { Cache, CacheOptions };
