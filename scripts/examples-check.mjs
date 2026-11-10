// Opens every example in Chromium, Firefox, and WebKit, uses it the way a
// person would, and checks the demo server's path restrictions. It also checks
// emulated phones. Run after the build.
import { chromium, devices, firefox, webkit } from 'playwright';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
const srv = spawn('node', [resolve(import.meta.dirname, 'serve.mjs')], {
  env: { ...process.env, PORT: '4322' },
  stdio: 'ignore',
});
const BASE = 'http://127.0.0.1:4322';
for (let i = 0; i < 40; i++) {
  try {
    await fetch(BASE + '/public/');
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}
let failed = 0,
  passed = 0;
const ok = (c, m) => {
  if (c) passed++;
  else {
    failed++;
    console.log('FAIL', m);
  }
};
const raw = (p) =>
  new Promise((res) =>
    http.get({ host: '127.0.0.1', port: 4322, path: p }, (r) => {
      let b = '';
      r.on('data', (d) => (b += d));
      r.on('end', () => res({ s: r.statusCode, b, l: r.headers.location }));
    })
  );
for (const p of [
  '/../../etc/passwd',
  '/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
  '/public/..%2f..%2f..%2f..%2fetc/passwd',
  '/package.json',
  '/.git/HEAD',
  '/src/index.ts',
  '/public/../.git/config',
  '/publicfoo',
]) {
  const r = await raw(p);
  ok(r.s === 403, 'blocked ' + p + ' ' + r.s);
  console.log('blocked?', p, '->', r.s);
}
ok((await raw('/dist/opendb-esm.js')).s === 200, 'dist served');
ok((await raw('/%E0%A4%A')).s === 400, 'bad encoding 400');
ok((await raw('/')).l === '/public/', 'root redirect');
ok((await raw('/public/examples/basics')).s === 302, 'folder redirect');
const SLUGS = [
  'basics',
  'expiry',
  'theme-sync',
  'api-cache',
  'form-draft',
  'cookie-consent',
  'shopping-cart',
  'user-accounts',
  'schema-migration',
  'error-handling',
  'indexeddb',
  'compression',
  'storage-debug',
];
for (const [name, type] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
]) {
  const b = await type.launch();
  const ctx = await b.newContext();
  const errs = [];
  const logs = [];
  const open = async (s) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(s + ': ' + e.message));
    p.on('console', (m) => {
      logs.push(m.text());
      if (m.type() === 'error') errs.push(s + ': ' + m.text());
    });
    p.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('favicon'))
        errs.push(s + ': ' + r.status() + ' ' + r.url());
    });
    await p.goto(BASE + '/public/examples/' + s + '/');
    await p.waitForTimeout(150);
    return p;
  };
  const T = (p, s) => p.textContent(s);
  const until = (p, s, v, t = 9000) =>
    p.waitForFunction(
      ([s, v]) => document.querySelector(s).textContent === v,
      [s, v],
      { timeout: t }
    );
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      ok(false, name + ' ' + label + ': ' + e.message.split('\n')[0]);
    }
  };
  await step('gallery', async () => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('gallery: ' + e.message));
    await p.goto(BASE + '/public/');
    ok(
      (await p.locator('.gallery a').count()) === SLUGS.length,
      name + ' gallery count'
    );
    await p.click('text=Shopping cart');
    await p.waitForSelector('#catalog button');
    await p.click('.back');
    await p.waitForSelector('.gallery');
    await p.close();
  });
  await step('basics', async () => {
    const p = await open('basics');
    ok((await T(p, '#name')) === 'Nothing saved yet', name + ' basics empty');
    await p.fill('#input', 'Ada');
    await p.click('#form button:not(.secondary)');
    await until(p, '#name', 'Ada');
    await p.reload();
    await until(p, '#name', 'Ada');
    ok(true, '');
    await p.click('#remove');
    await until(p, '#name', 'Nothing saved yet');
    await p.close();
  });
  await step('expiry', async () => {
    const p = await open('expiry');
    await p.click('#save');
    await until(p, '#offer', 'SAVE10');
    ok((await T(p, '#left')).endsWith('s'), name + ' expiry left');
    await until(p, '#offer', 'Expired or not saved');
    ok((await T(p, '#left')) === 'None', name + ' expiry none');
    await p.close();
  });
  await step('theme', async () => {
    const a = await open('theme-sync');
    const c = await open('theme-sync');
    await c.click('[data-theme-choice=dark]');
    await until(a, '#current', 'dark');
    ok(
      (await a.evaluate(() => document.documentElement.dataset.theme)) ===
        'dark',
      name + ' theme attr'
    );
    ok((await T(a, '#changes')) === '1', name + ' theme changes');
    await c.click('[data-theme-choice=light]');
    await until(a, '#current', 'light');
    await a.close();
    await c.close();
  });
  await step('cache', async () => {
    const p = await open('api-cache');
    await p.click('#load');
    await until(p, '#source', 'Server');
    await p.click('#load');
    await until(p, '#source', 'Cache');
    ok((await T(p, '#calls')) === '1', name + ' cache calls');
    await p.click('#clear');
    await p.click('#load');
    await until(p, '#calls', '2');
    await p.click('#clear');
    await p.close();
  });
  await step('draft', async () => {
    const p = await open('form-draft');
    await p.fill('[name=title]', 'Hello');
    await p.reload();
    await p.waitForTimeout(150);
    ok(
      (await p.inputValue('[name=title]')) === 'Hello',
      name + ' draft restored'
    );
    await p.click('#form button');
    ok((await p.inputValue('[name=title]')) === '', name + ' draft reset');
    ok((await T(p, '#output')) === '{}', name + ' draft cleared');
    await p.close();
  });
  await step('consent', async () => {
    const p = await open('cookie-consent');
    ok(await p.isVisible('#banner'), name + ' banner');
    await p.click('#accept');
    ok(!(await p.isVisible('#banner')), name + ' banner hidden');
    ok((await T(p, '#choice')).includes('true'), name + ' choice');
    ok(
      (await T(p, '#expires')) === '365 days',
      name + ' expires ' + (await T(p, '#expires'))
    );
    ok((await T(p, '#raw')).includes('app.consent'), name + ' raw');
    await p.reload();
    await p.waitForTimeout(150);
    ok(!(await p.isVisible('#banner')), name + ' persisted');
    await p.click('#reset');
    ok(await p.isVisible('#banner'), name + ' banner back');
    await p.close();
  });
  await step('cart', async () => {
    const p = await open('shopping-cart');
    await p.click('text=Add Keyboard');
    await p.click('text=Add Keyboard');
    await p.click('text=Add Mouse');
    ok((await p.locator('#items li').count()) === 2, name + ' cart lines');
    ok((await T(p, '#items')).includes('Keyboard x 2'), name + ' qty');
    await p.click('#items li:first-child button');
    await until(p, '#later', '1');
    ok((await T(p, '#skus')) === 'Keyboard, Mouse', name + ' pluck');
    await p.reload();
    await until(p, '#later', '1');
    await p.click('#empty');
    await until(p, '#skus', 'None');
    await p.close();
  });
  await step('users', async () => {
    const p = await open('user-accounts');
    await p.fill('#note', 'shoes');
    await p.click('text=Add');
    await p.selectOption('#user', 'grace');
    await p.fill('#note', 'bags');
    await p.click('text=Add');
    let o = JSON.parse(await T(p, '#output'));
    ok(o.ada[0] === 'shoes' && o.grace[0] === 'bags', name + ' users separate');
    await p.click('#logout');
    o = JSON.parse(await T(p, '#output'));
    ok(o.ada.length === 1 && o.grace.length === 0, name + ' logout scoped');
    await p.selectOption('#user', 'ada');
    await p.click('#logout');
    await p.close();
  });
  await step('migrate', async () => {
    const p = await open('schema-migration');
    await p.click('#write');
    ok((await T(p, '#raw')) === '{"value":{"dark":true}}', name + ' old raw');
    await p.click('#read');
    ok((await T(p, '#value')) === '{"theme":"dark"}', name + ' migrated');
    ok((await T(p, '#raw')).includes('"v":2'), name + ' saved v2');
    await p.close();
  });
  await step('errors', async () => {
    const p = await open('error-handling');
    await p.click('#circular');
    await until(p, '#result', 'set returned false');
    await p.click('#expire');
    await p.click('#cookie');
    await p.click('#corrupt');
    await until(p, '#result', 'get returned the default value');
    await p.click('#quota');
    await p.waitForFunction(
      () => document.querySelector('#result').textContent.startsWith('Stored'),
      null,
      { timeout: 20000 }
    );
    const t = await T(p, '#errors');
    for (const c of [
      'SERIALIZE_FAILED',
      'INVALID_ARGUMENT',
      'QUOTA_EXCEEDED',
      'CORRUPT_VALUE',
    ])
      ok(t.includes(c), name + ' error ' + c);
    ok(
      (await p.evaluate(
        () =>
          Object.keys(localStorage).filter((k) => k.startsWith('errors-demo.'))
            .length
      )) === 0,
      name + ' space returned'
    );
    console.log(name, 'quota:', await T(p, '#result'));
    await p.close();
  });
  await step('indexeddb', async () => {
    const p = await open('indexeddb');
    await until(p, '#current', 'None');
    const q = await open('indexeddb');
    await p.fill('#note', 'hello');
    await p.click('#form button');
    await until(p, '#current', 'hello');
    await until(q, '#current', 'hello');
    await p.click('#dataset');
    await until(p, '#result', 'Saved 12 MB', 20000);
    await p.click('#types');
    await until(p, '#result', 'Date and Map came back intact');
    await p.click('#file');
    await p.waitForFunction(() =>
      /^(File says|Not saved)/.test(
        document.querySelector('#result').textContent
      )
    );
    const f = await T(p, '#result');
    ok(
      f ===
        (name === 'webkit'
          ? 'Not saved: STORAGE_UNAVAILABLE'
          : 'File says: Saved in IndexedDB'),
      name + ' file ' + f
    );
    await p.click('#patches');
    await until(p, '#result', '20 of 20 fields were kept');
    await p.reload();
    await until(p, '#current', 'hello');
    ok((await p.locator('#items li').count()) >= 3, name + ' idb list');
    await p.click('#clear');
    await until(p, '#result', 'Cleared');
    await until(p, '#current', 'None');
    await p.close();
    await q.close();
  });
  await step('compression', async () => {
    const p = await open('compression');
    await p.click('#save');
    await p.waitForFunction(
      () => document.querySelector('#packed-size').textContent !== '-'
    );
    const plainK = parseFloat(await T(p, '#plain-size'));
    const packedK = parseFloat(await T(p, '#packed-size'));
    ok(plainK / packedK > 10, name + ' ratio ' + plainK + '/' + packedK);
    await p.click('#fill');
    await p.waitForFunction(
      () => document.querySelector('#packed-fit').textContent !== '-',
      null,
      { timeout: 60000 }
    );
    const a = parseInt((await T(p, '#plain-fit')).replace(/,/g, ''));
    const c = parseInt((await T(p, '#packed-fit')).replace(/,/g, ''));
    ok(c > a * 2, name + ' fit ' + a + ' vs ' + c);
    ok(
      (await p.evaluate(() => localStorage.length)) === 0,
      name + ' space returned'
    );
    console.log(name, 'fit', a, '->', c);
    await p.click('#clear');
    await p.close();
  });
  await step('debug', async () => {
    const p = await open('storage-debug');
    await p.waitForFunction(
      () => document.querySelectorAll('#reports .card').length === 4
    );
    ok(true, '');
    await p.click('#small');
    await p.click('#large');
    await p.waitForFunction(() =>
      document
        .querySelector('#report-indexeddb')
        .textContent.includes('2 entries')
    );
    for (const k of ['local', 'session', 'cookie', 'indexeddb'])
      ok(
        (await T(p, '#report-' + k)).includes('2 entries'),
        name + ' debug ' + k
      );
    ok(
      await p.evaluate(
        () => document.querySelector('#report-local progress').value > 0
      ),
      name + ' progress'
    );
    await p.click('#print');
    await p.waitForTimeout(100);
    await p.waitForTimeout(150);
    ok(
      logs.some((l) => l.includes('[opendb-store] indexeddb')),
      name + ' console report'
    );
    await p.click('#clear');
    await p.waitForFunction(() =>
      document
        .querySelector('#report-indexeddb')
        .textContent.includes('0 entries')
    );
    ok(
      (await T(p, '#report-cookie')).includes('0 entries'),
      name + ' debug clear'
    );
    await p.close();
  });
  ok(
    errs.length === 0,
    name + ' page errors: ' + errs.join(' | ').slice(0, 400)
  );
  if (name === 'chromium') {
    const m = await b.newContext({ viewport: { width: 375, height: 800 } });
    const p = await m.newPage();
    for (const s of ['', ...SLUGS.map((x) => 'examples/' + x + '/')]) {
      await p.goto(BASE + '/public/' + s);
      await p.waitForTimeout(80);
      const over = await p.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      ok(over <= 0, 'phone overflow ' + s + ' ' + over);
    }
    await m.close();
  }
  await b.close();
}

