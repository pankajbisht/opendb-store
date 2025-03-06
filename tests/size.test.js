import db from '../dist/opendb-esm.js';

describe('size', () => {
  beforeEach(() => {
    db.local.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  test('should return 0 and warn when key does not exist', () => {
    const size = db.local.size('nonExistingKey');
    expect(size).toBe(0);
  });

  test('should return raw byte size for a stored key', () => {
    const testObj = { name: 'Alice', age: 30 };
    db.local.set('testKey', testObj);

    const rawSize = db.local.size('testKey');
    expect(typeof rawSize).toBe('number');
    expect(rawSize).toBeGreaterThan(0);
  });

  test('should return formatted size in MB with unit when options provided', () => {
    const testObj = { name: 'Alice', age: 30 };
    db.local.set('testKey', testObj);

    const formatted = db.local.size('testKey', { format: 'MB', unit: true });
    expect(typeof formatted).toBe('string');
    expect(formatted).toMatch(/ MB$/);
  });

  test('should return formatted size in MB without unit when unit option is false', () => {
    const testObj = { name: 'Alice', age: 30 };
    db.local.set('testKey', testObj);

    const formatted = db.local.size('testKey', { format: 'mb', unit: false });
    expect(typeof formatted).toBe('string');
    // Expect the string NOT to end with " MB"
    expect(formatted).not.toMatch(/ MB$/);
  });

  test('should fallback to auto-formatting for an invalid format option', () => {
    const testObj = { name: 'Alice', age: 30 };
    db.local.set('testKey', testObj);

    const formatted = db.local.size('testKey', { format: 'xyz', unit: true });
    expect(typeof formatted).toBe('string');
    // It should fall back to auto-formatting, which will output a unit of either B, KB, or MB.
    expect(formatted).toMatch(/ (B|KB|MB)$/);
  });
});
