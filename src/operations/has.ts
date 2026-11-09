import { normalizeKey } from '../codec/key';
import type { Context } from '../context';
import type { Key } from '../types';
import { readEntry } from './internal';

export function has(ctx: Context, key: Key): boolean {
  const normalized = normalizeKey(key);
  if (normalized === undefined) return false;

  return readEntry(ctx, ctx.keyCodec.build(normalized)) !== undefined;
}
