import { getSeparator } from '../config/config.js';

export default function used() {
  let totalBytes = 0;
  const separator = getSeparator();

  for (let i = 0; i < this.count; i++) {
    const completkey = this.key(i);
    const [, currentkey] = completkey.split(`${separator}`, 2);

    const value = this.get(currentkey);
    totalBytes += new Blob([JSON.stringify(completkey)]).size;
    totalBytes += new Blob([JSON.stringify(value)]).size;
  }

  return totalBytes;
}
