import {
  decodeEntry,
  isExpired,
  peekMeta,
  type Entry,
  type EntryMeta,
} from '../codec/entry';
import { normalizeKey } from '../codec/key';
import type { Context } from '../context';
import { isQuotaError } from '../errors';
import { emit } from './events';

/** Applies the `validate` option, reporting values it rejects. */
export function accepts(
  ctx: Pick<Context, 'validate' | 'report'>,
  key: string,
  value: unknown
): boolean {
  if (!ctx.validate) return true;

  let valid = false;
  let cause: unknown;

  try {
    valid = Boolean(ctx.validate(value, key));
  } catch (error) {
    cause = error;
  }

  if (!valid) ctx.report('VALIDATION_FAILED', `Rejected "${key}"`, key, cause);
  return valid;
}

/** Normalizes a key for a write, reporting it if invalid. */
export function requireKey(
  ctx: Pick<Context, 'report'>,
  key: unknown
): string | undefined {
  const normalized = normalizeKey(key);
  if (normalized === undefined) {
    ctx.report('INVALID_KEY', `Invalid key: ${typeof key}`);
  }
  return normalized;
}

/** Every raw key in storage, in any namespace. Copied so callers can remove while looping. */
export function allRawKeys(ctx: Context): string[] {
  const keys: string[] = [];

  try {
    const storage = ctx.adapter();

    for (let index = 0, total = storage.length; index < total; index++) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
  } catch (error) {
    ctx.report('STORAGE_UNAVAILABLE', 'List failed', undefined, error);
  }

  return keys;
}

export function rawKeys(ctx: Context): string[] {
  return allRawKeys(ctx).filter(ctx.keyCodec.owns);
}

export function rawLength(ctx: Context, rawKey: string): number {
  try {
    const storage = ctx.adapter();
    const value = storage.getItem(rawKey) ?? '';

    return storage.measure
      ? storage.measure(rawKey, value)
      : rawKey.length + value.length;
  } catch {
    return 0;
  }
}

export function removeRaw(ctx: Context, rawKey: string): void {
  try {
    ctx.adapter().removeItem(rawKey);
    emit(ctx, rawKey);
  } catch (error) {
    ctx.report(
      'STORAGE_UNAVAILABLE',
      `Failed to remove "${rawKey}"`,
      rawKey,
      error
    );
  }
}

/** Reads an unexpired entry as stored, deleting it if it has expired. */
function readCurrent(
  ctx: Context,
  rawKey: string,
  reportCorrupt: boolean
): Entry | undefined {
  let entry: Entry | undefined;

  try {
    const raw = ctx.adapter().getItem(rawKey);
    if (raw === null) return undefined;
    entry = decodeEntry(ctx.serializer, raw);
  } catch (error) {
    if (reportCorrupt)
      ctx.report('CORRUPT_VALUE', `Cannot decode "${rawKey}"`, rawKey, error);
    return undefined;
  }

  if (entry && isExpired(entry)) {
    removeRaw(ctx, rawKey);
    return undefined;
  }

  return entry;
}

const needsUpgrade = (ctx: Context, v: number | undefined): boolean =>
  Boolean(ctx.version && ctx.migrate && (v ?? 0) < ctx.version);

function upgrade(
  ctx: Context,
  rawKey: string,
  entry: Entry
): Entry | undefined {
  const { version, migrate } = ctx;
  const fromVersion = entry.v ?? 0;
  if (!migrate || !needsUpgrade(ctx, entry.v)) return entry;

  try {
    const value = migrate(entry.value, fromVersion, ctx.keyCodec.parse(rawKey));

    if (value === undefined) {
      removeRaw(ctx, rawKey);
      return undefined;
    }

    const upgraded = { ...entry, value, v: version };
    writeEntry(ctx, rawKey, upgraded, true);
    return upgraded;
  } catch (error) {
    ctx.report('MIGRATION_FAILED', `Cannot migrate "${rawKey}"`, rawKey, error);
    return undefined;
  }
}

/** Reads a live entry at the current schema version. */
export function readEntry(
  ctx: Context,
  rawKey: string,
  reportCorrupt = false
): Entry | undefined {
  const entry = readCurrent(ctx, rawKey, reportCorrupt);
  return entry && upgrade(ctx, rawKey, entry);
}

/**
 * Reads only the expiry and version of a live entry. Large values are not
 * decoded unless the stored text is unusual or the entry needs a migration.
 */
export function readMeta(
  ctx: Context,
  rawKey: string,
  migrate = true
): EntryMeta | undefined {
  let raw: string | null;

  try {
    raw = ctx.adapter().getItem(rawKey);
  } catch {
    return undefined;
  }

  const meta = raw === null ? undefined : peekMeta(raw);

  if (!meta) {
    return raw === null
      ? undefined
      : migrate
        ? readEntry(ctx, rawKey)
        : readCurrent(ctx, rawKey, false);
  }

  if (isExpired(meta)) {
    removeRaw(ctx, rawKey);
    return undefined;
  }

  return migrate && needsUpgrade(ctx, meta.v) ? readEntry(ctx, rawKey) : meta;
}

export function liveKeys(ctx: Context): string[] {
  return rawKeys(ctx)
    .filter((rawKey) => readMeta(ctx, rawKey))
    .map(ctx.keyCodec.parse);
}

export function liveEntries(ctx: Context): [string, Entry][] {
  const result: [string, Entry][] = [];

  for (const rawKey of rawKeys(ctx)) {
    const entry = readEntry(ctx, rawKey);
    const key = ctx.keyCodec.parse(rawKey);
    if (entry && accepts(ctx, key, entry.value)) result.push([key, entry]);
  }

  return result;
}

export function purgeExpired(ctx: Context): number {
  const keys = rawKeys(ctx);
  keys.forEach((rawKey) => readMeta(ctx, rawKey, false));
  return keys.length - rawKeys(ctx).length;
}

export function writeEntry(
  ctx: Context,
  rawKey: string,
  entry: Entry,
  silent = false
): boolean {
  let serialized: string;

  try {
    serialized = ctx.serializer.serialize(entry);
  } catch (error) {
    ctx.report(
      'SERIALIZE_FAILED',
      `Cannot serialize "${rawKey}"`,
      rawKey,
      error
    );
    return false;
  }

  const write = (): void =>
    ctx.adapter().setItem(rawKey, serialized, { expire: entry.expire });

  try {
    try {
      write();
    } catch (error) {
      // Dead entries may be what is filling the storage.
      if (!isQuotaError(error) || !purgeExpired(ctx)) throw error;
      write();
    }
    if (!silent) emit(ctx, rawKey);
    return true;
  } catch (error) {
    const code = isQuotaError(error) ? 'QUOTA_EXCEEDED' : 'STORAGE_UNAVAILABLE';
    ctx.report(code, `Failed to write "${rawKey}"`, rawKey, error);
    return false;
  }
}
