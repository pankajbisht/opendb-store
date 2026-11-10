import type { Context } from '../context';
import { liveEntries, liveKeys } from './internal';

export function keys(ctx: Context): string[] {
  return liveKeys(ctx);
}

export function keyAt(ctx: Context, index: number): string | null {
  return keys(ctx)[index] ?? null;
}

export function values(ctx: Context): unknown[] {
  return liveEntries(ctx).map(([, entry]) => entry.value);
}

export function entries(ctx: Context): [string, unknown][] {
  return liveEntries(ctx).map(([key, entry]) => [key, entry.value]);
}
