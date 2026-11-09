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

/** Validates a write and builds its entry, reporting why if it cannot. */
export function buildEntry(
  ctx: Pick<Context, 'report' | 'defaultTTL' | 'version'>,
  key: string,
  value: unknown,
  options?: SetOptions
): Entry | undefined {
  const opts = options ?? {};
  for (const name of Object.keys(opts)) {
    if (name !== 'expire') {
      ctx.report('INVALID_ARGUMENT', `Unknown option "${name}"`, key);
    }
  }

  const ttl = opts.expire === undefined ? ctx.defaultTTL : opts.expire;
  if (ttl !== undefined && !isValidTTL(ttl)) {
    ctx.report('INVALID_ARGUMENT', '`expire` must be positive', key);
    return undefined;
  }

  if (!isStorable(value)) {
    ctx.report('SERIALIZE_FAILED', `A ${typeof value} cannot be stored`, key);
    return undefined;
  }

  const entry: Entry = { value };
  if (ttl !== undefined) entry.expire = Date.now() + ttl;
  if (ctx.version) entry.v = ctx.version;

  return entry;
}

export function set(
  ctx: Context,
  key: Key,
  value: unknown,
  options?: SetOptions
): boolean {
  const normalized = requireKey(ctx, key);
  if (normalized === undefined) return false;

  const entry = buildEntry(ctx, normalized, value, options);
  return entry ? writeEntry(ctx, ctx.keyCodec.build(normalized), entry) : false;
}
