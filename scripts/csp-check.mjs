// Loads every browser bundle on a page with a strict Content Security Policy
// and Trusted Types, then fails if anything is blocked. Run after the build.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const BUNDLES = [
  'opendb-umd.min.js',
  'debug-umd.min.js',
  'indexeddb-umd.min.js',
  'compress-umd.min.js',
];
const POLICY = [
  "default-src 'none'",
  // Browsers request a site icon on their own; allow it so it is not counted.
  "img-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');

const page = `<!doctype html><meta charset="utf-8"><title>CSP</title>
${BUNDLES.map((file) => `<script src="/${file}"></script>`).join('\n')}
<script src="/exercise.js"></script>`;

const exercise = `
window.result = (async () => {
  const store = db.createStore({ namespace: 'csp', serializer: dbCompress.compressed({ minLength: 1 }) });
  store.set('k', { text: 'hello '.repeat(50) });
  db.cookie.set('c', 1);
  const idb = dbIndexed.createIndexedStore({ database: 'csp' });
  await idb.set('k', new Date());
  dbDebug.inspect(store);
  await dbDebug.inspect(idb);
  return store.get('k').text.length === 300 && db.cookie.get('c') === 1;
})();`;

const server = createServer((request, response) => {
  const name = request.url.slice(1);
  response.setHeader('content-security-policy', POLICY);

  if (request.url === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(page);
  } else if (name === 'favicon.ico') {
    response.writeHead(204).end();
  } else if (name === 'exercise.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(exercise);
  } else if (BUNDLES.includes(name)) {
    response.setHeader('content-type', 'text/javascript');
    response.end(readFileSync(join(root, 'dist', name)));
  } else {
    response.writeHead(404).end();
  }
});

await new Promise((done) => server.listen(4318, '127.0.0.1', done));
let failed = false;

for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch();
  const tab = await browser.newPage();
  const problems = [];

  tab.on('pageerror', (error) => problems.push(error.message));
  tab.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  await tab.addInitScript(() => {
    window.violations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    );
  });
  await tab.goto('http://127.0.0.1:4318/');

  const worked = await tab.evaluate(() => window.result);
  const violations = await tab.evaluate(() => window.violations);
  problems.push(...violations);

  if (!worked) problems.push('the exercise did not complete');
  console.log(
    problems.length ? `FAIL ${name}: ${problems.join(' | ')}` : `ok - ${name}`
  );
  failed ||= problems.length > 0;
  await browser.close();
}

server.close();
process.exitCode = failed ? 1 : 0;
