import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMemoryAdapter } from '../src/adapters/memory';
import db, { createStore, StoreError } from '../src/index';
import { findWhere, pick, pluck, where } from '../src/query';
import type { StorageAdapter } from '../src/types';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  db.cookie.clear();
});

describe('cookie attribute injection', () => {
  test.each([
    ['path with a semicolon', { path: '/; Domain=evil.example' }],
    ['path with a newline', { path: '/\nSet-Cookie: a=b' }],
    ['domain with a semicolon', { domain: 'x; Path=/admin' }],
    ['domain with a control character', { domain: 'a\u0000b' }],
    ['non-string path', { path: 5 }],
    ['non-string domain', { domain: {} }],
    ['unknown sameSite', { sameSite: 'Lax; Domain=evil' }],
  ])('rejects %s before writing anything', (_label, cookie) => {
    const write = vi.spyOn(document, 'cookie', 'set');

    expect(() =>
      createStore({ storage: 'cookie', cookie: cookie as never })
    ).toThrow(TypeError);
    expect(write).not.toHaveBeenCalled();
  });

  test('accepts ordinary attributes', () => {
    expect(() =>
      createStore({
        storage: 'cookie',
        cookie: { path: '/app', domain: '.a.com', sameSite: 'None' },
      })
    ).not.toThrow();
  });

  test('keys and values cannot add attributes', () => {
    const write = vi.spyOn(document, 'cookie', 'set');
    db.cookie.set('a; Domain=evil', 'b; Secure');

    const [pair] = (write.mock.lastCall?.[0] as string).split(';');
    expect(pair).toMatch(/^app\.a%3B%20Domain%3Devil=/);
    expect(write.mock.lastCall?.[0]).not.toContain('Domain=evil');
  });
});

describe('cookie lifetimes', () => {
  test.each([[1e300], [Number.MAX_SAFE_INTEGER]])(
    'a very long expire %d becomes a valid, capped Max-Age',
    (expire) => {
      const write = vi.spyOn(document, 'cookie', 'set');
      db.cookie.set('k', 1, { expire });
      expect(write.mock.lastCall?.[0]).toContain(
        `; Max-Age=${400 * 24 * 60 * 60}`
      );
    }
  );
});

describe('cookie name aliases', () => {
  test('a differently encoded name cannot pose as a library key', () => {
    document.cookie = 'app%2Eadmin=%7B%22value%22%3Atrue%7D; Path=/';

    expect(db.cookie.get('admin')).toBeNull();
    expect(db.cookie.keys()).toEqual([]);
    document.cookie = 'app%2Eadmin=; Path=/; Max-Age=0';
  });
});

describe('tampered stored data', () => {
  const store = () => createStore({ namespace: 't', onError: () => {} });

  test.each([['"9999999999999"'], ['{}'], ['true'], ['1e999']])(
    'ignores an expire of %s',
    (expire) => {
      window.localStorage.setItem('t.k', `{"value":1,"expire":${expire}}`);
      expect(store().ttl('k')).toBeNull();
      expect(store().get('k')).toBe(1);
    }
  );

  test('a tampered expire is not written back by patch', () => {
    window.localStorage.setItem('t.k', '{"value":{"a":1},"expire":"x"}');
    store().patch('k', { b: 2 });
    expect(JSON.parse(window.localStorage.getItem('t.k') as string)).toEqual({
      value: { a: 1, b: 2 },
    });
  });

  test('a non-numeric version is treated as unversioned', () => {
    window.localStorage.setItem('m.k', '{"value":1,"v":"abc"}');
    const migrate = vi.fn((value) => value);

    createStore({ namespace: 'm', version: 2, migrate }).get('k');

    expect(migrate).toHaveBeenCalledWith(1, 0, 'k');
  });

  describe('prototype safety', () => {
    const POISON = '{"value":{"__proto__":{"isAdmin":true},"a":1}}';
    const isClean = () => (({}) as { isAdmin?: boolean }).isAdmin === undefined;

    test('get and patch never pollute Object.prototype', () => {
      window.localStorage.setItem('t.k', POISON);
      store().get('k');
      store().patch('k', { b: 2 });

      expect(isClean()).toBe(true);
      expect(Object.getPrototypeOf(store().get('k'))).toBe(Object.prototype);
    });

    test('pick of __proto__ does not change the result prototype', () => {
      window.localStorage.setItem('t.k', POISON);
      const picked = pick(store(), 'k', ['__proto__']) as {
        isAdmin?: boolean;
      };

      expect(Object.getPrototypeOf(picked)).toBe(Object.prototype);
      expect(picked.isAdmin).toBeUndefined();
    });

    test('query helpers ignore inherited fields', () => {
      const s = store();
      s.set('list', [{ a: 1 }]);

      expect(pluck(s, 'list', 'constructor')).toEqual([]);
      expect(where(s, 'list', { constructor: Object })).toEqual([]);
      expect(findWhere(s, 'list', { toString: Object })).toBeUndefined();
    });
  });
});

