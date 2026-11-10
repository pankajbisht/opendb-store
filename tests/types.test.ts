import { expectTypeOf, test } from 'vitest';
import type { StoreReport } from '../src/debug';
import { debug, inspect } from '../src/debug';
import type { Cache } from '../src/cache';
import { createCache } from '../src/cache';
import db, { createStore } from '../src/index';
import type { AsyncStore } from '../src/indexeddb/index';
import { where } from '../src/query';
import { useStored } from '../src/react';

// These assertions are checked by `tsc`. The calls never run.
const never = false as boolean;

test('public types', () => {
  if (!never) return;

  expectTypeOf(db.local.get('k', 'text')).toEqualTypeOf<string>();
  expectTypeOf(db.local.get<number>('k')).toEqualTypeOf<number | null>();
  expectTypeOf(db.local.set('k', 1)).toEqualTypeOf<boolean>();
  expectTypeOf(db.cookie.count).toEqualTypeOf<number>();

  const idb = {} as AsyncStore;
  expectTypeOf(idb.get('k', 'text')).toEqualTypeOf<Promise<string>>();
  expectTypeOf(idb.count).toEqualTypeOf<Promise<number>>();
  expectTypeOf(idb.getMany<number>(['a'])).toEqualTypeOf<
    Promise<(number | null)[]>
  >();
  expectTypeOf(idb.subscribe('k', () => {})).toEqualTypeOf<() => void>();

  expectTypeOf(where(db.local, 'k', {})).toEqualTypeOf<
    Record<string, unknown>[]
  >();
  expectTypeOf(where(idb, 'k', {})).toEqualTypeOf<
    Promise<Record<string, unknown>[]>
  >();

  expectTypeOf(inspect(db.local)).toEqualTypeOf<StoreReport>();
  expectTypeOf(inspect(idb)).toEqualTypeOf<Promise<StoreReport>>();
  expectTypeOf(debug(db)).toEqualTypeOf<Record<string, StoreReport>>();
  expectTypeOf(debug({ idb })).toEqualTypeOf<
    Promise<Record<string, StoreReport>>
  >();

  expectTypeOf(createCache(db.local, { maxEntries: 2 })).toEqualTypeOf<Cache>();
  expectTypeOf(useStored(db.local, 'k', 1)[0]).toEqualTypeOf<number>();
  expectTypeOf(useStored(idb, 'k', 'x')[1]).toEqualTypeOf<
    (next: string) => void
  >();

  // @ts-expect-error IndexedDB has its own factory.
  createStore({ storage: 'indexeddb' });
  // @ts-expect-error Unknown options are caught at compile time.
  db.local.set('k', 1, { expires: 5 });
});
