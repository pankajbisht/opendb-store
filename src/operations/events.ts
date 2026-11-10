import type { Context } from '../context';
import type { StorageAdapter } from '../types';

export interface Subscription {
  ctx: Context;
  rawKey: string;
  notify(): void;
}

// Grouped by key, so a write costs nothing for subscribers of other keys.
const subscriptions = new Map<string, Set<Subscription>>();
const hasWindow = (): boolean => typeof window !== 'undefined';

/** Notifies subscribers of a change another tab made. */
function notifyAdapter(adapter: unknown, rawKey: string | null): void {
  // A null key means the whole storage area was cleared.
  const groups =
    rawKey === null ? [...subscriptions.values()] : [subscriptions.get(rawKey)];

  groups.forEach((group) =>
    group?.forEach((sub) => {
      if (sub.ctx.adapter() === adapter) sub.notify();
    })
  );
}

const onStorageEvent = (event: StorageEvent): void =>
  notifyAdapter(event.storageArea, event.key);

// Adapters with their own change events, such as cookies, are watched once.
const watchers = new Map<StorageAdapter, { stop(): void; count: number }>();

/** Tells this tab's subscribers, on any store sharing the adapter. */
export function emit(ctx: Context, rawKey: string): void {
  subscriptions.get(rawKey)?.forEach((sub) => {
    if (sub.ctx.adapter() === ctx.adapter()) sub.notify();
  });
}

export function addSubscription(subscription: Subscription): () => void {
  const { rawKey } = subscription;

  if (!subscriptions.size && hasWindow()) {
    window.addEventListener('storage', onStorageEvent);
  }

  const group = subscriptions.get(rawKey) ?? new Set();
  subscriptions.set(rawKey, group.add(subscription));

  const adapter = subscription.ctx.adapter();
  let watcher = watchers.get(adapter);
  if (!watcher && adapter.watch) {
    const stop = adapter.watch((key) => notifyAdapter(adapter, key));
    watcher = { stop, count: 0 };
    watchers.set(adapter, watcher);
  }
  if (watcher) watcher.count++;

  return () => {
    if (!group.delete(subscription)) return;

    if (watcher && --watcher.count === 0) {
      watcher.stop();
      watchers.delete(adapter);
    }

    if (!group.size && subscriptions.get(rawKey) === group) {
      subscriptions.delete(rawKey);
    }
    if (!subscriptions.size && hasWindow()) {
      window.removeEventListener('storage', onStorageEvent);
    }
  };
}
