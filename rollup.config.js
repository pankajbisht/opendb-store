import typescript from '@rollup/plugin-typescript';
import { dts } from 'rollup-plugin-dts';

const compile = () =>
  typescript({
    tsconfig: './tsconfig.json',
    include: ['src/**/*.ts'],
    noEmit: false,
    declaration: false,
    sourceMap: true,
  });

const base = { sourcemap: true, exports: 'named' };

const declarations = (input, name) => ({
  input,
  plugins: [dts()],
  output: [
    { file: `dist/${name}.d.ts`, format: 'es' },
    { file: `dist/${name}.d.cts`, format: 'es' },
  ],
});

export default [
  {
    input: 'src/index.ts',
    plugins: [compile()],
    output: [
      { ...base, file: 'dist/opendb-esm.js', format: 'es' },
      { ...base, file: 'dist/opendb.cjs', format: 'cjs' },
      // Named exports keep `db.local` working on the script-tag global.
      { ...base, file: 'dist/opendb-umd.js', format: 'umd', name: 'db', noConflict: true },
    ],
  },
  {
    input: 'src/query.ts',
    plugins: [compile()],
    output: [
      { ...base, file: 'dist/query.js', format: 'es' },
      { ...base, file: 'dist/query.cjs', format: 'cjs' },
    ],
  },
  {
    input: 'src/debug.ts',
    plugins: [compile()],
    output: [
      { ...base, file: 'dist/debug.js', format: 'es' },
      { ...base, file: 'dist/debug.cjs', format: 'cjs' },
      { ...base, file: 'dist/debug-umd.js', format: 'umd', name: 'dbDebug' },
    ],
  },
  {
    input: 'src/indexeddb/index.ts',
    plugins: [compile()],
    output: [
      { ...base, file: 'dist/indexeddb.js', format: 'es' },
      { ...base, file: 'dist/indexeddb.cjs', format: 'cjs' },
      { ...base, file: 'dist/indexeddb-umd.js', format: 'umd', name: 'dbIndexed' },
    ],
  },
  declarations('src/index.ts', 'index'),
  declarations('src/query.ts', 'query'),
  declarations('src/debug.ts', 'debug'),
  declarations('src/indexeddb/index.ts', 'indexeddb'),
];
