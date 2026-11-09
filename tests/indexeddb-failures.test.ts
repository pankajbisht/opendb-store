import { afterEach, describe, expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { estimateSize } from '../src/indexeddb/estimate';
import { createIndexedStore, StoreError } from '../src/indexeddb/index';

let counter = 0;
const unique = () => `failure-${counter++}`;

function collect() {
  const errors: StoreError[] = [];
  return { errors, onError: (e: StoreError) => void errors.push(e) };
}

const quotaError = () => new DOMException('full', 'QuotaExceededError');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('storage availability', () => {
  test('creating a store does not touch IndexedDB', () => {
    const open = vi.spyOn(indexedDB, 'open');
    createIndexedStore({ database: unique() });
    expect(open).not.toHaveBeenCalled();
  });

  test.each([
    ['missing', () => undefined],
    [
      'throwing on open',
      () => ({
        open() {
          throw new DOMException('blocked', 'SecurityError');
        },
      }),
    ],
    [
      'failing to open',
      () => ({
        open() {
          const request: Record<string, unknown> = {
            error: new DOMException('no', 'UnknownError'),
          };
          setTimeout(() => (request.onerror as () => void)());
          return request;
        },
      }),
    ],
  ])('%s falls back to memory and reports once', async (_label, stub) => {
    vi.stubGlobal('indexedDB', stub());
    const { errors, onError } = collect();
    const store = createIndexedStore({ database: unique(), onError });

    expect(await store.set('k', { n: 1 }, { expire: 60_000 })).toBe(true);
    expect(await store.get('k')).toEqual({ n: 1 });
    expect(await store.keys()).toEqual(['k']);
    expect(await store.values()).toEqual([{ n: 1 }]);
    expect(await store.patch('k', { m: 2 })).toBe(true);
    expect(await store.purgeExpired()).toBe(0);
    await store.clear();
    expect(await store.count).toBe(0);
    expect(errors.map((e) => e.code)).toEqual(['STORAGE_UNAVAILABLE']);
  });

  test('memory fallback expires entries and copies values', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const store = createIndexedStore({ database: unique(), onError() {} });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);

    const value = { n: 1 };
    await store.set('k', value, { expire: 10 });
    await store.set('j', 1, { expire: 10 });
    await store.set('forever', 2);
    value.n = 9;
    expect(((await store.get('k')) as { n: number }).n).toBe(1);

    now.mockReturnValue(2000);
    expect(await store.get('k')).toBeNull();
    expect(await store.keys()).toEqual(['forever']);
    await store.set('z', 1, { expire: 10 });
    now.mockReturnValue(3000);
    expect(await store.purgeExpired()).toBe(1);
  });

  test('a failing estimate falls back to a default capacity', async () => {
    vi.stubGlobal('navigator', {});
    const store = createIndexedStore({ database: unique() });

    await store.set('k', 'value');

    expect(await store.capacity()).toBe(50 * 1024 * 1024);
    expect(await store.free()).toBe(50 * 1024 * 1024 - (await store.used()));
  });

  test('uses the quota and usage the browser reports', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 1000, usage: 400 }) },
    });
    const store = createIndexedStore({ database: unique() });

    expect(await store.capacity()).toBe(1000);
    expect(await store.free()).toBe(600);
  });
});

describe('an open request that never finishes', () => {
  function stubOpen() {
    const request: Record<string, unknown> = {};
    vi.stubGlobal('indexedDB', { open: () => request });
    return request;
  }

  test('falls back to memory after the timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubOpen();
    const { errors, onError } = collect();
    const store = createIndexedStore({ database: unique(), onError });

    const write = store.set('k', 1);
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();

    expect(await write).toBe(true);
    expect(await store.get('k')).toBe(1);
    expect(errors.map((e) => e.code)).toEqual(['STORAGE_UNAVAILABLE']);
  });

  test('closes a connection that arrives too late', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const request = stubOpen();
    const store = createIndexedStore({ database: unique(), onError() {} });

    const read = store.get('k');
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
    await read;

    const close = vi.fn();
    request.result = { close };
    (request.onsuccess as () => void)();

    expect(close).toHaveBeenCalledTimes(1);
  });

  test('a normal open does not leave a timer running', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    await createIndexedStore({ database: unique() }).has('k');
    expect(clear).toHaveBeenCalled();
  });
});

describe('write failures', () => {
  test('a quota error is reported', async () => {
    const { errors, onError } = collect();
    const store = createIndexedStore({ database: unique(), onError });
    await store.has('x');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw quotaError();
    });

    expect(await store.set('k', 1)).toBe(false);
    expect(errors[0]?.code).toBe('QUOTA_EXCEEDED');
  });

  test('a quota error purges expired entries and retries', async () => {
    const store = createIndexedStore({ database: unique() });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await store.set('dead', 1, { expire: 10 });
    now.mockReturnValue(2000);

    const put = IDBObjectStore.prototype.put;
    let first = true;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof put>
    ) {
      if (first) {
        first = false;
        throw quotaError();
      }
      return put.apply(this, args);
    });

    expect(await store.set('new', 2)).toBe(true);
    expect(await store.get('new')).toBe(2);
    expect(await store.keys()).toEqual(['new']);
  });

  test('other write errors report STORAGE_UNAVAILABLE', async () => {
    const { errors, onError } = collect();
    const store = createIndexedStore({ database: unique(), onError });
    await store.set('j', { a: 1 });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('disk');
    });

    expect(await store.set('k', 1)).toBe(false);
    expect(await store.patch('j', { b: 1 })).toBe(false);
    expect(errors.map((e) => e.code)).toEqual([
      'STORAGE_UNAVAILABLE',
      'STORAGE_UNAVAILABLE',
    ]);
  });
});

