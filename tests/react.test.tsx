import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createMemoryAdapter } from '../src/adapters/memory';
import { createStore } from '../src/index';
import { useStored } from '../src/react';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

if (!('indexedDB' in globalThis)) await import('fake-indexeddb/auto');
const { createIndexedStore } = await import('../src/indexeddb/index');

let container: HTMLDivElement;
let unmount: () => void;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => unmount());
  container.remove();
});

type Store = Parameters<typeof useStored>[0];
let api: [unknown, (next: unknown) => void, () => void];

function Probe({ store, fallback }: { store: Store; fallback: unknown }) {
  api = useStored(store, 'k', fallback);
  return <span>{JSON.stringify(api[0])}</span>;
}

function render(store: Store, fallback: unknown = 'fallback') {
  const root = createRoot(container);
  act(() => root.render(<Probe store={store} fallback={fallback} />));
  unmount = () => root.unmount();
}

const text = () => container.textContent;

test('shows the fallback, then the stored value', async () => {
  const store = createStore({ storage: createMemoryAdapter() });
  store.set('k', 'stored');

  render(store);
  await act(async () => {});

  expect(text()).toBe('"stored"');
});

test('follows writes, removal, and other writers', async () => {
  const store = createStore({ storage: createMemoryAdapter() });
  render(store);
  await act(async () => {});

  act(() => api[1]('first'));
  expect(text()).toBe('"first"');

  act(() => {
    store.set('k', 'elsewhere');
  });
  expect(text()).toBe('"elsewhere"');

  act(() => api[2]());
  expect(text()).toBe('"fallback"');
});

test('works with an IndexedDB store', async () => {
  const store = createIndexedStore({ database: `react-${Date.now()}` });
  await store.set('k', { n: 1 });

  render(store, {});
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(text()).toBe('{"n":1}');

  await act(async () => {
    api[1]({ n: 2 });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(text()).toBe('{"n":2}');
});

test('stops listening after unmount', async () => {
  const store = createStore({ storage: createMemoryAdapter() });
  render(store);
  await act(async () => {});
  act(() => unmount());
  unmount = () => {};

  expect(() => store.set('k', 'after')).not.toThrow();
});
