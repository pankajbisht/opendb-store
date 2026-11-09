import type { CookieOptions, StorageAdapter, WriteMeta } from '../types';

// RFC 6265 requires browsers to support at least 4096 bytes per cookie and
// 50 cookies per domain. Sizes beyond that vary, so this is the safe estimate.
const MAX_COOKIE_BYTES = 4096;
const SAFE_COOKIE_COUNT = 50;
// Browsers cap cookie lifetimes at 400 days, and very large numbers would
// print in exponent form, which is not a valid Max-Age.
const MAX_AGE_LIMIT = 400 * 24 * 60 * 60;

const encode = encodeURIComponent;

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // Other code may have written a value that is not percent-encoded.
    return text;
  }
}

/** Rejects anything that could add extra attributes to the cookie. */
export function isValidCookieOptions(options: CookieOptions): boolean {
  const { path, domain, sameSite } = options;
  const isSafe = (text: unknown): boolean =>
    text === undefined ||
    (typeof text === 'string' && !/[;\p{Cc}]/u.test(text));

  return (
    isSafe(path) &&
    isSafe(domain) &&
    [undefined, 'Strict', 'Lax', 'None'].includes(sameSite)
  );
}

// A name that is not this adapter's own encoding stays literal, so a cookie
// named `app%2Ekey` cannot pose as `app.key`.
function decodeName(raw: string): string {
  const name = decode(raw);
  return encode(name) === raw ? name : raw;
}

let parsedText: string | undefined;
let parsedCookies: [string, string][] = [];

function readCookies(): [string, string][] {
  const text = document.cookie;

  // The browser's current text is always read. Only decoding it is reused.
  if (text !== parsedText) {
    parsedCookies = text
      .split('; ')
      .filter((pair) => pair.includes('='))
      .map((pair) => {
        const index = pair.indexOf('=');
        return [
          decodeName(pair.slice(0, index)),
          decode(pair.slice(index + 1)),
        ];
      });
    parsedText = text;
  }

  return parsedCookies;
}

export function createCookieAdapter(
  options: CookieOptions = {}
): StorageAdapter {
  const { path = '/', domain, sameSite = 'Lax', secure } = options;

  const write = (pair: string, lifetime: string): void => {
    const isSecure = secure ?? location.protocol === 'https:';
    document.cookie =
      `${pair}; Path=${path}; SameSite=${sameSite}${lifetime}` +
      `${domain ? `; Domain=${domain}` : ''}${isSecure ? '; Secure' : ''}`;
  };

  const getItem = (key: string): string | null =>
    readCookies().find(([name]) => name === key)?.[1] ?? null;

  return {
    capacity: MAX_COOKIE_BYTES * SAFE_COOKIE_COUNT,
    get length() {
      return readCookies().length;
    },
    key: (index) => readCookies()[index]?.[0] ?? null,
    getItem,
    setItem(key: string, value: string, meta?: WriteMeta) {
      const pair = `${encode(key)}=${encode(value)}`;

      // Browsers drop oversized cookies silently, so refuse them explicitly.
      if (pair.length > MAX_COOKIE_BYTES) {
        throw Object.assign(new Error('Cookie exceeds 4096 bytes'), {
          name: 'QuotaExceededError',
        });
      }

      const lifetime = meta?.expire
        ? `; Max-Age=${Math.min(Math.ceil((meta.expire - Date.now()) / 1000), MAX_AGE_LIMIT)}`
        : '';
      write(pair, lifetime);

      if (getItem(key) !== value) throw new Error('Cookie was rejected');
    },
    removeItem: (key) => write(`${encode(key)}=`, '; Max-Age=0'),
    measure: (key, value) => encode(key).length + encode(value).length,
  };
}
