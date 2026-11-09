import { beforeEach, describe, expect, test } from 'vitest';
import db from '../src/index';

// Exact strings written by opendb-store@2.0.1.
describe('reads data written by 2.0.1', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('plain values', () => {
    window.localStorage.setItem('app.name', '{"value":"Ada"}');
    expect(db.local.get('name')).toBe('Ada');
    expect(db.local.has('name')).toBe(true);
  });

  test('objects', () => {
    window.localStorage.setItem(
      'app.user',
      '{"value":{"name":"Ada","age":36}}'
    );
    expect(db.local.get('user')).toEqual({ name: 'Ada', age: 36 });
  });

  test('entries with an expiry still in the future', () => {
    const expire = Date.now() + 60_000;
    window.localStorage.setItem('app.t', `{"value":"v","expire":${expire}}`);
    expect(db.local.get('t')).toBe('v');
  });

  test('entries already expired', () => {
    window.localStorage.setItem('app.t', '{"value":"v","expire":1}');
    expect(db.local.get('t')).toBeNull();
    expect(window.localStorage.getItem('app.t')).toBeNull();
  });

  test('keys built with the old field-style format', () => {
    window.localStorage.setItem('app.profile.city', '{"value":"Pune"}');
    expect(db.local.get('profile.city')).toBe('Pune');
  });

  test('the {} that 2.0.1 wrote for undefined counts as absent', () => {
    window.localStorage.setItem('app.u', '{}');
    expect(db.local.get('u', 'd')).toBe('d');
    expect(db.local.has('u')).toBe(false);
  });
});
