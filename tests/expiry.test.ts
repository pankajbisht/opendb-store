import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createStore } from '../src/index';
import type { StoreError } from '../src/errors';

describe('expiry', () => {
  const errors: StoreError[] = [];
  const store = createStore({
    namespace: 'ttl',
    onError: (error) => errors.push(error),
  });

  beforeEach(() => {
    window.localStorage.clear();
    errors.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('value is live up to and including the expiry instant', () => {
    store.set('k', 'v', { expire: 1000 });
    vi.advanceTimersByTime(1000);
    expect(store.get('k')).toBe('v');
    expect(store.has('k')).toBe(true);
  });

  test('value is gone just after the expiry instant', () => {
    store.set('k', 'v', { expire: 1000 });
    vi.advanceTimersByTime(1001);
    expect(store.get('k')).toBeNull();
    expect(store.get('k', 'd')).toBe('d');
  });

  test('has reports expiry and removes the entry', () => {
    store.set('k', 'v', { expire: 1000 });
    vi.advanceTimersByTime(1001);
    expect(store.has('k')).toBe(false);
    expect(window.localStorage.getItem('ttl.k')).toBeNull();
  });

  test('get removes the expired entry', () => {
    store.set('k', 'v', { expire: 1000 });
    vi.advanceTimersByTime(1001);
    store.get('k');
    expect(window.localStorage.getItem('ttl.k')).toBeNull();
  });

  test('writing again restarts the lifetime', () => {
    store.set('k', 'v', { expire: 1000 });
    vi.advanceTimersByTime(900);
    store.set('k', 'v2', { expire: 1000 });
    vi.advanceTimersByTime(900);
    expect(store.get('k')).toBe('v2');
  });

  test('writing without expire makes the entry permanent', () => {
    store.set('k', 'v', { expire: 1000 });
    store.set('k', 'v2');
    vi.advanceTimersByTime(5000);
    expect(store.get('k')).toBe('v2');
  });

  test('expired entries are left out of iteration and removed', () => {
    store.set('dead', 1, { expire: 1000 });
    store.set('live', 2);
    vi.advanceTimersByTime(1001);
    expect(store.keys()).toEqual(['live']);
    expect(store.count).toBe(1);
    expect(window.localStorage.getItem('ttl.dead')).toBeNull();
  });

  test('remove of an expired key returns null', () => {
    store.set('k', 'v', { expire: 1000 });
    vi.advanceTimersByTime(1001);
    expect(store.remove('k')).toBeNull();
  });

  test('size of an expired key is 0', () => {
    store.set('k', 'v', { expire: 1000 });
    vi.advanceTimersByTime(1001);
    expect(store.size('k')).toBe(0);
  });

  test('patch keeps the existing expiry', () => {
    store.set('k', { a: 1 }, { expire: 1000 });
    vi.advanceTimersByTime(500);
    store.patch('k', { b: 2 });
    vi.advanceTimersByTime(501);
    expect(store.get('k')).toBeNull();
  });

  test('patch on an expired entry starts fresh', () => {
    store.set('k', { a: 1 }, { expire: 1000 });
    vi.advanceTimersByTime(1001);
    store.patch('k', { b: 2 });
    expect(store.get('k')).toEqual({ b: 2 });
  });

  test.each([[0], [-1], [NaN], [Infinity], ['1000'], [null]])(
    'rejects expire %s without writing',
    (expire) => {
      expect(store.set('k', 'v', { expire: expire as never })).toBe(false);
      expect(window.localStorage.getItem('ttl.k')).toBeNull();
      expect(errors[0]?.code).toBe('INVALID_ARGUMENT');
    }
  );

  test('reports an unknown option but still stores the value', () => {
    expect(store.set('k', 'v', { expires: 500 } as never)).toBe(true);
    expect(store.get('k')).toBe('v');
    expect(errors[0]?.message).toContain('expires');
  });

  describe('defaultTTL', () => {
    const timed = createStore({ namespace: 'timed', defaultTTL: 1000 });

    test('applies when expire is omitted', () => {
      timed.set('k', 'v');
      vi.advanceTimersByTime(1001);
      expect(timed.get('k')).toBeNull();
    });

    test('can be overridden per entry', () => {
      timed.set('k', 'v', { expire: 5000 });
      vi.advanceTimersByTime(1001);
      expect(timed.get('k')).toBe('v');
    });

    test('applies when patch creates an entry', () => {
      timed.patch('k', { a: 1 });
      vi.advanceTimersByTime(1001);
      expect(timed.get('k')).toBeNull();
    });
  });
});
