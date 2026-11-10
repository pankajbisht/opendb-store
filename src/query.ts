import type { Key } from './types';

/** A synchronous store, or an IndexedDB store whose results are promises. */
export type Reader = { get(key: Key): unknown; readonly async?: boolean };
export type Item = Record<string, unknown>;
export type Result<S, T> = S extends { async: true } ? Promise<T> : T;

function using<S extends Reader, T>(
  store: S,
  key: Key,
  read: (value: unknown) => T
): Result<S, T> {
  const value = store.get(key);
  return (
    store.async ? Promise.resolve(value).then(read) : read(value)
  ) as Result<S, T>;
}

function asObject(value: unknown): Item | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Item)
    : undefined;
}

const asList = (value: unknown): Item[] => (Array.isArray(value) ? value : []);

function hasField(item: unknown, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(item ?? {}, field);
}

/** Reads an item's own field, so `constructor` and friends are never returned. */
function field(item: Item, name: string): unknown {
  return hasField(item, name) ? item[name] : undefined;
}

function matcher(conditions: Item) {
  return (item: Item) =>
    Object.keys(conditions).every((k) => field(item, k) === conditions[k]);
}

/** Returns a copy of the stored object with only the named fields. */
export function pick<S extends Reader>(
  store: S,
  key: Key,
  fields: string[]
): Result<S, Item> {
  return using(store, key, (value) => {
    const source = asObject(value);
    if (!source || !Array.isArray(fields)) return {};

    // fromEntries defines plain properties, so `__proto__` cannot set a prototype.
    return Object.fromEntries(
      fields.filter((name) => hasField(source, name)).map((n) => [n, source[n]])
    );
  });
}

/** Returns a copy of the stored object without the named fields. */
export function omit<S extends Reader>(
  store: S,
  key: Key,
  fields: string[]
): Result<S, Item> {
  return using(store, key, (value) => {
    const source = asObject(value);
    if (!source || !Array.isArray(fields)) return {};

    return Object.fromEntries(
      Object.entries(source).filter(([name]) => !fields.includes(name))
    );
  });
}

/** Returns one field from each item in a stored array, skipping missing ones. */
export function pluck<T = unknown, S extends Reader = Reader>(
  store: S,
  key: Key,
  name: string
): Result<S, T[]> {
  return using(store, key, (value) =>
    asList(value)
      .map((item) => field(item, name) as T)
      .filter((found) => found !== null && found !== undefined)
  );
}

/** Returns every item in a stored array that matches all conditions. */
export function where<S extends Reader>(
  store: S,
  key: Key,
  conditions: Item
): Result<S, Item[]> {
  return using(store, key, (value) =>
    asList(value).filter(matcher(conditions))
  );
}

/** Returns the first item in a stored array that matches all conditions. */
export function findWhere<S extends Reader>(
  store: S,
  key: Key,
  conditions: Item
): Result<S, Item | undefined> {
  return using(store, key, (value) => asList(value).find(matcher(conditions)));
}
