import type { Serializer } from '../types';

export interface Entry {
  value: unknown;
  expire?: number;
  /** Schema version. Only present when the store sets `version`. */
  v?: number;
}

export const jsonSerializer: Serializer = {
  serialize: (value) => JSON.stringify(value),
  deserialize: (raw) => JSON.parse(raw),
};

function isEntry(data: unknown): data is Entry {
  return (
    typeof data === 'object' &&
    data !== null &&
    Object.prototype.hasOwnProperty.call(data, 'value')
  );
}

/** Returns `undefined` for data this library did not write. Throws if undecodable. */
export function decodeEntry(
  serializer: Serializer,
  raw: string
): Entry | undefined {
  return sanitizeEntry(serializer.deserialize(raw));
}

/** Returns `undefined` for anything that is not an entry. */
export function sanitizeEntry(data: unknown): Entry | undefined {
  if (!isEntry(data)) return undefined;

  // Stored data can be edited, so metadata must be a number to be trusted.
  if (!Number.isFinite(data.expire)) delete data.expire;
  if (!Number.isFinite(data.v)) delete data.v;

  return data;
}

export function isExpired(entry: Entry): boolean {
  return entry.expire !== undefined && Date.now() > entry.expire;
}

export function isValidTTL(ttl: unknown): ttl is number {
  return typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0;
}
