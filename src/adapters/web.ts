import type { CookieOptions, StorageAdapter, StorageKind } from '../types';
import { createCookieAdapter } from './cookie';
import { createMemoryAdapter } from './memory';

const PROBE_KEY = '__opendb_probe__';

// Stores of the same kind share one fallback, as they would share real storage.
const fallbacks: Partial<Record<StorageKind, StorageAdapter>> = {};

// One shared instance, so same-tab subscribers match across cookie stores.
let defaultCookies: StorageAdapter | undefined;

export function isQuotaError(error: unknown): boolean {
  const { name, code } = (error ?? {}) as { name?: string; code?: number };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

function isWritable(storage: StorageAdapter): boolean {
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch (error) {
    // Full storage is still working storage.
    return isQuotaError(error);
  }
}

function fallback(kind: StorageKind): StorageAdapter {
  return (fallbacks[kind] ??= createMemoryAdapter());
}

function lookup(kind: StorageKind, cookie?: CookieOptions): StorageAdapter {
  if (kind !== 'cookie') return window[`${kind}Storage`];
  if (cookie) return createCookieAdapter(cookie);
  return (defaultCookies ??= createCookieAdapter());
}

export function resolveWebStorage(
  kind: StorageKind,
  cookie: CookieOptions | undefined,
  onUnavailable: () => void
): StorageAdapter {
  // A server has no storage by design, so this case is not reported.
  if (typeof window === 'undefined') return fallback(kind);

  try {
    const storage = lookup(kind, cookie);
    if (storage && isWritable(storage)) return storage;
  } catch {
    // Reading the property throws when storage is blocked.
  }

  onUnavailable();
  return fallback(kind);
}
