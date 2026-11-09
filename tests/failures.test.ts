import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryAdapter } from '../src/adapters/memory';
import { isQuotaError } from '../src/adapters/web';
import { createStore, StoreError } from '../src/index';
import type { StorageAdapter } from '../src/types';

function collectErrors() {
  const errors: StoreError[] = [];
  return { errors, onError: (error: StoreError) => void errors.push(error) };
}

function failingAdapter(overrides: Partial<StorageAdapter>): StorageAdapter {
  const base = createMemoryAdapter();
  return Object.create(base, Object.getOwnPropertyDescriptors(overrides));
}

function stubStorage(
  name: 'localStorage' | 'sessionStorage',
  get: () => unknown
) {
  Object.defineProperty(window, name, { configurable: true, get });
}

describe('write failures', () => {
  test('quota error returns false and reports QUOTA_EXCEEDED', () => {
    const { errors, onError } = collectErrors();
    const storage = failingAdapter({
      setItem() {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    const store = createStore({ storage, onError });

    expect(store.set('k', 'v')).toBe(false);
    expect(errors[0]).toBeInstanceOf(StoreError);
    expect(errors[0]?.code).toBe('QUOTA_EXCEEDED');
    expect(errors[0]?.key).toBe('app.k');
    expect(errors[0]?.cause).toBeInstanceOf(DOMException);
  });

  test('other write errors report STORAGE_UNAVAILABLE', () => {
    const { errors, onError } = collectErrors();
    const storage = failingAdapter({
      setItem() {
        throw new Error('denied');
      },
    });

    expect(createStore({ storage, onError }).set('k', 'v')).toBe(false);
    expect(errors[0]?.code).toBe('STORAGE_UNAVAILABLE');
  });

  test('circular values return false and report SERIALIZE_FAILED', () => {
    const { errors, onError } = collectErrors();
    const store = createStore({ storage: createMemoryAdapter(), onError });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(store.set('k', circular)).toBe(false);
    expect(errors[0]?.code).toBe('SERIALIZE_FAILED');
  });

  test('BigInt values return false', () => {
    const { errors, onError } = collectErrors();
    const store = createStore({ storage: createMemoryAdapter(), onError });
    expect(store.set('k', BigInt(1))).toBe(false);
    expect(errors[0]?.code).toBe('SERIALIZE_FAILED');
  });

  test('invalid key on write reports INVALID_KEY', () => {
    const { errors, onError } = collectErrors();
    const store = createStore({ storage: createMemoryAdapter(), onError });
    store.set('' as never, 1);
    store.remove('' as never);
    expect(errors.map((e) => e.code)).toEqual(['INVALID_KEY', 'INVALID_KEY']);
  });

  test('a key object without a string form does not throw', () => {
    const store = createStore({
      storage: createMemoryAdapter(),
      onError: () => {},
    });
    expect(store.set(Object.create(null) as never, 1)).toBe(false);
  });

  test('failures go to console.warn when there is no onError', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createStore({ storage: createMemoryAdapter() }).set('' as never, 1);
    expect(warn).toHaveBeenCalledWith(
      '[opendb-store]',
      expect.stringContaining('INVALID_KEY')
    );
    warn.mockRestore();
  });
});

describe('read failures', () => {
  test('corrupt JSON returns the default and reports once', () => {
    const { errors, onError } = collectErrors();
    const storage = createMemoryAdapter();
    storage.setItem('app.k', '{not json');
    const store = createStore({ storage, onError });

    expect(store.get('k', 'd')).toBe('d');
    expect(errors.map((e) => e.code)).toEqual(['CORRUPT_VALUE']);
  });

  test('has and keys do not report corrupt values', () => {
    const { errors, onError } = collectErrors();
    const storage = createMemoryAdapter();
    storage.setItem('app.k', '{not json');
    const store = createStore({ storage, onError });

    expect(store.has('k')).toBe(false);
    expect(store.keys()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test.each([['"plain"'], ['0'], ['[1]'], ['null'], ['{"other":1}']])(
    'foreign value %s returns the default and is left in place',
    (raw) => {
      const storage = createMemoryAdapter();
      storage.setItem('app.k', raw);
      const store = createStore({ storage });

      expect(store.get('k', 'd')).toBe('d');
      expect(store.has('k')).toBe(false);
      expect(storage.getItem('app.k')).toBe(raw);
    }
  );

  test('an adapter that throws on read returns the default', () => {
    const storage = failingAdapter({
      getItem() {
        throw new Error('boom');
      },
    });
    const store = createStore({ storage, onError: () => {} });
    expect(store.get('k', 'd')).toBe('d');
  });

  test('an adapter that throws on remove reports the failure', () => {
    const { errors, onError } = collectErrors();
    const storage = failingAdapter({
      removeItem() {
        throw new Error('boom');
      },
    });

    expect(() => createStore({ storage, onError }).remove('k')).not.toThrow();
    expect(errors[0]?.code).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('storage availability', () => {
  const originals = {
    localStorage: Object.getOwnPropertyDescriptor(window, 'localStorage'),
    sessionStorage: Object.getOwnPropertyDescriptor(window, 'sessionStorage'),
  };

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).localStorage;
    delete (window as unknown as Record<string, unknown>).sessionStorage;
    if (originals.localStorage) {
      Object.defineProperty(window, 'localStorage', originals.localStorage);
    }
    if (originals.sessionStorage) {
      Object.defineProperty(window, 'sessionStorage', originals.sessionStorage);
    }
  });

  test('creating a store does not touch storage', () => {
    const access = vi.fn(() => {
      throw new Error('should not be read');
    });
    stubStorage('localStorage', access);

    createStore({ storage: 'local' });

    expect(access).not.toHaveBeenCalled();
  });

  test('blocked storage falls back to memory and reports once', () => {
    stubStorage('sessionStorage', () => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { errors, onError } = collectErrors();
    const store = createStore({ storage: 'session', namespace: 'b1', onError });

    expect(store.set('k', 1)).toBe(true);
    expect(store.get('k')).toBe(1);
    expect(store.has('k')).toBe(true);
    expect(errors.map((e) => e.code)).toEqual(['STORAGE_UNAVAILABLE']);
    store.clear();
  });

  test('missing storage falls back to memory', () => {
    stubStorage('localStorage', () => null);
    const store = createStore({ namespace: 'b2', onError: () => {} });

    expect(store.set('k', 1)).toBe(true);
    expect(store.get('k')).toBe(1);
    store.clear();
  });

  test('stores of the same kind share the memory fallback', () => {
    stubStorage('localStorage', () => null);
    const a = createStore({ namespace: 'b3', onError: () => {} });
    const b = createStore({ namespace: 'b3', onError: () => {} });

    a.set('k', 1);
    expect(b.get('k')).toBe(1);
    a.clear();
  });

  test('storage that rejects writes falls back to memory', () => {
    const broken = failingAdapter({
      setItem() {
        throw new Error('denied');
      },
    });
    stubStorage('localStorage', () => broken);
    const { errors, onError } = collectErrors();
    const store = createStore({ namespace: 'b4', onError });

    expect(store.set('k', 1)).toBe(true);
    expect(errors[0]?.code).toBe('STORAGE_UNAVAILABLE');
    store.clear();
  });

  test('full storage is still used, and reports quota errors', () => {
    const full = failingAdapter({
      setItem() {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    stubStorage('localStorage', () => full);
    const { errors, onError } = collectErrors();
    const store = createStore({ namespace: 'b5', onError });

    expect(store.set('k', 1)).toBe(false);
    expect(store.storage).toBe(full);
    expect(errors.map((e) => e.code)).toEqual(['QUOTA_EXCEEDED']);
  });

  test.each([
    [{ name: 'QuotaExceededError' }, true],
    [{ name: 'NS_ERROR_DOM_QUOTA_REACHED' }, true],
    [{ code: 22 }, true],
    [{ code: 1014 }, true],
    [new Error('x'), false],
    [null, false],
  ])('isQuotaError(%o) is %s', (error, expected) => {
    expect(isQuotaError(error)).toBe(expected);
  });
});

describe('store configuration', () => {
  test.each([
    ['empty namespace', { namespace: '' }],
    ['non-string namespace', { namespace: 1 }],
    ['empty separator', { separator: '' }],
    ['namespace containing the separator', { namespace: 'a.b' }],
    ['unknown storage kind', { storage: 'websql' }],
    ['version of zero', { version: 0 }],
    ['fractional version', { version: 1.5 }],
    ['migrate without version', { migrate: () => 1 }],
    ['invalid adapter', { storage: {} }],
    ['null adapter', { storage: null }],
    ['zero defaultTTL', { defaultTTL: 0 }],
    ['non-numeric defaultTTL', { defaultTTL: 'soon' }],
  ])('rejects %s', (_label, options) => {
    expect(() => createStore(options as never)).toThrow(TypeError);
  });

  test('a custom separator is applied', () => {
    const storage = createMemoryAdapter();
    createStore({ storage, namespace: 'a.b', separator: ':' }).set('k', 1);
    expect(storage.getItem('a.b:k')).toBe('{"value":1}');
  });

  test('from keeps the other options', () => {
    const storage = createMemoryAdapter();
    createStore({ storage, separator: ':' }).from('x').set('k', 1);
    expect(storage.getItem('x:k')).not.toBeNull();
  });

  test('from rejects an invalid namespace', () => {
    expect(() =>
      createStore({ storage: createMemoryAdapter() }).from('')
    ).toThrow(TypeError);
  });

  test('a custom serializer is used for reads and writes', () => {
    const storage = createMemoryAdapter();
    const serializer = {
      serialize: (value: unknown) => btoa(JSON.stringify(value)),
      deserialize: (raw: string) => JSON.parse(atob(raw)),
    };
    const store = createStore({ storage, serializer });

    store.set('k', 'secret');
    expect(storage.getItem('app.k')).not.toContain('secret');
    expect(store.get('k')).toBe('secret');
  });

  test('the store object cannot be modified', () => {
    const store = createStore({ storage: createMemoryAdapter() });
    expect(Object.isFrozen(store)).toBe(true);
  });

  test('storage exposes the underlying adapter', () => {
    const storage = createMemoryAdapter();
    expect(createStore({ storage }).storage).toBe(storage);
  });
});

describe('formatting', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const store = createStore({ storage: createMemoryAdapter() });

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test.each([
    [512, '512.00 B'],
    [2048, '2.00 KB'],
    [3 * 1024 * 1024, '3.00 MB'],
    [5 * 1024 * 1024 * 1024, '5120.00 MB'],
  ])('an unknown format auto-scales %i', (capacity, expected) => {
    expect(store.capacity({ capacity, format: 'xyz', unit: true })).toBe(
      expected
    );
    expect(warn).toHaveBeenCalled();
  });

  test('auto-scaling can omit the unit', () => {
    expect(store.capacity({ capacity: 2048, format: 'xyz', unit: false })).toBe(
      '2.00'
    );
  });

  test('auto-scaling handles an empty size', () => {
    expect(store.used({ format: 'xyz', unit: true })).toBe('0.00 B');
  });
});