// Emulated phones: layout, touch, and the basic flows.
for (const [label, type, device] of [
  ['iPhone 13 (WebKit)', webkit, devices['iPhone 13']],
  ['Pixel 7 (Chromium)', chromium, devices['Pixel 7']],
]) {
  const b = await type.launch();
  const ctx = await b.newContext({ ...device });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  for (const s of ['', ...SLUGS.map((x) => 'examples/' + x + '/')]) {
    await p.goto(BASE + '/public/' + s);
    await p.waitForTimeout(60);
    const over = await p.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    ok(over <= 0, label + ' overflow ' + s + ' ' + over);
  }
  await p.goto(BASE + '/public/examples/basics/');
  await p.tap('#input');
  await p.fill('#input', 'Phone');
  await p.tap('#form button:not(.secondary)');
  await p.waitForFunction(
    () => document.querySelector('#name').textContent === 'Phone'
  );
  await p.reload();
  ok((await p.textContent('#name')) === 'Phone', label + ' basics persists');
  await p.goto(BASE + '/public/examples/shopping-cart/');
  await p.tap('text=Add Keyboard');
  ok((await p.locator('#items li').count()) === 1, label + ' cart tap');
  await p.goto(BASE + '/public/examples/storage-debug/');
  await p.tap('#large');
  await p.waitForFunction(() =>
    document
      .querySelector('#report-indexeddb')
      .textContent.includes('1 entries')
  );
  ok(true, '');
  await p.tap('#clear');
  ok(errs.length === 0, label + ' page errors ' + errs.join(' | '));
  await b.close();
}
srv.kill();
console.log(failed ? 'FAILED ' + failed : 'ALL PASSED', passed, 'checks');
process.exit(failed ? 1 : 0);