describe('failures never escape', () => {
  test('an onError that throws does not break the operation', () => {
    const store = createStore({
      namespace: 'e',
      onError() {
        throw new Error('handler bug');
      },
    });

    expect(store.set('', 1)).toBe(false);
    expect(store.set('k', Symbol('s'))).toBe(false);
  });

  test('storage that fails while listing is reported, not thrown', () => {
    const errors: StoreError[] = [];
    const storage: StorageAdapter = {
      get length(): number {
        throw new Error('revoked');
      },
      key: () => null,
      getItem() {
        throw new Error('revoked');
      },
      setItem() {},
      removeItem() {},
    };
    const store = createStore({
      storage,
      onError: (error) => errors.push(error),
    });

    expect(store.keys()).toEqual([]);
    expect(store.count).toBe(0);
    expect(() => store.clear()).not.toThrow();
    expect(store.purgeExpired()).toBe(0);
    expect(store.used()).toBe(0);
    expect(store.size('k')).toBe(0);
    expect(typeof store.free()).toBe('number');
    expect(errors[0]?.code).toBe('STORAGE_UNAVAILABLE');
  });

  test('a storage value cannot break a size read', () => {
    const memory = createMemoryAdapter();
    memory.setItem('app.k', '{"value":1}');
    const storage = Object.create(memory, {
      getItem: {
        value(): string {
          throw new Error('revoked');
        },
      },
      length: { value: 1 },
      key: { value: () => 'app.k' },
    }) as StorageAdapter;

    expect(createStore({ storage, onError() {} }).used()).toBe(0);
  });
});

describe('logging', () => {
  test('a key cannot act as a console format string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    createStore({ storage: createMemoryAdapter() }).set('%c%s', circular);

    expect(warn).toHaveBeenCalledWith(
      '[opendb-store]',
      expect.stringContaining('%c%s')
    );
  });
});

describe('efficiency', () => {
  test('a listener that writes its own key does not recurse', () => {
    const store = createStore({ namespace: 'r' });
    let calls = 0;
    const stop = store.subscribe('k', () => {
      calls++;
      store.set('k', calls);
    });

    store.set('k', 0);
    stop();

    expect(calls).toBe(1);
    expect(store.get('k')).toBe(1);
  });

  test('a listener is notified again by later writes', () => {
    const store = createStore({ namespace: 'r' });
    const seen: unknown[] = [];
    const stop = store.subscribe('k', (value) => seen.push(value));

    store.set('k', 1);
    store.set('k', 2);
    stop();

    expect(seen).toEqual([1, 2]);
  });

  test('real storage is probed once across stores', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const probes = () =>
      write.mock.calls.filter(([key]) => key === '__opendb_probe__').length;

    createStore({ namespace: 'p1' }).has('k');
    const before = probes();
    createStore({ namespace: 'p2' }).has('k');
    createStore({ namespace: 'p3' }).has('k');

    expect(before).toBeLessThanOrEqual(1);
    expect(probes()).toBe(before);
  });

  test('memory keeps key order through writes and removals', () => {
    const memory = createMemoryAdapter();
    const keys = () =>
      Array.from({ length: memory.length }, (_, i) => memory.key(i));

    memory.setItem('a', '1');
    memory.setItem('b', '2');
    expect(keys()).toEqual(['a', 'b']);

    memory.setItem('a', '3');
    memory.setItem('c', '4');
    expect(keys()).toEqual(['a', 'b', 'c']);

    memory.removeItem('b');
    expect(keys()).toEqual(['a', 'c']);
  });

  test('cookie parsing follows every change to the cookie text', () => {
    db.cookie.set('a', 1);
    expect(db.cookie.get('a')).toBe(1);

    document.cookie = 'app.a=%7B%22value%22%3A2%7D; Path=/';
    expect(db.cookie.get('a')).toBe(2);

    db.cookie.remove('a');
    expect(db.cookie.get('a')).toBeNull();
  });

  test('unsubscribing one listener keeps the others on that key', () => {
    const store = createStore({ namespace: 'r' });
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = store.subscribe('k', first);
    const stopSecond = store.subscribe('k', second);

    stopFirst();
    stopFirst();
    store.set('k', 1);
    stopSecond();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
