import { afterEach, expect, test, vi } from 'vitest';
import { inspect } from '../../src/debug';
import db, { createStore, StoreError } from '../../src/index';

afterEach(() => {
  window.localStorage.clear();
  db.cookie.clear();
});

test('a change made in another document reaches subscribers', async () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const seen: unknown[] = [];
  const stop = createStore({ namespace: 'tabs' }).subscribe('k', (value) =>
    seen.push(value)
  );

  frame.contentWindow?.localStorage.setItem('tabs.k', '{"value":"remote"}');

  await vi.waitFor(() => expect(seen).toEqual(['remote']));
  stop();
  frame.remove();
});

test('a real cookie disappears when its lifetime ends', async () => {
  db.cookie.set('short', 1, { expire: 1000 });
  expect(document.cookie).toContain('app.short=');

  await vi.waitFor(() => expect(document.cookie).not.toContain('app.short='), {
    timeout: 4000,
    interval: 200,
  });
});

test('a real browser refuses an oversized cookie and we report it', () => {
  const errors: StoreError[] = [];
  const store = createStore({
    storage: 'cookie',
    onError: (error) => errors.push(error),
  });

  expect(store.set('huge', 'x'.repeat(8000))).toBe(false);
  expect(errors[0]?.code).toBe('QUOTA_EXCEEDED');
});

test('a cookie close to the limit is stored intact', () => {
  const value = 'x'.repeat(3900);
  expect(db.cookie.set('big', value)).toBe(true);
  expect(db.cookie.get('big')).toBe(value);
});

test('cookies with awkward content survive a real browser', () => {
  const value = { text: 'a;b=c "quoted" नमस्ते 😀' };
  db.cookie.set('awkward', value);
  expect(db.cookie.get('awkward')).toEqual(value);
});

test('inspect reports real usage', () => {
  db.local.set('report', 'x'.repeat(10_000));
  const report = inspect(db.local);

  expect(report.entries[0]?.key).toBe('report');
  expect(report.percentUsed).toBeGreaterThan(0);
});
