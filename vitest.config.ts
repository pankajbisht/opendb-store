import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/context.ts'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/*.test.ts'],
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
            'tests/browser/*.test.ts',
          ],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
              { browser: 'firefox' },
              { browser: 'webkit' },
            ],
          },
        },
      },
    ],
  },
});
