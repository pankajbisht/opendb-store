import type { KeyCodec } from './codec/key';
import type { StoreErrorCode } from './errors';
import type { Serializer, StorageAdapter, StoreOptions } from './types';

export interface Context {
  adapter(): StorageAdapter;
  keyCodec: KeyCodec;
  serializer: Serializer;
  defaultTTL?: number;
  version?: number;
  migrate?: StoreOptions['migrate'];
  validate?: StoreOptions['validate'];
  report(
    code: StoreErrorCode,
    message: string,
    key?: string,
    cause?: unknown
  ): void;
}
