import type { AsyncStore } from './indexeddb/types';
import type { Store } from './types';

export interface DebugEntry {
  key: string;
  /** Size of this entry. */
  size: number;
  /** Percentage of this namespace's usage. */
  share: number;
  /** Milliseconds until expiry, or `null` if permanent. */
  expiresIn: number | null;
}

export interface StoreReport {
  namespace: string;
  count: number;
  /** Size of this namespace. */
  used: number;
  /** Estimated room left, shared by everything on this origin. */
  free: number;
  /** Estimated total capacity. */
  capacity: number;
  /** Percentage of capacity used by the whole origin. */
  percentUsed: number;
  /** Largest first. */
  entries: DebugEntry[];
}

export interface DebugOptions {
  /** Warn when the origin is at least this percent full. Defaults to 80. */
  warnAt?: number;
  /** Name shown in the output. Defaults to the namespace. */
  label?: string;
}

export type AnyStore = Store | AsyncStore;
export type StoreMap = Record<string, Store>;
export type AnyStoreMap = Record<string, AnyStore>;

const round = (value: number): number => Math.round(value * 100) / 100;

// Reading a value this large from local or session storage blocks the page.
const LARGE_ENTRY = 512 * 1024;

function warnLarge(report: StoreReport, label: string): void {
  const large = report.entries.filter((entry) => entry.size > LARGE_ENTRY);
  if (!large.length) return;

  console.warn(
    `[opendb-store] ${label}: ${large.map((entry) => entry.key).join(', ')} ` +
      `${large.length === 1 ? 'is' : 'are'} over 512 KB. Reading ` +
      `${large.length === 1 ? 'it' : 'them'} blocks the page; ` +
      'consider IndexedDB or compression.'
  );
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'never';
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function buildReport(
  namespace: string,
  sizes: { used: number; free: number; capacity: number },
  rows: Omit<DebugEntry, 'share'>[]
): StoreReport {
  const { used, free, capacity } = sizes;

  return {
    namespace,
    count: rows.length,
    used,
    free,
    capacity,
    percentUsed: round(((capacity - free) / capacity) * 100),
    entries: rows
      .map((row) => ({
        ...row,
        share: used ? round((row.size / used) * 100) : 0,
      }))
      .sort((a, b) => b.size - a.size),
  };
}

function inspectSync(store: Store): StoreReport {
  // Listing keys first removes expired entries, so the totals exclude them.
  const keys = store.keys();
  const sizes = {
    used: store.used(),
    free: store.free(),
    capacity: store.capacity(),
  };

  return buildReport(
    store.namespace,
    sizes,
    keys.map((key) => ({
      key,
      size: store.size(key),
      expiresIn: store.ttl(key),
    }))
  );
}

async function inspectAsync(store: AsyncStore): Promise<StoreReport> {
  const keys = await store.keys();
  const [used, free, capacity, rows] = await Promise.all([
    store.used(),
    store.free(),
    store.capacity(),
    Promise.all(
      keys.map(async (key) => ({
        key,
        size: await store.size(key),
        expiresIn: await store.ttl(key),
      }))
    ),
  ]);

  return buildReport(store.namespace, { used, free, capacity }, rows);
}

const isAsync = (store: AnyStore): store is AsyncStore => 'async' in store;

/** Measures a store and returns the figures without printing anything. */
export function inspect(store: AsyncStore): Promise<StoreReport>;
export function inspect(store: Store): StoreReport;
export function inspect(store: AnyStore): StoreReport | Promise<StoreReport> {
  return isAsync(store) ? inspectAsync(store) : inspectSync(store);
}

function print(report: StoreReport, label: string, warnAt: number): void {
  console.group(
    `[opendb-store] ${label}: ${formatSize(report.used)} in ${report.count} ` +
      `${report.count === 1 ? 'entry' : 'entries'}, origin ` +
      `${report.percentUsed}% of ~${formatSize(report.capacity)}`
  );

  if (report.entries.length) {
    console.table(
      report.entries.map(({ key, size, share, expiresIn }) => ({
        key,
        size: formatSize(size),
        share: `${share}%`,
        expires: formatDuration(expiresIn),
      }))
    );
  }

  console.groupEnd();

  if (report.percentUsed >= warnAt) {
    console.warn(
      `[opendb-store] ${label} is ${report.percentUsed}% full ` +
        `(${formatSize(report.free)} left)`
    );
  }
}

function isStore(target: AnyStore | AnyStoreMap): target is AnyStore {
  return typeof (target as Store).keys === 'function';
}

/**
 * Prints a size report to the console and returns the figures. Pass one store,
 * or several, such as the default `db` export. Anything including an IndexedDB
 * store returns a promise.
 */
export function debug(
  target: AsyncStore,
  options?: DebugOptions
): Promise<StoreReport>;
export function debug(target: Store, options?: DebugOptions): StoreReport;
export function debug(
  target: StoreMap,
  options?: DebugOptions
): Record<string, StoreReport>;
export function debug(
  target: AnyStoreMap,
  options?: DebugOptions
): Promise<Record<string, StoreReport>>;
export function debug(
  target: AnyStore | AnyStoreMap,
  options: DebugOptions = {}
): unknown {
  const { warnAt = 80, label } = options;

  const run = (
    store: AnyStore,
    name: string
  ): StoreReport | Promise<StoreReport> => {
    const finish = (report: StoreReport): StoreReport => {
      print(report, name, warnAt);
      if (!isAsync(store)) warnLarge(report, name);
      return report;
    };

    return isAsync(store)
      ? inspectAsync(store).then(finish)
      : finish(inspectSync(store));
  };

  if (isStore(target)) return run(target, label ?? target.namespace);

  const names = Object.keys(target);
  const reports = names.map((name) => run(target[name] as AnyStore, name));
  const assemble = (done: StoreReport[]): Record<string, StoreReport> =>
    Object.fromEntries(
      names.map((name, index) => [name, done[index] as StoreReport])
    );

  return Object.values(target).some(isAsync)
    ? Promise.all(reports).then(assemble)
    : assemble(reports as StoreReport[]);
}
