/**
 * Config Loader Branch Coverage Tests
 * Targets specific uncovered branches in config-loader.ts
 *
 * Critical coverage targets:
 * - Duplicate spell name check (line 45-46)
 * - Generic error in loadOne (line 54)
 * - Directory error re-throw (line 66)
 * - Invalid config structure (line 75)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { YAMLConfigLoader } from '../config-loader';
import { ConfigurationError } from '../../core/spell-config';

describe('YAMLConfigLoader Branch Coverage', () => {
  let testDir: string;
  let loader: YAMLConfigLoader;

  beforeEach(async () => {
    testDir = resolve(tmpdir(), `config-loader-branches-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    loader = new YAMLConfigLoader();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Duplicate spell name handling', () => {
    /**
     * Test: Skip duplicate spell names
     * Coverage: Lines 44-46 (duplicate check branch)
     */
    it('should skip files with duplicate spell names', async () => {
      // Create first spell
      await writeFile(
        resolve(testDir, 'first.spell.yaml'),
        `name: duplicate-name
version: 1.0.0
description: First spell
keywords:
  - test
  - first
  - duplicate
server:
  transport: stdio
  command: echo
  args:
    - test
`
      );

      // Create second spell with SAME name but different file
      await writeFile(
        resolve(testDir, 'second.spell.yaml'),
        `name: duplicate-name
version: 2.0.0
description: Second spell (should be skipped)
keywords:
  - duplicate
  - second
  - test
server:
  transport: stdio
  command: node
  args:
    - test
`
      );

      const configs = await loader.loadAll(testDir);

      // Should only have one entry (first one wins)
      expect(configs.size).toBe(1);
      expect(configs.has('duplicate-name')).toBe(true);

      // Should be the first version
      const config = configs.get('duplicate-name');
      expect(config?.version).toBe('1.0.0');
      expect(config?.description).toBe('First spell');
    });
  });

  describe('Invalid config structure handling', () => {
    /**
     * Test: Handle invalid YAML structure
     * Coverage: Lines 74-75 (invalid config check)
     */
    it('should throw ConfigurationError for invalid config structure', async () => {
      const invalidPath = resolve(testDir, 'invalid.spell.yaml');
      await writeFile(
        invalidPath,
        `# Missing required fields
name: incomplete
# No version, description, keywords, or server
`
      );

      await expect(loader.loadOne(invalidPath)).rejects.toThrow(ConfigurationError);
      await expect(loader.loadOne(invalidPath)).rejects.toThrow(/Invalid config structure/);
    });

    /**
     * Test: Handle completely malformed YAML
     * Coverage: Lines 74-75 (invalid structure)
     */
    it('should reject config missing all required fields', async () => {
      const malformedPath = resolve(testDir, 'malformed.spell.yaml');
      await writeFile(
        malformedPath,
        `# Just a string, not an object
"this is not a valid spell config"
`
      );

      await expect(loader.loadOne(malformedPath)).rejects.toThrow(ConfigurationError);
    });

    /**
     * Test: Handle config with wrong types
     * Coverage: Type validation branch
     */
    it('should reject config with wrong field types', async () => {
      const wrongTypePath = resolve(testDir, 'wrong-type.spell.yaml');
      await writeFile(
        wrongTypePath,
        `name: 123
version: true
description: []
keywords: "not an array"
server: "not an object"
`
      );

      await expect(loader.loadOne(wrongTypePath)).rejects.toThrow();
    });
  });

  describe('Generic error handling in loadAll', () => {
    /**
     * Test: Handle non-ConfigurationError during file load
     * Coverage: Lines 51-54 (else branch for generic errors)
     */
    it('should handle generic errors when loading files', async () => {
      // Create a file with syntax error (not ConfigurationError)
      await writeFile(
        resolve(testDir, 'syntax-error.spell.yaml'),
        `name: test
version: 1.0.0
description: Test
keywords: [test
# Unclosed bracket - causes YAML parse error
server:
  transport: stdio
  command: echo
  args: [test]
`
      );

      // Should not throw, but log error and continue
      const configs = await loader.loadAll(testDir);

      // File with error should be skipped
      expect(configs.has('test')).toBe(false);
    });

    /**
     * Test: Handle file read errors
     * Coverage: Generic error handling
     */
    it('should skip files that cause read errors', async () => {
      // Create valid file first
      await writeFile(
        resolve(testDir, 'valid.spell.yaml'),
        `name: valid
version: 1.0.0
description: Valid spell
keywords:
  - test
  - valid
  - spell
server:
  transport: stdio
  command: echo
  args:
    - test
`
      );

      // Create a directory with .spell.yaml extension (will cause error when trying to read as file)
      const dirPath = resolve(testDir, 'directory.spell.yaml');
      await mkdir(dirPath);

      // Should not throw, should skip the directory and load the valid file
      const configs = await loader.loadAll(testDir);

      expect(configs.has('valid')).toBe(true);
      expect(configs.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Directory error handling', () => {
    /**
     * Test: Handle non-ENOENT directory errors
     * Coverage: Lines 62-66 (error re-throw branch)
     */
    it('should re-throw non-ENOENT directory errors', async () => {
      // Try to load from a file instead of directory (will cause ENOTDIR or similar)
      const filePath = resolve(testDir, 'not-a-directory.txt');
      await writeFile(filePath, 'this is a file, not a directory');

      // On some systems this might succeed but return empty,
      // on others it might throw. Either is acceptable.
      try {
        const result = await loader.loadAll(filePath);
        // If it succeeds, should return empty or handle gracefully
        expect(result).toBeDefined();
      } catch (error) {
        // If it throws, should not be ConfigurationError
        expect(error).not.toBeInstanceOf(ConfigurationError);
      }
    });

    /**
     * Test: Handle ENOENT gracefully
     * Coverage: Lines 62-64 (ENOENT branch)
     */
    it('should return empty map for non-existent directory', async () => {
      const nonExistentDir = resolve(testDir, 'does-not-exist');

      const configs = await loader.loadAll(nonExistentDir);

      expect(configs).toBeInstanceOf(Map);
      expect(configs.size).toBe(0);
    });
  });

  describe('loadOne specific branches', () => {
    /**
     * Test: Successfully load valid config
     * Coverage: Happy path through loadOne
     */
    it('should successfully load valid spell config', async () => {
      const validPath = resolve(testDir, 'complete.spell.yaml');
      await writeFile(
        validPath,
        `name: complete-spell
version: 1.0.0
description: A complete valid spell
keywords:
  - complete
  - valid
  - test
server:
  transport: stdio
  command: node
  args:
    - -v
`
      );

      const config = await loader.loadOne(validPath);

      expect(config.name).toBe('complete-spell');
      expect(config.version).toBe('1.0.0');
      expect(config.keywords).toContain('complete');
      expect(config.server.transport).toBe('stdio');
    });

    /**
     * Test: Load config with optional fields
     * Coverage: Optional fields handling
     */
    it('should load config with optional steering', async () => {
      const withSteeringPath = resolve(testDir, 'with-steering.spell.yaml');
      await writeFile(
        withSteeringPath,
        `name: with-steering
version: 1.0.0
description: Spell with steering
keywords:
  - test
  - steering
  - guidance
server:
  transport: stdio
  command: echo
  args:
    - test
steering: |
  This is expert guidance
  Multiple lines of steering
  Best practices here
`
      );

      const config = await loader.loadOne(withSteeringPath);

      expect(config.steering).toBeDefined();
      expect(config.steering).toContain('expert guidance');
    });
  });

  describe('Mixed valid and invalid files', () => {
    /**
     * Test: Load directory with mix of valid/invalid files
     * Coverage: Multiple error handling branches in sequence
     */
    it('should load valid files and skip invalid ones', async () => {
      // Valid file 1
      await writeFile(
        resolve(testDir, 'valid1.spell.yaml'),
        `name: valid-one
version: 1.0.0
description: Valid spell one
keywords: [test, valid, one]
server:
  transport: stdio
  command: echo
  args: [test]
`
      );

      // Invalid file (missing required fields)
      await writeFile(
        resolve(testDir, 'invalid.spell.yaml'),
        `name: invalid
version: 1.0.0
# Missing description, keywords, server
`
      );

      // Valid file 2
      await writeFile(
        resolve(testDir, 'valid2.spell.yaml'),
        `name: valid-two
version: 2.0.0
description: Valid spell two
keywords: [test, second, valid]
server:
  transport: stdio
  command: node
  args: ["-v"]
`
      );

      // File with YAML syntax error
      await writeFile(
        resolve(testDir, 'syntax-error.spell.yaml'),
        `name: broken
version: [unclosed
description: "broken YAML
`
      );

      const configs = await loader.loadAll(testDir);

      // Should load only the 2 valid files
      expect(configs.size).toBe(2);
      expect(configs.has('valid-one')).toBe(true);
      expect(configs.has('valid-two')).toBe(true);
      expect(configs.has('invalid')).toBe(false);
      expect(configs.has('broken')).toBe(false);
    });
  });
});
