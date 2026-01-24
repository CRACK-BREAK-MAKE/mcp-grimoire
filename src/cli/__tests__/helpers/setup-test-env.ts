/**
 * Test Environment Setup
 * Mocks process.exit to prevent tests from exiting the process
 *
 * Industry Standard: Jest, Vitest, and all major test runners mock process.exit
 * because CLI tools call process.exit() in production but tests need to continue.
 */

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

let processExitSpy: ReturnType<typeof vi.spyOn> | undefined;

// Global mock that applies to the entire test suite
// This ensures process.exit is mocked even in beforeAll hooks
beforeAll(() => {
  processExitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation((_code?: string | number | null) => {
      // Don't actually exit - just return undefined
      // Tests can spy on process.exit separately if they need to assert it was called
      return undefined as never;
    });
});

afterAll(() => {
  if (processExitSpy !== undefined) {
    processExitSpy.mockRestore();
  }
});

// Also refresh the mock before/after each test for test isolation
beforeEach(() => {
  // If spy doesn't exist (shouldn't happen), create it
  if (processExitSpy === undefined) {
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: string | number | null) => {
        return undefined as never;
      });
  }
});

afterEach(() => {
  // Clear mock calls but keep the mock active
  if (processExitSpy !== undefined) {
    processExitSpy.mockClear();
  }
});
