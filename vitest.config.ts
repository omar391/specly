import { defineConfig } from 'vitest/config';

// Minimal inline guard: prevent running tests under Bun runtime where native deps & Vitest mocking caused prior failures.
// We intentionally keep this extremely small and self-contained (no extra files or docs) per user request.
if (typeof process !== 'undefined' && process.versions?.bun) {
  // Fail fast with clear guidance.
  // eslint-disable-next-line no-console
  console.error('\n[TEST RUNTIME ERROR] Detected Bun runtime. Please run tests via `npm test` (Node + Vitest).\n');
  throw new Error('Bun runtime not supported for test execution. Use `npm test`.');
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'], // Only include test files from src folder
    exclude: [
      '.trunk/**',
      'node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/types.ts',
        '**/__mocks__/**',
        '**/test/**',
      ],
    },
    testTimeout: 10000,
  },
});
