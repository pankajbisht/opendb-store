import util from '../utils/index.js';

export default function size(key, options = {}) {
  const value = this.get(key);

  if (value === null) {
    return 0;
  }

  const bytes = new Blob([JSON.stringify(value)]).size;

  if (options.format) {
    let unit = 'unit' in options ? options.unit : true;
    return util.units(bytes, options.format, unit);
  }

  return bytes;
}