describe('promises never reject', () => {
  const brokenStore = async () => {
    const { errors, onError } = collect();
    const store = createIndexedStore({ database: unique(), onError });
    await store.has('x');
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new DOMException('gone', 'InvalidStateError');
    });
    return { store, errors };
  };

  test('every operation resolves to its empty result', async () => {
    const { store, errors } = await brokenStore();

    expect(await store.get('k', 'd')).toBe('d');
    expect(await store.has('k')).toBe(false);
    expect(await store.set('k', 1)).toBe(false);
    expect(await store.patch('k', {})).toBe(false);
    expect(await store.remove('k')).toBeNull();
    expect(await store.clear()).toBeUndefined();
    expect(await store.keys()).toEqual([]);
    expect(await store.key(0)).toBeNull();
    expect(await store.count).toBe(0);
    expect(await store.values()).toEqual([]);
    expect(await store.entries()).toEqual([]);
    expect(await store.size('k')).toBe(0);
    expect(await store.used()).toBe(0);
    expect(await store.ttl('k')).toBeNull();
    expect(await store.purgeExpired()).toBe(0);
    expect(errors.every((e) => e.code === 'STORAGE_UNAVAILABLE')).toBe(true);
  });
});

describe('connections', () => {
  test('recovers when the connection has closed', async () => {
    const store = createIndexedStore({ database: unique() });
    await store.set('k', 1);

    const original = IDBDatabase.prototype.transaction;
    let failed = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<typeof original>
    ) {
      if (!failed) {
        failed = true;
        throw new DOMException('closing', 'InvalidStateError');
      }
      return original.apply(this, args);
    });

    expect(await store.get('k')).toBe(1);
    expect(failed).toBe(true);
  });

  test('does not block deleting the database, and recovers', async () => {
    const database = unique();
    const store = createIndexedStore({ database });
    await store.set('k', 1);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(database);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });

    expect(await store.get('k')).toBeNull();
    expect(await store.set('k', 2)).toBe(true);
    expect(await store.get('k')).toBe(2);
  });

  test('stores sharing a database share one connection', async () => {
    const database = unique();
    const open = vi.spyOn(indexedDB, 'open');

    await createIndexedStore({ database }).has('a');
    await createIndexedStore({ database }).has('a');
    await createIndexedStore({ database, namespace: 'x' }).has('a');

    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('cross-tab channel', () => {
  test('a message from another tab reaches subscribers', async () => {
    const database = unique();
    const store = createIndexedStore({ database });
    const seen: unknown[] = [];
    const stop = store.subscribe('k', (value) => seen.push(value));
    await store.set('k', 'value');
    await vi.waitFor(() => expect(seen).toEqual(['value']));

    const other = new BroadcastChannel(`opendb-store:${database}`);
    other.postMessage({ keys: ['app.k'] });
    other.postMessage({ unexpected: true });

    await vi.waitFor(() => expect(seen).toEqual(['value', 'value']));
    other.close();
    stop();
  });

  test('writes are announced to other tabs', async () => {
    const database = unique();
    const store = createIndexedStore({ database });
    await store.has('x');
    const received: unknown[] = [];
    const other = new BroadcastChannel(`opendb-store:${database}`);
    other.onmessage = (event) => received.push(event.data);

    await store.set('k', 1);

    await vi.waitFor(() => expect(received).toEqual([{ keys: ['app.k'] }]));
    other.close();
  });
});

describe('estimateSize', () => {
  test.each([
    ['string', 'abc', 6],
    ['number', 1, 8],
    ['bigint', BigInt(1), 8],
    ['boolean', true, 4],
    ['null', null, 0],
    ['undefined', undefined, 0],
    ['date', new Date(0), 8],
    ['bytes', new Uint8Array(10), 10],
    ['buffer', new ArrayBuffer(12), 12],
  ])('measures %s', (_label, value, expected) => {
    expect(estimateSize(value)).toBe(expected);
  });

  test('measures containers and survives cycles', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    expect(estimateSize(cycle)).toBeGreaterThan(0);
    expect(estimateSize(new Map([['a', 1]]))).toBeGreaterThan(8);
    expect(estimateSize(new Set(['a']))).toBeGreaterThan(2);
    expect(estimateSize(['a'])).toBeGreaterThan(2);
    expect(estimateSize(new Blob(['abc']))).toBe(3);
  });
});
