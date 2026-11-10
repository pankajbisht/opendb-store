// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { inspect } from '../src/debug';
import db, {
  cookie,
  createMemoryAdapter,
  createStore,
  local,
  session,
  version,
} from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
});

test('there is no window in this environment', () => {
  expect(typeof window).toBe('undefined');
});

test('the package imports and exposes its API without a window', () => {
  expect(db.local).toBe(local);
  expect(db.session).toBe(session);
  expect(db.cookie).toBe(cookie);
  expect(typeof version).toBe('string');
});

test('reads return defaults, without warnings', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const store = createStore({ namespace: 'ssr' });

  expect(store.get('k')).toBeNull();
  expect(store.get('k', 'fallback')).toBe('fallback');
  expect(store.has('k')).toBe(false);
  expect(store.keys()).toEqual([]);
  expect(store.count).toBe(0);
  expect(store.ttl('k')).toBeNull();
  expect(store.used()).toBe(0);
  expect(store.remove('k')).toBeNull();
  expect(() => store.clear()).not.toThrow();
  expect(store.purgeExpired()).toBe(0);

  expect(warn).not.toHaveBeenCalled();
});

test.each([
  ['local', local],
  ['session', session],
  ['cookie', cookie],
])('%s keeps nothing between server requests', (_name, store) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  expect(store.set('profile', { email: 'alice@example.com' })).toBe(false);
  expect(store.get('profile')).toBeNull();
  expect(inspect(store).count).toBe(0);
});

test('a write on the server is reported', () => {
  const codes: string[] = [];
  const store = createStore({ onError: (e) => codes.push(e.code) });

  store.set('k', 1);

  expect(codes).toEqual(['STORAGE_UNAVAILABLE']);
});

test('subscribers are not called for a discarded write', () => {
  const store = createStore({ namespace: 'sub', onError: () => {} });
  const listener = vi.fn();
  const stop = store.subscribe('k', listener);

  store.set('k', 1);
  stop();

  expect(listener).not.toHaveBeenCalled();
});

test('memory can be chosen explicitly, for tests and scripts', () => {
  const store = createStore({ storage: createMemoryAdapter() });

  expect(store.set('k', 1)).toBe(true);
  expect(store.get('k')).toBe(1);
});
