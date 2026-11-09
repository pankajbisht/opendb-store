import { isExpired, sanitizeEntry, type Entry } from '../codec/entry';
import { createKeyCodec, normalizeKey } from '../codec/key';
import { isQuotaError } from '../errors';
import { requireKey } from '../operations/internal';
import { isPlainObject } from '../operations/patch';
import { buildEntry } from '../operations/set';
import { format } from '../operations/size';
import {
  assertCommonOptions,
  assertOption,
  createReporter,
  isNonEmptyString,
} from '../options';
import type { FormatOptions, Key, SetOptions } from '../types';
import {
  DELETE,
  getBackend,
  KEEP,
  type Backend,
  type StoredRecord,
  type Updater,
} from './backend';
import { estimateSize } from './estimate';
import {
  activeSubscription,
  addSubscription,
  announce,
  runListener,
  type Subscription,
} from './events';
import type { AsyncStore, IndexedStoreOptions } from './types';

// Used only if the browser cannot report its quota.
const DEFAULT_CAPACITY = 50 * 1024 * 1024;

export function createIndexedStore(
  options: IndexedStoreOptions = {}
): AsyncStore {
  const {
    namespace = 'app',
    separator = '.',
    database = 'opendb-store',
    defaultTTL,
    version,
    migrate,
    serializer,
    onError,
  } = options;

  assertCommonOptions(namespace, separator, defaultTTL, version, migrate);
  assertOption(isNonEmptyString(database), 'database');

  const report = createReporter(onError);
  const keyCodec = createKeyCodec(namespace, separator);
  const prefix = keyCodec.build('');
  const writeContext = { report, defaultTTL, version };

  let resolved: Promise<Backend> | undefined;
  const backend = (): Promise<Backend> => {
    resolved ??= getBackend(database).then((found) => {
      if (found.fallback) {
        report('STORAGE_UNAVAILABLE', 'No IndexedDB; using memory');
      }
      return found;
    });
    return resolved;
  };

  /** Runs an operation so that its promise never rejects. */
  async function guard<T>(fallback: T, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      report('STORAGE_UNAVAILABLE', 'IndexedDB failed', undefined, error);
      return fallback;
    }
  }

  function toEntry(
    rawKey: string,
    record: StoredRecord | undefined,
    reportCorrupt = false
  ): Entry | undefined {
    if (record === undefined) return undefined;

    try {
      return sanitizeEntry(
        serializer
          ? { ...record, value: serializer.deserialize(record.value as string) }
          : record
      );
    } catch (error) {
      if (reportCorrupt) {
        report('CORRUPT_VALUE', `Cannot decode "${rawKey}"`, rawKey, error);
      }
      return undefined;
    }
  }

  // Only the value is serialized. Expiry stays readable so it can be indexed.
  const toRecord = (entry: Entry): StoredRecord =>
    serializer
      ? { ...entry, value: serializer.serialize(entry.value) }
      : { ...entry };

  const needsUpgrade = (entry: Entry): boolean =>
    Boolean(version && migrate && (entry.v ?? 0) < version);

  /** Inside a transaction: expires or upgrades a record, noting the result. */
  function settle(
    rawKey: string,
    record: StoredRecord | undefined,
    live: Map<string, Entry>,
    removed: string[]
  ): ReturnType<Updater> {
    const entry = toEntry(rawKey, record);
    if (!entry) return KEEP;

    if (isExpired(entry)) {
      removed.push(rawKey);
      return DELETE;
    }

    if (!needsUpgrade(entry)) {
      live.set(rawKey, entry);
      return KEEP;
    }

    try {
      const value = migrate?.(
        entry.value,
        entry.v ?? 0,
        keyCodec.parse(rawKey)
      );

      if (value === undefined) {
        removed.push(rawKey);
        return DELETE;
      }

      const upgraded = { ...entry, value, v: version };
      live.set(rawKey, upgraded);
      return toRecord(upgraded);
    } catch (error) {
      report('MIGRATION_FAILED', `Cannot migrate "${rawKey}"`, rawKey, error);
      return KEEP;
    }
  }

  async function refresh(rawKeys: string[]): Promise<Map<string, Entry>> {
    const live = new Map<string, Entry>();
    const removed: string[] = [];

    await (
      await backend()
    ).update(rawKeys, (rawKey, record) =>
      settle(rawKey, record, live, removed)
    );
    announce(database, removed);

    return live;
  }

  async function readEntry(
    rawKey: string,
    reportCorrupt = false
  ): Promise<Entry | undefined> {
    const record = await (await backend()).read(rawKey);
    const entry = toEntry(rawKey, record, reportCorrupt);

    if (!entry) return undefined;
    if (!isExpired(entry) && !needsUpgrade(entry)) return entry;

    return (await refresh([rawKey])).get(rawKey);
  }

  async function liveEntries(): Promise<[string, Entry][]> {
    const rows = await (await backend()).scan(prefix);
    const stale: string[] = [];
    const entries = new Map<string, Entry>();

    for (const [rawKey, record] of rows) {
      const entry = toEntry(rawKey, record);
      if (!entry) continue;
      if (isExpired(entry) || needsUpgrade(entry)) stale.push(rawKey);
      else entries.set(rawKey, entry);
    }

    if (stale.length) {
      (await refresh(stale)).forEach((entry, rawKey) =>
        entries.set(rawKey, entry)
      );
    }

    return rows.flatMap(([rawKey]): [string, Entry][] => {
      const entry = entries.get(rawKey);
      return entry ? [[keyCodec.parse(rawKey), entry]] : [];
    });
  }

  const purge = async (): Promise<number> => {
    const removed = await (await backend()).purge(prefix, Date.now());
    announce(database, removed);
    return removed.length;
  };

  function reportWriteFailure(rawKey: string, error: unknown): false {
    if ((error as Error)?.name === 'DataCloneError') {
      report('SERIALIZE_FAILED', `Cannot store "${rawKey}"`, rawKey, error);
    } else {
      const code = isQuotaError(error)
        ? 'QUOTA_EXCEEDED'
        : 'STORAGE_UNAVAILABLE';
      report(code, `Failed to write "${rawKey}"`, rawKey, error);
    }
    return false;
  }

  async function writeEntry(
    rawKey: string,
    entry: Entry,
    origin?: Subscription
  ): Promise<boolean> {
    let record: StoredRecord;

    try {
      record = toRecord(entry);
    } catch (error) {
      report('SERIALIZE_FAILED', `Cannot store "${rawKey}"`, rawKey, error);
      return false;
    }

    try {
      const found = await backend();

      try {
        await found.write(rawKey, record);
      } catch (error) {
        // Dead entries may be what is filling the storage.
        if (!isQuotaError(error) || !(await purge())) throw error;
        await found.write(rawKey, record);
      }

      announce(database, [rawKey], origin);
      return true;
    } catch (error) {
      return reportWriteFailure(rawKey, error);
    }
  }

  async function set(
    key: Key,
    value: unknown,
    opts?: SetOptions
  ): Promise<boolean> {
    const origin = activeSubscription();
    const normalized = requireKey(writeContext, key);
    if (normalized === undefined) return false;

    const entry = buildEntry(writeContext, normalized, value, opts);
    return entry
      ? writeEntry(keyCodec.build(normalized), entry, origin)
      : false;
  }

  async function patch(
    key: Key,
    partial: Record<string, unknown>
  ): Promise<boolean> {
    const origin = activeSubscription();
    const normalized = requireKey(writeContext, key);
    if (normalized === undefined) return false;

    if (!isPlainObject(partial)) {
      report('INVALID_ARGUMENT', '`patch` needs a plain object', normalized);
      return false;
    }

    const rawKey = keyCodec.build(normalized);
    const live = new Map<string, Entry>();
    const removed: string[] = [];
    let patched = false;

    try {
      // Read and write share one transaction, so concurrent patches all land.
      await (
        await backend()
      ).update([rawKey], (_, record) => {
        const settled = settle(rawKey, record, live, removed);
        const entry = live.get(rawKey);

        if (!entry) {
          const created = buildEntry(writeContext, normalized, partial);
          patched = Boolean(created);
          return created ? toRecord(created) : settled;
        }

        if (!isPlainObject(entry.value)) {
          report(
            'INVALID_ARGUMENT',
            `Cannot patch non-object "${normalized}"`,
            normalized
          );
          return settled;
        }

        patched = true;
        return toRecord({
          ...entry,
          value: { ...entry.value, ...partial },
        });
      });
    } catch (error) {
      return reportWriteFailure(rawKey, error);
    }

    announce(database, patched ? [rawKey] : removed, origin);
    return patched;
  }

  async function remove(key: Key): Promise<unknown> {
    const origin = activeSubscription();
    const normalized = requireKey(writeContext, key);
    if (normalized === undefined) return null;

    const rawKey = keyCodec.build(normalized);

    return guard(null, async () => {
      const live = new Map<string, Entry>();

      await (
        await backend()
      ).update([rawKey], (_, record) => {
        settle(rawKey, record, live, []);
        return record === undefined ? KEEP : DELETE;
      });
      announce(database, [rawKey], origin);

      return live.get(rawKey)?.value ?? null;
    });
  }

  // Records are decoded so this always agrees with `has` and `get`.
  const keys = (): Promise<string[]> =>
    guard<string[]>([], async () => (await liveEntries()).map(([key]) => key));

  const estimateUsed = async (): Promise<number> =>
    (await liveEntries()).reduce(
      (total, [key, entry]) =>
        total + (prefix.length + key.length) * 2 + estimateSize(entry.value),
      0
    );

  async function quota(): Promise<StorageEstimate> {
    try {
      return await navigator.storage.estimate();
    } catch {
      return {};
    }
  }

  const capacityFrom = (
    estimate: StorageEstimate,
    opts?: FormatOptions
  ): number => opts?.capacity || estimate.quota || DEFAULT_CAPACITY;

  function subscribe(key: Key, listener: (value: never) => void): () => void {
    const normalized = requireKey(writeContext, key);
    if (normalized === undefined) return () => {};

    const rawKey = keyCodec.build(normalized);

    const subscription: Subscription = {
      rawKey,
      async notify() {
        try {
          const entry = await readEntry(rawKey);
          const value = entry ? entry.value : null;
          runListener(subscription, () => listener(value as never));
        } catch (error) {
          report('LISTENER_FAILED', 'Listener failed', normalized, error);
        }
      },
    };

    return addSubscription(database, subscription);
  }

  const store = {
    async: true,
    namespace,
    database,
    get count() {
      return keys().then((found) => found.length);
    },
    get: (key: Key, defaultValue: unknown = null) =>
      guard(defaultValue, async () => {
        const normalized = normalizeKey(key);
        if (normalized === undefined) return defaultValue;

        const entry = await readEntry(keyCodec.build(normalized), true);
        return entry ? entry.value : defaultValue;
      }),
    set,
    has: (key: Key) =>
      guard(false, async () => {
        const normalized = normalizeKey(key);
        return (
          normalized !== undefined &&
          (await readEntry(keyCodec.build(normalized))) !== undefined
        );
      }),
    patch,
    remove,
    clear: () =>
      guard(undefined, async () => {
        announce(database, await (await backend()).removePrefix(prefix));
      }),
    key: (index: number) => keys().then((found) => found[index] ?? null),
    keys,
    values: () =>
      guard<unknown[]>([], async () =>
        (await liveEntries()).map(([, entry]) => entry.value)
      ),
    entries: () =>
      guard<[string, unknown][]>([], async () =>
        (await liveEntries()).map(([key, entry]) => [key, entry.value])
      ),
    size: (key: Key, opts?: FormatOptions) =>
      guard<number | string>(0, async () => {
        const normalized = normalizeKey(key);
        const entry =
          normalized === undefined
            ? undefined
            : await readEntry(keyCodec.build(normalized));

        return format(
          entry
            ? (prefix.length + (normalized as string).length) * 2 +
                estimateSize(entry.value)
            : 0,
          opts
        );
      }),
    used: (opts?: FormatOptions) =>
      guard<number | string>(0, async () => format(await estimateUsed(), opts)),
    free: (opts?: FormatOptions) =>
      guard<number | string>(0, async () => {
        const estimate = await quota();
        const usage = estimate.usage ?? (await estimateUsed());
        return format(Math.max(capacityFrom(estimate, opts) - usage, 0), opts);
      }),
    capacity: (opts?: FormatOptions) =>
      guard<number | string>(0, async () =>
        format(capacityFrom(await quota(), opts), opts)
      ),
    ttl: (key: Key) =>
      guard<number | null>(null, async () => {
        const normalized = normalizeKey(key);
        const entry =
          normalized === undefined
            ? undefined
            : await readEntry(keyCodec.build(normalized));

        return entry?.expire === undefined ? null : entry.expire - Date.now();
      }),
    purgeExpired: () => guard(0, purge),
    subscribe,
    from: (name: string) => createIndexedStore({ ...options, namespace: name }),
  } as unknown as AsyncStore;

  return Object.freeze(store);
}
