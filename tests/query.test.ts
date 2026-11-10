import { beforeEach, describe, expect, test } from 'vitest';
import { createStore } from '../src/index';
import { findWhere, omit, pick, pluck, where } from '../src/query';

describe('query helpers', () => {
  const store = createStore({ namespace: 'q' });
  const users = [
    { name: 'moe', age: 40, active: true },
    { name: 'larry', age: 50, active: false },
    { name: 'curly', age: 40, active: true },
  ];

  beforeEach(() => {
    window.localStorage.clear();
    store.set('users', users);
    store.set('user', { id: 1, name: 'moe', age: 40 });
    store.set('text', 'not structured');
  });

  test('pick returns the named fields', () => {
    expect(pick(store, 'user', ['id', 'missing'])).toEqual({ id: 1 });
  });

  test('omit drops the named fields', () => {
    expect(omit(store, 'user', ['age'])).toEqual({ id: 1, name: 'moe' });
  });

  test('pluck collects a field and skips missing ones', () => {
    store.set('mixed', [{ a: 1 }, {}, null, { a: 0 }]);
    expect(pluck(store, 'mixed', 'a')).toEqual([1, 0]);
  });

  test('where returns all matches', () => {
    expect(where(store, 'users', { age: 40, active: true })).toHaveLength(2);
  });

  test('findWhere returns the first match', () => {
    expect(findWhere(store, 'users', { age: 50 })?.name).toBe('larry');
    expect(findWhere(store, 'users', { age: 99 })).toBeUndefined();
  });

  test('helpers return empty results for unsuitable data', () => {
    expect(pick(store, 'text', ['a'])).toEqual({});
    expect(pick(store, 'missing', ['a'])).toEqual({});
    expect(pick(store, 'user', 'id' as never)).toEqual({});
    expect(omit(store, 'text', ['a'])).toEqual({});
    expect(omit(store, 'user', 'id' as never)).toEqual({});
    expect(pluck(store, 'text', 'a')).toEqual([]);
    expect(where(store, 'missing', { a: 1 })).toEqual([]);
    expect(findWhere(store, 'text', { a: 1 })).toBeUndefined();
  });
});
