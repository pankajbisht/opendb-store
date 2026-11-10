import { afterEach, describe, expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createMemoryAdapter } from '../src/adapters/memory';
import { createStore, requestPersistence, StoreError } from '../src/index';
import { createIndexedStore } from '../src/indexeddb/index';

let counter = 0;
const unique = () => `add-${Date.now()}-${counter++}`;

function collect() {
  const errors: StoreError[] = [];
  return { errors, onError: (e: StoreError) => void errors.push(e) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('validate', () => {
  const isUser = (value: unknown) =>
    typeof value === 'object' && value !== null && 'name' in value;

  test('rejected values read as missing and are reported', () => {
    const { errors, onError } = collect();
    const storage = createMemoryAdapter();
    const store = createStore({ storage, validate: isUser, onError });
    storage.setItem('app.good', '{"value":{"name":"Ada"}}');
    storage.setItem('app.bad', '{"value":{"admin":true}}');

    expect(store.get('good')).toEqual({ name: 'Ada' });
    expect(store.get('bad', 'd')).toBe('d');
    expect(store.values()).toEqual([{ name: 'Ada' }]);
    expect(store.remove('bad')).toBeNull();
    expect(errors.map((e) => e.code)).toEqual([
      'VALIDATION_FAILED',
      'VALIDATION_FAILED',
      'VALIDATION_FAILED',
    ]);
  });

  test('a validator that throws rejects the value', () => {
    const { errors, onError } = collect();
    const storage = createMemoryAdapter();
    storage.setItem('app.k', '{"value":1}');
    const store = createStore({
      storage,
      onError,
      validate() {
        throw new Error('bad schema');
      },
    });

    expect(store.get('k', 'd')).toBe('d');
    expect(errors[0]?.cause).toBeInstanceOf(Error);
  });

  test('patch refuses to merge into a rejected value', () => {
    const storage = createMemoryAdapter();
    storage.setItem('app.k', '{"value":{"admin":true}}');
    const store = createStore({ storage, validate: isUser, onError() {} });

    expect(store.patch('k', { name: 'x' })).toBe(false);
  });

  test('IndexedDB stores validate too', async () => {
    const { errors, onError } = collect();
    const store = createIndexedStore({
      database: unique(),
      validate: isUser,
      onError,
    });
    await store.set('good', { name: 'Ada' });
    await store.set('bad', { admin: true });

    expect(await store.get('bad', 'd')).toBe('d');
    expect(await store.values()).toEqual([{ name: 'Ada' }]);
    expect((await store.keys()).sort()).toEqual(['bad', 'good']);
    expect(await store.getMany(['good', 'bad'])).toEqual([
      { name: 'Ada' },
      null,
    ]);
    expect(await store.patch('bad', { x: 1 })).toBe(false);
    expect(await store.remove('bad')).toBeNull();
    expect(errors.every((e) => e.code === 'VALIDATION_FAILED')).toBe(true);
  });

  test.each([[{ validate: 'yes' }]])('rejects option %o', (options) => {
    expect(() => createStore(options as never)).toThrow(TypeError);
    expect(() => createIndexedStore(options as never)).toThrow(TypeError);
  });
});

describe('subscribers hear only real changes', () => {
  test('an identical rewrite is not reported', () => {
    const store = createStore({ storage: createMemoryAdapter() });
    const listener = vi.fn();
    const stop = store.subscribe('k', listener);

    store.set('k', 1);
    store.set('k', 1);
    store.set('k', 2);
    stop();

    expect(listener.mock.calls).toEqual([[1], [2]]);
  });
});

describe('adapters that watch for changes', () => {
  test('a custom adapter can report changes from elsewhere', () => {
    let onChange: ((key: string | null) => void) | undefined;
    const stop = vi.fn();
    const memory = createMemoryAdapter();
    const storage = Object.assign(Object.create(memory), {
      watch(callback: typeof onChange) {
        onChange = callback;
        return stop;
      },
    });
    const store = createStore({ storage });
    const seen: unknown[] = [];
    const stopA = store.subscribe('a', (value) => seen.push(value));
    const stopB = store.subscribe('b', () => {});

    memory.setItem('app.a', '{"value":"remote"}');
    onChange?.('app.a');
    memory.removeItem('app.a');
    onChange?.(null);
    stopA();
    expect(stop).not.toHaveBeenCalled();
    stopB();

    expect(seen).toEqual(['remote', null]);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('cookies use the CookieStore API when the browser has it', () => {
    const target = new EventTarget();
    vi.stubGlobal('cookieStore', target);
    const store = createStore({ storage: 'cookie', namespace: 'cs' });
    const seen: unknown[] = [];
    const stop = store.subscribe('k', (value) => seen.push(value));

    document.cookie = 'cs.k=%7B%22value%22%3A%22other%20tab%22%7D; Path=/';
    target.dispatchEvent(
      Object.assign(new Event('change'), { changed: [{ name: 'cs.k' }] })
    );
    document.cookie = 'cs.k=; Path=/; Max-Age=0';
    target.dispatchEvent(
      Object.assign(new Event('change'), { deleted: [{ name: 'cs.k' }] })
    );
    stop();

    expect(seen).toEqual(['other tab', null]);
  });
});

describe('IndexedDB batches', () => {
  test('setMany, getMany, and removeMany work in one go', async () => {
    const store = createIndexedStore({ database: unique() });

    expect(await store.setMany({ a: 1, b: { n: 2 } })).toBe(true);
    expect(await store.setMany([['c', 3]], { expire: 60_000 })).toBe(true);
    expect(await store.getMany(['a', 'b', 'c', 'missing', ''])).toEqual([
      1,
      { n: 2 },
      3,
      null,
      null,
    ]);
    expect(await store.ttl('c')).toBeGreaterThan(0);

    await store.removeMany(['a', 'c', '' as never]);
    expect((await store.keys()).sort()).toEqual(['b']);
    expect(await store.setMany([])).toBe(true);
  });

  test('a batch with one bad value writes nothing', async () => {
    const { errors, onError } = collect();
    const store = createIndexedStore({ database: unique(), onError });

    expect(await store.setMany({ a: 1, b: undefined })).toBe(false);
    expect(await store.setMany([['', 1]])).toBe(false);
    expect(await store.setMany({ a: 1, b: { run: () => 1 } })).toBe(false);
    expect(await store.keys()).toEqual([]);
    expect(errors.map((e) => e.code)).toEqual([
      'SERIALIZE_FAILED',
      'INVALID_KEY',
      'SERIALIZE_FAILED',
    ]);
  });

  test('getMany handles expired entries and notifies once per batch', async () => {
    const store = createIndexedStore({ database: unique() });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await store.setMany({ old: 1, live: 2 }, { expire: 10 });
    await store.set('forever', 3);
    now.mockReturnValue(2000);

    expect(await store.getMany(['old', 'forever'])).toEqual([null, 3]);
  });

  test('a serializer failure in a batch is reported', async () => {
    const { errors, onError } = collect();
    const store = createIndexedStore({
      database: unique(),
      onError,
      serializer: {
        serialize: () => {
          throw new Error('no');
        },
        deserialize: (text) => text,
      },
    });

    expect(await store.setMany({ a: 1 })).toBe(false);
    expect(errors[0]?.code).toBe('SERIALIZE_FAILED');
  });

  test('every batch method resolves when IndexedDB fails', async () => {
    const store = createIndexedStore({ database: unique(), onError() {} });
    await store.has('x');
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new DOMException('gone', 'InvalidStateError');
    });

    expect(await store.setMany({ a: 1 })).toBe(false);
    expect(await store.getMany(['a'])).toEqual([null]);
    await expect(store.removeMany(['a'])).resolves.toBeUndefined();
  });
});

describe('IndexedDB layout versions', () => {
  test('opens a database a newer release upgraded', async () => {
    const database = unique();
    await new Promise<void>((resolve) => {
      const request = indexedDB.open(database, 3);
      request.onupgradeneeded = () =>
        request.result
          .createObjectStore('entries')
          .createIndex('expire', 'expire');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });

    const { errors, onError } = collect();
    const store = createIndexedStore({ database, onError });

    expect(await store.set('k', 1)).toBe(true);
    expect(await store.get('k')).toBe(1);
    expect(errors).toEqual([]);
  });

  test('recovers after the browser closes the connection', async () => {
    const database = unique();
    const store = createIndexedStore({ database });
    const open = vi.spyOn(indexedDB, 'open');
    await store.set('k', 1);

    const request = open.mock.results[0]?.value as IDBOpenDBRequest;
    request.result.onclose?.(new Event('close'));

    expect(await store.get('k')).toBe(1);
    expect(open).toHaveBeenCalledTimes(2);
  });

  test('a commit-time abort is reported, not thrown', async () => {
    const { errors, onError } = collect();
    const store = createIndexedStore({ database: unique(), onError });
    await store.has('x');
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof put>
    ) {
      const result = put.apply(this, args);
      this.transaction.abort();
      return result;
    });

    expect(await store.set('k', 1)).toBe(false);
    expect(errors[0]?.code).toBe('STORAGE_UNAVAILABLE');
  });
});

