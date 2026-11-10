export interface KeyCodec {
  build(key: string): string;
  owns(rawKey: string): boolean;
  parse(rawKey: string): string;
}

/** Returns the string form of a valid key, or `undefined` for an invalid one. */
export function normalizeKey(key: unknown): string | undefined {
  if (typeof key === 'string') return key === '' ? undefined : key;
  if (typeof key === 'number' && Number.isFinite(key)) return String(key);
  return undefined;
}

export function createKeyCodec(namespace: string, separator: string): KeyCodec {
  const prefix = `${namespace}${separator}`;

  return {
    build: (key) => `${prefix}${key}`,
    owns: (rawKey) => rawKey.startsWith(prefix),
    parse: (rawKey) => rawKey.slice(prefix.length),
  };
}
