import type { Context } from '../context';

export interface Subscription {
  ctx: Context;
  rawKey: string;
  notify(): void;
}

const subscriptions = new Set<Subscription>();
const hasWindow = (): boolean => typeof window !== 'undefined';

function onStorageEvent(event: StorageEvent): void {
  subscriptions.forEach((sub) => {
    // A null key means another tab cleared the whole storage area.
    const matchesKey = event.key === null || event.key === sub.rawKey;
    if (matchesKey && event.storageArea === sub.ctx.adapter()) sub.notify();
  });
}

/** Tells this tab's subscribers, on any store sharing the adapter. */
export function emit(ctx: Context, rawKey: string): void {
  const adapter = ctx.adapter();

  subscriptions.forEach((sub) => {
    if (sub.rawKey === rawKey && sub.ctx.adapter() === adapter) sub.notify();
  });
}

export function addSubscription(subscription: Subscription): () => void {
  if (!subscriptions.size && hasWindow()) {
    window.addEventListener('storage', onStorageEvent);
  }
  subscriptions.add(subscription);

  return () => {
    subscriptions.delete(subscription);
    if (!subscriptions.size && hasWindow()) {
      window.removeEventListener('storage', onStorageEvent);
    }
  };
}
