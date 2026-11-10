import { describe, expect, test } from 'vitest';
import { compress, compressed, decompress } from '../src/compress';
import { createMemoryAdapter } from '../src/adapters/memory';
import { createStore, StoreError } from '../src/index';

/** Deterministic, well-mixed random text (mulberry32). */
function randomText(length: number, alphabet: number, seed: number): string {
  let state = seed >>> 0;
  const nextRandom = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const codes = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    codes[i] = Math.floor(nextRandom() * alphabet);
  }

  let text = '';
  for (let i = 0; i < length; i += 8192) {
    text += String.fromCharCode(...codes.slice(i, i + 8192));
  }
  return text;
}

describe('compress and decompress', () => {
  test.each([
    ['empty', ''],
    ['one character', 'a'],
    ['two characters', 'ab'],
    ['repeated character', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['repeating pattern', 'abcabcabcabcabcabcabcabc'],
    ['a pattern that refers to itself', 'ababababababababab'],
    ['JSON', JSON.stringify({ users: [{ id: 1, name: 'Ada' }] })],
    ['Unicode', 'नमस्ते दुनिया 😀 你好 Здравствуй мир'],
    ['lone surrogates', '\ud800a\udc00b\ud83d'],
    ['control characters', '\u0000\u0001\u001f\u007f￿'],
    ['quotes and backslashes', '"\\"\\\\'],
  ])('round-trips %s', (_label, text) => {
    expect(decompress(compress(text))).toBe(text);
  });

  test.each([
    [1, 256, 2000],
    [2, 4, 5000],
    [3, 65536, 3000],
    [4, 2, 20000],
    [5, 60, 100_000],
  ])('round-trips random text, seed %i', (seed, alphabet, length) => {
    const text = randomText(length, alphabet, seed);
    expect(decompress(compress(text))).toBe(text);
  });

  test('round-trips text large enough to fill the dictionary', () => {
    const text = randomText(1_500_000, 256, 9);
    expect(decompress(compress(text))).toBe(text);
  }, 60_000);

  test('new characters after the dictionary is full still round-trip', () => {
    // A wide alphabet makes short phrases, so the dictionary fills quickly.
    // Characters 60000 and above appear only after it is full.
    let tail = '';
    for (let i = 0; i < 3000; i++) tail += String.fromCharCode(60_000 + i);
    const text = randomText(1_500_000, 60_000, 7) + tail + 'abc';
    expect(decompress(compress(text))).toBe(text);
  }, 60_000);

  test('output stays in safe characters', () => {
    const packed = compress(randomText(20_000, 65536, 7));
    for (let i = 0; i < packed.length; i++) {
      const code = packed.charCodeAt(i);
      expect(code >= 32 && code < 32 + 32768).toBe(true);
    }
  });

  test('typical JSON shrinks substantially', () => {
    const json = JSON.stringify(
      Array.from({ length: 500 }, (_, id) => ({
        id,
        name: `Product ${id}`,
        price: id * 3,
        tags: ['sale', 'new'],
        inStock: id % 2 === 0,
      }))
    );
    expect(compress(json).length).toBeLessThan(json.length / 4);
  });

  test('highly repetitive text is fast and tiny', () => {
    const text = 'x'.repeat(2_000_000);
    const started = Date.now();
    const packed = compress(text);
    expect(decompress(packed)).toBe(text);
    expect(packed.length).toBeLessThan(5000);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 60_000);

  test.each([
    ['empty input', ''],
    ['a character below the range', '\u0001'],
    ['a character above the range', '￿'],
    ['an unknown code', String.fromCharCode(32 + 0b111)],
  ])('rejects %s', (_label, packed) => {
    expect(() => decompress(packed)).toThrow();
  });

  test('rejects truncated input', () => {
    const packed = compress('hello world, hello world, hello world');
    expect(() => decompress(packed.slice(0, 3))).toThrow();
  });

  test('stops at the size limit instead of exhausting memory', () => {
    const packed = compress('x'.repeat(100_000));
    expect(() => decompress(packed, 50_000)).toThrow('too large');
    expect(decompress(packed, 100_000)).toHaveLength(100_000);
  });

  test('random damaged input never hangs or crashes the process', () => {
    for (let seed = 1; seed < 200; seed++) {
      const junk = randomText(40, 32768, seed)
        .split('')
        .map((c) => String.fromCharCode(c.charCodeAt(0) + 32))
        .join('');
      try {
        decompress(junk, 10_000);
      } catch {
        // Rejecting is the expected outcome.
      }
    }
    expect(true).toBe(true);
  });
});

describe('compressed format is stable', () => {
  // Users keep compressed data across library versions, so the format must
  // never change. If this fails, old data would become unreadable.
  const GOLDEN: [string, string, string][] = [
    [
      'json',
      JSON.stringify([
        { id: 1, name: 'Ada', tags: ['a', 'b'] },
        { id: 2, name: 'Grace', tags: ['a', 'b'] },
      ]),
      '\u618c\u443e\u1a60\u3b40\u03c0\u0082\u03b6\u01d8\u2081\u283b\u0ef6\u3430\u0ed9\u4033\u030e\u01bc\u1b06\u21e3\u00bc\u0782\u0bc0\u27f0\u1452\u202d\u3286\u1d89\u23a0\u3920\u4037\u0e51\u69f2\u51ea\u3b15\u55b0\u04f1 ',
    ],
    [
      'repeat',
      'abcabcabcabcabcabcabcabcabcabc',
      '\u41a4\u4638\u5a31\u7604\u052a',
    ],
    [
      'unicode',
      'नमस्ते नमस्ते 😀😀 ÿĀ',
      '\u24c1\u4ba8\u60a4\u0869\u096d\u24a2\u1c62j\u0440\u2f82\u4208=\u5b98\u7c2f/\u0422',
    ],
    ['empty', '', '"'],
  ];

  test.each(GOLDEN)(
    '%s compresses to exactly the stored form',
    (_l, text, packed) => {
      expect(compress(text)).toBe(packed);
    }
  );

  test.each(GOLDEN)(
    '%s from an earlier version still decodes',
    (_l, text, packed) => {
      expect(decompress(packed)).toBe(text);
    }
  );
});

describe('compressed stores', () => {
  const records = Array.from({ length: 300 }, (_, id) => ({
    id,
    name: `Product ${id}`,
    description: 'A product description that repeats in many records.',
  }));

  function make(options = {}) {
    const storage = createMemoryAdapter();
    const errors: StoreError[] = [];
    const store = createStore({
      storage,
      serializer: compressed(options),
      onError: (error) => errors.push(error),
    });
    return { storage, store, errors };
  }

  test('large values are stored compressed and read back', () => {
    const { storage, store } = make();
    store.set('products', records, { expire: 60_000 });

    const raw = storage.getItem('app.products') as string;
    expect(raw.length).toBeLessThan(JSON.stringify(records).length / 3);
    expect(raw).toMatch(/^\{"value":".*","z":1,"expire":\d+\}$/s);
    expect(store.get('products')).toEqual(records);
  });

  test('small values are stored as plain JSON', () => {
    const { storage, store } = make();
    store.set('theme', 'dark');
    expect(storage.getItem('app.theme')).toBe('{"value":"dark"}');
  });

  test('values that would not shrink are stored as plain JSON', () => {
    const { storage, store } = make({ minLength: 1 });
    store.set('k', 'q');
    expect(storage.getItem('app.k')).toBe('{"value":"q"}');
  });

  test('listing, expiry, and size never need to decompress', () => {
    const { store } = make();
    store.set('a', records, { expire: 60_000 });
    store.set('b', records);

    expect(store.keys().sort()).toEqual(['a', 'b']);
    expect(store.has('a')).toBe(true);
    expect(store.ttl('a')).toBeGreaterThan(0);
    expect(store.size('a')).toBeLessThan(store.used());
  });

  test('patch, migrations, and plain entries work alongside', () => {
    const storage = createMemoryAdapter();
    storage.setItem('app.old', '{"value":{"n":1}}');
    const store = createStore({
      storage,
      serializer: compressed({ minLength: 10 }),
      version: 2,
      migrate: (value) => ({ ...value, m: 'x'.repeat(50) }),
    });

    expect(store.get('old')).toEqual({ n: 1, m: 'x'.repeat(50) });
    store.patch('old', { o: 'y'.repeat(50) });
    expect(store.get<{ o: string }>('old')?.o).toHaveLength(50);
    expect(storage.getItem('app.old')).toContain('"z":1');
  });

  test('tampered compressed data reports CORRUPT_VALUE', () => {
    const { storage, store, errors } = make();
    storage.setItem('app.k', '{"value":"\\u0001\\u0002","z":1}');

    expect(store.get('k', 'default')).toBe('default');
    expect(errors[0]?.code).toBe('CORRUPT_VALUE');
  });

  test('a decompression bomb is refused', () => {
    const { storage, store, errors } = make({ maxLength: 10_000 });
    const bomb = compress(JSON.stringify('x'.repeat(1_000_000)));
    storage.setItem('app.k', JSON.stringify({ value: bomb, z: 1 }));

    expect(store.get('k', 'refused')).toBe('refused');
    expect(errors[0]?.code).toBe('CORRUPT_VALUE');
  });

  test.each([[{ minLength: -1 }], [{ maxLength: 0 }], [{ minLength: NaN }]])(
    'rejects options %o',
    (options) => {
      expect(() => compressed(options)).toThrow(TypeError);
    }
  );

  test('fits far more than plain JSON in the same space', () => {
    const plain = createMemoryAdapter();
    const packed = createMemoryAdapter();
    createStore({ storage: plain }).set('k', records);
    createStore({ storage: packed, serializer: compressed() }).set(
      'k',
      records
    );

    const ratio =
      (plain.getItem('app.k') as string).length /
      (packed.getItem('app.k') as string).length;
    expect(ratio).toBeGreaterThan(5);
  });
});

describe('real storage', () => {
  test('compressed values survive real localStorage', () => {
    const store = createStore({
      namespace: 'z',
      serializer: compressed({ minLength: 10 }),
    });
    const value = { text: 'नमस्ते 😀 '.repeat(200), list: [1, 2, 3] };

    expect(store.set('k', value)).toBe(true);
    expect(
      createStore({ namespace: 'z', serializer: compressed() }).get('k')
    ).toEqual(value);
    window.localStorage.clear();
  });
});
