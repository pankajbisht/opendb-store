import db from 'opendb-store';
import { $ } from '../../shared/ui.js';

function render() {
  const remaining = db.local.ttl('offer');
  $('#offer').textContent = db.local.get('offer', 'Expired or not saved');
  $('#left').textContent =
    remaining === null ? 'None' : `${(remaining / 1000).toFixed(1)}s`;
}

$('#save').addEventListener('click', () => {
  db.local.set('offer', 'SAVE10', { expire: 5000 });
  render();
});

render();
setInterval(render, 100);
