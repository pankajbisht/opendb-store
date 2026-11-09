import type { FormatOptions, Key, SetOptions, StoreOptions } from '../types';

export interface IndexedStoreOptions extends Omit<
  StoreOptions,
  'storage' | 'cookie'
> {
  /** IndexedDB database name. Defaults to `opendb-store`. */
  database?: string;
}

/** The same operations as a `Store`, returning promises that never reject. */
export interface AsyncStore {
  readonly async: true;
  readonly namespace: string;
  readonly database: string;
  /** Number of live entries in this namespace. */
  readonly count: Promise<number>;
  get<T = unknown>(key: Key): Promise<T | null>;
  get<T>(key: Key, defaultValue: T): Promise<T>;
  set(key: Key, value: unknown, options?: SetOptions): Promise<boolean>;
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
  subscribe<T = unknown>(
    key: Key,
    listener: (value: T | null) => void
  ): () => void;
  /** Returns a separate store with the same options and another namespace. */
  from(namespace: string): AsyncStore;
}
