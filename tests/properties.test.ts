import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { createMemoryAdapter } from '../src/adapters/memory';
import { peekMeta } from '../src/codec/entry';
import { createKeyCodec, normalizeKey } from '../src/codec/key';
import { compress, decompress } from '../src/compress';
import { createStore } from '../src/index';

// Any string, including lone surrogates and control characters.
const anyText = fc.string({ unit: 'binary', maxLength: 400 });
const anyCodeUnits = fc
  .array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 300 })
  .map((codes) => String.fromCharCode(...codes));

describe('properties', () => {
  test('compression always round-trips', () => {
    fc.assert(
      fc.property(fc.oneof(anyText, anyCodeUnits), (text) => {
        expect(decompress(compress(text))).toBe(text);
      }),
      { numRuns: 500 }
    );
  });

  test('decompressing any text either works or throws, never hangs', () => {
    fc.assert(
      fc.property(anyCodeUnits, (junk) => {
        try {
          decompress(junk, 10_000);
        } catch {
          // Rejecting damaged input is correct.
        }
      }),
      { numRuns: 500 }
    );
  });

  test('reading metadata never contradicts full decoding', () => {
    const entry = fc.record(
      {
        value: fc.jsonValue(),
        expire: fc.oneof(fc.integer(), fc.double({ noNaN: true })),
        v: fc.integer({ min: 0, max: 1000 }),
      },
      { requiredKeys: ['value'] }
    );

    fc.assert(
      fc.property(entry, (record) => {
        const raw = JSON.stringify(record);
        const meta = peekMeta(raw);
        if (meta === undefined) return;

        const parsed = JSON.parse(raw);
        const expected: Record<string, number> = {};
        if (Number.isFinite(parsed.expire)) expected.expire = parsed.expire;
        if (Number.isFinite(parsed.v)) expected.v = parsed.v;
        expect(meta).toEqual(expected);
      }),
      { numRuns: 1000 }
    );
  });

  test('reading metadata never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.oneof(anyText, anyCodeUnits), (text) => {
        peekMeta(text);
        peekMeta(`{"value":${text}`);
      })
    );
  });

  test('keys round-trip through the namespace prefix', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((ns) => !ns.includes('.')),
        fc.oneof(fc.string(), fc.integer(), fc.double()),
        (namespace, key) => {
          const codec = createKeyCodec(namespace, '.');
          const normalized = normalizeKey(key);
          if (normalized === undefined) return;

          const raw = codec.build(normalized);
          expect(codec.owns(raw)).toBe(true);
          expect(codec.parse(raw)).toBe(normalized);
        }
      )
    );
  });

  test('a store behaves like a simple map', () => {
    const keys = fc.constantFrom('a', 'b', 'c', '5');
    const command = fc.oneof(
      fc.record({ op: fc.constant('set'), key: keys, value: fc.jsonValue() }),
      fc.record({ op: fc.constant('remove'), key: keys }),
      fc.record({ op: fc.constant('clear') })
    );

    fc.assert(
      fc.property(fc.array(command, { maxLength: 40 }), (commands) => {
        const store = createStore({ storage: createMemoryAdapter() });
        const model = new Map<string, unknown>();

        for (const command of commands) {
          if (command.op === 'set') {
            const value = JSON.parse(JSON.stringify(command.value));
            store.set(command.key, value);
            model.set(command.key, value);
          } else if (command.op === 'remove') {
            store.remove(command.key);
            model.delete(command.key);
          } else {
            store.clear();
            model.clear();
          }

          expect(store.keys().sort()).toEqual([...model.keys()].sort());
          for (const [key, value] of model) {
            expect(store.get(key)).toEqual(value);
            expect(store.has(key)).toBe(true);
          }
        }
      }),
      { numRuns: 300 }
    );
  });
});
