/**
 * Tests for cross-platform path utilities
 * Following TDD: Write tests first, then implement
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ensureDirectories, getEmbeddingCachePath, getSpellDirectory, PATHS } from '../paths';

describe('Path Utilities', () => {
  describe('PATHS constant', () => {
    it('should expose config directory path', () => {
      expect(PATHS.config).toBeDefined();
      expect(typeof PATHS.config).toBe('string');
      expect(PATHS.config.length).toBeGreaterThan(0);
    });

    it('should expose cache directory path', () => {
      expect(PATHS.cache).toBeDefined();
      expect(typeof PATHS.cache).toBe('string');
      expect(PATHS.cache.length).toBeGreaterThan(0);
    });

    it('should expose log directory path', () => {
      expect(PATHS.log).toBeDefined();
      expect(typeof PATHS.log).toBe('string');
      expect(PATHS.log.length).toBeGreaterThan(0);
    });

    it('should use same directory for config and cache (Claude Code convention)', () => {
      // Following Claude Code pattern: everything in ~/.grimoire
      expect(PATHS.config).toBe(PATHS.cache);
      expect(PATHS.config).toBe(PATHS.log);
    });

    it('should use .grimoire directory (Claude Code convention)', () => {
      // Following Claude Code's ~/.claude pattern
      const configPath = PATHS.config;
      expect(configPath).toContain('.grimoire');
    });
  });

  describe('getSpellDirectory', () => {
    it('should return .grimoire directory (no spells subdirectory)', () => {
      const spellDir = getSpellDirectory();
      expect(spellDir).toBeDefined();
      expect(typeof spellDir).toBe('string');
      expect(spellDir).toContain('.grimoire');
    });

    it('should be same as config directory (flat structure)', () => {
      const spellDir = getSpellDirectory();
      expect(spellDir).toBe(PATHS.config);
    });

    it('should end with .grimoire (Claude Code convention)', () => {
      const spellDir = getSpellDirectory();
      expect(spellDir.endsWith('.grimoire')).toBe(true);
    });
  });

  describe('getEmbeddingCachePath', () => {
    it('should return path to embeddings.msgpack file', () => {
      const cachePath = getEmbeddingCachePath();
      expect(cachePath).toBeDefined();
      expect(typeof cachePath).toBe('string');
      expect(cachePath).toContain('embeddings.msgpack');
    });

    it('should be within cache directory', () => {
      const cachePath = getEmbeddingCachePath();
      expect(cachePath).toContain(PATHS.cache);
    });

    it('should end with embeddings.msgpack', () => {
      const cachePath = getEmbeddingCachePath();
      expect(cachePath.endsWith('embeddings.msgpack')).toBe(true);
    });
  });

  describe('ensureDirectories', () => {
    let testDir: string;

    beforeEach(async () => {
      // Create a temporary test directory
      testDir = join(tmpdir(), `mcp-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up test directory
      try {
        const { rm } = await import('fs/promises');
        await rm(testDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    });

    it('should create all required directories', async () => {
      // This test will be more meaningful in integration tests
      // where we can temporarily override PATHS
      await expect(ensureDirectories()).resolves.not.toThrow();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await ensureDirectories();
      await expect(ensureDirectories()).resolves.not.toThrow();
    });

    it('should create config directory if it does not exist', async () => {
      // Verify config directory exists after ensureDirectories
      await ensureDirectories();
      await expect(access(PATHS.config)).resolves.not.toThrow();
    });

    it('should create cache directory if it does not exist', async () => {
      // Verify cache directory exists after ensureDirectories
      await ensureDirectories();
      await expect(access(PATHS.cache)).resolves.not.toThrow();
    });

    it('should create log directory if it does not exist', async () => {
      // Verify log directory exists after ensureDirectories
      await ensureDirectories();
      await expect(access(PATHS.log)).resolves.not.toThrow();
    });

    it('should create grimoire directory', async () => {
      await ensureDirectories();
      const spellDir = getSpellDirectory();
      await expect(access(spellDir)).resolves.not.toThrow();
    });
  });

  describe('Path Security', () => {
    it('should not contain shell metacharacters', () => {
      const allPaths = [
        PATHS.config,
        PATHS.cache,
        PATHS.log,
        getSpellDirectory(),
        getEmbeddingCachePath(),
      ];

      for (const path of allPaths) {
        expect(path).not.toMatch(/[;&|`$()]/);
      }
    });

    it('should be absolute paths', () => {
      const { isAbsolute } = require('path');
      expect(isAbsolute(PATHS.config)).toBe(true);
      expect(isAbsolute(PATHS.cache)).toBe(true);
      expect(isAbsolute(PATHS.log)).toBe(true);
      expect(isAbsolute(getSpellDirectory())).toBe(true);
      expect(isAbsolute(getEmbeddingCachePath())).toBe(true);
    });
  });
});
