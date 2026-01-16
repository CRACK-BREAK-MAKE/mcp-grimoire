import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for cross-platform container tests
 *
 * These tests are run in Docker containers to validate cross-platform compatibility.
 * They are excluded from the main test suite to avoid double-running tests.
 *
 * Run with: pnpm test:containers
 */
export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Pool: Use 'forks' to enable execArgv
    pool: 'forks',
    execArgv: ['--expose-gc'],

    // Only include container tests
    include: ['tests/cross-platform/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],

    // No coverage for container tests (they test in isolated environments)
    coverage: {
      enabled: false,
    },

    // Globals
    globals: true,

    // Output options
    silent: false,
    reporters: ['default'],

    // Extended timeouts for container operations
    testTimeout: 600_000, // 10 minutes for container tests (slow startup)
    hookTimeout: 600_000, // 10 minutes for beforeAll (container setup)
  },
});
