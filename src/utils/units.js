function auto(bytes, unit) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + (unit ? sizes[i] : '');
}

export default function units(bytes, format, unit) {
  format = format.toUpperCase();
  let formatted = '';

  switch (format) {
    case 'B':
      formatted = bytes.toFixed(2);
      break;
    case 'KB':
      formatted = (bytes / 1024).toFixed(2);
      break;
    case 'MB':
      formatted = (bytes / (1024 * 1024)).toFixed(2);
      break;
    default:
      console.warn(
        `Unsupported format "${format}" provided. Falling back to auto-formatting.`
      );
      return auto(bytes, unit);
  }

  return unit ? `${formatted} ${format}` : formatted;
}
