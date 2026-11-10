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
      r.end('<!doctype html><meta charset=utf-8><title>z</title>');
    }
  })
  .listen(4173);
for (const [n, t] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
]) {
  const b = await t.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:4173/');
  await p.addScriptTag({ url: 'http://localhost:4173/opendb-umd.min.js' });
  await p.addScriptTag({ url: 'http://localhost:4173/compress-umd.min.js' });
  const r = await p.evaluate(() => {
    const record = (id) => ({
      id,
      sku: 'SKU-' + (100000 + id),
      name: 'Product ' + id,
      price: Math.round(id * 7.3) / 10,
      inStock: id % 3 !== 0,
      tags: ['electronics', id % 2 ? 'sale' : 'new'],
      description:
        'Wireless keyboard with backlight and long battery life, model ' +
        (id % 40),
    });
    const batch = Array.from({ length: 2000 }, (_, i) => record(i));
    const out = {};
    const plain = db.createStore({ namespace: 'p', onError() {} });
    const packed = db.createStore({
      namespace: 'c',
      serializer: dbCompress.compressed(),
      onError() {},
    });
    const T = (fn, k = 5) => {
      const t = performance.now();
      for (let i = 0; i < k; i++) fn();
      return +((performance.now() - t) / k).toFixed(1);
    };
    localStorage.clear();
    out['JSON size, chars'] = JSON.stringify(batch).length;
    out['set plain ms'] = T(() => plain.set('batch', batch));
    out['set compressed ms'] = T(() => packed.set('batch', batch));
    out['get plain ms'] = T(() => plain.get('batch'));
    out['get compressed ms'] = T(() => packed.get('batch'));
    out['stored plain chars'] = plain.size('batch');
    out['stored compressed chars'] = packed.size('batch');
    out['ratio'] = +(
      out['stored plain chars'] / out['stored compressed chars']
    ).toFixed(1);
    out['keys() compressed ms'] = T(() => packed.keys(), 50);
    const fill = (s) => {
      localStorage.clear();
      let n = 0;
      while (
        s.set(
          'r' + n,
          Array.from({ length: 50 }, (_, i) => record(n * 50 + i))
        )
      )
        n++;
      localStorage.clear();
      return n * 50;
    };
    out['records that fit, plain'] = fill(plain);
    out['records that fit, compressed'] = fill(packed);
    return out;
  });
  console.log(n, JSON.stringify(r));
  await b.close();
}
srv.close();
