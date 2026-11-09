import { isValidTTL } from './codec/entry';
import type { Context } from './context';
import { StoreError } from './errors';
import type { StoreOptions } from './types';

export function assertOption(valid: boolean, name: string): void {
  if (!valid) throw new TypeError(`Invalid option: ${name}`);
}

export function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value !== '';
}

export function assertCommonOptions(
  namespace: string,
  separator: string,
  defaultTTL: StoreOptions['defaultTTL'],
  version: StoreOptions['version'],
  migrate: StoreOptions['migrate']
): void {
  assertOption(isNonEmptyString(separator), 'separator');
  assertOption(
    isNonEmptyString(namespace) && !namespace.includes(separator),
    'namespace'
  );
  assertOption(
    defaultTTL === undefined || isValidTTL(defaultTTL),
    'defaultTTL'
  );
  assertOption(
    version === undefined || (Number.isInteger(version) && version > 0),
    'version'
  );
  assertOption(!migrate || version !== undefined, 'migrate');
}

export function createReporter(
  onError: StoreOptions['onError']
): Context['report'] {
  return (code, message, key, cause) => {
    const error = new StoreError(code, message, key, cause);

    // A faulty handler must not turn a reported failure into a thrown one.
    try {
      // A fixed first argument stops keys being read as console format codes.
      if (onError) onError(error);
      else console.warn('[opendb-store]', `${code}: ${message}`);
    } catch {
      // Nothing further can be done with the failure.
    }
  };
}
