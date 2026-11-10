import { normalizeKey } from '../codec/key';
import type { Context } from '../context';
import type { Key } from '../types';
import { readMeta } from './internal';

export function has(ctx: Context, key: Key): boolean {
  const normalized = normalizeKey(key);
  if (normalized === undefined) return false;

  return readMeta(ctx, ctx.keyCodec.build(normalized)) !== undefined;
}
