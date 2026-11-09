import { createStore } from 'opendb-store';
import { $ } from '../../shared/ui.js';

const KEY = 'migration-demo.prefs';

// The first release of the app, which had no version.
const oldStore = createStore({ namespace: 'migration-demo' });

// A later release, which stores a theme name instead of a boolean.
const newStore = createStore({
  namespace: 'migration-demo',
  version: 2,
  migrate(value, fromVersion) {
    return fromVersion < 2 ? { theme: value.dark ? 'dark' : 'light' } : value;
  },
});

function renderRaw() {
  $('#raw').textContent = localStorage.getItem(KEY) ?? '(empty)';
}

$('#write').addEventListener('click', () => {
  oldStore.set('prefs', { dark: true });
  $('#value').textContent = '';
  renderRaw();
});

$('#read').addEventListener('click', () => {
  $('#value').textContent = JSON.stringify(newStore.get('prefs'));
  renderRaw();
});

renderRaw();
