import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import db, { createStore, StoreError } from '../src/index';

function clearCookies() {
  for (const pair of document.cookie.split('; ').filter(Boolean)) {
    document.cookie = `${pair.split('=')[0]}=; Path=/; Max-Age=0`;
  }
}

function collectErrors() {
  const errors: StoreError[] = [];
  return { errors, onError: (error: StoreError) => void errors.push(error) };
}

describe('cookie store', () => {
  beforeEach(clearCookies);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('db.cookie is available with the same API', () => {
    expect(db.cookie.set('theme', 'dark')).toBe(true);
    expect(db.cookie.get('theme')).toBe('dark');
    expect(document.cookie).toContain('app.theme=');
  });

  test.each([
    ['semicolons', 'a;b'],
    ['equals', 'a=b'],
    ['spaces', 'a b'],
    ['quotes', '"a"'],
    ['percent', '100%'],
    ['unicode', 'नमस्ते 😀'],
  ])('encodes keys and values containing %s', (_label, text) => {
    db.cookie.set(text, text);
    expect(db.cookie.get(text)).toBe(text);
    expect(db.cookie.keys()).toContain(text);
  });

  test('writes safe default attributes', () => {
    const write = vi.spyOn(document, 'cookie', 'set');
    db.cookie.set('k', 1);

    expect(write.mock.calls[0]?.[0]).toMatch(/; Path=\/; SameSite=Lax$/);
  });

  test('an expiring entry gets a browser Max-Age', () => {
    const write = vi.spyOn(document, 'cookie', 'set');
    db.cookie.set('k', 1, { expire: 90_500 });

    expect(write.mock.calls[0]?.[0]).toContain('; Max-Age=91');
  });

  test('defaultTTL produces a persistent cookie', () => {
    const write = vi.spyOn(document, 'cookie', 'set');
    createStore({ storage: 'cookie', defaultTTL: 5000 }).set('k', 1);

    expect(write.mock.lastCall?.[0]).toContain('; Max-Age=5');
  });

  test('applies custom attributes', () => {
    const write = vi.spyOn(document, 'cookie', 'set');
    const store = createStore({
      storage: 'cookie',
      cookie: { path: '/', domain: 'localhost', sameSite: 'Strict' },
    });
    store.set('k', 1);

    const written = write.mock.calls.pop()?.[0];
    expect(written).toContain('; SameSite=Strict');
    expect(written).toContain('; Domain=localhost');
  });

  test('marks cookies Secure automatically on HTTPS', () => {
    vi.stubGlobal('location', { protocol: 'https:' });
    const written: string[] = [];
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => (written[written.length - 1] as string).split(';')[0],
      set: (text: string) => written.push(text),
    });

    try {
      createStore({ storage: 'cookie', namespace: 'tls' }).set('k', 1);
      expect(written[written.length - 1]).toContain('; Secure');
    } finally {
      delete (document as unknown as Record<string, unknown>).cookie;
    }
  });

  test('removal uses the same attributes and an immediate expiry', () => {
    db.cookie.set('k', 1);
    const write = vi.spyOn(document, 'cookie', 'set');

    db.cookie.remove('k');

    expect(write.mock.calls[0]?.[0]).toMatch(/^app\.k=; Path=\/.*Max-Age=0/);
    expect(db.cookie.has('k')).toBe(false);
  });

  test('refuses an oversized cookie and reports QUOTA_EXCEEDED', () => {
    const { errors, onError } = collectErrors();
    const store = createStore({ storage: 'cookie', onError });

    expect(store.set('k', 'x'.repeat(5000))).toBe(false);
    expect(errors[0]?.code).toBe('QUOTA_EXCEEDED');
    expect(store.has('k')).toBe(false);
  });

  test('the limit applies to the encoded size', () => {
    const { errors, onError } = collectErrors();
    const store = createStore({ storage: 'cookie', onError });

    // Each of these encodes to nine bytes.
    expect(store.set('k', '界'.repeat(600))).toBe(false);
    expect(errors[0]?.code).toBe('QUOTA_EXCEEDED');
  });

  test('reports a write the browser silently rejected', () => {
    const { errors, onError } = collectErrors();
    const store = createStore({ storage: 'cookie', namespace: 'r', onError });
    store.has('probe');
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {});

    expect(store.set('k', 1)).toBe(false);
    expect(errors[0]?.code).toBe('STORAGE_UNAVAILABLE');
  });

  test('ignores foreign cookies but counts them against free space', () => {
    const before = db.cookie.free();
    document.cookie = '_ga=GA1.2.123; Path=/';
    document.cookie = 'broken=%E0%A4%A; Path=/';

    expect(db.cookie.keys()).toEqual([]);
    expect(db.cookie.free()).toBeLessThan(before);

    db.cookie.clear();
    expect(document.cookie).toContain('_ga=');
  });

  test('ignores a cookie with no equals sign', () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('bare; app.k=x');
    expect(db.cookie.storage.key(0)).toBe('app.k');
    expect(db.cookie.storage.key(5)).toBeNull();
  });

  test('an unusable cookie jar falls back to memory and reports it', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { errors, onError } = collectErrors();
    const store = createStore({
      storage: 'cookie',
      namespace: 'blocked',
      onError,
    });

    expect(store.set('k', 1)).toBe(true);
    expect(store.get('k')).toBe(1);
    expect(errors.map((e) => e.code)).toEqual(['STORAGE_UNAVAILABLE']);
    store.clear();
  });

  test('capacity is the guaranteed RFC 6265 minimum', () => {
    expect(db.cookie.capacity()).toBe(4096 * 50);
  });
});
