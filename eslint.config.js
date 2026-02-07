import pluginJs from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        Blob: 'readonly',
        TextEncoder: 'readonly',

        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',

        module: 'readable',
        define: 'readable',
        self: 'readable',
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
        'prettier/prettier': 'error',
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-useless-assignment': 'off',
        eqeqeq: 'error',
        'no-unused-vars': 'warn',
    }
  },
  pluginJs.configs.recommended,
  prettierConfig,
];
