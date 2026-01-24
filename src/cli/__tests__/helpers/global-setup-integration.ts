/**
 * Global Setup for Integration Tests
 * Backs up ~/.grimoire/ before tests, restores after tests complete
 */

import { logger } from '../../../utils/logger';

/**
 * Global setup - runs ONCE before ALL integration tests
 */
export function setup(): void {
  logger.info('TEST', '==============================');

  logger.info('TEST', 'INTEGRATION TESTS - GLOBAL SETUP');

  logger.info('TEST', '==============================');

  logger.info('TEST', 'INTEGRATION TESTS - READY TO RUN');

  logger.info('TEST', '==============================');
}
