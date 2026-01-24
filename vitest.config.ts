import os from 'os';
import { defineConfig } from 'vitest/config';

// Windows needs longer timeouts due to slower process spawning in CI
const isWindows = os.platform() === 'win32';
const timeoutMultiplier = isWindows ? 2 : 1;

export default defineConfig({
  test: {
    // Use projects to separate unit and integration tests
    projects: [
      // Unit tests project
      {
        test: {
          name: 'unit',
          environment: 'node',
          pool: 'forks',
          execArgv: ['--expose-gc'],
          // Include only .test.ts files, exclude integration and e2e
          include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: [
            '**/*.integration.test.ts',
            '**/*.e2e.test.ts',
            'node_modules',
            'dist',
            'tests/**',
          ],
          globals: true,
          testTimeout: 10000 * timeoutMultiplier, // Unit tests should be fast (20s on Windows)
          hookTimeout: 10000 * timeoutMultiplier,
          // Setup file that runs before each test to mock process.exit
          setupFiles: ['./src/cli/__tests__/helpers/setup-test-env.ts'],
        },
      },
      // Integration tests project
      {
        test: {
          name: 'integration',
          environment: 'node',
          pool: 'forks',
          execArgv: ['--expose-gc'],
          // Include .integration.test.ts and .e2e.test.ts files
          include: [
            'src/**/__tests__/**/*.integration.test.ts',
            'src/**/*.integration.test.ts',
            'src/**/*.e2e.test.ts',
            'tests/**/*.integration.test.ts',
          ],
          globals: true,
          testTimeout: 60000 * timeoutMultiplier, // Integration tests can be slower (120s on Windows)
          hookTimeout: 60000 * timeoutMultiplier,
          // Global setup/teardown for backup/restore
          globalSetup: './src/cli/__tests__/helpers/global-setup-integration.ts',
          // Setup file that runs before each test to mock process.exit
          setupFiles: ['./src/cli/__tests__/helpers/setup-test-env.ts'],
        },
      },
    ],

    // Coverage configuration (shared across projects)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.ts', 'src/**/__tests__/**', 'src/**/*.spec.ts'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },

    // Output options
    silent: false,
    reporters: ['default', 'html'],
  },
});
