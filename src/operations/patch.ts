import type { Context } from '../context';
import type { Key } from '../types';
import { readEntry, requireKey, writeEntry } from './internal';
import { set } from './set';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function patch(
  ctx: Context,
  key: Key,
  partial: Record<string, unknown>
): boolean {
  const normalized = requireKey(ctx, key);
  if (normalized === undefined) return false;

  if (!isPlainObject(partial)) {
    ctx.report('INVALID_ARGUMENT', '`patch` needs a plain object', normalized);
    return false;
  }

  const rawKey = ctx.keyCodec.build(normalized);
  const entry = readEntry(ctx, rawKey);
  if (!entry) return set(ctx, normalized, partial);

  if (!isPlainObject(entry.value)) {
    ctx.report(
      'INVALID_ARGUMENT',
      `Cannot patch non-object "${normalized}"`,
      normalized
    );
    return false;
  }

  return writeEntry(ctx, rawKey, {
    ...entry,
    value: { ...entry.value, ...partial },
  });
}
