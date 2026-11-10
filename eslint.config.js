import pluginJs from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'public/'] },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
    },
  },
  {
    files: ['src/debug.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Node scripts that also send code to run inside browser pages.
    files: ['scripts/**/*.mjs', 'bench/**/*.mjs', '*.config.js'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: { 'no-console': 'off', 'no-undef': 'off' },
  },
];
