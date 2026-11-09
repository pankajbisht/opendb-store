import { createStore } from './store';

export { createStore } from './store';
export { createMemoryAdapter } from './adapters/memory';
export { StoreError, type StoreErrorCode } from './errors';
export { version } from './version';
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
