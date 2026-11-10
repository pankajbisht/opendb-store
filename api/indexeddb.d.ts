type StoreErrorCode = 'QUOTA_EXCEEDED' | 'SERIALIZE_FAILED' | 'CORRUPT_VALUE' | 'STORAGE_UNAVAILABLE' | 'INVALID_KEY' | 'INVALID_ARGUMENT' | 'MIGRATION_FAILED' | 'LISTENER_FAILED' | 'VALIDATION_FAILED';
declare class StoreError extends Error {
    readonly code: StoreErrorCode;
    readonly key?: string;
    readonly cause?: unknown;
    constructor(code: StoreErrorCode, message: string, key?: string, cause?: unknown);
}

type Key = string | number;
type StorageKind = 'local' | 'session' | 'cookie';
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
interface CookieOptions {
    /** Defaults to `/`. */
    path?: string;
    /** Defaults to the current host only. */
    domain?: string;
    /** Defaults to `Lax`. */
    sameSite?: 'Strict' | 'Lax' | 'None';
    /** Defaults to true on HTTPS pages and false elsewhere. */
    secure?: boolean;
}
interface Serializer {
    serialize(value: unknown): string;
    deserialize(raw: string): unknown;
}
interface StoreOptions {
    /** Prefix for every key. Must not contain the separator. Defaults to `app`. */
    namespace?: string;
    /** Text between namespace and key. Defaults to `.`. */
    separator?: string;
    /** Which storage to use, or a custom adapter. Defaults to `local`. */
    storage?: StorageKind | StorageAdapter;
    /** Cookie attributes. Applies when `storage` is `cookie`. */
    cookie?: CookieOptions;
    /** Lifetime in milliseconds for entries set without `expire`. */
    defaultTTL?: number;
    /** Schema version, a positive integer, recorded on every entry written. */
    version?: number;
    /**
     * Upgrades an entry written under an older `version`, on first read.
     * Entries from before versioning have `fromVersion` 0. Return `undefined`
     * to discard the entry.
     */
    migrate?: (value: any, fromVersion: number, key: string) => unknown;
    /** Replaces JSON. Receives the whole `{ value, expire }` entry. */
    serializer?: Serializer;
    /**
     * Checks each value as it is read. Values it rejects read as missing and
     * report `VALIDATION_FAILED`. Stored data can be edited, so use this for
     * anything you trust.
     */
    validate?: (value: unknown, key: string) => boolean;
    /** Receives every failure. Without it, failures go to `console.warn`. */
    onError?: (error: StoreError) => void;
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

interface IndexedStoreOptions extends Omit<StoreOptions, 'storage' | 'cookie'> {
    /** IndexedDB database name. Defaults to `opendb-store`. */
    database?: string;
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

declare function createIndexedStore(options?: IndexedStoreOptions): AsyncStore;

/** A ready-to-use store, like `db.local`, whose methods return promises. */
declare const indexed: AsyncStore;

export { StoreError, createIndexedStore, indexed as default, indexed };
export type { AsyncStore, FormatOptions, IndexedStoreOptions, Key, Serializer, SetOptions, StoreErrorCode };
