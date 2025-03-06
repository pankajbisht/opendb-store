import utils from '../utils/index.js';

const DEFAULT_CAPACITY = 5 * 1024 * 1024; // 5 MB

export default function capacity(options = {}) {
  const bytes = options.capacity || DEFAULT_CAPACITY;

  if (options.format) {
    let unit = 'unit' in options ? options.unit : true;
    return utils.units(bytes, options.format, unit);
  }

  return bytes;
}