describe('memory fallback without structuredClone', () => {
  test('still stores and reads values', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('structuredClone', undefined);
    const store = createIndexedStore({ database: unique(), onError() {} });

    expect(await store.set('k', { n: 1 })).toBe(true);
    expect(await store.get('k')).toEqual({ n: 1 });
  });
});

describe('requestPersistence', () => {
  test('returns what the browser decides', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => true } });
    expect(await requestPersistence()).toBe(true);
  });

  test.each([
    ['no storage API', {}],
    [
      'a failing call',
      {
        storage: {
          persist: async () => {
            throw new Error('denied');
          },
        },
      },
    ],
  ])('resolves false with %s', async (_label, navigatorStub) => {
    vi.stubGlobal('navigator', navigatorStub);
    expect(await requestPersistence()).toBe(false);
  });
});

describe('measuring a key removed between listing and reading', () => {
  test('counts only its key', () => {
    const memory = createMemoryAdapter();
    memory.setItem('app.k', '{"value":1}');
    const storage = {
      get length() {
        return memory.length;
      },
      key: (index: number) => memory.key(index),
      getItem: () => null,
      setItem: memory.setItem,
      removeItem: memory.removeItem,
    };

    // Only the key is left to count.
    expect(createStore({ storage }).used()).toBe('app.k'.length);
  });
});

