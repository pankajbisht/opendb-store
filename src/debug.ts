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

type StoreMap = Record<string, Store>;

const round = (value: number): number => Math.round(value * 100) / 100;

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

/** Measures a store and returns the figures without printing anything. */
export function inspect(store: Store): StoreReport {
  // Listing keys first removes expired entries, so the totals exclude them.
  const keys = store.keys();
  const used = store.used();
  const capacity = store.capacity();
  const free = store.free();

  const entries = keys
    .map((key) => {
      const size = store.size(key);
      return {
        key,
        size,
        share: used ? round((size / used) * 100) : 0,
        expiresIn: store.ttl(key),
      };
    })
    .sort((a, b) => b.size - a.size);

  return {
    namespace: store.namespace,
    count: entries.length,
    used,
    free,
    capacity,
    percentUsed: round(((capacity - free) / capacity) * 100),
    entries,
  };
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

function isStore(target: Store | StoreMap): target is Store {
  return typeof (target as Store).keys === 'function';
}

/**
 * Prints a size report to the console and returns the figures. Pass one store,
 * or several, such as the default `db` export.
 */
export function debug(target: Store, options?: DebugOptions): StoreReport;
export function debug(
  target: StoreMap,
  options?: DebugOptions
): Record<string, StoreReport>;
export function debug(
  target: Store | StoreMap,
  options: DebugOptions = {}
): StoreReport | Record<string, StoreReport> {
  const { warnAt = 80, label } = options;

  const run = (store: Store, name: string): StoreReport => {
    const report = inspect(store);
    print(report, name, warnAt);
    return report;
  };

  if (isStore(target)) return run(target, label ?? target.namespace);

  return Object.fromEntries(
    Object.entries(target).map(([name, store]) => [name, run(store, name)])
  );
}
