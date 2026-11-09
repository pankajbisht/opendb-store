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
  let running = false;

  return addSubscription({
    ctx,
    rawKey,
    notify() {
      // A listener that writes its own key must not recurse without end.
      if (running) return;
      running = true;

      // A failing listener must not break the write that triggered it.
      try {
        const entry = readEntry(ctx, rawKey);
        listener((entry ? entry.value : null) as never);
      } catch (error) {
        ctx.report('LISTENER_FAILED', `Listener failed`, normalized, error);
      } finally {
        running = false;
      }
    },
  });
}
