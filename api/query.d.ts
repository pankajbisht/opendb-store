type Key = string | number;

/** A synchronous store, or an IndexedDB store whose results are promises. */
type Reader = {
    get(key: Key): unknown;
    readonly async?: boolean;
};
type Item = Record<string, unknown>;
type Result<S, T> = S extends {
    async: true;
} ? Promise<T> : T;
/** Returns a copy of the stored object with only the named fields. */
declare function pick<S extends Reader>(store: S, key: Key, fields: string[]): Result<S, Item>;
/** Returns a copy of the stored object without the named fields. */
declare function omit<S extends Reader>(store: S, key: Key, fields: string[]): Result<S, Item>;
/** Returns one field from each item in a stored array, skipping missing ones. */
declare function pluck<T = unknown, S extends Reader = Reader>(store: S, key: Key, name: string): Result<S, T[]>;
/** Returns every item in a stored array that matches all conditions. */
declare function where<S extends Reader>(store: S, key: Key, conditions: Item): Result<S, Item[]>;
/** Returns the first item in a stored array that matches all conditions. */
declare function findWhere<S extends Reader>(store: S, key: Key, conditions: Item): Result<S, Item | undefined>;

export { findWhere, omit, pick, pluck, where };
export type { Item, Reader, Result };
