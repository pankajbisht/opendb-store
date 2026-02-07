/**
 * Check whether a specified key exists in local or session storage
 *
 * @param {string} key - The key to check in local or session storage.
 * @returns {boolean} True if the key exists, false otherwise.
 */

export default function has(key) {
  const value = this.get(key);

  if (value === null) return false;
  if (value === '') return false;
  if (value === 'undefined' || value === undefined) return false;

  return true;
}
