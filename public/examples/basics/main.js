import db from 'opendb-store';
import { $ } from '../../shared/ui.js';

const form = $('#form');

function render() {
  const saved = db.local.has('name');
  $('#name').textContent = db.local.get('name', 'Nothing saved yet');
  $('#name').classList.toggle('good', saved);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  db.local.set('name', $('#input').value);
  form.reset();
  render();
});

$('#remove').addEventListener('click', () => {
  db.local.remove('name');
  render();
});

render();
