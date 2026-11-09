import type { Context } from '../context';
import type { Key } from '../types';
import { rawKeys, readEntry, removeRaw, requireKey } from './internal';

export function remove(ctx: Context, key: Key): unknown {
  const normalized = requireKey(ctx, key);
  if (normalized === undefined) return null;

  const rawKey = ctx.keyCodec.build(normalized);
  const entry = readEntry(ctx, rawKey);
  removeRaw(ctx, rawKey);

  return entry ? entry.value : null;
}

export function clear(ctx: Context): void {
  rawKeys(ctx).forEach((rawKey) => removeRaw(ctx, rawKey));
}
