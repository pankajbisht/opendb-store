type Key = string | number;

/** What the hook needs. Every store type, including IndexedDB, has it. */
interface Subscribable {
    get(key: Key, defaultValue: unknown): unknown;
    set(key: Key, value: unknown): unknown;
    remove(key: Key): unknown;
    subscribe(key: Key, listener: (value: any) => void): () => void;
}
/**
 * Reads a stored value and keeps it current, including changes from other
 * tabs. The first render uses `fallback`, so server and client output match.
 * Works with every store type, including IndexedDB.
 */
declare function useStored<T>(store: Subscribable, key: Key, fallback: T): [value: T, setValue: (next: T) => void, remove: () => void];

export { useStored };
export type { Subscribable };
