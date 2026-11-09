import { beforeEach, describe, expect, test } from 'vitest';
import { createCookieAdapter } from '../src/adapters/cookie';
import { createMemoryAdapter } from '../src/adapters/memory';
import { createStore } from '../src/index';
import type { StorageAdapter, StoreOptions } from '../src/types';

const memory = createMemoryAdapter();
const cookies = createCookieAdapter();

const backends: [string, StoreOptions['storage'], () => StorageAdapter][] = [
  ['localStorage', 'local', () => window.localStorage],
  ['sessionStorage', 'session', () => window.sessionStorage],
  ['cookies', 'cookie', () => cookies],
  ['memory adapter', memory, () => memory],
];

describe.each(backends)('contract: %s', (_name, storage, raw) => {
  const make = (options: StoreOptions = {}) =>
    createStore({ storage, onError: () => {}, ...options });
  let store: ReturnType<typeof make>;

  beforeEach(() => {
    const adapter = raw();
    for (let i = adapter.length - 1; i >= 0; i--) {
      adapter.removeItem(adapter.key(i) as string);
    }
    store = make();
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
    ])('round-trips %s', (_label, value) => {
      expect(store.set('k', value)).toBe(true);
      expect(store.get('k', 'default')).toEqual(value);
    });

    test('uses the 2.x key and payload format', () => {
      store.set('k', 1);
      expect(raw().getItem('app.k')).toBe('{"value":1}');
    });

    test('returns null for a missing key', () => {
      expect(store.get('missing')).toBeNull();
    });

    test('returns the default for a missing key', () => {
      expect(store.get('missing', 'fallback')).toBe('fallback');
    });

    test.each([[undefined], [null], [''], [NaN], [{}]])(
      'treats invalid key %s as missing',
      (key) => {
        expect(store.get(key as never)).toBeNull();
        expect(store.get(key as never, 'd')).toBe('d');
        expect(store.has(key as never)).toBe(false);
        expect(store.set(key as never, 1)).toBe(false);
      }
    );

    test('accepts number keys across instances', () => {
      store.set(5, 'x');
      expect(make().get(5)).toBe('x');
      expect(make().has(5)).toBe(true);
      expect(make().get('5')).toBe('x');
    });

    test('accepts a key named "null"', () => {
      expect(store.set('null', 'v')).toBe(true);
      expect(store.get('null')).toBe('v');
    });

    test('accepts Unicode keys and values', () => {
      store.set('ключ-🔑', 'значение-😀');
      expect(make().get('ключ-🔑')).toBe('значение-😀');
    });

    test('allows the separator inside a key', () => {
      store.set('a.b.c', 1);
      expect(store.get('a.b.c')).toBe(1);
      expect(store.keys()).toEqual(['a.b.c']);
    });

    test.each([
      ['undefined', undefined],
      ['function', () => 1],
      ['symbol', Symbol('s')],
    ])('refuses to store %s', (_label, value) => {
      expect(store.set('k', value)).toBe(false);
      expect(raw().getItem('app.k')).toBeNull();
    });
  });

  describe('storage is the source of truth', () => {
    test('caller mutations do not change what is read', () => {
      const value = { n: 1 };
      store.set('k', value);
      value.n = 99;
      expect(store.get<{ n: number }>('k')?.n).toBe(1);
    });

    test('mutating a read result does not change what is read next', () => {
      store.set('k', { n: 1 });
      store.get<{ n: number }>('k')!.n = 99;
      expect(store.get<{ n: number }>('k')?.n).toBe(1);
    });

    test('types match before and after a reload', () => {
      store.set('d', new Date(0));
      expect(store.get('d')).toBe(make().get('d'));
    });

    test('sees writes from another instance', () => {
      const other = make();
      store.set('k', 1);
      expect(other.get('k')).toBe(1);
      store.set('k', 2);
      expect(other.get('k')).toBe(2);
    });

    test('sees removal done outside the library', () => {
      store.set('k', 1);
      raw().removeItem('app.k');
      expect(store.get('k')).toBeNull();
      expect(store.has('k')).toBe(false);
    });
  });

  describe('has', () => {
    test.each([
      ['empty string', ''],
      ['null', null],
      ['zero', 0],
      ['false', false],
    ])('is true for a stored %s', (_label, value) => {
      store.set('k', value);
      expect(store.has('k')).toBe(true);
    });

    test('is false for a missing key', () => {
      expect(store.has('missing')).toBe(false);
    });

    test('is false for a value not written by this library', () => {
      raw().setItem('app.foreign', '"plain"');
      expect(store.has('foreign')).toBe(false);
    });
  });

  describe('remove and clear', () => {
    test('remove returns the previous value', () => {
      store.set('k', { a: 1 });
      expect(store.remove('k')).toEqual({ a: 1 });
      expect(store.get('k')).toBeNull();
    });

    test('remove returns null for a missing or invalid key', () => {
      expect(store.remove('missing')).toBeNull();
      expect(store.remove('' as never)).toBeNull();
    });

    test('clear removes only this namespace', () => {
      const other = store.from('other');
      raw().setItem('unrelated', 'keep');
      store.set('a', 1);
      store.set('b', 2);
      other.set('c', 3);

      store.clear();

      expect(store.count).toBe(0);
      expect(other.get('c')).toBe(3);
      expect(raw().getItem('unrelated')).toBe('keep');
    });

    test('clear on an empty store does nothing', () => {
      expect(() => store.clear()).not.toThrow();
    });
  });

  describe('namespaces', () => {
    test('isolates equal keys', () => {
      const a = store.from('a');
      const b = store.from('b');
      a.set('k', 'A');
      b.set('k', 'B');
      expect(a.get('k')).toBe('A');
      expect(b.get('k')).toBe('B');
    });

    test('from does not change the original store', () => {
      store.from('other').set('k', 1);
      expect(store.has('k')).toBe(false);
    });

    test('a namespace that prefixes another is kept separate', () => {
      const short = store.from('ab');
      const long = store.from('abc');
      short.set('k', 1);
      long.set('k', 2);
      expect(short.keys()).toEqual(['k']);
      short.clear();
      expect(long.get('k')).toBe(2);
    });
  });

  describe('iteration', () => {
    beforeEach(() => {
      store.set('a', 1);
      store.set('b', 2);
      store.from('other').set('c', 3);
      raw().setItem('unrelated', 'x');
      raw().setItem('app.foreign', '"plain"');
    });

    test('keys are scoped and unprefixed', () => {
      expect(store.keys().sort()).toEqual(['a', 'b']);
    });

    test('count matches keys', () => {
      expect(store.count).toBe(2);
    });

    test('values and entries are scoped', () => {
      expect(store.values().sort()).toEqual([1, 2]);
      expect(store.entries().sort()).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    test('key returns a key by index or null', () => {
      expect(['a', 'b']).toContain(store.key(0));
      expect(store.key(9)).toBeNull();
    });
  });

  describe('patch', () => {
    test('merges into a stored object', () => {
      store.set('k', { a: 1, b: 2 });
      expect(store.patch('k', { b: 3, c: 4 })).toBe(true);
      expect(store.get('k')).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('creates a missing entry', () => {
      store.patch('k', { a: 1 });
      expect(store.get('k')).toEqual({ a: 1 });
    });

    test.each([
      ['array', [1, 2]],
      ['string', 'text'],
    ])('leaves a stored %s untouched', (_label, value) => {
      store.set('k', value);
      expect(store.patch('k', { a: 1 })).toBe(false);
      expect(store.get('k')).toEqual(value);
    });

    test.each([[null], [[1]], ['x']])('rejects partial %s', (partial) => {
      store.set('k', { a: 1 });
      expect(store.patch('k', partial as never)).toBe(false);
      expect(store.get('k')).toEqual({ a: 1 });
    });

    test('rejects an invalid key', () => {
      expect(store.patch('' as never, { a: 1 })).toBe(false);
    });
  });

  describe('ttl', () => {
    test('is null for a missing, invalid, or permanent key', () => {
      store.set('forever', 1);
      expect(store.ttl('missing')).toBeNull();
      expect(store.ttl('' as never)).toBeNull();
      expect(store.ttl('forever')).toBeNull();
    });

    test('is the remaining time for an expiring key', () => {
      store.set('k', 1, { expire: 60_000 });
      const remaining = store.ttl('k') as number;
      expect(remaining).toBeGreaterThan(50_000);
      expect(remaining).toBeLessThanOrEqual(60_000);
    });
  });

  describe('subscribe', () => {
    test('reports writes, including from another store instance', () => {
      const seen: unknown[] = [];
      const stop = store.subscribe('k', (value) => seen.push(value));

      store.set('k', 1);
      make().set('k', 2);
      store.patch('other', { ignored: true });
      stop();

      expect(seen).toEqual([1, 2]);
    });

    test('reports removal and clear as null', () => {
      const seen: unknown[] = [];
      const stop = store.subscribe('k', (value) => seen.push(value));

      store.set('k', 1);
      store.remove('k');
      store.set('k', 2);
      store.clear();
      stop();

      expect(seen).toEqual([1, null, 2, null]);
    });

    test('stops after unsubscribing', () => {
      const seen: unknown[] = [];
      store.subscribe('k', (value) => seen.push(value))();
      store.set('k', 1);
      expect(seen).toEqual([]);
    });

    test('keeps namespaces separate', () => {
      const seen: unknown[] = [];
      const stop = store.subscribe('k', (value) => seen.push(value));
      store.from('other').set('k', 1);
      stop();
      expect(seen).toEqual([]);
    });
  });

  describe('sizes', () => {
    test('size is what the backend counts against its limit', () => {
      store.set('k', 'é😀');
      const rawValue = raw().getItem('app.k') as string;
      expect(store.size('k')).toBe(
        raw().measure?.('app.k', rawValue) ?? 'app.k'.length + rawValue.length
      );
    });

    test('size is 0 for a missing or invalid key', () => {
      expect(store.size('missing')).toBe(0);
      expect(store.size('' as never)).toBe(0);
    });

    test.each([
      [{ format: 'MB', unit: true }, / MB$/],
      [{ format: 'kb', unit: true }, / KB$/],
      [{ format: 'B' }, / B$/],
      [{ unit: true }, / MB$/],
    ])('formats with %o', (options, expected) => {
      store.set('k', 'v');
      expect(store.size('k', options)).toMatch(expected);
    });

    test('omits the unit when asked', () => {
      store.set('k', 'v');
      expect(store.size('k', { format: 'MB', unit: false })).toMatch(
        /^\d+\.\d+$/
      );
    });

    test('used counts only this namespace', () => {
      store.set('a', 1);
      const before = store.used();
      store.from('other').set('b', 'large value');
      expect(store.used()).toBe(before);
      expect(before).toBeGreaterThan(0);
    });

    test('free accounts for the whole origin', () => {
      const before = store.free();
      store.from('other').set('b', 'value');
      expect(store.free()).toBeLessThan(before);
    });

    test('free never goes below zero', () => {
      store.set('a', 'value');
      expect(store.free({ capacity: 1 })).toBe(0);
    });

    test('capacity uses the backend estimate and can be overridden', () => {
      const expected = raw().capacity ?? 5 * 1024 * 1024;
      expect(store.capacity()).toBe(expected);
      expect(store.capacity({ format: 'B', unit: false })).toBe(
        expected.toFixed(2)
      );
      expect(store.capacity({ capacity: 2048, format: 'KB' })).toBe('2.00 KB');
    });

    test('used and free accept format options', () => {
      expect(store.used({ format: 'KB', unit: true })).toMatch(/ KB$/);
      expect(store.free({ format: 'MB', unit: false })).toMatch(/^\d/);
    });
  });
});
