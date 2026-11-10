import { createIndexedStore } from 'opendb-store/indexeddb';
import { inspect } from 'opendb-store/debug';
import { $, el } from '../../shared/ui.js';

const failures = [];
const library = createIndexedStore({
  namespace: 'library',
  onError: (error) => failures.push(error.code),
});

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const result = (text) => ($('#result').textContent = text);

function describe(saved, success) {
  result(saved ? success : `Not saved: ${failures[failures.length - 1]}`);
}

async function render() {
  const report = await inspect(library);

  $('#current').textContent = await library.get('note', 'None');
  $('#items').replaceChildren(
    ...report.entries.map((entry) =>
      el('li', {}, `${entry.key}: about ${formatSize(entry.size)}`)
    )
  );
  $('#usage').textContent = `${report.count} entries, about ${formatSize(report.used)}`;
}

// Hears changes made here and in the user's other tabs.
library.subscribe('note', render);

$('#form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await library.set('note', $('#note').value);
  $('#form').reset();
});

$('#dataset').addEventListener('click', async () => {
  const bytes = new Uint8Array(12 * 1024 * 1024).fill(7);
  describe(await library.set('dataset', bytes), 'Saved 12 MB');
  await render();
});

$('#types').addEventListener('click', async () => {
  await library.set('session', {
    started: new Date(),
    pages: new Map([['home', 3]]),
  });

  const { started, pages } = await library.get('session');
  result(
    `${started.constructor.name} and ${pages.constructor.name} came back intact`
  );
  await render();
});

$('#file').addEventListener('click', async () => {
  const file = new Blob(['Saved in IndexedDB'], { type: 'text/plain' });
  describe(await library.set('file', file), 'Saved a file');

  const stored = await library.get('file');
  if (stored) result(`File says: ${await stored.text()}`);
  await render();
});

$('#patches').addEventListener('click', async () => {
  await library.set('counters', {});
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      library.patch('counters', { [`field${index}`]: index })
    )
  );

  const fields = Object.keys(await library.get('counters')).length;
  result(`${fields} of 20 fields were kept`);
  await render();
});

$('#clear').addEventListener('click', async () => {
  await library.clear();
  result('Cleared');
  await render();
});

render();
