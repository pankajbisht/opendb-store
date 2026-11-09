import type { CookieOptions, StorageAdapter, WriteMeta } from '../types';

// RFC 6265 requires browsers to support at least 4096 bytes per cookie and
// 50 cookies per domain. Sizes beyond that vary, so this is the safe estimate.
const MAX_COOKIE_BYTES = 4096;
const SAFE_COOKIE_COUNT = 50;

const encode = encodeURIComponent;

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // Other code may have written a value that is not percent-encoded.
    return text;
  }
}

function readCookies(): [string, string][] {
  return document.cookie
    .split('; ')
    .filter((pair) => pair.includes('='))
    .map((pair) => {
      const index = pair.indexOf('=');
      return [decode(pair.slice(0, index)), decode(pair.slice(index + 1))];
    });
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
        ? `; Max-Age=${Math.ceil((meta.expire - Date.now()) / 1000)}`
        : '';
      write(pair, lifetime);

      if (getItem(key) !== value) throw new Error('Cookie was rejected');
    },
    removeItem: (key) => write(`${encode(key)}=`, '; Max-Age=0'),
    measure: (key, value) => encode(key).length + encode(value).length,
  };
}
