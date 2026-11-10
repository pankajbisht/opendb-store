// See bench/README.md.
import { chromium, firefox, webkit } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
const DIST = new URL('../dist/', import.meta.url).pathname;
const srv = http
  .createServer((q, r) => {
    if (q.url.endsWith('.js')) {
      r.setHeader('content-type', 'text/javascript');
      r.end(fs.readFileSync(DIST + q.url.slice(1)));
    } else {
      r.setHeader('content-type', 'text/html; charset=utf-8');
      r.end('<!doctype html><meta charset=utf-8><title>b</title>');
    }
  })
  .listen(4176);
const R = {};
for (const [n, t] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
]) {
  const b = await t.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:4176/');
  await p.addScriptTag({ url: 'http://localhost:4176/indexeddb-umd.min.js' });
  R[n] = await p.evaluate(async () => {
    const s = dbIndexed.createIndexedStore({ database: 'bench', onError() {} });
    const out = {};
    const T = async (fn, n = 1) => {
      const t = performance.now();
      for (let i = 0; i < n; i++) await fn(i);
      return +((performance.now() - t) / n).toFixed(3);
    };
    const rawGet = () =>
      new Promise((res) => {
        const r = indexedDB.open('native', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('e');
        r.onsuccess = () => res(r.result);
      });
    const db = await rawGet();
    const nPut = (k, v) =>
      new Promise((res) => {
        const tx = db.transaction('e', 'readwrite');
        tx.objectStore('e').put(v, k);
        tx.oncomplete = res;
      });
    const nGet = (k) =>
      new Promise((res) => {
        const q = db.transaction('e').objectStore('e').get(k);
        q.onsuccess = () => res(q.result);
      });
    out['native put ms'] = await T(() => nPut('k', { value: { a: 1 } }), 300);
    out['store.set ms'] = await T(() => s.set('k', { a: 1 }), 300);
    out['native get ms'] = await T(() => nGet('k'), 500);
    out['store.get ms'] = await T(() => s.get('k'), 500);
    out['store.has ms'] = await T(() => s.has('k'), 500);
    out['store.patch ms'] = await T(
      (i) => s.patch('p', { ['f' + (i % 5)]: i }),
      300
    );
    let t = performance.now();
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) => s.set('c' + i, { i }))
    );
    out['1000 parallel sets ms total'] = +(performance.now() - t).toFixed(1);
    await s.clear();
    t = performance.now();
    await s.setMany(Array.from({ length: 1000 }, (_, i) => ['c' + i, { i }]));
    out['setMany 1000 ms total'] = +(performance.now() - t).toFixed(1);
    t = performance.now();
    await s.getMany(Array.from({ length: 1000 }, (_, i) => 'c' + i));
    out['getMany 1000 ms total'] = +(performance.now() - t).toFixed(1);
    t = performance.now();
    await Promise.all(Array.from({ length: 1000 }, (_, i) => s.get('c' + i)));
    out['1000 parallel gets ms total'] = +(performance.now() - t).toFixed(1);
    await s.clear();
    for (let i = 0; i < 3000; i++)
      if (i % 500 === 499)
        await s.set('k' + i, { i, t: 'y'.repeat(200) }, { expire: 1e7 });
      else s.set('k' + i, { i, t: 'y'.repeat(200) }, { expire: 1e7 });
    await s.set('flush', 1);
    out['keys() 3001 ms'] = await T(() => s.keys(), 3);
    out['count 3001 ms'] = await T(() => s.count, 3);
    out['values() 3001 ms'] = await T(() => s.values(), 3);
    out['used() 3001 ms'] = await T(() => s.used(), 3);
    out['purgeExpired ms'] = await T(() => s.purgeExpired(), 3);
    t = performance.now();
    await s.clear();
    out['clear 3001 ms'] = +(performance.now() - t).toFixed(1);
    await s.set('big', new Uint8Array(20 * 1024 * 1024));
    out['get 20MB ms'] = await T(() => s.get('big'), 5);
    out['keys() with 20MB value ms'] = await T(() => s.keys(), 5);
    await s.clear();
    return out;
  });
  await b.close();
}
srv.close();
const pad = (x, n) => String(x).padEnd(n);
console.log(pad('', 30), pad('chromium', 11), pad('firefox', 11), 'webkit');
for (const k of Object.keys(R.chromium))
  console.log(
    pad(k, 30),
    pad(R.chromium[k], 11),
    pad(R.firefox[k], 11),
    R.webkit[k]
  );
