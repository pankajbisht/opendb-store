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
      r.end('<!doctype html><meta charset=utf-8><title>f</title>');
    }
  })
  .listen(4174);
const out = {};
for (const [n, t] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
]) {
  const b = await t.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const load = async () => {
    await p.goto('http://localhost:4174/');
    await p.addScriptTag({ url: 'http://localhost:4174/opendb-umd.min.js' });
    if (fs.existsSync(DIST + 'compress-umd.min.js'))
      await p.addScriptTag({
        url: 'http://localhost:4174/compress-umd.min.js',
      });
  };
  await load();
  const r = {};
  // Scenario A: many 1 KB records filling about 4.5 MB.
  Object.assign(
    r,
    await p.evaluate(() => {
      localStorage.clear();
      const s = db.createStore({ namespace: 'm', onError() {} });
      const rec = (i) => ({
        id: i,
        name: 'Product ' + i,
        tags: ['a', 'b'],
        text: 'x'.repeat(900),
      });
      for (let i = 0; i < 4400; i++)
        s.set('k' + i, rec(i), i % 2 ? { expire: 1e9 } : undefined);
      const T = (fn, n = 5) => {
        const t = performance.now();
        for (let i = 0; i < n; i++) fn(i);
        return +((performance.now() - t) / n).toFixed(2);
      };
      return {
        'A used chars': s.used(),
        'A get one ms': T(() => s.get('k10'), 200),
        'A has ms': T(() => s.has('k10'), 200),
        'A keys() ms': T(() => s.keys()),
        'A count ms': T(() => s.count),
        'A ttl ms': T(() => s.ttl('k11'), 200),
        'A values() ms': T(() => s.values()),
        'A used() ms': T(() => s.used()),
        'A free() ms': T(() => s.free()),
        'A purgeExpired ms': T(() => s.purgeExpired()),
        'A set small ms': T((i) => s.set('x' + (i % 3), 1), 200),
        'A failing set ms': T(() => s.set('huge', 'y'.repeat(900000)), 5),
      };
    })
  );
  // First access after a reload, which is browser work.
  await load();
  r['A first read after reload ms'] = await p.evaluate(() => {
    const t = performance.now();
    localStorage.getItem('m.k1');
    return +(performance.now() - t).toFixed(2);
  });
  // Scenario B: one 4.4 MB value.
  Object.assign(
    r,
    await p.evaluate(() => {
      localStorage.clear();
      const s = db.createStore({ namespace: 'b', onError() {} });
      s.set('big', { rows: 'z'.repeat(4_400_000) }, { expire: 1e9 });
      s.set('small', 1);
      const T = (fn, n = 10) => {
        const t = performance.now();
        for (let i = 0; i < n; i++) fn(i);
        return +((performance.now() - t) / n).toFixed(2);
      };
      return {
        'B get small ms': T(() => s.get('small'), 200),
        'B get big ms': T(() => s.get('big')),
        'B has big ms': T(() => s.has('big')),
        'B keys() ms': T(() => s.keys()),
        'B ttl big ms': T(() => s.ttl('big')),
        'B size big ms': T(() => s.size('big')),
      };
    })
  );
  out[n] = r;
  await b.close();
}
srv.close();
const pad = (x, w) => String(x).padEnd(w);
console.log(pad('', 30), pad('chromium', 10), pad('firefox', 10), 'webkit');
for (const k of Object.keys(out.chromium))
  console.log(
    pad(k, 30),
    pad(out.chromium[k], 10),
    pad(out.firefox[k], 10),
    out.webkit[k]
  );
