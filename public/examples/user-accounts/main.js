import { createStore } from 'opendb-store';
import { $, show } from '../../shared/ui.js';

const userStore = (name) => createStore({ namespace: `user-${name}` });
const USERS = ['ada', 'grace'];
const current = () => userStore($('#user').value);

function render() {
  show(
    '#output',
    Object.fromEntries(
      USERS.map((name) => [name, userStore(name).get('searches', [])])
    )
  );
}

$('#form').addEventListener('submit', (event) => {
  event.preventDefault();
  const store = current();
  store.set('searches', [...store.get('searches', []), $('#note').value]);
  $('#form').reset();
  render();
});

$('#logout').addEventListener('click', () => {
  current().clear();
  render();
});

$('#user').addEventListener('change', render);
render();
