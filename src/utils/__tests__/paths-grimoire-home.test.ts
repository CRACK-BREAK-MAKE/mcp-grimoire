/**
 * Integration Test: GRIMOIRE_HOME Environment Variable Override
 *
 * PURPOSE:
 * Validates that GRIMOIRE_HOME environment variable correctly overrides
 * the default ~/.grimoire path for all grimoire operations.
 *
 * COVERS:
 * - Path override via GRIMOIRE_HOME
 * - Cache invalidation with resetPathsCache()
 * - Restoration of default behavior after cleanup
 * - All path functions respect override
 *
 * NO MOCKS - Real path resolution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { homedir } from 'os';
import { getSpellDirectory, getEmbeddingCachePath, resetPathsCache, PATHS } from '../paths';

describe('GRIMOIRE_HOME Environment Variable Override', () => {
  let originalGrimoireHome: string | undefined;

  beforeEach(() => {
    // Save original value if set
    originalGrimoireHome = process.env.GRIMOIRE_HOME;
  });

  afterEach(() => {
    // Restore original value or delete
    if (originalGrimoireHome !== undefined) {
      process.env.GRIMOIRE_HOME = originalGrimoireHome;
    } else {
      delete process.env.GRIMOIRE_HOME;
    }
    // Always reset cache after test
    resetPathsCache();
  });

  it('should use custom directory when GRIMOIRE_HOME is set', () => {
    // ARRANGE: Set custom directory
    const customDir = '/custom/grimoire/path';
    process.env.GRIMOIRE_HOME = customDir;
    resetPathsCache();

    // ACT: Get paths
    const spellDir = getSpellDirectory();
    const embeddingPath = getEmbeddingCachePath();
    const configPath = PATHS.config;
    const cachePath = PATHS.cache;

    // ASSERT: All paths use custom directory
    expect(spellDir).toBe(customDir);
    expect(embeddingPath).toBe(join(customDir, 'embeddings.msgpack'));
    expect(configPath).toBe(customDir);
    expect(cachePath).toBe(customDir);
  });

  it('should use default directory when GRIMOIRE_HOME is not set', () => {
    // ARRANGE: Ensure GRIMOIRE_HOME is not set
    delete process.env.GRIMOIRE_HOME;
    resetPathsCache();

    // ACT: Get paths
    const spellDir = getSpellDirectory();
    const embeddingPath = getEmbeddingCachePath();

    // ASSERT: Paths use default ~/.grimoire
    const expectedDir = join(homedir(), '.grimoire');
    expect(spellDir).toBe(expectedDir);
    expect(embeddingPath).toBe(join(expectedDir, 'embeddings.msgpack'));
    expect(spellDir).toContain('.grimoire');
  });

  it('should handle relative paths in GRIMOIRE_HOME (converts to absolute)', () => {
    // ARRANGE: Set relative path
    process.env.GRIMOIRE_HOME = './test-grimoire';
    resetPathsCache();

    // ACT: Get paths
    const spellDir = getSpellDirectory();

    // ASSERT: Path is absolute (resolve() was called)
    expect(spellDir).not.toBe('./test-grimoire');
    expect(spellDir).toContain('test-grimoire');
    // Should be absolute path starting with / or C:\ (Windows)
    const isAbsolute = spellDir.startsWith('/') || /^[A-Z]:\\/.test(spellDir);
    expect(isAbsolute).toBe(true);
  });

  it('should update paths when GRIMOIRE_HOME changes and cache is reset', () => {
    // ARRANGE: Set first directory
    process.env.GRIMOIRE_HOME = '/first/dir';
    resetPathsCache();
    const firstDir = getSpellDirectory();

    // ACT: Change to second directory
    process.env.GRIMOIRE_HOME = '/second/dir';
    resetPathsCache();
    const secondDir = getSpellDirectory();

    // ASSERT: Paths changed
    expect(firstDir).toBe('/first/dir');
    expect(secondDir).toBe('/second/dir');
    expect(firstDir).not.toBe(secondDir);
  });

  it('should NOT update paths when GRIMOIRE_HOME changes without cache reset', () => {
    // ARRANGE: Set first directory
    process.env.GRIMOIRE_HOME = '/first/dir';
    resetPathsCache();
    const firstDir = getSpellDirectory();

    // ACT: Change to second directory WITHOUT resetting cache
    process.env.GRIMOIRE_HOME = '/second/dir';
    // Note: No resetPathsCache() call
    const secondDir = getSpellDirectory();

    // ASSERT: Paths still use cached value
    expect(firstDir).toBe('/first/dir');
    expect(secondDir).toBe('/first/dir'); // Still cached!
    expect(firstDir).toBe(secondDir);
  });

  it('should use custom temp directory when GRIMOIRE_HOME is set', () => {
    // ARRANGE: Set custom directory
    const customDir = '/custom/grimoire';
    process.env.GRIMOIRE_HOME = customDir;
    resetPathsCache();

    // ACT: Get temp path
    const tempPath = PATHS.temp;

    // ASSERT: Temp uses subdirectory of custom path
    expect(tempPath).toBe(join(customDir, 'tmp'));
    expect(tempPath).toContain(customDir);
  });

  it('should restore default behavior after unsetting GRIMOIRE_HOME', () => {
    // ARRANGE: Set custom directory
    process.env.GRIMOIRE_HOME = '/custom/dir';
    resetPathsCache();
    const customPath = getSpellDirectory();

    // ACT: Unset and reset
    delete process.env.GRIMOIRE_HOME;
    resetPathsCache();
    const defaultPath = getSpellDirectory();

    // ASSERT: Restored to default
    expect(customPath).toBe('/custom/dir');
    expect(defaultPath).toBe(join(homedir(), '.grimoire'));
    expect(defaultPath).not.toBe(customPath);
  });

  it('should handle paths with spaces and special characters', () => {
    // ARRANGE: Set path with spaces
    const pathWithSpaces = '/path with spaces/grimoire';
    process.env.GRIMOIRE_HOME = pathWithSpaces;
    resetPathsCache();

    // ACT: Get paths
    const spellDir = getSpellDirectory();
    const embeddingPath = getEmbeddingCachePath();

    // ASSERT: Paths preserved correctly
    expect(spellDir).toBe(pathWithSpaces);
    expect(embeddingPath).toBe(join(pathWithSpaces, 'embeddings.msgpack'));
  });

  it('should work with test helper pattern (workspace relative paths)', () => {
    // ARRANGE: Simulate test helper usage
    const testDir = join(process.cwd(), '.test-grimoire', 'my-test');
    process.env.GRIMOIRE_HOME = testDir;
    resetPathsCache();

    // ACT: Get paths
    const spellDir = getSpellDirectory();
    const embeddingPath = getEmbeddingCachePath();

    // ASSERT: Uses workspace-relative test directory
    expect(spellDir).toContain('.test-grimoire');
    expect(spellDir).toContain('my-test');
    expect(spellDir).toContain(process.cwd());
    expect(embeddingPath).toBe(join(testDir, 'embeddings.msgpack'));
  });
});
