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

/** The same operations as a `Store`, returning promises that never reject. */
interface AsyncStore {
    readonly async: true;
    readonly namespace: string;
    readonly database: string;
    /** Number of live entries in this namespace. */
    readonly count: Promise<number>;
    get<T = unknown>(key: Key): Promise<T | null>;
    get<T>(key: Key, defaultValue: T): Promise<T>;
    set(key: Key, value: unknown, options?: SetOptions): Promise<boolean>;
    /** Writes many values in one transaction: all of them, or none on failure. */
    setMany(items: Record<string, unknown> | [Key, unknown][], options?: SetOptions): Promise<boolean>;
    /** Reads many values in one transaction, in the order given. */
    getMany<T = unknown>(keys: Key[]): Promise<(T | null)[]>;
    /** Removes many keys in one transaction. */
    removeMany(keys: Key[]): Promise<void>;
    has(key: Key): Promise<boolean>;
    /** Atomically merges into a stored object, keeping its expiry. */
    patch(key: Key, partial: Record<string, unknown>): Promise<boolean>;
    /** Removes the entry and returns its previous value, or `null`. */
    remove<T = unknown>(key: Key): Promise<T | null>;
    /** Removes every key in this namespace. */
    clear(): Promise<void>;
    key(index: number): Promise<string | null>;
    keys(): Promise<string[]>;
    values<T = unknown>(): Promise<T[]>;
    entries<T = unknown>(): Promise<[string, T][]>;
    /** Estimated size of one entry. */
    size(key: Key): Promise<number>;
    size(key: Key, options: FormatOptions): Promise<number | string>;
    /** Estimated size of this namespace. */
    used(): Promise<number>;
    used(options: FormatOptions): Promise<number | string>;
    /** Room left for the whole origin, as reported by the browser. */
    free(): Promise<number>;
    free(options: FormatOptions): Promise<number | string>;
    /** Total capacity for the origin, as reported by the browser. */
    capacity(): Promise<number>;
    capacity(options: FormatOptions): Promise<number | string>;
    /** Milliseconds until expiry, or `null` if absent or permanent. */
    ttl(key: Key): Promise<number | null>;
    /** Deletes every expired entry and returns how many were removed. */
    purgeExpired(): Promise<number>;
    /**
     * Calls `listener` with the new value (`null` once gone) when the key
     * changes, including from other tabs. Returns an unsubscribe function.
     */
    subscribe<T = unknown>(key: Key, listener: (value: T | null) => void): () => void;
    /** Returns a separate store with the same options and another namespace. */
    from(namespace: string): AsyncStore;
}

interface DebugEntry {
    key: string;
    /** Size of this entry. */
    size: number;
    /** Percentage of this namespace's usage. */
    share: number;
    /** Milliseconds until expiry, or `null` if permanent. */
    expiresIn: number | null;
}
interface StoreReport {
    namespace: string;
    count: number;
    /** Size of this namespace. */
    used: number;
    /** Estimated room left, shared by everything on this origin. */
    free: number;
    /** Estimated total capacity. */
    capacity: number;
    /** Percentage of capacity used by the whole origin. */
    percentUsed: number;
    /** Largest first. */
    entries: DebugEntry[];
}
interface DebugOptions {
    /** Warn when the origin is at least this percent full. Defaults to 80. */
    warnAt?: number;
    /** Name shown in the output. Defaults to the namespace. */
    label?: string;
}
type AnyStore = Store | AsyncStore;
type StoreMap = Record<string, Store>;
type AnyStoreMap = Record<string, AnyStore>;
/** Measures a store and returns the figures without printing anything. */
declare function inspect(store: AsyncStore): Promise<StoreReport>;
declare function inspect(store: Store): StoreReport;
/**
 * Prints a size report to the console and returns the figures. Pass one store,
 * or several, such as the default `db` export. Anything including an IndexedDB
 * store returns a promise.
 */
declare function debug(target: AsyncStore, options?: DebugOptions): Promise<StoreReport>;
declare function debug(target: Store, options?: DebugOptions): StoreReport;
declare function debug(target: StoreMap, options?: DebugOptions): Record<string, StoreReport>;
declare function debug(target: AnyStoreMap, options?: DebugOptions): Promise<Record<string, StoreReport>>;

export { debug, inspect };
export type { AnyStore, AnyStoreMap, DebugEntry, DebugOptions, StoreMap, StoreReport };
