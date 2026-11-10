import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { StoreError } from '../src/indexeddb/index';

// jsdom has no IndexedDB. Real browsers run this file against the real thing.
if (!('indexedDB' in globalThis)) await import('fake-indexeddb/auto');

const { createIndexedStore, indexed } = await import('../src/indexeddb/index');
const { inspect, debug } = await import('../src/debug');
const { findWhere, omit, pick, pluck, where } = await import('../src/query');

type Options = Parameters<typeof createIndexedStore>[0];
let counter = 0;
let database: string;

function make(options: Options = {}) {
  return createIndexedStore({ database, onError: () => {}, ...options });
}

function collect() {
  const errors: StoreError[] = [];
  return { errors, onError: (e: StoreError) => void errors.push(e) };
}

function raw(mode: 'put' | 'get', key: string, record?: unknown) {
  return new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open(database, 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('entries', 'readwrite');
      const store = tx.objectStore('entries');
      const request = mode === 'put' ? store.put(record, key) : store.get(key);
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
    };
  });
}

beforeEach(() => {
  database = `test-${Date.now()}-${counter++}`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('get and set', () => {
  test.each([
    ['string', 'value'],
    ['empty string', ''],
    ['number', 42],
    ['zero', 0],
    ['false', false],
    ['null', null],
    ['object', { a: { b: 1 } }],
    ['array', [1, 'two', null]],
  ])('round-trips %s', async (_label, value) => {
    const store = make();
    expect(await store.set('k', value)).toBe(true);
    expect(await store.get('k', 'default')).toEqual(value);
  });

  test('keeps values that JSON cannot represent', async () => {
    const store = make();
    const date = new Date(0);
    const map = new Map([['a', 1]]);
    const bytes = new Uint8Array([1, 2, 3]);

    await store.set('date', date);
    await store.set('map', map);
    await store.set('set', new Set([1]));
    await store.set('bytes', bytes);

    expect((await store.get<Date>('date'))?.getTime()).toBe(0);
    expect((await store.get<Map<string, number>>('map'))?.get('a')).toBe(1);
    expect((await store.get<Set<number>>('set'))?.has(1)).toBe(true);
    expect([...((await store.get<Uint8Array>('bytes')) ?? [])]).toEqual([
      1, 2, 3,
    ]);
  });

  test('returns null or the default for a missing key', async () => {
    const store = make();
    expect(await store.get('missing')).toBeNull();
    expect(await store.get('missing', 'fallback')).toBe('fallback');
  });

  test.each([[undefined], [null], [''], [NaN], [{}]])(
    'treats invalid key %s as missing',
    async (key) => {
      const store = make();
      expect(await store.get(key as never)).toBeNull();
      expect(await store.get(key as never, 'd')).toBe('d');
      expect(await store.has(key as never)).toBe(false);
      expect(await store.set(key as never, 1)).toBe(false);
      expect(await store.remove(key as never)).toBeNull();
      expect(await store.patch(key as never, {})).toBe(false);
      expect(await store.size(key as never)).toBe(0);
      expect(await store.ttl(key as never)).toBeNull();
    }
  );

  test('number keys and a key named "null" work', async () => {
    const store = make();
    await store.set(5, 'x');
    await store.set('null', 'v');
    expect(await make().get(5)).toBe('x');
    expect(await make().get('5')).toBe('x');
    expect(await store.get('null')).toBe('v');
  });

  test('Unicode and separators in keys work', async () => {
    const store = make();
    await store.set('ключ-🔑.a.b', 'значение');
    expect(await make().get('ключ-🔑.a.b')).toBe('значение');
    expect(await store.keys()).toEqual(['ключ-🔑.a.b']);
  });

  test.each([
    ['undefined', undefined],
    ['function', () => 1],
    ['symbol', Symbol('s')],
  ])('refuses to store %s', async (_label, value) => {
    const { errors, onError } = collect();
    const store = make({ onError });

    expect(await store.set('k', value)).toBe(false);
    expect(await store.has('k')).toBe(false);
    expect(errors[0]?.code).toBe('SERIALIZE_FAILED');
  });

  test('a value that cannot be cloned is reported', async () => {
    const { errors, onError } = collect();
    const store = make({ onError });

    expect(await store.set('k', { run: () => 1 })).toBe(false);
    expect(errors[0]?.code).toBe('SERIALIZE_FAILED');
  });

  test('mutating before or after does not change what is stored', async () => {
    const store = make();
    const value = { n: 1 };
    await store.set('k', value);
    value.n = 99;

    const read = await store.get<{ n: number }>('k');
    expect(read?.n).toBe(1);
    (read as { n: number }).n = 50;
    expect((await store.get<{ n: number }>('k'))?.n).toBe(1);
  });

  test('sees writes from another instance', async () => {
    const store = make();
    await make().set('k', 1);
    expect(await store.get('k')).toBe(1);
  });

  test.each([
    ['empty string', ''],
    ['null', null],
    ['zero', 0],
  ])('has is true for a stored %s', async (_label, value) => {
    const store = make();
    await store.set('k', value);
    expect(await store.has('k')).toBe(true);
  });
});

describe('remove, clear, and iteration', () => {
  test('remove returns the previous value', async () => {
    const store = make();
    await store.set('k', { a: 1 });
    expect(await store.remove('k')).toEqual({ a: 1 });
    expect(await store.get('k')).toBeNull();
    expect(await store.remove('k')).toBeNull();
  });

  test('clear removes only this namespace', async () => {
    const store = make();
    const other = store.from('other');
    const similar = store.from('ap');
    await store.set('a', 1);
    await other.set('c', 3);
    await similar.set('d', 4);

    await store.clear();

    expect(await store.count).toBe(0);
    expect(await other.get('c')).toBe(3);
    expect(await similar.get('d')).toBe(4);
  });

  test('databases are separate', async () => {
    await make().set('k', 1);
    const elsewhere = createIndexedStore({ database: `${database}-b` });
    expect(await elsewhere.has('k')).toBe(false);
  });

  test('iteration is scoped and unprefixed', async () => {
    const store = make();
    await store.set('a', 1);
    await store.set('b', 2);
    await store.from('other').set('c', 3);

    expect((await store.keys()).sort()).toEqual(['a', 'b']);
    expect(await store.count).toBe(2);
    expect(((await store.values()) as number[]).sort()).toEqual([1, 2]);
    expect((await store.entries()).sort()).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(['a', 'b']).toContain(await store.key(0));
    expect(await store.key(9)).toBeNull();
  });

  test('a namespace that prefixes another stays separate', async () => {
    const short = make({ namespace: 'ab' });
    const long = make({ namespace: 'abc' });
    await short.set('k', 1);
    await long.set('k', 2);

    expect(await short.keys()).toEqual(['k']);
    await short.clear();
    expect(await long.get('k')).toBe(2);
  });
});

describe('expiry', () => {
  const at = (time: number) => vi.spyOn(Date, 'now').mockReturnValue(time);

  test('live up to and including the expiry instant', async () => {
    const store = make();
    at(1000);
    await store.set('k', 'v', { expire: 1000 });
    at(2000);
    expect(await store.get('k')).toBe('v');
    expect(await store.ttl('k')).toBe(0);
  });

  test('gone just after, and removed from the database', async () => {
    const store = make();
    at(1000);
    await store.set('k', 'v', { expire: 1000 });
    at(2001);
    expect(await store.get('k', 'd')).toBe('d');
    expect(await raw('get', 'app.k')).toBeUndefined();
  });

  test('expired entries leave every listing', async () => {
    const store = make();
    at(1000);
    await store.set('dead', 1, { expire: 10 });
    await store.set('live', 2);
    at(2000);

    expect(await store.values()).toEqual([2]);
    await store.set('dead', 1, { expire: 10 });
    at(3000);
    expect(await store.keys()).toEqual(['live']);
    expect(await store.count).toBe(1);
    expect(await store.size('dead')).toBe(0);
  });

  test('purgeExpired counts and removes only expired entries', async () => {
    const store = make();
    const other = store.from('other');
    at(1000);
    await store.set('a', 1, { expire: 10 });
    await store.set('b', 2, { expire: 10 });
    await store.set('c', 3, { expire: 99_999 });
    await other.set('d', 4, { expire: 10 });
    at(2000);

    expect(await store.purgeExpired()).toBe(2);
    expect(await store.purgeExpired()).toBe(0);
    expect(await store.keys()).toEqual(['c']);
    expect(await raw('get', 'other.d')).toBeDefined();
  });

  test('a write made after expiry is not deleted by an old read', async () => {
    const store = make();
    at(1000);
    await store.set('k', 'old', { expire: 10 });
    at(2000);

    const [, read] = await Promise.all([
      store.set('k', 'new', { expire: 99_999 }),
      store.get('k', 'default'),
    ]);

    expect(['new', 'default']).toContain(read);
    expect(await store.get('k')).toBe('new');
  });

  test('writing again restarts the lifetime', async () => {
    const store = make();
    at(1000);
    await store.set('k', 1, { expire: 100 });
    at(1050);
    await store.set('k', 2, { expire: 100 });
    at(1120);
    expect(await store.get('k')).toBe(2);
  });

  test('defaultTTL applies and can be overridden', async () => {
    const store = make({ defaultTTL: 100 });
    at(1000);
    await store.set('a', 1);
    await store.set('b', 2, { expire: 5000 });
    await store.patch('c', { n: 1 });
    at(1200);
    expect(await store.has('a')).toBe(false);
    expect(await store.has('b')).toBe(true);
    expect(await store.has('c')).toBe(false);
  });

  test.each([[0], [-1], [NaN], [Infinity], ['1000'], [null]])(
    'rejects expire %s without writing',
    async (expire) => {
      const { errors, onError } = collect();
      const store = make({ onError });

      expect(await store.set('k', 1, { expire: expire as never })).toBe(false);
      expect(await store.has('k')).toBe(false);
      expect(errors[0]?.code).toBe('INVALID_ARGUMENT');
    }
  );

  test('an unknown option is reported and the value stored', async () => {
    const { errors, onError } = collect();
    const store = make({ onError });

    expect(await store.set('k', 1, { expires: 5 } as never)).toBe(true);
    expect(errors[0]?.message).toContain('expires');
  });
});

describe('patch', () => {
  test('merges, creates, and keeps expiry', async () => {
    const store = make();
    await store.patch('new', { a: 1 });
    expect(await store.get('new')).toEqual({ a: 1 });

    await store.set('k', { a: 1, b: 2 }, { expire: 60_000 });
    expect(await store.patch('k', { b: 3 })).toBe(true);
    expect(await store.get('k')).toEqual({ a: 1, b: 3 });
    expect(await store.ttl('k')).toBeGreaterThan(0);
  });

  test('concurrent patches are all applied', async () => {
    const store = make();
    await store.set('k', {});

    await Promise.all(
      Array.from({ length: 25 }, (_, i) => store.patch('k', { [`f${i}`]: i }))
    );

    expect(Object.keys((await store.get('k')) as object)).toHaveLength(25);
  });

  test('concurrent patches from separate stores are all applied', async () => {
    await make().set('k', {});
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => make().patch('k', { [`f${i}`]: i }))
    );
    expect(Object.keys((await make().get('k')) as object)).toHaveLength(10);
  });

  test.each([
    ['array', [1, 2]],
    ['string', 'text'],
  ])('leaves a stored %s untouched', async (_label, value) => {
    const store = make();
    await store.set('k', value);
    expect(await store.patch('k', { a: 1 })).toBe(false);
    expect(await store.get('k')).toEqual(value);
  });

  test.each([[null], [[1]], ['x']])('rejects partial %s', async (partial) => {
    const store = make();
    await store.set('k', { a: 1 });
    expect(await store.patch('k', partial as never)).toBe(false);
    expect(await store.get('k')).toEqual({ a: 1 });
  });

  test('a partial that cannot be cloned fails and changes nothing', async () => {
    const { errors, onError } = collect();
    const store = make({ onError });
    await store.set('k', { a: 1 });

    expect(await store.patch('k', { run: () => 1 })).toBe(false);
    expect(errors[0]?.code).toBe('SERIALIZE_FAILED');
    expect(await store.get('k')).toEqual({ a: 1 });
  });
});

