// @vitest-environment node
import { expect, test, vi } from 'vitest';
import db, { createStore, local, session, version } from '../src/index';

test('there is no window in this environment', () => {
  expect(typeof window).toBe('undefined');
});

test('the package imports and exposes its API without a window', () => {
  expect(db.local).toBe(local);
  expect(db.session).toBe(session);
  expect(typeof version).toBe('string');
});

test('operations work against memory, without warnings', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const store = createStore({ namespace: 'ssr' });

  expect(store.set('k', 1)).toBe(true);
  expect(store.get('k')).toBe(1);
  expect(store.keys()).toEqual(['k']);
  store.clear();
  expect(store.count).toBe(0);

  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

test('local and session do not share memory', () => {
  const a = createStore({ namespace: 'iso', storage: 'local' });
  const b = createStore({ namespace: 'iso', storage: 'session' });

  a.set('k', 1);
  expect(b.has('k')).toBe(false);
  a.clear();
});

test('cookies and debug work without a window', async () => {
  const { cookie } = await import('../src/index');
  const { inspect } = await import('../src/debug');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  expect(cookie.set('k', 1)).toBe(true);
  expect(cookie.get('k')).toBe(1);
  expect(inspect(cookie).count).toBe(1);
  cookie.clear();

  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});

test('subscribe works without a window', () => {
  const store = createStore({ namespace: 'sub' });
  const seen: unknown[] = [];
  const stop = store.subscribe('k', (value) => seen.push(value));

  store.set('k', 1);
  stop();
  store.clear();

  expect(seen).toEqual([1]);
});
