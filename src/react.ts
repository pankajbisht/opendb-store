import { useCallback, useEffect, useRef, useState } from 'react';
import type { Key } from './types';

/** What the hook needs. Every store type, including IndexedDB, has it. */
export interface Subscribable {
  get(key: Key, defaultValue: unknown): unknown;
  set(key: Key, value: unknown): unknown;
  remove(key: Key): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe(key: Key, listener: (value: any) => void): () => void;
}

/**
 * Reads a stored value and keeps it current, including changes from other
 * tabs. The first render uses `fallback`, so server and client output match.
 * Works with every store type, including IndexedDB.
 */
export function useStored<T>(
  store: Subscribable,
  key: Key,
  fallback: T
): [value: T, setValue: (next: T) => void, remove: () => void] {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    let active = true;

    Promise.resolve(store.get(key, fallbackRef.current)).then((current) => {
      if (active) setValue(current as T);
    });

    const stop = store.subscribe(key, (next: T | null) => {
      if (active) setValue(next ?? fallbackRef.current);
    });

    return () => {
      active = false;
      stop();
    };
  }, [store, key]);

  const update = useCallback(
    (next: T) => void store.set(key, next),
    [store, key]
  );
  const remove = useCallback(() => void store.remove(key), [store, key]);

  return [value, update, remove];
}
