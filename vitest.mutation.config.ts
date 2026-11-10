import { defineConfig } from 'vitest/config';

// Mutation testing runs the jsdom tests only; real browsers would be too slow
// to repeat for every mutant.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/*.test.ts', 'tests/*.test.tsx'],
    // Instrumented code runs several times slower.
    testTimeout: 60_000,
  },
});
