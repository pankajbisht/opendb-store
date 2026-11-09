import { createStore } from 'opendb-store';
import { $, show } from '../../shared/ui.js';

const cache = createStore({ namespace: 'api-cache' });
const TEN_SECONDS = 10_000;
let calls = 0;

// Stands in for fetch('/api/products').
function fetchProducts() {
  $('#calls').textContent = String(++calls);
  return new Promise((resolve) => {
    setTimeout(() => resolve([{ id: 1, name: 'Keyboard' }]), 400);
  });
}

async function getProducts() {
  const cached = cache.get('products');
  if (cached) return { products: cached, source: 'Cache' };

  const products = await fetchProducts();
  cache.set('products', products, { expire: TEN_SECONDS });
  return { products, source: 'Server' };
}

$('#load').addEventListener('click', async () => {
  const { products, source } = await getProducts();
  $('#source').textContent = source;
  show('#output', products);
});

$('#clear').addEventListener('click', () => {
  cache.clear();
  $('#source').textContent = 'Not loaded';
  show('#output', '');
});
