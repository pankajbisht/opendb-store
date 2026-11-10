const OBJECT_OVERHEAD = 16;

/** Approximates stored bytes. Browsers do not report the size of one value. */
export function estimateSize(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): number {
  switch (typeof value) {
    case 'string':
      return value.length * 2;
    case 'number':
    case 'bigint':
      return 8;
    case 'boolean':
      return 4;
    case 'object':
      break;
    default:
      return 0;
  }

  if (value === null || seen.has(value)) return 0;
  seen.add(value);

  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof Date) return 8;

  const parts: unknown[] =
    value instanceof Map
      ? [...value.entries()]
      : value instanceof Set
        ? [...value]
        : Array.isArray(value)
          ? value
          : Object.entries(value);

  return parts.reduce<number>(
    (total, part) => total + estimateSize(part, seen),
    OBJECT_OVERHEAD
  );
}
