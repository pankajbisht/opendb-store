import util from '../utils/index.js';

const DEFAULT_CAPACITY = 5 * 1024 * 1024; // 5 MB

export default function free(options = {}) {
  const capacity = options.capacity || DEFAULT_CAPACITY;
  const total = this.used();
  const remaining = capacity - total;
  const bytes = remaining > 0 ? remaining : 0;

  if (options.format) {
    let unit = 'unit' in options ? options.unit : true;
    return util.units(bytes, options.format, unit);
  }

  return bytes;
}
