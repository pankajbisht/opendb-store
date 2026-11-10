import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryAdapter } from '../src/adapters/memory';
import { createCache } from '../src/cache';
import { createStore } from '../src/index';

describe('createCache', () => {
  let storage: ReturnType<typeof createMemoryAdapter>;
  const make = (options = {}, storeOptions = {}) =>
    createCache(createStore({ storage, namespace: 'api', ...storeOptions }), {
      maxEntries: 3,
      ...options,
    });

  beforeEach(() => {
    storage = createMemoryAdapter();
  });

  test('keeps at most maxEntries, removing the least recently used', () => {
    const cache = make();
    ['a', 'b', 'c', 'd'].forEach((key) => cache.set(key, key));

    expect(cache.keys()).toEqual(['b', 'c', 'd']);
    expect(cache.get('a')).toBeNull();
    expect(cache.count).toBe(3);
  });

  test('reading an entry protects it from eviction', () => {
    const cache = make();
    ['a', 'b', 'c'].forEach((key) => cache.set(key, key));
    cache.get('a');
    cache.set('d', 'd');

    expect(cache.keys()).toEqual(['c', 'a', 'd']);
    expect(cache.has('b')).toBe(false);
  });

  test('touchOnRead: false evicts by write order only', () => {
    const cache = make({ touchOnRead: false });
    ['a', 'b', 'c'].forEach((key) => cache.set(key, key));
    cache.get('a');
    cache.set('d', 'd');

    expect(cache.has('a')).toBe(false);
  });

  test('rewriting a key makes it the newest', () => {
    const cache = make();
    ['a', 'b', 'c'].forEach((key) => cache.set(key, key));
    cache.set('a', 'again');
    cache.set('d', 'd');

    expect(cache.keys()).toEqual(['c', 'a', 'd']);
    expect(cache.get('a')).toBe('again');
  });

  test('expired entries do not count against the limit', () => {
    vi.useFakeTimers();
    const cache = make();
    cache.set('old', 1, { expire: 10 });
    cache.set('b', 2);
    cache.set('c', 3);
    vi.advanceTimersByTime(20);
    cache.set('d', 4);
    vi.useRealTimers();

    expect(cache.keys()).toEqual(['b', 'c', 'd']);
  });

  test('the order survives a reload', () => {
    ['a', 'b', 'c'].forEach((key) => make().set(key, key));
    make().get('a');
    make().set('d', 'd');

    expect(make().keys()).toEqual(['c', 'a', 'd']);
  });

  test('remove and clear update the order', () => {
    const cache = make();
    ['a', 'b'].forEach((key) => cache.set(key, key));

    expect(cache.remove('a')).toBe('a');
    expect(cache.keys()).toEqual(['b']);
    cache.clear();
    expect(cache.keys()).toEqual([]);
    expect(storage.length).toBe(0);
  });

  test('the order is not one of the store keys', () => {
    const store = createStore({ storage, namespace: 'api' });
    createCache(store, { maxEntries: 2 }).set('a', 1);
    expect(store.keys()).toEqual(['a']);
  });

  test('works where the order cannot be saved', () => {
    const full = Object.assign(createMemoryAdapter(), {});
    const store = createStore({ storage: full, namespace: 'q' });
    const cache = createCache(store, { maxEntries: 1 });
    const setItem = full.setItem;
    full.setItem = (key, value) => {
      if (key === 'q~order') throw new Error('full');
      setItem(key, value);
    };

    expect(cache.set('a', 1)).toBe(true);
    expect(cache.get('a')).toBe(1);
    full.removeItem = () => {
      throw new Error('blocked');
    };
    expect(() => cache.clear()).not.toThrow();
  });

  test('shares state with the store it wraps', () => {
    const store = createStore({ storage, namespace: 'api' });
    const cache = createCache(store, { maxEntries: 5 });
    const seen: unknown[] = [];
    const stop = store.subscribe('k', (value) => seen.push(value));
    cache.set('k', 1);
    stop();
    expect(seen).toEqual([1]);
  });

  test('missing keys return the default and are not touched', () => {
    const cache = make();
    expect(cache.get('missing', 'd')).toBe('d');
    expect(cache.keys()).toEqual([]);
  });

  test('a stored null is a hit', () => {
    const cache = make();
    cache.set('k', null);
    expect(cache.get('k', 'd')).toBeNull();
  });

  test('a failed write changes nothing', () => {
    const cache = make({}, { onError() {} });
    cache.set('a', 1);
    expect(cache.set('b', undefined)).toBe(false);
    expect(cache.keys()).toEqual(['a']);
  });

  test('a damaged order is ignored', () => {
    const cache = make();
    storage.setItem('api~order', 'not json');
    cache.set('a', 1);
    storage.setItem('api~order', '{"not":"a list"}');
    expect(cache.keys()).toEqual([]);
    storage.setItem('api~order', '[1,"a",null]');
    expect(cache.keys()).toEqual(['a']);
  });

  test.each([[0], [-1], [1.5], [NaN]])('rejects maxEntries %s', (max) => {
    expect(() => make({ maxEntries: max })).toThrow(TypeError);
  });
});
