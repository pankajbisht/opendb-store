import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createStore, StoreError } from '../src/index';

const RAW = 'mig.user';

describe('schema migrations', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const write = (entry: object) =>
    window.localStorage.setItem(RAW, JSON.stringify(entry));
  const read = () => JSON.parse(window.localStorage.getItem(RAW) as string);

  test('records the version on new entries', () => {
    createStore({ namespace: 'mig', version: 2 }).set('user', 1);
    expect(read()).toEqual({ value: 1, v: 2 });
  });

  test('a store without version adds nothing', () => {
    createStore({ namespace: 'mig' }).set('user', 1);
    expect(read()).toEqual({ value: 1 });
  });

  test('upgrades an unversioned entry on first read and saves it', () => {
    write({ value: { name: 'Ada' } });
    const migrate = vi.fn((value, from, key) => ({ ...value, from, key }));
    const store = createStore({ namespace: 'mig', version: 2, migrate });

    expect(store.get('user')).toEqual({ name: 'Ada', from: 0, key: 'user' });
    expect(read().v).toBe(2);
    store.get('user');
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  test('passes the stored version to migrate', () => {
    write({ value: 'x', v: 1 });
    const migrate = vi.fn((value) => value);
    createStore({ namespace: 'mig', version: 3, migrate }).get('user');
    expect(migrate).toHaveBeenCalledWith('x', 1, 'user');
  });

  test('does not touch current or newer entries', () => {
    const migrate = vi.fn((value) => value);
    const store = createStore({ namespace: 'mig', version: 2, migrate });

    write({ value: 'x', v: 2 });
    expect(store.get('user')).toBe('x');
    write({ value: 'y', v: 9 });
    expect(store.get('user')).toBe('y');
    expect(migrate).not.toHaveBeenCalled();
  });

  test('keeps the expiry when upgrading', () => {
    const expire = Date.now() + 60_000;
    write({ value: 1, expire });
    createStore({
      namespace: 'mig',
      version: 2,
      migrate: (value) => value + 1,
    }).get('user');
    expect(read()).toEqual({ value: 2, expire, v: 2 });
  });

  test('does not run on expired entries', () => {
    write({ value: 1, expire: 1 });
    const migrate = vi.fn((value) => value);
    const store = createStore({ namespace: 'mig', version: 2, migrate });

    expect(store.get('user')).toBeNull();
    expect(migrate).not.toHaveBeenCalled();
  });

  test('returning undefined discards the entry', () => {
    write({ value: 1 });
    const store = createStore({
      namespace: 'mig',
      version: 2,
      migrate: () => undefined,
    });

    expect(store.get('user', 'd')).toBe('d');
    expect(window.localStorage.getItem(RAW)).toBeNull();
  });

  test('a failing migration reports, keeps the data, and returns default', () => {
    write({ value: 1 });
    const errors: StoreError[] = [];
    const store = createStore({
      namespace: 'mig',
      version: 2,
      onError: (error) => errors.push(error),
      migrate: () => {
        throw new Error('bad');
      },
    });

    expect(store.get('user', 'd')).toBe('d');
    expect(errors[0]?.code).toBe('MIGRATION_FAILED');
    expect(read()).toEqual({ value: 1 });
  });

  test('iteration and patch see upgraded values', () => {
    write({ value: { n: 1 } });
    const store = createStore({
      namespace: 'mig',
      version: 2,
      migrate: (value) => ({ ...value, m: 2 }),
    });

    expect(store.values()).toEqual([{ n: 1, m: 2 }]);
    store.patch('user', { o: 3 });
    expect(read()).toEqual({ value: { n: 1, m: 2, o: 3 }, v: 2 });
  });

  test('a read-triggered upgrade does not notify subscribers', () => {
    write({ value: 1 });
    const store = createStore({
      namespace: 'mig',
      version: 2,
      migrate: (value) => value + 1,
    });
    const listener = vi.fn();
    const stop = store.subscribe('user', listener);

    store.get('user');
    stop();

    expect(listener).not.toHaveBeenCalled();
  });
});
