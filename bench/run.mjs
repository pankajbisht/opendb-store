// Runs every benchmark in turn. See bench/README.md.
import { execFileSync } from 'node:child_process';

for (const script of ['full-storage.mjs', 'compression.mjs', 'indexeddb.mjs']) {
  console.log(`\n## ${script}\n`);
  execFileSync('node', [new URL(script, import.meta.url).pathname], {
    stdio: 'inherit',
  });
}
