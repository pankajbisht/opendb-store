import { createStore } from 'opendb-store';
import { $, show } from '../../shared/ui.js';

const drafts = createStore({ storage: 'session', namespace: 'draft' });
const form = $('#form');

function render() {
  show('#output', drafts.get('post', {}));
}

const saved = drafts.get('post', {});
form.elements.title.value = saved.title ?? '';
form.elements.message.value = saved.message ?? '';
render();

form.addEventListener('input', (event) => {
  drafts.patch('post', { [event.target.name]: event.target.value });
  $('#status').textContent = 'Draft saved';
  render();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  drafts.remove('post');
  form.reset();
  $('#status').textContent = 'Submitted and draft cleared';
  render();
});
