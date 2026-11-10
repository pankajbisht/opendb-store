import { createStore } from 'opendb-store';
import { compressed } from 'opendb-store/compress';
import { $ } from '../../shared/ui.js';

const plain = createStore({ namespace: 'plain', onError() {} });
const packed = createStore({
  namespace: 'packed',
  serializer: compressed(),
  onError() {},
});

const product = (id) => ({
  id,
  sku: `SKU-${100000 + id}`,
  name: `Product ${id}`,
  price: id * 3,
  inStock: id % 3 !== 0,
  tags: ['electronics', id % 2 ? 'sale' : 'new'],
  description: `Wireless keyboard with backlight, model ${id % 40}`,
});

function time(work) {
  const started = performance.now();
  work();
  return `${(performance.now() - started).toFixed(1)} ms`;
}

const size = (chars) => `${(chars / 1024).toFixed(1)} K characters`;

$('#save').addEventListener('click', () => {
  const products = Array.from({ length: 2000 }, (_, id) => product(id));

  $('#plain-write').textContent = time(() => plain.set('products', products));
  $('#packed-write').textContent = time(() => packed.set('products', products));
  $('#plain-read').textContent = time(() => plain.get('products'));
  $('#packed-read').textContent = time(() => packed.get('products'));
  $('#plain-size').textContent = size(plain.size('products'));
  $('#packed-size').textContent = size(packed.size('products'));
});

function fill(store) {
  localStorage.clear();
  let batches = 0;
  while (
    store.set(
      `batch-${batches}`,
      Array.from({ length: 50 }, (_, i) => product(batches * 50 + i))
    )
  ) {
    batches++;
  }
  localStorage.clear(); // Give the space back.
  return (batches * 50).toLocaleString();
}

$('#fill').addEventListener('click', () => {
  $('#plain-fit').textContent = fill(plain);
  $('#packed-fit').textContent = fill(packed);
});

$('#clear').addEventListener('click', () => {
  plain.clear();
  packed.clear();
  document.querySelectorAll('td').forEach((cell) => (cell.textContent = '-'));
});
