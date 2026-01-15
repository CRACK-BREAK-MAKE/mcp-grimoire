import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Pool: Use 'forks' to enable execArgv and avoid VM memory leaks
    // vmThreads/vmForks have inherent memory leak issues with ESM
    pool: 'forks',
    execArgv: ['--expose-gc'],

    // Test file patterns
    include: ['src/**/__tests__/**/*.ts', 'src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'tests/cross-platform/**'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/*.spec.ts',
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },

    // Globals (makes test/expect/describe available without imports)
    globals: true,

    // Output options
    silent: false,
    reporters: ['default', 'html'],

    // Timeouts (increased for slower environments like containers/CI)
    testTimeout: 30000,  // 30s for individual tests
    hookTimeout: 30000,  // 30s for beforeEach/afterEach (gateway initialization can be slow)
  },
});
