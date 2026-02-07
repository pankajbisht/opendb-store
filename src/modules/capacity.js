import utils from '../utils/index.js';
import { DEFAULT_CAPACITY } from '../const/capacity.js';

export default function capacity(options = {}) {
  const bytes = options.capacity || DEFAULT_CAPACITY;

  if (options.format) {
    let unit = 'unit' in options ? options.unit : true;
    return utils.units(bytes, options.format, unit);
  }

  return bytes;
}
