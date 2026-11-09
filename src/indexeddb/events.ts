export interface Subscription {
  rawKey: string;
  notify(): void;
}

const groups = new Map<string, Set<Subscription>>();
const channels = new Map<string, BroadcastChannel>();
let active: Subscription | undefined;

const groupId = (database: string, rawKey: string): string =>
  `${database}\u0000${rawKey}`;

function deliver(
  database: string,
  rawKeys: string[],
  origin?: Subscription
): void {
  rawKeys.forEach((rawKey) => {
    groups.get(groupId(database, rawKey))?.forEach((sub) => {
      if (sub !== origin) sub.notify();
    });
  });
}

// IndexedDB has no change event, so other tabs are told through a channel.
function channelFor(database: string): BroadcastChannel | undefined {
  if (
    typeof BroadcastChannel === 'undefined' ||
    typeof indexedDB === 'undefined'
  ) {
    return undefined;
  }

  let channel = channels.get(database);

  if (!channel) {
    channel = new BroadcastChannel(`opendb-store:${database}`);
    channel.onmessage = (event: MessageEvent<{ keys?: unknown }>) => {
      const keys = event.data?.keys;
      if (Array.isArray(keys)) deliver(database, keys);
    };
    channels.set(database, channel);
  }

  return channel;
}

/** The subscription whose listener is running right now, if any. */
export const activeSubscription = (): Subscription | undefined => active;

/** Marks writes made during `listener` so they do not notify it again. */
export function runListener(sub: Subscription, listener: () => void): void {
  active = sub;
  try {
    listener();
  } finally {
    active = undefined;
  }
}

export function announce(
  database: string,
  rawKeys: string[],
  origin?: Subscription
): void {
  if (!rawKeys.length) return;

  deliver(database, rawKeys, origin);
  channelFor(database)?.postMessage({ keys: rawKeys });
}

export function addSubscription(
  database: string,
  subscription: Subscription
): () => void {
  const id = groupId(database, subscription.rawKey);
  const group = groups.get(id) ?? new Set();

  channelFor(database);
  groups.set(id, group.add(subscription));

  return () => {
    group.delete(subscription);
    if (!group.size && groups.get(id) === group) groups.delete(id);
  };
}
