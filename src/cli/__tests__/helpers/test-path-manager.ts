/**
 * Test Path Manager - Helper for Grimoire Directory Isolation in Tests
 *
 * PURPOSE:
 * Provides utilities to setup and cleanup isolated grimoire directories for tests,
 * preventing pollution of user's ~/.grimoire directory.
 *
 * USAGE:
 * ```typescript
 * describe('My Test', () => {
 *   let testGrimoireDir: string;
 *
 *   beforeAll(async () => {
 *     testGrimoireDir = await setupTestGrimoireDir('my-test-name');
 *   });
 *
 *   afterAll(async () => {
 *     await cleanupTestGrimoireDir(testGrimoireDir);
 *   });
 * });
 * ```
 *
 * PRINCIPLE: Single Responsibility (SRP)
 * This module is responsible ONLY for test directory management.
 */

import { homedir } from 'os';
import { join } from 'path';
import { resetPathsCache } from '../../../utils/paths';

/**
 * Setup isolated test directory for grimoire tests
 *
 * Creates a test-specific directory under .test-grimoire/ and sets GRIMOIRE_HOME
 * to point to it, ensuring tests don't pollute ~/.grimoire
 *
 * @param testName - Unique name for this test (e.g., 'basic-auth-http')
 * @returns Absolute path to the test grimoire directory
 *
 * @example
 * ```typescript
 * const testDir = setupTestGrimoireDir('my-test');
 * // testDir = /workspace/.test-grimoire/my-test
 * // GRIMOIRE_HOME = /workspace/.test-grimoire/my-test
 * ```
 */
export function setupTestGrimoireDir(testName: string): string {
  // Create test directory path under .test-grimoire/
  // Using process.cwd() ensures it's in the workspace, not home directory
  const testDir = join(process.cwd(), '.test-grimoire', testName);

  // Set GRIMOIRE_HOME environment variable
  // This overrides the default ~/.grimoire path
  process.env.GRIMOIRE_HOME = testDir;

  // Reset path cache to pick up new environment variable
  // Without this, cached paths would still use ~/.grimoire
  resetPathsCache();

  // Return the path - directory will be created by ensureDirectories()
  // This tests the real production code path
  return testDir;
}

/**
 * Cleanup test directory after test
 *
 * Removes test directory, unsets GRIMOIRE_HOME, and resets path cache
 * to restore default behavior.
 *
 * @param testDir - Path to test directory (from setupTestGrimoireDir)
 *
 * @example
 * ```typescript
 * await cleanupTestGrimoireDir(testDir);
 * // Directory deleted, GRIMOIRE_HOME unset, cache cleared
 * ```
 */
export async function cleanupTestGrimoireDir(testDir: string): Promise<void> {
  const { rm } = await import('fs/promises');

  // Remove test directory and all contents
  // force: true prevents error if directory doesn't exist
  await rm(testDir, { recursive: true, force: true });

  // Unset GRIMOIRE_HOME environment variable
  delete process.env.GRIMOIRE_HOME;

  // Reset path cache to restore default ~/.grimoire behavior
  resetPathsCache();
}

/**
 * Get current grimoire directory path (useful for assertions)
 *
 * @returns Current GRIMOIRE_HOME or default ~/.grimoire path
 *
 * @example
 * ```typescript
 * const dir = getCurrentGrimoireDir();
 * expect(dir).toBe('/workspace/.test-grimoire/my-test');
 * ```
 */
export function getCurrentGrimoireDir(): string {
  const envPath = process.env.GRIMOIRE_HOME;
  if (envPath != null && envPath !== '') {
    return envPath;
  }
  return join(homedir(), '.grimoire');
}
