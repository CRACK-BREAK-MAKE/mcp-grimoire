/**
 * Integration Test Setup - Backup/Restore ~/.grimoire/ Folder
 * Ensures tests run against real production paths without polluting user data
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync } from 'fs';
import { cp, rm, mkdir } from 'fs/promises';

const GRIMOIRE_DIR = join(homedir(), '.grimoire');
const BACKUP_DIR = join(homedir(), '.grimoire-backup-integration-tests');

/**
 * Backup ~/.grimoire/ folder before running integration tests
 * Creates backup at ~/.grimoire-backup-integration-tests/
 */
export async function backupGrimoireFolder(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[INTEGRATION SETUP] Backing up ~/.grimoire/ folder...');

  // If backup already exists, remove it (from previous failed run)
  if (existsSync(BACKUP_DIR)) {
    await rm(BACKUP_DIR, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log('[INTEGRATION SETUP] Removed old backup');
  }

  // If grimoire folder exists, back it up
  if (existsSync(GRIMOIRE_DIR)) {
    await cp(GRIMOIRE_DIR, BACKUP_DIR, { recursive: true });
    // eslint-disable-next-line no-console
    console.log(`[INTEGRATION SETUP] ✓ Backed up to ${BACKUP_DIR}`);

    // List what was backed up
    const files = readdirSync(GRIMOIRE_DIR);
    if (files.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[INTEGRATION SETUP] Backed up files: ${files.join(', ')}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[INTEGRATION SETUP] No existing ~/.grimoire/ folder to backup');
  }

  // Ensure grimoire folder exists (may be empty after backup)
  await mkdir(GRIMOIRE_DIR, { recursive: true });
  // eslint-disable-next-line no-console
  console.log('[INTEGRATION SETUP] ✓ ~/.grimoire/ folder ready for tests');
}

/**
 * Restore ~/.grimoire/ folder after integration tests complete
 * Removes test data and restores original grimoire folder
 */
export async function restoreGrimoireFolder(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[INTEGRATION CLEANUP] Restoring ~/.grimoire/ folder...');

  // Remove test-created grimoire folder entirely
  if (existsSync(GRIMOIRE_DIR)) {
    const testFiles = readdirSync(GRIMOIRE_DIR);
    // eslint-disable-next-line no-console
    console.log(`[INTEGRATION CLEANUP] Removing test files: ${testFiles.join(', ')}`);
    await rm(GRIMOIRE_DIR, { recursive: true, force: true });
  }

  // Restore backup if it exists
  if (existsSync(BACKUP_DIR)) {
    await cp(BACKUP_DIR, GRIMOIRE_DIR, { recursive: true });
    await rm(BACKUP_DIR, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log('[INTEGRATION CLEANUP] ✓ Restored from backup');

    const restored = readdirSync(GRIMOIRE_DIR);
    if (restored.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[INTEGRATION CLEANUP] Restored files: ${restored.join(', ')}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[INTEGRATION CLEANUP] No backup to restore (folder did not exist before)');
  }

  // eslint-disable-next-line no-console
  console.log('[INTEGRATION CLEANUP] ✓ Cleanup complete');
}

/**
 * Remove test spell files matching pattern test-*.spell.yaml
 * Useful for individual test cleanup
 */
export async function cleanupTestSpells(): Promise<void> {
  if (!existsSync(GRIMOIRE_DIR)) return;

  const files = readdirSync(GRIMOIRE_DIR);
  for (const file of files) {
    if (file.startsWith('test-') && file.endsWith('.spell.yaml')) {
      await rm(join(GRIMOIRE_DIR, file));
      // eslint-disable-next-line no-console
      console.log(`[TEST CLEANUP] Removed ${file}`);
    }
  }
}
