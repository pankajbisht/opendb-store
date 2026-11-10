import type { StoreError } from './errors';

export type Key = string | number;

export type StorageKind = 'local' | 'session' | 'cookie';

export interface WriteMeta {
  /** Absolute expiry time in epoch milliseconds, if the entry has one. */
  expire?: number;
}

/** The subset of the Web Storage API that a store needs. */
export interface StorageAdapter {
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

export interface CookieOptions {
  /** Defaults to `/`. */
  path?: string;
  /** Defaults to the current host only. */
  domain?: string;
  /** Defaults to `Lax`. */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** Defaults to true on HTTPS pages and false elsewhere. */
  secure?: boolean;
}

export interface Serializer {
  serialize(value: unknown): string;
  deserialize(raw: string): unknown;
}

export interface StoreOptions {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export interface SetOptions {
  /** Lifetime in milliseconds from now. Must be a positive number. */
  expire?: number;
}

export interface FormatOptions {
  format?: 'B' | 'KB' | 'MB' | (string & {});
  unit?: boolean;
  /** Overrides the assumed capacity used by `free` and `capacity`. */
  capacity?: number;
}

export interface Store {
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
  subscribe<T = unknown>(
    key: Key,
    listener: (value: T | null) => void
  ): () => void;
  /** Returns a separate store with the same options and another namespace. */
  from(namespace: string): Store;
}
