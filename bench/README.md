# Benchmarks

Run with `npm run bench`. It builds the library, then measures it in Chromium, Firefox, and WebKit.

| Script | Measures |
| --- | --- |
| `full-storage.mjs` | Every operation with about 4.5 MB already stored |
| `compression.mjs` | Size, speed, and capacity with and without compression |
| `indexeddb.mjs` | IndexedDB operations against raw IndexedDB, including batches |

Numbers vary by machine and are for comparing changes, not for absolute claims. Run before and after a change
on the same machine.
