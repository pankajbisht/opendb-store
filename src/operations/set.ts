import { isValidTTL, type Entry } from '../codec/entry';
import type { Context } from '../context';
import type { Key, SetOptions } from '../types';
import { requireKey, writeEntry } from './internal';

function isStorable(value: unknown): boolean {
  return (
    value !== undefined &&
    typeof value !== 'function' &&
    typeof value !== 'symbol'
  );
}

export function set(
  ctx: Context,
  key: Key,
  value: unknown,
  options?: SetOptions
): boolean {
  const normalized = requireKey(ctx, key);
  if (normalized === undefined) return false;

  const opts = options ?? {};
  for (const name of Object.keys(opts)) {
    if (name !== 'expire') {
      ctx.report(
        'INVALID_ARGUMENT',
        `Unknown option "${name}" was ignored`,
        normalized
      );
    }
  }

  const ttl = opts.expire === undefined ? ctx.defaultTTL : opts.expire;
  if (ttl !== undefined && !isValidTTL(ttl)) {
    ctx.report(
      'INVALID_ARGUMENT',
      '`expire` must be a positive number',
      normalized
    );
    return false;
  }

  if (!isStorable(value)) {
    ctx.report(
      'SERIALIZE_FAILED',
      `A ${typeof value} cannot be stored`,
      normalized
    );
    return false;
  }

  const entry: Entry = { value };
  if (ttl !== undefined) entry.expire = Date.now() + ttl;
  if (ctx.version) entry.v = ctx.version;

  return writeEntry(ctx, ctx.keyCodec.build(normalized), entry);
}