describe('measurements are exact', () => {
  test('free is capacity minus every stored key and value', () => {
    const memory = createMemoryAdapter();
    memory.setItem('other.x', 'abc');
    const store = createStore({ storage: memory });
    store.set('k', 'v');

    const usedByAll =
      'other.x'.length + 3 + 'app.k'.length + '{"value":"v"}'.length;
    expect(store.free({ capacity: 1000 })).toBe(1000 - usedByAll);
    expect(store.used()).toBe('app.k'.length + '{"value":"v"}'.length);
  });
});

describe('quiet paths', () => {
  test('purging does not report corrupt entries, but get does', () => {
    const { errors, onError } = collect();
    const memory = createMemoryAdapter();
    memory.setItem('app.bad', '{"value":');
    const store = createStore({ storage: memory, onError });

    expect(store.purgeExpired()).toBe(0);
    expect(store.keys()).toEqual([]);
    expect(errors).toEqual([]);
    store.get('bad');
    expect(errors.map((e) => e.code)).toEqual(['CORRUPT_VALUE']);
  });

  test.each([['null'], ['"text"'], ['42']])(
    'a foreign %s value is not reported as corrupt',
    (raw) => {
      const { errors, onError } = collect();
      const memory = createMemoryAdapter();
      memory.setItem('app.k', raw);

      expect(createStore({ storage: memory, onError }).get('k', 'd')).toBe('d');
      expect(errors).toEqual([]);
    }
  );
});
