// @vitest-environment node
import { expect, test, vi } from 'vitest';
import { createIndexedStore, indexed } from '../src/indexeddb/index';

test('there is no IndexedDB in this environment', () => {
  expect(typeof indexedDB).toBe('undefined');
});

test('reads return defaults, without warnings', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  expect(await indexed.get('k', 'fallback')).toBe('fallback');
  expect(await indexed.has('k')).toBe(false);
  expect(await indexed.keys()).toEqual([]);
  expect(await indexed.count).toBe(0);
  expect(await indexed.values()).toEqual([]);
  expect(await indexed.purgeExpired()).toBe(0);
  await indexed.clear();

  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

test('nothing is kept between server requests', async () => {
  const codes: string[] = [];
  const store = createIndexedStore({
    namespace: 'ssr',
    onError: (e) => codes.push(e.code),
  });

  expect(await store.set('profile', { email: 'a@example.com' })).toBe(false);
  expect(await store.patch('profile', { a: 1 })).toBe(false);
  expect(await store.get('profile')).toBeNull();
  expect(codes).toEqual(['STORAGE_UNAVAILABLE', 'STORAGE_UNAVAILABLE']);
});

test('subscribe does not keep the process alive or throw', () => {
  const stop = indexed.subscribe('k', () => {});
  expect(stop).not.toThrow();
});
