import { getSeparator } from '../config/config.js';

export default function setFormattedData(key, obj) {
  const separator = getSeparator();

  for (let k in obj) {
    if (k in obj) {
      this.set(`${key}${separator}${k}`, obj[k]);
    }
  }
}
