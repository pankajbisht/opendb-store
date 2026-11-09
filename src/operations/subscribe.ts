import type { Context } from '../context';
import type { Key } from '../types';
import { addSubscription } from './events';
import { readEntry, requireKey } from './internal';

export function subscribe(
  ctx: Context,
  key: Key,
  listener: (value: never) => void
): () => void {
  const normalized = requireKey(ctx, key);
  if (normalized === undefined) return () => {};

  const rawKey = ctx.keyCodec.build(normalized);

  return addSubscription({
    ctx,
    rawKey,
    notify() {
      // A failing listener must not break the write that triggered it.
      try {
        const entry = readEntry(ctx, rawKey);
        listener((entry ? entry.value : null) as never);
      } catch (error) {
        ctx.report('LISTENER_FAILED', `Listener failed`, normalized, error);
      }
    },
  });
}
