import { createStore } from 'opendb-store';
import { debug, inspect } from 'opendb-store/debug';
import { createIndexedStore } from 'opendb-store/indexeddb';
import { $, el } from '../../shared/ui.js';

const stores = {
  local: createStore({ namespace: 'debug-demo', storage: 'local' }),
  session: createStore({ namespace: 'debug-demo', storage: 'session' }),
  cookie: createStore({ namespace: 'debug-demo', storage: 'cookie' }),
  indexeddb: createIndexedStore({ namespace: 'debug-demo' }),
};

let id = 0;

async function addToAll(length, expire) {
  id++;
  await Promise.all(
    Object.values(stores).map((store) =>
      store.set(`entry-${id}`, 'x'.repeat(length), { expire })
    )
  );
  await render();
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const formatExpiry = (ms) =>
  ms === null ? 'never' : `${Math.ceil(ms / 1000)}s`;

function reportCard(name, report) {
  return el(
    'section',
    { className: 'card', id: `report-${name}` },
    el('h2', { textContent: name }),
    el('progress', { max: 100, value: report.percentUsed }),
    el('p', {
      textContent:
        `${formatSize(report.used)} in ${report.count} entries, ` +
        `${report.percentUsed}% of about ${formatSize(report.capacity)}`,
    }),
    el(
      'ul',
      {},
      ...report.entries.map((entry) =>
        el(
          'li',
          {},
          `${entry.key}: ${formatSize(entry.size)}, ` +
            `expires ${formatExpiry(entry.expiresIn)}`
        )
      )
    )
  );
}

async function render() {
  const cards = await Promise.all(
    Object.entries(stores).map(async ([name, store]) =>
      reportCard(name, await inspect(store))
    )
  );
  $('#reports').replaceChildren(...cards);
}

$('#small').addEventListener('click', () => addToAll(50));
$('#large').addEventListener('click', () => addToAll(3000, 60_000));
$('#print').addEventListener('click', () => debug(stores));
$('#clear').addEventListener('click', async () => {
  await Promise.all(Object.values(stores).map((store) => store.clear()));
  await render();
});

render();
