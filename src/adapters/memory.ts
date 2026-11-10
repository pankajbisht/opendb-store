import type { StorageAdapter } from '../types';

export function createMemoryAdapter(): StorageAdapter {
  const items = new Map<string, string>();
  // Built on demand, so walking every key by index stays linear.
  let order: string[] | undefined;

  return {
    get length() {
      return items.size;
    },
    key: (index) => (order ??= [...items.keys()])[index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      if (!items.has(key)) order = undefined;
      items.set(key, value);
    },
    removeItem(key) {
      order = undefined;
      items.delete(key);
    },
  };
}
