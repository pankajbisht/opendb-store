import type { Context } from '../context';

export interface Subscription {
  ctx: Context;
  rawKey: string;
  notify(): void;
}

// Grouped by key, so a write costs nothing for subscribers of other keys.
const subscriptions = new Map<string, Set<Subscription>>();
const hasWindow = (): boolean => typeof window !== 'undefined';

function onStorageEvent(event: StorageEvent): void {
  // A null key means another tab cleared the whole storage area.
  const groups =
    event.key === null
      ? [...subscriptions.values()]
      : [subscriptions.get(event.key)];

  groups.forEach((group) =>
    group?.forEach((sub) => {
      if (event.storageArea === sub.ctx.adapter()) sub.notify();
    })
  );
}

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

  return () => {
    group.delete(subscription);
    if (!group.size && subscriptions.get(rawKey) === group) {
      subscriptions.delete(rawKey);
    }
    if (!subscriptions.size && hasWindow()) {
      window.removeEventListener('storage', onStorageEvent);
    }
  };
}
