import { createStore } from 'opendb-store';
import { pluck, where } from 'opendb-store/query';
import { $, el } from '../../shared/ui.js';

const cart = createStore({ namespace: 'shop' });
const CATALOG = ['Keyboard', 'Mouse', 'Monitor'];

const items = () => cart.get('items', []);

function save(next) {
  cart.set('items', next);
  cart.patch('summary', { updated: new Date().toLocaleTimeString() });
  render();
}

function add(sku) {
  const found = items().some((item) => item.sku === sku);
  save(
    found
      ? items().map((item) =>
          item.sku === sku ? { ...item, qty: item.qty + 1 } : item
        )
      : [...items(), { sku, qty: 1, later: false }]
  );
}

function toggleLater(sku) {
  save(
    items().map((item) =>
      item.sku === sku ? { ...item, later: !item.later } : item
    )
  );
}

function render() {
  $('#items').replaceChildren(
    ...items().map((item) =>
      el(
        'li',
        {},
        `${item.sku} x ${item.qty} `,
        el('button', {
          className: 'secondary',
          textContent: item.later ? 'Move to cart' : 'Save for later',
          onclick: () => toggleLater(item.sku),
        })
      )
    )
  );
  $('#skus').textContent = pluck(cart, 'items', 'sku').join(', ') || 'None';
  $('#later').textContent = String(
    where(cart, 'items', { later: true }).length
  );
  $('#updated').textContent = cart.get('summary', {}).updated ?? 'Never';
}

$('#catalog').append(
  ...CATALOG.map((sku) =>
    el('button', { textContent: `Add ${sku}`, onclick: () => add(sku) })
  )
);

$('#empty').addEventListener('click', () => {
  cart.clear();
  render();
});

render();
