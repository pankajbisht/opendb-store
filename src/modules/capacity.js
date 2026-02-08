import utils from '../utils/index.js';
import { DEFAULT_CAPACITY } from '../const/capacity.js';

export default function capacity(options = {}) {
  const bytes = options.capacity || DEFAULT_CAPACITY;

  if (options.format || 'unit' in options) {
    const format = options.format || 'MB';
    const unit = 'unit' in options ? options.unit : true;

    return utils.units(bytes, format, unit);
  }

  return bytes;
}
