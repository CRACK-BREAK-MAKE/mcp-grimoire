/**
 * Integration Test: CLI create command input validation
 *
 * PURPOSE:
 * Tests that the CLI properly validates user inputs and rejects invalid configurations
 * BEFORE attempting to create spell files or probe servers. Prevents pollution of
 * ~/.grimoire directory with broken spell files.
 *
 * NO MCP SERVERS NEEDED:
 * This test runs with probe:false - validates input logic only, no network calls.
 *
 * VALIDATION CATEGORIES TESTED:
 *
 * 1. SPELL NAME VALIDATION:
 *    - ✓ Rejects empty spell name
 *    - ✓ Rejects uppercase letters (must be lowercase)
 *    - ✓ Rejects spaces in name
 *    - ✓ Rejects special characters (!@#$%^&*)
 *    - ✓ Rejects names starting with hyphen
 *    - ✓ Accepts valid names (lowercase, hyphens, numbers)
 *    - Pattern: /^[a-z0-9][a-z0-9-]*$/
 *
 * 2. TRANSPORT VALIDATION:
 *    - ✓ Rejects invalid transport types (websocket, grpc, etc.)
 *    - ✓ Rejects missing transport in non-interactive mode
 *    - ✓ Accepts: stdio, http, sse
 *
 * 3. URL VALIDATION:
 *    - ✓ Rejects URLs without http:// or https:// scheme
 *    - ✓ Rejects malformed URLs
 *    - ✓ Accepts valid HTTP/HTTPS URLs
 *
 * 4. AUTHENTICATION VALIDATION:
 *    - ✓ Rejects bearer auth without --auth-token
 *    - ✓ Rejects basic auth without --auth-username
 *    - ✓ Rejects basic auth without --auth-password
 *    - ✓ Validates auth type matches required credentials
 *
 * ERROR HANDLING:
 * - Validation errors thrown BEFORE file operations
 * - Clear error messages guide users to fix issues
 * - No spell files created on validation failure
 * - Prevents accumulation of broken spell files
 *
 * TEST PHILOSOPHY:
 * Fail fast, fail loud - catch issues at input validation, not at runtime.
 *
 * NO SERVERS NEEDED - Tests validation logic only (probe: false)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { existsSync } from 'fs';
import { getSpellDirectory } from '../../utils/paths';
import { createCommand } from '../commands/create';
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';

describe('CLI create - Input Validation', () => {
  let testGrimoireDir: string;
  let grimoireDir: string;

  beforeAll(async () => {
    // Setup isolated test directory
    testGrimoireDir = await setupTestGrimoireDir('input-validation');
    grimoireDir = getSpellDirectory();

    // Ensure test directory structure exists
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();
  });

  afterAll(async () => {
    // Cleanup test directory and restore defaults
    await cleanupTestGrimoireDir(testGrimoireDir);
  });

  describe('Spell Name Validation', () => {
    it('should reject empty spell name', async () => {
      // ARRANGE: Empty name
      const spellPath = join(grimoireDir, '.spell.yaml');

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: '',
          transport: 'stdio',
          command: 'node',
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject spell name with uppercase letters', async () => {
      // ARRANGE: Uppercase name
      const invalidName = 'TestSpell';
      const spellPath = join(grimoireDir, `${invalidName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: invalidName,
          transport: 'stdio',
          command: 'node',
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject spell name with spaces', async () => {
      // ARRANGE: Name with spaces
      const invalidName = 'test spell';
      const spellPath = join(grimoireDir, `${invalidName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: invalidName,
          transport: 'stdio',
          command: 'node',
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject spell name with special characters', async () => {
      // ARRANGE: Special characters in name
      const invalidName = 'test@spell!';
      const spellPath = join(grimoireDir, `${invalidName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: invalidName,
          transport: 'stdio',
          command: 'node',
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject spell name starting with hyphen', async () => {
      // ARRANGE: Name starting with hyphen
      const invalidName = '-test-spell';
      const spellPath = join(grimoireDir, `${invalidName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: invalidName,
          transport: 'stdio',
          command: 'node',
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should accept valid spell name with lowercase and hyphens', async () => {
      // ARRANGE: Valid name (this is the ONE acceptance test)
      const validName = 'valid-spell-123';
      const spellPath = join(grimoireDir, `${validName}.spell.yaml`);

      // ACT: Should succeed
      await createCommand({
        name: validName,
        transport: 'stdio',
        command: 'node',
        probe: false,
        interactive: false,
      });

      // ASSERT: Spell file created
      expect(existsSync(spellPath)).toBe(true);
    });
  });

  describe('Transport Validation', () => {
    it('should reject invalid transport type', async () => {
      // ARRANGE: Invalid transport
      const testSpellName = 'test-invalid-transport';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: testSpellName,
          transport: 'websocket' as any, // Invalid transport
          url: 'ws://localhost:8000',
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject missing transport in non-interactive mode', async () => {
      // ARRANGE: No transport provided
      const testSpellName = 'test-no-transport';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: testSpellName,
          transport: undefined as any, // Missing transport
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });
  });

  describe('URL Validation', () => {
    it('should reject URL without http/https scheme', async () => {
      // ARRANGE: URL without scheme
      const testSpellName = 'test-no-scheme';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: testSpellName,
          transport: 'http',
          url: 'localhost:8000', // No http:// or https://
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject malformed URL', async () => {
      // ARRANGE: Malformed URL
      const testSpellName = 'test-malformed-url';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: testSpellName,
          transport: 'http',
          url: 'http:/invalid-url', // Malformed
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should accept valid HTTP URL', async () => {
      // ARRANGE: Valid HTTP URL (acceptance test)
      const testSpellName = 'test-valid-http';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT: Should succeed
      await createCommand({
        name: testSpellName,
        transport: 'http',
        url: 'http://localhost:8000',
        probe: false,
        interactive: false,
      });

      // ASSERT: Spell file created in isolated test directory
      expect(existsSync(spellPath)).toBe(true);
      expect(spellPath).toContain('.test-grimoire');
    });

    it('should accept valid HTTPS URL', async () => {
      // ARRANGE: Valid HTTPS URL (acceptance test)
      const testSpellName = 'test-valid-https';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT: Should succeed
      await createCommand({
        name: testSpellName,
        transport: 'http',
        url: 'https://api.example.com',
        probe: false,
        interactive: false,
      });

      // ASSERT: Spell file created in isolated test directory
      expect(existsSync(spellPath)).toBe(true);
      expect(spellPath).toContain('.test-grimoire');
    });
  });

  describe('Conflicting Options Validation', () => {
    it('should reject bearer auth without token', async () => {
      // ARRANGE: Bearer auth but no token
      const testSpellName = 'test-bearer-no-token';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: testSpellName,
          transport: 'http',
          url: 'http://localhost:8000',
          authType: 'bearer',
          authToken: undefined, // Missing token
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject basic auth without username', async () => {
      // ARRANGE: Basic auth but no username
      const testSpellName = 'test-basic-no-username';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: testSpellName,
          transport: 'http',
          url: 'http://localhost:8000',
          authType: 'basic',
          authUsername: undefined, // Missing username
          authPassword: 'password',
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });

    it('should reject basic auth without password', async () => {
      // ARRANGE: Basic auth but no password
      const testSpellName = 'test-basic-no-password';
      const spellPath = join(grimoireDir, `${testSpellName}.spell.yaml`);

      // ACT & ASSERT: Should throw or reject
      await expect(
        createCommand({
          name: testSpellName,
          transport: 'http',
          url: 'http://localhost:8000',
          authType: 'basic',
          authUsername: 'user',
          authPassword: undefined, // Missing password
          probe: false,
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: No spell file created
      expect(existsSync(spellPath)).toBe(false);
    });
  });
});
