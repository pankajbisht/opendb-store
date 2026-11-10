// Compares the published type declarations with the committed copies in api/,
// so any change to the public API shows up in review. Run after the build.
// `--update` accepts the current declarations.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const api = join(root, 'api');
const update = process.argv.includes('--update');

const files = readdirSync(dist).filter((file) => file.endsWith('.d.ts'));
const changed = [];

mkdirSync(api, { recursive: true });

for (const file of files) {
  const current = readFileSync(join(dist, file), 'utf8');
  let saved = '';

  try {
    saved = readFileSync(join(api, file), 'utf8');
  } catch {
    // A new entry point has no saved copy yet.
  }

  if (current === saved) continue;
  if (update) writeFileSync(join(api, file), current);
  else changed.push(file);
}

if (changed.length) {
  console.error(
    `The public API changed in: ${changed.join(', ')}.\n` +
      'If this is intended, run `npm run api:update` and commit api/.'
  );
  process.exitCode = 1;
} else {
  console.log(update ? 'API report updated.' : 'API matches api/.');
}
