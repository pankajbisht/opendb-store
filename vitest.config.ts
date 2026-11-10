import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// BROWSERS=chromium limits the browser project, for example to measure
// coverage, which only Chromium supports.
const browsers = (process.env.BROWSERS ?? 'chromium,firefox,webkit')
  .split(',')
  .map((browser) => ({ browser: browser.trim() }));

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/context.ts', 'src/version.ts'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/*.test.ts', 'tests/*.test.tsx'],
        },
      },
      {
        test: {
          name: 'browser',
          include: [
            'tests/contract.test.ts',
            'tests/expiry.test.ts',
            'tests/compat.test.ts',
            'tests/query.test.ts',
            'tests/migrate.test.ts',
            'tests/indexeddb.test.ts',
            'tests/compress.test.ts',
            'tests/browser/*.test.ts',
          ],
          // Real browsers include a few timing-based tests; CI retries them.
          retry: process.env.CI ? 2 : 0,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: browsers,
          },
        },
      },
    ],
  },
});
