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
export function pick(store: Reader, key: Key, fields: string[]): Item {
  const source = readObject(store, key);
  if (!source || !Array.isArray(fields)) return {};

  // fromEntries defines plain properties, so `__proto__` cannot set a prototype.
  return Object.fromEntries(
    fields.filter((name) => hasField(source, name)).map((n) => [n, source[n]])
  );
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
export function pluck<T = unknown>(store: Reader, key: Key, name: string): T[] {
  return readList(store, key)
    .map((item) => field(item, name) as T)
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
