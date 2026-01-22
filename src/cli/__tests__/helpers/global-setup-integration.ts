/**
 * Global Setup for Integration Tests
 * Backs up ~/.grimoire/ before tests, restores after tests complete
 */

import { backupGrimoireFolder } from './setup-integration';

/**
 * Global setup - runs ONCE before ALL integration tests
 */
export async function setup(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n='.repeat(80));
  // eslint-disable-next-line no-console
  console.log('INTEGRATION TESTS - GLOBAL SETUP');
  // eslint-disable-next-line no-console
  console.log('='.repeat(80));

  await backupGrimoireFolder();

  // eslint-disable-next-line no-console
  console.log('='.repeat(80));
  // eslint-disable-next-line no-console
  console.log('INTEGRATION TESTS - READY TO RUN');
  // eslint-disable-next-line no-console
  console.log('='.repeat(80) + '\n');
}

/**
 * Global teardown - runs ONCE after ALL integration tests
 */
export function teardown(): void {
  // eslint-disable-next-line no-console
  console.log('\n='.repeat(80));
  // eslint-disable-next-line no-console
  console.log('INTEGRATION TESTS - GLOBAL TEARDOWN');
  // eslint-disable-next-line no-console
  console.log('='.repeat(80));

  // SKIP RESTORE: Keep spell files for manual verification
  // TODO: Re-enable restore once all tests are verified
  // await restoreGrimoireFolder();
  // eslint-disable-next-line no-console
  console.log(
    '[INTEGRATION CLEANUP] Skipping restore - keeping test spell files for manual verification'
  );
  // eslint-disable-next-line no-console
  console.log('[INTEGRATION CLEANUP] Test spell files location: ~/.grimoire/');
  // eslint-disable-next-line no-console
  console.log('[INTEGRATION CLEANUP] To clean up manually: rm ~/.grimoire/test-*.spell.yaml');

  // eslint-disable-next-line no-console
  console.log('='.repeat(80));
  // eslint-disable-next-line no-console
  console.log('INTEGRATION TESTS - CLEANUP COMPLETE');
  // eslint-disable-next-line no-console
  console.log('='.repeat(80) + '\n');
}
