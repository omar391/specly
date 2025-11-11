import { defineConfig } from 'vitest/config';

if (typeof process !== 'undefined' && process.versions?.bun) {
    console.error('\n[TEST RUNTIME ERROR] Detected Bun runtime. Please run tests via `npm test` (Node + Vitest).\n');
    throw new Error('Bun runtime not supported for test execution. Use `npm test`.');
}

export default defineConfig({
    test: {
        maxWorkers: 2,
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
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
