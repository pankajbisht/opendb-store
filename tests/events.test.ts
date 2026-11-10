import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMemoryAdapter } from '../src/adapters/memory';
import { createStore, StoreError } from '../src/index';
import type { StorageAdapter } from '../src/types';

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('purgeExpired', () => {
  test('removes only expired entries and counts them', () => {
    vi.useFakeTimers();
    const store = createStore({ namespace: 'p' });
    store.set('dead1', 1, { expire: 1000 });
    store.set('dead2', 2, { expire: 1000 });
    store.set('alive', 3, { expire: 5000 });
    store.set('forever', 4);
    window.localStorage.setItem('p.foreign', '"plain"');
    vi.advanceTimersByTime(2000);

    expect(store.purgeExpired()).toBe(2);
    expect(store.keys().sort()).toEqual(['alive', 'forever']);
    expect(window.localStorage.getItem('p.foreign')).toBe('"plain"');
    expect(store.purgeExpired()).toBe(0);
  });

  test('a quota error purges expired entries and retries', () => {
    vi.useFakeTimers();
    const memory = createMemoryAdapter();
    let full = true;
    const storage: StorageAdapter = {
      get length() {
        return memory.length;
      },
      key: memory.key,
      getItem: memory.getItem,
      removeItem(key) {
        memory.removeItem(key);
        full = false;
      },
      setItem(key, value) {
        if (full && key === 'app.new') {
          throw new DOMException('full', 'QuotaExceededError');
        }
        memory.setItem(key, value);
      },
    };
    const store = createStore({ storage });
    store.set('dead', 1, { expire: 1000 });
    vi.advanceTimersByTime(2000);

    expect(store.set('new', 2)).toBe(true);
    expect(store.get('new')).toBe(2);
  });

  test('a quota error with nothing to purge still fails', () => {
    const errors: StoreError[] = [];
    const memory = createMemoryAdapter();
    const setItem = vi.fn(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const storage = Object.create(memory, {
      setItem: { value: setItem },
    }) as StorageAdapter;
    const store = createStore({
      storage,
      onError: (error) => errors.push(error),
    });

    expect(store.set('k', 1)).toBe(false);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(errors[0]?.code).toBe('QUOTA_EXCEEDED');
  });
});

describe('subscribe', () => {
  test('an expired entry notifies when it is discovered', () => {
    vi.useFakeTimers();
    const store = createStore({ namespace: 's' });
    const seen: unknown[] = [];
    const stop = store.subscribe('k', (value) => seen.push(value));

    store.set('k', 1, { expire: 1000 });
    vi.advanceTimersByTime(2000);
    store.get('k');
    stop();

    expect(seen).toEqual([1, null]);
  });

  test('a throwing listener does not break the write or other listeners', () => {
    const errors: StoreError[] = [];
    const store = createStore({
      namespace: 's',
      onError: (error) => errors.push(error),
    });
    const other = vi.fn();
    const stopA = store.subscribe('k', () => {
      throw new Error('bad listener');
    });
    const stopB = store.subscribe('k', other);

    expect(store.set('k', 1)).toBe(true);
    expect(other).toHaveBeenCalledWith(1);
    expect(errors[0]?.code).toBe('LISTENER_FAILED');
    stopA();
    stopB();
  });

  test('an invalid key reports and returns a harmless unsubscribe', () => {
    const errors: StoreError[] = [];
    const store = createStore({ onError: (error) => errors.push(error) });
    const stop = store.subscribe('' as never, () => {});

    expect(errors[0]?.code).toBe('INVALID_KEY');
    expect(stop).not.toThrow();
  });

  const fireStorageEvent = (key: string | null, storageArea: Storage) =>
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea }));

  test('reports a change from another tab', () => {
    const store = createStore({ namespace: 's' });
    const seen: unknown[] = [];
    const stop = store.subscribe('k', (value) => seen.push(value));

    window.localStorage.setItem('s.k', '{"value":"remote"}');
    fireStorageEvent('s.k', window.localStorage);
    stop();

    expect(seen).toEqual(['remote']);
  });

  test('reports a clear from another tab', () => {
    const store = createStore({ namespace: 's' });
    const seen: unknown[] = [];
    store.set('k', 1);
    const stop = store.subscribe('k', (value) => seen.push(value));

    // As another tab would: clear the storage, then the event arrives.
    window.localStorage.clear();
    fireStorageEvent(null, window.localStorage);
    stop();

    expect(seen).toEqual([null]);
  });

  test('ignores other keys and other storage areas', () => {
    const store = createStore({ namespace: 's' });
    const listener = vi.fn();
    const stop = store.subscribe('k', listener);

    fireStorageEvent('s.other', window.localStorage);
    fireStorageEvent('s.k', window.sessionStorage);
    stop();

    expect(listener).not.toHaveBeenCalled();
  });

  test('removes the window listener with the last subscriber', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const store = createStore({ namespace: 's' });
    const stopA = store.subscribe('a', () => {});
    const stopB = store.subscribe('b', () => {});

    stopA();
    expect(remove).not.toHaveBeenCalled();
    stopB();
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
    remove.mockRestore();
  });
});
