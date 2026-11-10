import type { Serializer } from './types';

// Output characters are 15-bit chunks shifted past the control characters.
// They stay below the surrogate range, so storage keeps them intact.
const BITS = 15;
const OFFSET = 32;
const NEW_BYTE = 0;
const NEW_CHAR = 1;
const END = 2;
const FIRST_CODE = 3;
// Bounds the dictionary, so memory and code width stay predictable.
const MAX_CODES = 1 << 20;
const DEFAULT_MAX_LENGTH = 50_000_000;

const bitsFor = (maxCode: number): number => 32 - Math.clz32(maxCode);

/**
 * Compresses text with LZW into characters that local and session storage
 * hold intact. Each output character carries 15 bits, so text that only
 * shrinks a little still takes fewer storage characters.
 */
export function compress(text: string): string {
  const singles = new Map<number, number>();
  const phrases = new Map<number, number>();
  const output: number[] = [];
  let next = FIRST_CODE;
  let pending = 0;
  let pendingBits = 0;

  function write(value: number, bits: number): void {
    while (bits > 0) {
      const take = Math.min(bits, BITS - pendingBits);
      pending |= (value & ((1 << take) - 1)) << pendingBits;
      value >>>= take;
      bits -= take;
      pendingBits += take;

      if (pendingBits === BITS) {
        output.push(pending + OFFSET);
        pending = 0;
        pendingBits = 0;
      }
    }
  }

  const writeCode = (code: number): void => write(code, bitsFor(next - 1));

  /** Emits a character the dictionary has not seen, then learns it. */
  function writeLiteral(char: number): number | undefined {
    const wide = char > 0xff;
    writeCode(wide ? NEW_CHAR : NEW_BYTE);
    write(char, wide ? 16 : 8);
    if (next >= MAX_CODES) return undefined;
    singles.set(char, next);
    return next++;
  }

  const learn = (key: number): void => {
    if (next < MAX_CODES) phrases.set(key, next++);
  };

  let current = -1;
  let literal = -1;

  for (let index = 0; index < text.length; index++) {
    const char = text.charCodeAt(index);

    if (current !== -1) {
      const found = phrases.get(current * 0x10000 + char);
      if (found !== undefined) {
        current = found;
        continue;
      }
      writeCode(current);
      learn(current * 0x10000 + char);
    } else if (literal !== -1) {
      const code = writeLiteral(literal);
      if (code !== undefined) learn(code * 0x10000 + char);
    }

    const known = singles.get(char);
    current = known ?? -1;
    literal = known === undefined ? char : -1;
  }

  if (current !== -1) writeCode(current);
  else if (literal !== -1) writeLiteral(literal);

  // The reader expects room for the phrase it would learn next.
  const tokens = current !== -1 || literal !== -1;
  write(END, bitsFor(next - 1 + (tokens && next < MAX_CODES ? 1 : 0)));
  if (pendingBits > 0) output.push(pending + OFFSET);

  let result = '';
  for (let index = 0; index < output.length; index += 8192) {
    result += String.fromCharCode(...output.slice(index, index + 8192));
  }
  return result;
}

/**
 * Reverses `compress`. Throws on damaged input, or once the result would pass
 * `maxLength` characters, so tampered data cannot exhaust memory.
 */
export function decompress(
  packed: string,
  maxLength = DEFAULT_MAX_LENGTH
): string {
  const dictionary: string[] = [];
  const firsts: string[] = [];
  const parts: string[] = [];
  let next = FIRST_CODE;
  let length = 0;
  let position = 0;
  let chunk = 0;
  let chunkBits = 0;

  function read(bits: number): number {
    let value = 0;
    let shift = 0;

    while (bits > 0) {
      if (chunkBits === 0) {
        if (position >= packed.length) throw new Error('Truncated data');
        chunk = packed.charCodeAt(position++) - OFFSET;
        if (chunk < 0 || chunk >= 1 << BITS) throw new Error('Invalid data');
        chunkBits = BITS;
      }

      const take = Math.min(bits, chunkBits);
      value |= (chunk & ((1 << take) - 1)) << shift;
      chunk >>>= take;
      chunkBits -= take;
      shift += take;
      bits -= take;
    }

    return value;
  }

  let previous: string | undefined;
  let previousFirst = '';

  for (;;) {
    const pendingPhrase = previous !== undefined && next < MAX_CODES ? 1 : 0;
    const code = read(bitsFor(next - 1 + pendingPhrase));
    if (code === END) break;

    let entry: string;
    let first: string;
    const isLiteral = code === NEW_BYTE || code === NEW_CHAR;

    if (isLiteral) {
      entry = first = String.fromCharCode(read(code === NEW_BYTE ? 8 : 16));
    } else if (code < next) {
      entry = dictionary[code] as string;
      first = firsts[code] as string;
    } else if (code === next && previous !== undefined) {
      entry = previous + previousFirst;
      first = previousFirst;
    } else {
      throw new Error('Invalid data');
    }

    if (previous !== undefined && next < MAX_CODES) {
      dictionary[next] = previous + first;
      firsts[next++] = previousFirst;
    }
    if (isLiteral && next < MAX_CODES) {
      dictionary[next] = entry;
      firsts[next++] = first;
    }

    length += entry.length;
    if (length > maxLength) throw new Error('Decompressed data is too large');

    parts.push(entry);
    previous = entry;
    previousFirst = first;
  }

  return parts.join('');
}

export interface CompressionOptions {
  /** Values shorter than this, as JSON text, are stored as is. Defaults to 1024. */
  minLength?: number;
  /** Largest decompressed value accepted, in characters. Defaults to 50 million. */
  maxLength?: number;
}

/**
 * A serializer for local and session stores that compresses large values.
 * Expiry stays readable, so listing keys never decompresses anything.
 */
export function compressed(options: CompressionOptions = {}): Serializer {
  const { minLength = 1024, maxLength = DEFAULT_MAX_LENGTH } = options;

  if (!(minLength >= 0) || !(maxLength > 0)) {
    throw new TypeError('Invalid option: compression');
  }

  return {
    serialize(entry) {
      const { value, ...meta } = entry as { value: unknown };
      const text = JSON.stringify(value);

      if (text !== undefined && text.length >= minLength) {
        const packed = JSON.stringify({ value: compress(text), z: 1, ...meta });
        // Compare whole entries, since the marker adds a few characters.
        if (packed.length < text.length + JSON.stringify(meta).length + 8) {
          return packed;
        }
      }

      return JSON.stringify(entry);
    },

    deserialize(raw) {
      const data = JSON.parse(raw);

      if (data?.z === 1 && typeof data.value === 'string') {
        data.value = JSON.parse(decompress(data.value, maxLength));
        delete data.z;
      }

      return data;
    },
  };
}
