import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { debug, inspect } from '../src/debug';
import { createMemoryAdapter } from '../src/adapters/memory';
import db, { createStore } from '../src/index';

describe('debug tools', () => {
  let group: ReturnType<typeof vi.spyOn>;
  let table: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  const store = () => createStore({ storage: createMemoryAdapter() });

  beforeEach(() => {
    group = vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    table = vi.spyOn(console, 'table').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('inspect', () => {
    test('reports totals and sorts entries largest first', () => {
      const s = store();
      s.set('small', 1);
      s.set('large', 'x'.repeat(1000));

      const report = inspect(s);

      expect(report.namespace).toBe('app');
      expect(report.count).toBe(2);
      expect(report.used).toBe(s.used());
      expect(report.free).toBe(s.free());
      expect(report.capacity).toBe(s.capacity());
      expect(report.entries.map((e) => e.key)).toEqual(['large', 'small']);
    });

    test('shares add up to the namespace total', () => {
      const s = store();
      s.set('a', 'aaaa');
      s.set('b', 'bbbbbbbb');
      const total = inspect(s).entries.reduce((n, e) => n + e.share, 0);
      expect(total).toBeCloseTo(100, 0);
    });

    test('percentUsed covers the whole origin', () => {
      const memory = createMemoryAdapter();
      const a = createStore({ storage: memory, namespace: 'a' });
      const b = createStore({ storage: memory, namespace: 'b' });
      b.set('k', 'x'.repeat(52_428));

      expect(inspect(a).used).toBe(0);
      expect(inspect(a).percentUsed).toBeCloseTo(1, 1);
    });

    test('an empty store reports zeros', () => {
      expect(inspect(store())).toMatchObject({
        count: 0,
        used: 0,
        percentUsed: 0,
        entries: [],
      });
    });

    test('leaves out expired entries', () => {
      vi.useFakeTimers();
      const s = store();
      s.set('dead', 'x'.repeat(100), { expire: 1000 });
      s.set('live', 1);
      vi.advanceTimersByTime(2000);

      const report = inspect(s);
      expect(report.entries.map((e) => e.key)).toEqual(['live']);
      expect(report.used).toBe(s.size('live'));
    });

    test('measures cookies by their own limit', () => {
      db.cookie.set('debug', 'value');
      const report = inspect(db.cookie);

      expect(report.capacity).toBe(4096 * 50);
      expect(report.count).toBe(1);
      db.cookie.clear();
    });
  });

  describe('debug', () => {
    test('prints a summary and a table, and returns the report', () => {
      const s = store();
      s.set('k', 'v');

      const report = debug(s);

      expect(group.mock.calls[0]?.[0]).toMatch(
        /^\[opendb-store\] app: \d+ B in 1 entry, origin [\d.]+% of ~5\.00 MB$/
      );
      expect(table).toHaveBeenCalledWith([
        expect.objectContaining({ key: 'k', expires: 'never', share: '100%' }),
      ]);
      expect(report.count).toBe(1);
    });

    test('uses a custom label and pluralizes', () => {
      const s = store();
      s.set('a', 1);
      s.set('b', 2);
      debug(s, { label: 'Cart' });
      expect(group.mock.calls[0]?.[0]).toContain('Cart: ');
      expect(group.mock.calls[0]?.[0]).toContain('2 entries');
    });

    test('skips the table for an empty store', () => {
      debug(store());
      expect(table).not.toHaveBeenCalled();
    });

    test.each([
      [500, /^500 B$/],
      [5000, /KB$/],
      [2 * 1024 * 1024, /MB$/],
    ])('formats a size of about %i', (length, pattern) => {
      const s = store();
      s.set('k', 'x'.repeat(length));
      debug(s);
      const size = (table.mock.calls[0]?.[0] as { size: string }[])[0]?.size;
      expect(size).toMatch(length === 500 ? /B$/ : pattern);
    });

    test.each([
      [30_000, '30s'],
      [300_000, '5m'],
      [7_200_000, '2h'],
      [172_800_000, '2d'],
    ])('formats an expiry of %i ms', (expire, expected) => {
      vi.useFakeTimers();
      const s = store();
      s.set('k', 1, { expire });
      debug(s);
      expect(table.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ expires: expected }),
      ]);
    });

    test('warns once usage passes the threshold', () => {
      const s = store();
      s.set('k', 'x'.repeat(4_500_000));

      debug(s);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('% full'));
    });

    test('stays quiet below the threshold and honours warnAt', () => {
      const s = store();
      ['a', 'b', 'c'].forEach((key) => s.set(key, 'x'.repeat(300_000)));

      debug(s);
      expect(warn).not.toHaveBeenCalled();

      debug(s, { warnAt: 10 });
      expect(warn).toHaveBeenCalledTimes(1);
    });

    test('warns about entries large enough to block the page', () => {
      const s = store();
      s.set('big', 'x'.repeat(600 * 1024));
      s.set('bigger', 'x'.repeat(700 * 1024));
      s.set('small', 1);

      debug(s);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('bigger, big are over 512 KB')
      );
    });

    test('names a single large entry in the singular', () => {
      const s = store();
      s.set('big', 'x'.repeat(600 * 1024));
      debug(s);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('big is over 512 KB. Reading it')
      );
    });

    test('accepts the default db object and reports each store', () => {
      db.local.set('a', 1);

      const reports = debug(db);

      expect(Object.keys(reports)).toEqual(['local', 'session', 'cookie']);
      expect(reports.local?.count).toBe(1);
      expect(group).toHaveBeenCalledTimes(3);
    });
  });
});
