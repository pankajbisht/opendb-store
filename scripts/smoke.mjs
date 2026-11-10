// Loads the built package the way consumers do. Run after `npm run build`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'opendb-smoke-'));
const tsc = join(root, 'node_modules/typescript/bin/tsc');

mkdirSync(join(dir, 'node_modules'));
symlinkSync(root, join(dir, 'node_modules/opendb-store'));

function write(name, content) {
  writeFileSync(join(dir, name), content);
  return name;
}

function check(label, run) {
  run();
  console.log(`ok - ${label}`);
}

const usage = `
  assert.equal(db.local.set('k', 1), false);
  assert.equal(db.local.get('k', 'server'), 'server');
  assert.equal(createStore({ namespace: 'x' }).has('k'), false);
  assert.deepEqual(where(db.local, 'none', {}), []);
  assert.equal(db.cookie.set('c', 1), false);
  assert.equal(await idb.set('k', 1), false);
  assert.equal(await idb.get('k', 'server'), 'server');
  assert.equal((await inspect(idb)).count, 0);
  assert.equal(inspect(db.cookie).count, 0);
  console.log('used');
`;

try {
  check('no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.dependencies ?? {}, {});
  });

  check('ESM import without window', () => {
    const file = write(
      'esm.mjs',
      `import assert from 'node:assert/strict';
       import db, { createStore } from 'opendb-store';
       import { where } from 'opendb-store/query';
       import { inspect } from 'opendb-store/debug';
       import { indexed as idb } from 'opendb-store/indexeddb';
       import { compress, decompress } from 'opendb-store/compress';
       import { createCache } from 'opendb-store/cache';
       import { useStored } from 'opendb-store/react';
       assert.equal(typeof useStored, 'function');
       assert.equal(createCache(db.local, { maxEntries: 2 }).set('k', 1), false);
       assert.equal(decompress(compress('hello hello')), 'hello hello');
       ${usage}`
    );
    assert.match(
      execFileSync('node', [file], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
      /used/
    );
  });

  check('CJS require without window', () => {
    const file = write(
      'cjs.cjs',
      `const assert = require('node:assert/strict');
       const lib = require('opendb-store');
       const { where } = require('opendb-store/query');
       const { inspect } = require('opendb-store/debug');
       const { indexed: idb } = require('opendb-store/indexeddb');
       const { compressed } = require('opendb-store/compress');
       const { createCache } = require('opendb-store/cache');
       assert.equal(typeof require('opendb-store/react').useStored, 'function');
       assert.equal(typeof createCache, 'function');
       assert.equal(typeof compressed().serialize, 'function');
       const { createStore } = lib;
       assert.ok(lib.default.local);
       const db = lib;
       (async () => {
         ${usage}
       })();`
    );
    assert.match(
      execFileSync('node', [file], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
      /used/
    );
  });

  check('script-tag global keeps db.local', () => {
    const items = new Map();
    const storage = {
      get length() {
        return items.size;
      },
      key: (i) => [...items.keys()][i] ?? null,
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => void items.set(k, v),
      removeItem: (k) => void items.delete(k),
    };
    const sandbox = { localStorage: storage, sessionStorage: storage };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
      readFileSync(join(root, 'dist/opendb-umd.min.js'), 'utf8'),
      sandbox
    );

    assert.equal(sandbox.db.local.set('k', 1), true);
    assert.equal(sandbox.db.local.get('k'), 1);
    assert.equal(items.get('app.k'), '{"value":1}');
    assert.equal(typeof sandbox.db.createStore, 'function');
    assert.equal(typeof sandbox.db.noConflict, 'function');
  });

  check('script-tag globals for debug and IndexedDB', () => {
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);

    for (const file of ['debug-umd.min.js', 'indexeddb-umd.min.js']) {
      vm.runInContext(readFileSync(join(root, 'dist', file), 'utf8'), sandbox);
    }

    assert.equal(typeof sandbox.dbDebug.debug, 'function');
    assert.equal(typeof sandbox.dbIndexed.createIndexedStore, 'function');
  });

  const consumer = `
    import db, { createStore, type Store } from 'opendb-store';
    import { where } from 'opendb-store/query';
    import { debug, inspect } from 'opendb-store/debug';
    import { createIndexedStore, indexed } from 'opendb-store/indexeddb';
    import { compressed } from 'opendb-store/compress';
    import { createCache, type Cache } from 'opendb-store/cache';
    import { useStored } from 'opendb-store/react';
    const cache: Cache = createCache(db.local, { maxEntries: 10 });
    const hook: typeof useStored = useStored;
    void [cache, hook];
    createStore({ serializer: compressed({ minLength: 512 }) });
    const idbValue: Promise<string> = indexed.get('k', 'default');
    const idbStore = createIndexedStore({ namespace: 'n', database: 'd' });
    const idbList: Promise<unknown[]> = where(idbStore, 'k', {});
    const idbReport: Promise<number> = inspect(idbStore).then((r) => r.used);
    void [idbValue, idbList, idbReport];
    debug(db);
    const percent: number = inspect(db.cookie).percentUsed;
    const store: Store = createStore({ namespace: 'x' });
    const a: string = db.local.get('k', 'default');
    const b: number | null = store.get<number>('k');
    const c: boolean = db.session.set('k', a);
    where(store, 'k', { b, c, percent });
  `;

  for (const [resolution, module, file] of [
    ['bundler', 'esnext', 'bundler.ts'],
    ['nodenext', 'nodenext', 'node.mts'],
    ['nodenext', 'nodenext', 'node.cts'],
  ]) {
    check(`TypeScript resolves types (${resolution}, ${file})`, () => {
      write(file, consumer);
      execFileSync(
        'node',
        [
          tsc,
          '--noEmit',
          '--strict',
          '--esModuleInterop',
          '--target',
          'es2020',
          '--lib',
          'es2020,dom',
          '--typeRoots',
          join(dir, 'no-ambient-types'),
          '--module',
          module,
          '--moduleResolution',
          resolution,
          file,
        ],
        { cwd: dir, stdio: 'pipe' }
      );
    });
  }
} catch (error) {
  console.error(error.stdout?.toString() || error.message);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
