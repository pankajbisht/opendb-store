import util from '../utils/index.js';
import { isInvalidArg } from '../errors/isInvalidArg.js';
import config from '../config/index.js';

/**
 * Retrieves data from local or session storage by key. Returns defaultValue if the key does not exist.
 *
 * If the key does not exist or the stored item has expired, returns the defaultValue.
 * If the stored value was serialized, it is parsed back to its original type.
 *
 * @param {string} key - The key to retrieve from localStorage.
 * @param {any} defaultValue - The value to return if the key is not found or is expired.
 * @returns {any} The retrieved value (parsed if needed) or the defaultValue.
 */

export default function get(key, defaultValue = null) {
  if (isInvalidArg(key)) return null;
  const namespacedKey = config.generateKey(key);
  const value = this.storage.getItem(namespacedKey);

  if (util.isNull(value)) {
    return defaultValue;
  }

  try {
    let parsedData = util.parse(value);

    if (parsedData.expire && Date.now() > parsedData.expire) {
      this.remove(key);
      return defaultValue;
    }

    return parsedData.value;
  } catch (error) {
    console.warn(`Failed to parse stored value for key "${key}":`, error);
    return defaultValue;
  }
}
