import db from 'opendb-store';
import { $ } from '../../shared/ui.js';

let changes = 0;

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  $('#current').textContent = theme;
}

apply(db.local.get('theme', 'light'));

// Fires for this tab and for the user's other tabs.
db.local.subscribe('theme', (theme) => {
  apply(theme ?? 'light');
  $('#changes').textContent = String(++changes);
});

document.querySelectorAll('[data-theme-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    db.local.set('theme', button.dataset.themeChoice);
  });
});
