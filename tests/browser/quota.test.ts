import { afterEach, expect, test } from 'vitest';
import { createStore, StoreError } from '../../src/index';

afterEach(() => {
  window.localStorage.clear();
});

test('real storage reports QUOTA_EXCEEDED and keeps earlier data', () => {
  const errors: StoreError[] = [];
  const store = createStore({
    namespace: 'quota',
    onError: (error) => errors.push(error),
  });
  store.set('first', 'kept');

  const chunk = 'x'.repeat(1024 * 1024);
  let index = 0;
  let accepted = true;

  // Browsers allow a few million characters, so this ends well before the cap.
  while (accepted && index < 50) {
    accepted = store.set(`fill-${index++}`, chunk);
  }

  expect(accepted).toBe(false);
  expect(errors[errors.length - 1]?.code).toBe('QUOTA_EXCEEDED');
  expect(store.get('first')).toBe('kept');
});

test('a real store works without any configuration', () => {
  const store = createStore();
  expect(store.storage).toBe(window.localStorage);
});
