import { normalizeKey } from '../codec/key';
import type { Context } from '../context';
import type { Key } from '../types';
import { readEntry } from './internal';

export function get(
  ctx: Context,
  key: Key,
  defaultValue: unknown = null
): unknown {
  const normalized = normalizeKey(key);
  if (normalized === undefined) return defaultValue;

  const entry = readEntry(ctx, ctx.keyCodec.build(normalized), true);
  return entry ? entry.value : defaultValue;
}
