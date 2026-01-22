/**
 * Global Setup for Integration Tests
 * Backs up ~/.grimoire/ before tests, restores after tests complete
 */

import { backupGrimoireFolder } from './setup-integration';
import { logger } from '../../../utils/logger';

/**
 * Global setup - runs ONCE before ALL integration tests
 */
export async function setup(): Promise<void> {
  logger.info('TEST', '==============================');

  logger.info('TEST', 'INTEGRATION TESTS - GLOBAL SETUP');

  logger.info('TEST', '==============================');

  await backupGrimoireFolder();

  logger.info('TEST', '==============================');

  logger.info('TEST', 'INTEGRATION TESTS - READY TO RUN');

  logger.info('TEST', '==============================');
}
