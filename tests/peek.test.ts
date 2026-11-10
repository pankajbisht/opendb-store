import { describe, expect, test } from 'vitest';
import { peekMeta } from '../src/codec/entry';

const write = (entry: object) => JSON.stringify(entry);

describe('reading metadata without decoding', () => {
  test.each([
    ['no metadata', { value: { a: 1 } }, {}],
    [
      'expiry',
      { value: 'x', expire: 1731234567890 },
      { expire: 1731234567890 },
    ],
    ['version', { value: 'x', v: 2 }, { v: 2 }],
    ['both', { value: [1], expire: 5, v: 3 }, { expire: 5, v: 3 }],
    [
      'fractional expiry',
      { value: 1, expire: 1731234567890.5 },
      { expire: 1731234567890.5 },
    ],
    ['exponent expiry', { value: 1, expire: 1e300 }, { expire: 1e300 }],
    ['compressed marker', { value: 'packed', z: 1, expire: 9 }, { expire: 9 }],
    ['null value', { value: null }, {}],
    ['string value', { value: 'a"b}' }, {}],
  ])('%s', (_label, entry, expected) => {
    expect(peekMeta(write(entry))).toEqual(expected);
  });

  test('a large value is not decoded', () => {
    const raw = write({ value: 'x'.repeat(5_000_000), expire: 7 });
    expect(peekMeta(raw)).toEqual({ expire: 7 });
  });

  test.each([
    ['nested "expire" without own expiry', { value: { a: 1, expire: 5 } }],
    ['nested "v" without own version', { value: { b: 1, v: 9 } }],
    ['nested "expire" before own version', { value: { expire: 5 }, v: 2 }],
  ])('defers to full decoding for %s', (_label, entry) => {
    expect(peekMeta(write(entry))).toBeUndefined();
  });

  test('never misreads a nested expiry as the real one', () => {
    const raw = write({ value: { expire: 5 }, expire: 9 });
    const meta = peekMeta(raw);
    expect(meta === undefined || meta.expire === 9).toBe(true);
  });

  test.each([
    ['foreign JSON', '"plain"'],
    ['empty object', '{}'],
    ['corrupt text', '{not json'],
    ['other field order', '{"expire":5,"value":1}'],
    ['string expiry', '{"value":1,"expire":"999"}'],
    ['object expiry', '{"value":1,"expire":{}}'],
    ['malformed number', '{"value":1,"expire":1e+}'],
    ['string version', '{"value":1,"v":"abc"}'],
    ['not ending in a brace', '{"value":1,"expire":5'],
  ])('defers to full decoding for %s', (_label, raw) => {
    expect(peekMeta(raw)).toBeUndefined();
  });
});
