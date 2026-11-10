interface Serializer {
    serialize(value: unknown): string;
    deserialize(raw: string): unknown;
}

/**
 * Compresses text with LZW into characters that local and session storage
 * hold intact. Each output character carries 15 bits, so text that only
 * shrinks a little still takes fewer storage characters.
 */
declare function compress(text: string): string;
/**
 * Reverses `compress`. Throws on damaged input, or once the result would pass
 * `maxLength` characters, so tampered data cannot exhaust memory.
 */
declare function decompress(packed: string, maxLength?: number): string;
interface CompressionOptions {
    /** Values shorter than this, as JSON text, are stored as is. Defaults to 1024. */
    minLength?: number;
    /** Largest decompressed value accepted, in characters. Defaults to 50 million. */
    maxLength?: number;
}
/**
 * A serializer for local and session stores that compresses large values.
 * Expiry stays readable, so listing keys never decompresses anything.
 */
declare function compressed(options?: CompressionOptions): Serializer;

export { compress, compressed, decompress };
export type { CompressionOptions };
