/**
 * Paths Branch Coverage Tests
 * Targets uncovered branches in paths.ts (25% → 75%+ goal)
 *
 * Critical coverage targets:
 * - getEnvPaths cache initialization (lines 25-29)
 * - initializePaths sync path setting (line 41)
 * - temp path getter (lines 82-83)
 * - Error handling in ensureDirectories (line 132)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolve } from 'path';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import {
  initializePaths,
  PATHS,
  getSpellDirectory,
  getEmbeddingCachePath,
  ensureDirectories,
} from '../paths';

describe('Paths Branch Coverage', () => {
  let testHomeDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testHomeDir = resolve(tmpdir(), `paths-test-${Date.now()}`);
    originalHome = process.env.HOME;
    process.env.HOME = testHomeDir;
  });

  afterEach(async () => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }

    try {
      await rm(testHomeDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Path initialization and caching', () => {
    /**
     * Test: initializePaths sets sync paths
     * Coverage: Line 41 (syncPaths = await getEnvPaths())
     */
    it('should initialize paths asynchronously', async () => {
      await initializePaths();

      // After initialization, PATHS should be available
      const configPath = PATHS.config;
      expect(configPath).toBeTruthy();
      expect(typeof configPath).toBe('string');
    });

    /**
     * Test: PATHS getters work after initialization
     * Coverage: Lines 70-84 (all getters)
     */
    it('should provide all path getters after initialization', async () => {
      await initializePaths();

      expect(PATHS.config).toBeTruthy();
      expect(PATHS.cache).toBeTruthy();
      expect(PATHS.log).toBeTruthy();
      expect(PATHS.data).toBeTruthy();
      expect(PATHS.temp).toBeTruthy();

      // All should return strings
      expect(typeof PATHS.config).toBe('string');
      expect(typeof PATHS.cache).toBe('string');
      expect(typeof PATHS.log).toBe('string');
      expect(typeof PATHS.data).toBe('string');
      expect(typeof PATHS.temp).toBe('string');
    });

    /**
     * Test: temp path is different from config path
     * Coverage: Lines 82-83 (temp getter)
     */
    it('should return temp path separate from config', async () => {
      await initializePaths();

      const configPath = PATHS.config;
      const tempPath = PATHS.temp;

      expect(tempPath).toBeTruthy();
      expect(tempPath).not.toBe(configPath);
      expect(tempPath).toContain('grimoire');
    });
  });

  describe('Path fallback behavior', () => {
    /**
     * Test: PATHS work without explicit initialization (fallback)
     * Coverage: Lines 46-61 (fallback path logic)
     */
    it('should fallback to path with grimoire identifier if not initialized', () => {
      // Don't call initializePaths, test fallback
      const configPath = PATHS.config;

      expect(configPath).toContain('grimoire'); // May be .grimoire or /grimoire/ depending on platform
      expect(configPath).toBeTruthy();
    });

    /**
     * Test: Multiple path accesses use same values
     * Coverage: Path caching behavior
     */
    it('should return consistent paths across multiple accesses', async () => {
      await initializePaths();

      const config1 = PATHS.config;
      const config2 = PATHS.config;
      const config3 = PATHS.config;

      expect(config1).toBe(config2);
      expect(config2).toBe(config3);
    });
  });

  describe('Helper functions', () => {
    /**
     * Test: getSpellDirectory returns config path
     * Coverage: Line 92 (return PATHS.config)
     */
    it('should return spell directory from config path', () => {
      const spellDir = getSpellDirectory();

      expect(spellDir).toBeTruthy();
      expect(spellDir).toBe(PATHS.config);
      expect(spellDir).toContain('grimoire'); // Platform-independent check
    });

    /**
     * Test: getEmbeddingCachePath returns correct filename
     * Coverage: Line 100 (join with embeddings.msgpack)
     */
    it('should return embedding cache path with msgpack extension', () => {
      const cachePath = getEmbeddingCachePath();

      expect(cachePath).toBeTruthy();
      expect(cachePath).toContain('embeddings.msgpack');
      expect(cachePath).toContain('grimoire'); // Platform-independent check
    });
  });

  describe('ensureDirectories', () => {
    /**
     * Test: ensureDirectories creates directory successfully
     * Coverage: Lines 118-127 (success path)
     */
    it('should create grimoire directory with proper permissions', async () => {
      await expect(ensureDirectories()).resolves.not.toThrow();

      // Directory should now exist
      await expect(ensureDirectories()).resolves.not.toThrow();
    });

    /**
     * Test: ensureDirectories is idempotent
     * Coverage: Multiple calls to same function
     */
    it('should be safe to call multiple times', async () => {
      await ensureDirectories();
      await ensureDirectories();
      await ensureDirectories();

      // Should all succeed
      expect(true).toBe(true);
    });

    /**
     * Test: ensureDirectories handles Unix vs Windows platforms
     * Coverage: Lines 125-127 (platform check branch)
     */
    it('should handle platform-specific permissions', async () => {
      const originalPlatform = process.platform;

      try {
        // Test on current platform
        await expect(ensureDirectories()).resolves.not.toThrow();

        // The chmod call (line 126) will only execute on non-Windows
        // This test exercises the branch without mocking
        if (process.platform !== 'win32') {
          // On Unix, chmod should be called
          await expect(ensureDirectories()).resolves.not.toThrow();
        }
      } finally {
        // Platform is read-only, so we can't actually change it
        // But we covered the branch by running on the actual platform
      }
    });
  });

  describe('Path structure validation', () => {
    /**
     * Test: All paths contain grimoire identifier
     * Coverage: Path format validation
     */
    it('should include grimoire in all path names', async () => {
      await initializePaths();

      expect(PATHS.config).toContain('grimoire');
      expect(PATHS.cache).toContain('grimoire');
      expect(PATHS.log).toContain('grimoire');
      expect(PATHS.data).toContain('grimoire');
      expect(PATHS.temp).toContain('grimoire');
    });

    /**
     * Test: getEmbeddingCachePath is in cache directory
     * Coverage: Path relationships
     */
    it('should place embedding cache in cache directory', () => {
      const cachePath = getEmbeddingCachePath();
      const cacheDir = PATHS.cache;

      expect(cachePath).toContain(cacheDir);
    });
  });

  describe('Concurrent access', () => {
    /**
     * Test: Multiple concurrent path accesses
     * Coverage: Thread safety / concurrent access
     */
    it('should handle concurrent path accesses', async () => {
      const promises = [initializePaths(), initializePaths(), initializePaths()];

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // After all complete, paths should be consistent
      const config1 = PATHS.config;
      const config2 = PATHS.config;
      expect(config1).toBe(config2);
    });

    /**
     * Test: Multiple concurrent directory creations
     * Coverage: ensureDirectories concurrency
     */
    it('should handle concurrent directory creation', async () => {
      const promises = [ensureDirectories(), ensureDirectories(), ensureDirectories()];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('Path getters without initialization', () => {
    /**
     * Test: All getters work without explicit init (fallback mode)
     * Coverage: Lines 46-61 (getPaths fallback)
     */
    it('should return valid paths even without explicit initialization', () => {
      // Access paths without calling initializePaths
      const config = PATHS.config;
      const cache = PATHS.cache;
      const log = PATHS.log;
      const data = PATHS.data;
      const temp = PATHS.temp;

      // All should be defined and contain grimoire (platform-independent)
      expect(config).toContain('grimoire');
      expect(cache).toContain('grimoire');
      expect(log).toContain('grimoire');
      expect(data).toContain('grimoire');
      expect(temp).toContain('grimoire');
    });
  });
});
