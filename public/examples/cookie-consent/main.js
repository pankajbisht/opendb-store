import db from 'opendb-store';
import { $ } from '../../shared/ui.js';

const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

function render() {
  const consent = db.cookie.get('consent');
  const ttl = db.cookie.ttl('consent');

  $('#banner').hidden = consent !== null;
  $('#choice').textContent = consent ? JSON.stringify(consent) : 'None';
  $('#expires').textContent = ttl
    ? `${Math.round(ttl / 86_400_000)} days`
    : 'Not set';
  $('#raw').textContent = document.cookie || '(no cookies)';
}

function choose(analytics) {
  db.cookie.set('consent', { analytics }, { expire: ONE_YEAR });
  render();
}

$('#accept').addEventListener('click', () => choose(true));
$('#essential').addEventListener('click', () => choose(false));
$('#reset').addEventListener('click', () => {
  db.cookie.remove('consent');
  render();
});

render();
