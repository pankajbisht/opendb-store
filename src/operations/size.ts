import { normalizeKey } from '../codec/key';
import type { Context } from '../context';
import type { FormatOptions, Key } from '../types';
import { allRawKeys, rawKeys, rawLength, readEntry } from './internal';

// Browsers limit storage by UTF-16 code units, so sizes are measured in those.
// The real limit varies by browser and cannot be queried; this is an estimate.
const DEFAULT_CAPACITY = 5 * 1024 * 1024;

const UNIT_DIVISORS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
};

function auto(size: number, unit: boolean | undefined): string {
  const units = ['B', 'KB', 'MB'];
  const index =
    size > 0 ? Math.min(Math.floor(Math.log(size) / Math.log(1024)), 2) : 0;
  return `${(size / Math.pow(1024, index)).toFixed(2)}${unit ? ` ${units[index]}` : ''}`;
}

export function format(size: number, options?: FormatOptions): number | string {
  const opts = options ?? {};
  if (!opts.format && !('unit' in opts)) return size;

  const name = String(opts.format ?? 'MB').toUpperCase();
  const unit = 'unit' in opts ? opts.unit : true;
  const divisor = UNIT_DIVISORS[name];

  if (divisor === undefined) {
    console.warn(
      `Unsupported format "${name}". Falling back to auto-formatting.`
    );
    return auto(size, unit);
  }

  const formatted = (size / divisor).toFixed(2);
  return unit ? `${formatted} ${name}` : formatted;
}

const sum = (ctx: Context, keys: string[]): number =>
  keys.reduce((total, rawKey) => total + rawLength(ctx, rawKey), 0);

const capacityOf = (ctx: Context, options?: FormatOptions): number =>
  options?.capacity || ctx.adapter().capacity || DEFAULT_CAPACITY;

export function ttl(ctx: Context, key: Key): number | null {
  const normalized = normalizeKey(key);
  const entry =
    normalized === undefined
      ? undefined
      : readEntry(ctx, ctx.keyCodec.build(normalized));

  return entry?.expire === undefined ? null : entry.expire - Date.now();
}

export function size(
  ctx: Context,
  key: Key,
  options?: FormatOptions
): number | string {
  const normalized = normalizeKey(key);
  const rawKey =
    normalized === undefined ? undefined : ctx.keyCodec.build(normalized);
  const live = rawKey !== undefined && readEntry(ctx, rawKey) !== undefined;

  return format(live ? rawLength(ctx, rawKey) : 0, options);
}

export function used(ctx: Context, options?: FormatOptions): number | string {
  return format(sum(ctx, rawKeys(ctx)), options);
}

/** The limit is shared by the whole origin, so every key counts here. */
export function free(ctx: Context, options?: FormatOptions): number | string {
  return format(
    Math.max(capacityOf(ctx, options) - sum(ctx, allRawKeys(ctx)), 0),
    options
  );
}

export function capacity(
  ctx: Context,
  options?: FormatOptions
): number | string {
  return format(capacityOf(ctx, options), options);
}
