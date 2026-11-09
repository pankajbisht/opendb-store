import type { Key, Store } from './types';

type Reader = Pick<Store, 'get'>;
type Item = Record<string, unknown>;

function readObject(store: Reader, key: Key): Item | undefined {
  const value = store.get<unknown>(key);
  return typeof value === 'object' && value !== null
    ? (value as Item)
    : undefined;
}

function readList(store: Reader, key: Key): Item[] {
  const value = store.get<unknown>(key);
  return Array.isArray(value) ? value : [];
}

function matcher(conditions: Item) {
  return (item: Item) =>
    Object.keys(conditions).every((k) => item?.[k] === conditions[k]);
}

/** Returns a copy of the stored object with only the named fields. */
export function pick(store: Reader, key: Key, fields: string[]): Item {
  const source = readObject(store, key);
  const result: Item = {};

  if (source && Array.isArray(fields)) {
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(source, field))
        result[field] = source[field];
    }
  }

  return result;
}

/** Returns a copy of the stored object without the named fields. */
export function omit(store: Reader, key: Key, fields: string[]): Item {
  const source = readObject(store, key);
  if (!source || !Array.isArray(fields)) return {};

  return Object.fromEntries(
    Object.entries(source).filter(([field]) => !fields.includes(field))
  );
}

/** Returns one field from each item in a stored array, skipping missing ones. */
export function pluck<T = unknown>(
  store: Reader,
  key: Key,
  field: string
): T[] {
  return readList(store, key)
    .map((item) => item?.[field] as T)
    .filter((value) => value !== null && value !== undefined);
}

/** Returns every item in a stored array that matches all conditions. */
export function where(store: Reader, key: Key, conditions: Item): Item[] {
  return readList(store, key).filter(matcher(conditions));
}

/** Returns the first item in a stored array that matches all conditions. */
export function findWhere(
  store: Reader,
  key: Key,
  conditions: Item
): Item | undefined {
  return readList(store, key).find(matcher(conditions));
}
