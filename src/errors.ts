export type StoreErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'SERIALIZE_FAILED'
  | 'CORRUPT_VALUE'
  | 'STORAGE_UNAVAILABLE'
  | 'INVALID_KEY'
  | 'INVALID_ARGUMENT'
  | 'MIGRATION_FAILED'
  | 'LISTENER_FAILED';

export class StoreError extends Error {
  readonly code: StoreErrorCode;
  readonly key?: string;
  readonly cause?: unknown;

  constructor(
    code: StoreErrorCode,
    message: string,
    key?: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.key = key;
    this.cause = cause;
  }
}

export function isQuotaError(error: unknown): boolean {
  const { name, code } = (error ?? {}) as { name?: string; code?: number };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}
