import { expect, test, vi } from 'vitest';
import { inspect } from '../../src/debug';
import { createIndexedStore } from '../../src/indexeddb/index';

const unique = () => `real-${Date.now()}-${Math.random()}`;

test('a Blob keeps its type and content', async () => {
  const errors: string[] = [];
  const store = createIndexedStore({
    database: unique(),
    onError: (error) => errors.push(error.code),
  });

  const saved = await store.set(
    'file',
    new Blob(['hello'], { type: 'text/plain' })
  );

  // Safari refuses Blobs in private browsing, which is how test browsers run.
  if (!saved && /Version\/[\d.]+.*Safari/.test(navigator.userAgent)) {
    expect(errors).toEqual(['STORAGE_UNAVAILABLE']);
    return;
  }

  const blob = await store.get<Blob>('file');

  expect(saved).toBe(true);
  expect(blob?.type).toBe('text/plain');
  expect(await blob?.text()).toBe('hello');
  expect(await store.size('file')).toBeGreaterThanOrEqual(5);
});

test('holds more than localStorage could', async () => {
  const store = createIndexedStore({ database: unique() });
  const value = new Uint8Array(12 * 1024 * 1024).fill(7);

  expect(await store.set('big', value)).toBe(true);

  const read = await store.get<Uint8Array>('big');
  expect(read?.length).toBe(value.length);
  expect(read?.[1000]).toBe(7);
  await store.clear();
});

test('a change in another document reaches subscribers', async () => {
  const database = unique();
  const store = createIndexedStore({ database });
  const seen: unknown[] = [];
  const stop = store.subscribe('k', (value) => seen.push(value));
  await store.set('k', 'first');
  await vi.waitFor(() => expect(seen).toEqual(['first']));

  const frame = document.createElement('iframe');
  document.body.append(frame);
  const channel = new (
    frame.contentWindow as unknown as typeof globalThis
  ).BroadcastChannel(`opendb-store:${database}`);
  await store.set('k', 'second');
  channel.postMessage({ keys: ['app.k'] });

  await vi.waitFor(() =>
    expect(seen.filter((value) => value === 'second').length).toBe(2)
  );
  channel.close();
  frame.remove();
  stop();
});

test('real quota figures are reported', async () => {
  const store = createIndexedStore({ database: unique() });
  await store.set('k', 'x'.repeat(10_000));

  const report = await inspect(store);

  expect(report.capacity).toBeGreaterThan(1024 * 1024);
  expect(report.entries[0]?.key).toBe('k');
});
