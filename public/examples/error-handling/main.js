import { createStore } from 'opendb-store';
import { $, el } from '../../shared/ui.js';

function onError(error) {
  $('#errors').prepend(el('li', {}, `${error.code}: ${error.message}`));
}

const store = createStore({ namespace: 'errors-demo', onError });
const cookies = createStore({
  storage: 'cookie',
  namespace: 'errors-demo',
  onError,
});

const result = (value) => ($('#result').textContent = String(value));

$('#circular').addEventListener('click', () => {
  const value = {};
  value.self = value;
  result(`set returned ${store.set('circular', value)}`);
});

$('#expire').addEventListener('click', () => {
  result(`set returned ${store.set('bad', 1, { expire: 0 })}`);
});

$('#cookie').addEventListener('click', () => {
  result(`set returned ${cookies.set('big', 'x'.repeat(5000))}`);
});

$('#corrupt').addEventListener('click', () => {
  localStorage.setItem('errors-demo.broken', '{not json');
  result(`get returned ${store.get('broken', 'the default value')}`);
  store.storage.removeItem('errors-demo.broken');
});

$('#quota').addEventListener('click', () => {
  const chunk = 'x'.repeat(1024 * 1024);
  let saved = 0;

  while (saved < 50 && store.set(`fill-${saved}`, chunk)) saved++;

  store.clear(); // Always give the space back.
  result(`Stored ${saved} MB before the browser refused`);
});
