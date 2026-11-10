import { createStore } from './store';

export { createStore } from './store';
export { createMemoryAdapter } from './adapters/memory';
export { StoreError, type StoreErrorCode } from './errors';
export { version } from './version';

/**
 * Asks the browser to keep this site's storage when space runs low. Resolves
 * to whether it agreed, and never rejects.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
export type {
  CookieOptions,
  FormatOptions,
  Key,
  Serializer,
  SetOptions,
  StorageAdapter,
  StorageKind,
  Store,
  StoreOptions,
  WriteMeta,
} from './types';

export const local = /*#__PURE__*/ createStore({ storage: 'local' });
export const session = /*#__PURE__*/ createStore({ storage: 'session' });
export const cookie = /*#__PURE__*/ createStore({ storage: 'cookie' });

export default { local, session, cookie };
