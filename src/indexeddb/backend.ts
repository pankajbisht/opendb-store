export const KEEP = Symbol('keep');
export const DELETE = Symbol('delete');

export type StoredRecord = Record<string, unknown>;
export type Updater = (
  rawKey: string,
  current: StoredRecord | undefined
) => StoredRecord | typeof KEEP | typeof DELETE;

export interface Backend {
  /** True when this is standing in for IndexedDB in a browser. */
  readonly fallback?: boolean;
  read(rawKey: string): Promise<StoredRecord | undefined>;
  write(rawKey: string, record: StoredRecord): Promise<void>;
  /** Reads and rewrites the keys inside one transaction, so it is atomic. */
  update(rawKeys: string[], updater: Updater): Promise<void>;
  scan(prefix: string): Promise<[string, StoredRecord][]>;
  removePrefix(prefix: string): Promise<string[]>;
  purge(prefix: string, now: number): Promise<string[]>;
}

const STORE = 'entries';
const EXPIRY_INDEX = 'expire';
const OPEN_TIMEOUT = 5000;

function prefixRange(prefix: string): IDBKeyRange {
  const last = prefix.length - 1;
  const end =
    prefix.slice(0, last) + String.fromCharCode(prefix.charCodeAt(last) + 1);
  return IDBKeyRange.bound(prefix, end, false, true);
}

const expiredRange = (now: number): IDBKeyRange =>
  IDBKeyRange.upperBound(now, true);

interface Work<T> {
  store: IDBObjectStore;
  done(result: T): void;
  on<R>(request: IDBRequest<R>, callback: (result: R) => void): void;
}

function createIndexedBackend(
  database: string
): Backend & { ready(): Promise<unknown> } {
  let connection: Promise<IDBDatabase> | undefined;

  function connect(): Promise<IDBDatabase> {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      let timedOut = false;

      // Some browsers can leave an open request unanswered forever.
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('Opening IndexedDB timed out'));
      }, OPEN_TIMEOUT);

      request.onupgradeneeded = () => {
        request.result
          .createObjectStore(STORE)
          .createIndex(EXPIRY_INDEX, EXPIRY_INDEX);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;

        if (timedOut) {
          db.close();
          return;
        }

        // Never block another tab that is upgrading or deleting the database.
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        db.onclose = () => {
          connection = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      connection = undefined;
      throw error;
    });

    return connection;
  }

  async function transact<T>(
    mode: IDBTransactionMode,
    work: (context: Work<T>) => void,
    retried = false
  ): Promise<T> {
    const db = await connect();
    let tx: IDBTransaction;

    try {
      tx = db.transaction(STORE, mode);
    } catch (error) {
      // The connection can close between opening it and using it.
      connection = undefined;
      if (retried) throw error;
      return transact(mode, work, true);
    }

    return new Promise<T>((resolve, reject) => {
      let result: T;
      let failure: unknown;

      const fail = (error: unknown): void => {
        failure = error;
        try {
          tx.abort();
        } catch {
          // Already finished.
        }
      };

      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error);

      try {
        work({
          store: tx.objectStore(STORE),
          done: (value) => {
            result = value;
          },
          on: (request, callback) => {
            request.onsuccess = () => {
              try {
                callback(request.result);
              } catch (error) {
                fail(error);
              }
            };
          },
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  return {
    ready: connect,

    read: (rawKey) =>
      transact('readonly', ({ store, done, on }) =>
        on(store.get(rawKey), done)
      ),

    write: (rawKey, record) =>
      transact('readwrite', ({ store }) => {
        store.put(record, rawKey);
      }),

    update: (rawKeys, updater) =>
      transact('readwrite', ({ store, on }) => {
        rawKeys.forEach((rawKey) =>
          on(store.get(rawKey), (current) => {
            const next = updater(rawKey, current);
            if (next === DELETE) store.delete(rawKey);
            else if (next !== KEEP) store.put(next, rawKey);
          })
        );
      }),

    scan: (prefix) =>
      transact('readonly', ({ store, done, on }) => {
        const range = prefixRange(prefix);
        on(store.getAllKeys(range), (keys) =>
          on(store.getAll(range), (values) =>
            done(keys.map((key, index) => [key as string, values[index]]))
          )
        );
      }),

    removePrefix: (prefix) =>
      transact('readwrite', ({ store, done, on }) => {
        const range = prefixRange(prefix);
        on(store.getAllKeys(range), (keys) => {
          done(keys as string[]);
          store.delete(range);
        });
      }),

    purge: (prefix, now) =>
      transact('readwrite', ({ store, done, on }) => {
        on(store.index(EXPIRY_INDEX).getAllKeys(expiredRange(now)), (found) => {
          const own = (found as string[]).filter((key) =>
            key.startsWith(prefix)
          );
          own.forEach((key) => store.delete(key));
          done(own);
        });
      }),
  };
}

const clone = <T>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : value;

function isExpiredRecord(record: StoredRecord, now: number): boolean {
  return typeof record.expire === 'number' && record.expire < now;
}

/** Used when a browser blocks IndexedDB. A tab has one user, so this is safe. */
function createMemoryBackend(): Backend {
  const items = new Map<string, StoredRecord>();
  const ownKeys = (prefix: string): string[] =>
    [...items.keys()].filter((key) => key.startsWith(prefix)).sort();

  return {
    fallback: true,
    read: async (rawKey) => clone(items.get(rawKey)),
    async write(rawKey, record) {
      items.set(rawKey, clone(record));
    },
    async update(rawKeys, updater) {
      for (const rawKey of rawKeys) {
        const next = updater(rawKey, clone(items.get(rawKey)));
        if (next === DELETE) items.delete(rawKey);
        else if (next !== KEEP) items.set(rawKey, clone(next));
      }
    },
    scan: async (prefix) =>
      ownKeys(prefix).map((key) => [
        key,
        clone(items.get(key) as StoredRecord),
      ]),
    async removePrefix(prefix) {
      const own = ownKeys(prefix);
      own.forEach((key) => items.delete(key));
      return own;
    },
    async purge(prefix, now) {
      const own = ownKeys(prefix).filter((key) =>
        isExpiredRecord(items.get(key) as StoredRecord, now)
      );
      own.forEach((key) => items.delete(key));
      return own;
    },
  };
}

// Servers keep nothing: shared memory would leak data between requests.
const serverBackend: Backend = {
  read: async () => undefined,
  write: async () => {
    throw new Error('No storage on the server');
  },
  update: async () => {
    throw new Error('No storage on the server');
  },
  scan: async () => [],
  removePrefix: async () => [],
  purge: async () => [],
};

async function resolveBackend(database: string): Promise<Backend> {
  try {
    if (typeof indexedDB === 'undefined') {
      return typeof window === 'undefined'
        ? serverBackend
        : createMemoryBackend();
    }

    const backend = createIndexedBackend(database);
    await backend.ready();
    return backend;
  } catch {
    // Opening is refused in some private modes and sandboxed frames.
    return createMemoryBackend();
  }
}

const backends = new Map<string, Promise<Backend>>();

/** Stores sharing a database share one connection. */
export function getBackend(database: string): Promise<Backend> {
  let backend = backends.get(database);

  if (!backend) {
    backend = resolveBackend(database);
    backends.set(database, backend);
  }

  return backend;
}