describe('migrations', () => {
  test('records the version, or nothing without one', async () => {
    await make({ namespace: 'v', version: 2 }).set('k', 1);
    await make({ namespace: 'n' }).set('k', 1);
    expect(await raw('get', 'v.k')).toEqual({ value: 1, v: 2 });
    expect(await raw('get', 'n.k')).toEqual({ value: 1 });
  });

  test('upgrades once and saves, keeping the expiry', async () => {
    const expire = Date.now() + 60_000;
    await make().has('x');
    await raw('put', 'app.k', { value: { n: 1 }, expire });
    const migrate = vi.fn((value, from, key) => ({ ...value, from, key }));
    const store = make({ version: 2, migrate });

    expect(await store.get('k')).toEqual({ n: 1, from: 0, key: 'k' });
    expect(await raw('get', 'app.k')).toMatchObject({ expire, v: 2 });
    await store.get('k');
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  test('iteration and patch see upgraded values', async () => {
    await make().has('x');
    await raw('put', 'app.k', { value: { n: 1 } });
    const store = make({
      version: 2,
      migrate: (value) => ({ ...value, m: 2 }),
    });

    expect(await store.values()).toEqual([{ n: 1, m: 2 }]);
    await raw('put', 'app.j', { value: { n: 1 } });
    await store.patch('j', { o: 3 });
    expect(await raw('get', 'app.j')).toEqual({
      value: { n: 1, m: 2, o: 3 },
      v: 2,
    });
  });

  test('does not touch current, newer, or expired entries', async () => {
    await make().has('x');
    await raw('put', 'app.a', { value: 'x', v: 2 });
    await raw('put', 'app.b', { value: 'y', v: 9 });
    await raw('put', 'app.c', { value: 'z', expire: 1 });
    const migrate = vi.fn((value) => value);
    const store = make({ version: 2, migrate });

    expect(await store.get('a')).toBe('x');
    expect(await store.get('b')).toBe('y');
    expect(await store.get('c')).toBeNull();
    expect(migrate).not.toHaveBeenCalled();
  });

  test('returning undefined discards the entry', async () => {
    await make().has('x');
    await raw('put', 'app.k', { value: 1 });
    const store = make({ version: 2, migrate: () => undefined });

    expect(await store.get('k', 'd')).toBe('d');
    expect(await raw('get', 'app.k')).toBeUndefined();
  });

  test('a failed migration reports and keeps the data', async () => {
    await make().has('x');
    await raw('put', 'app.k', { value: 1 });
    const { errors, onError } = collect();
    const store = make({
      version: 2,
      onError,
      migrate: () => {
        throw new Error('bad');
      },
    });

    expect(await store.get('k', 'd')).toBe('d');
    expect(errors[0]?.code).toBe('MIGRATION_FAILED');
    expect(await raw('get', 'app.k')).toEqual({ value: 1 });
  });
});

describe('subscribe', () => {
  test('reports writes from any instance, removal, and clear', async () => {
    const store = make();
    const seen: unknown[] = [];
    const stop = store.subscribe('k', (value) => seen.push(value));

    await store.set('k', 1);
    await vi.waitFor(() => expect(seen).toEqual([1]));
    await make().set('k', 2);
    await vi.waitFor(() => expect(seen).toEqual([1, 2]));
    await store.remove('k');
    await vi.waitFor(() => expect(seen).toEqual([1, 2, null]));
    await store.set('k', 3);
    await vi.waitFor(() => expect(seen).toHaveLength(4));
    await store.clear();
    await vi.waitFor(() => expect(seen).toEqual([1, 2, null, 3, null]));
    stop();
  });

  test('stops after unsubscribing and keeps namespaces apart', async () => {
    const store = make();
    const listener = vi.fn();
    const live = vi.fn();
    const stop = store.subscribe('k', listener);
    const keep = store.subscribe('k', live);
    stop();
    stop();

    await store.from('other').set('k', 1);
    await store.set('k', 1);
    await vi.waitFor(() => expect(live).toHaveBeenCalledTimes(1));
    keep();

    expect(listener).not.toHaveBeenCalled();
  });

  test('a listener writing its own key is not called again', async () => {
    const store = make();
    let calls = 0;
    const stop = store.subscribe('k', () => {
      calls++;
      void store.set('k', calls);
    });

    await store.set('k', 0);
    await vi.waitFor(() => expect(calls).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();

    expect(calls).toBe(1);
    expect(await store.get('k')).toBe(1);
  });

  test('a throwing listener is contained', async () => {
    const { errors, onError } = collect();
    const store = make({ onError });
    const other = vi.fn();
    const stopA = store.subscribe('k', () => {
      throw new Error('bad');
    });
    const stopB = store.subscribe('k', other);

    expect(await store.set('k', 1)).toBe(true);
    await vi.waitFor(() => expect(other).toHaveBeenCalledWith(1));
    await vi.waitFor(() => expect(errors[0]?.code).toBe('LISTENER_FAILED'));
    stopA();
    stopB();
  });

  test('an invalid key gives a harmless unsubscribe', () => {
    const { errors, onError } = collect();
    const stop = make({ onError }).subscribe('' as never, () => {});

    expect(errors[0]?.code).toBe('INVALID_KEY');
    expect(stop).not.toThrow();
  });
});

describe('tampered records', () => {
  beforeEach(async () => {
    await make().has('x');
  });

  test.each([['"999"'], ['{}'], ['true']])(
    'ignores a non-numeric expire %s',
    async (expire) => {
      await raw('put', 'app.k', { value: 1, expire: JSON.parse(expire) });
      expect(await make().ttl('k')).toBeNull();
      expect(await make().get('k')).toBe(1);
    }
  );

  test('a non-numeric version is treated as unversioned', async () => {
    await raw('put', 'app.k', { value: 1, v: 'abc' });
    const migrate = vi.fn((value) => value);
    await make({ version: 2, migrate }).get('k');
    expect(migrate).toHaveBeenCalledWith(1, 0, 'k');
  });

  test('records that are not entries read as missing', async () => {
    await raw('put', 'app.a', 'plain');
    await raw('put', 'app.b', { other: 1 });
    const store = make();

    expect(await store.get('a', 'd')).toBe('d');
    expect(await store.has('b')).toBe(false);
    expect(await store.values()).toEqual([]);
    expect(await store.keys()).toEqual([]);
    expect(await store.count).toBe(0);
  });

  test('stored __proto__ cannot pollute prototypes', async () => {
    const poison = JSON.parse('{"__proto__":{"isAdmin":true},"a":1}');
    const store = make();
    await store.set('k', poison);
    await store.patch('k', { b: 2 });

    const picked = (await pick(store, 'k', ['__proto__'])) as {
      isAdmin?: boolean;
    };
    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(picked)).toBe(Object.prototype);
    expect(picked.isAdmin).toBeUndefined();
  });
});

describe('serializer', () => {
  const serializer = {
    serialize: (value: unknown) => btoa(JSON.stringify(value)),
    deserialize: (text: string) => JSON.parse(atob(text)),
  };

  test('encodes values at rest and keeps expiry readable', async () => {
    const store = make({ serializer });
    await store.set('k', 'secret', { expire: 60_000 });

    const record = (await raw('get', 'app.k')) as Record<string, unknown>;
    expect(record.value).not.toContain('secret');
    expect(typeof record.expire).toBe('number');
    expect(await store.get('k')).toBe('secret');
    expect(await store.patch('j', { a: 1 })).toBe(true);
    expect(await store.get('j')).toEqual({ a: 1 });
  });

  test('corrupt data reports on get but not on has', async () => {
    const { errors, onError } = collect();
    const store = make({ serializer, onError });
    await store.has('x');
    await raw('put', 'app.k', { value: '%%%' });

    expect(await store.has('k')).toBe(false);
    expect(errors).toEqual([]);
    expect(await store.keys()).toEqual([]);
    expect(errors).toEqual([]);
    expect(await store.get('k', 'd')).toBe('d');
    expect(errors[0]?.code).toBe('CORRUPT_VALUE');
  });

  test('a failing serializer is reported', async () => {
    const { errors, onError } = collect();
    const store = make({
      onError,
      serializer: {
        serialize: () => {
          throw new Error('nope');
        },
        deserialize: (text) => text,
      },
    });

    expect(await store.set('k', 1)).toBe(false);
    expect(errors[0]?.code).toBe('SERIALIZE_FAILED');
  });
});

describe('options', () => {
  test.each([
    ['empty namespace', { namespace: '' }],
    ['namespace with separator', { namespace: 'a.b' }],
    ['empty separator', { separator: '' }],
    ['empty database', { database: '' }],
    ['non-string database', { database: 5 }],
    ['zero defaultTTL', { defaultTTL: 0 }],
    ['zero version', { version: 0 }],
    ['migrate without version', { migrate: () => 1 }],
  ])('rejects %s', (_label, options) => {
    expect(() => createIndexedStore(options as never)).toThrow(TypeError);
  });

  test('custom separator and from keep the other options', async () => {
    await make({ separator: ':' }).from('x').set('k', 1);
    expect(await raw('get', 'x:k')).toEqual({ value: 1 });
  });

  test('the store cannot be modified, and has a ready default', () => {
    expect(Object.isFrozen(make())).toBe(true);
    expect(indexed.namespace).toBe('app');
    expect(indexed.database).toBe('opendb-store');
    expect(indexed.async).toBe(true);
  });

  test('a throwing onError does not reject', async () => {
    const store = make({
      onError() {
        throw new Error('handler bug');
      },
    });
    await expect(store.set('', 1)).resolves.toBe(false);
  });
});

describe('sizes', () => {
  test('entries have estimated sizes that add up', async () => {
    const store = make();
    await store.set('a', 'x'.repeat(100));
    await store.set('b', 1);

    const a = await store.size('a');
    const b = await store.size('b');
    expect(a).toBeGreaterThan(200);
    expect(await store.used()).toBe(a + b);
    expect(await store.size('missing')).toBe(0);
  });

  test('sizes format like the other stores', async () => {
    const store = make();
    await store.set('a', 1);
    expect(await store.size('a', { format: 'KB', unit: true })).toMatch(/ KB$/);
    expect(await store.used({ format: 'MB', unit: false })).toMatch(/^\d/);
    expect(await store.capacity({ capacity: 2048, format: 'KB' })).toBe(
      '2.00 KB'
    );
  });

  test('capacity and free are positive numbers', async () => {
    const store = make();
    await store.set('k', 'value');
    expect(await store.capacity()).toBeGreaterThan(0);
    expect(await store.free()).toBeGreaterThan(0);
    expect(await store.free({ capacity: 1 })).toBe(0);
  });
});

describe('query helpers and debug tools', () => {
  test('query helpers return promises with the usual results', async () => {
    const store = make();
    await store.set('users', [
      { name: 'moe', age: 40 },
      { name: 'larry', age: 50 },
    ]);
    await store.set('user', { id: 1, age: 40 });

    expect(await where(store, 'users', { age: 40 })).toHaveLength(1);
    expect((await findWhere(store, 'users', { age: 50 }))?.name).toBe('larry');
    expect(await pluck(store, 'users', 'name')).toEqual(['moe', 'larry']);
    expect(await pick(store, 'user', ['id'])).toEqual({ id: 1 });
    expect(await omit(store, 'user', ['age'])).toEqual({ id: 1 });
  });

  test('inspect reports an IndexedDB store, largest first', async () => {
    const store = make();
    await store.set('small', 1);
    await store.set('large', 'x'.repeat(1000), { expire: 60_000 });

    const report = await inspect(store);

    expect(report.count).toBe(2);
    expect(report.used).toBe(await store.used());
    expect(report.entries[0]?.key).toBe('large');
    expect(report.entries[0]?.expiresIn).toBeGreaterThan(0);
    expect(report.percentUsed).toBeGreaterThanOrEqual(0);
  });

  test('debug prints and resolves, alone or with other stores', async () => {
    const group = vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
    const store = make();
    await store.set('k', 1);

    expect((await debug(store, { label: 'Files' })).count).toBe(1);
    expect(group.mock.calls[0]?.[0]).toContain('Files: ');
    expect(table).toHaveBeenCalled();

    const { createStore, createMemoryAdapter } = await import('../src/index');
    const reports = await debug({
      local: createStore({ storage: createMemoryAdapter() }),
      indexed: store,
    });
    expect(Object.keys(reports)).toEqual(['local', 'indexed']);
    expect(reports.indexed?.count).toBe(1);
  });
});
