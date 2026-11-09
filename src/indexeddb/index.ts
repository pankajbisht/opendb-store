import { createIndexedStore } from './store';

export { createIndexedStore } from './store';
export { StoreError, type StoreErrorCode } from '../errors';
export type { AsyncStore, IndexedStoreOptions } from './types';
export type { FormatOptions, Key, Serializer, SetOptions } from '../types';

/** A ready-to-use store, like `db.local`, whose methods return promises. */
export const indexed = /*#__PURE__*/ createIndexedStore();

export default indexed;
