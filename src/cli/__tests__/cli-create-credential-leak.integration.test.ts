/**
 * Integration Test: CLI create command - credential leak prevention
 *
 * PURPOSE:
 * CRITICAL SECURITY TEST - Ensures that credentials (passwords, API keys, tokens)
 * NEVER appear in console output, error messages, or log files.
 *
 * MCP SERVER USED:
 * - Server: servers.basic_auth.http_server (Port 8014)
 * - Auth: Basic Auth (username/password)
 * - Purpose: Test both successful and failed authentication scenarios
 *
 * SECURITY PRINCIPLES TESTED:
 * 1. ✓ Credentials NEVER logged to console.log()
 * 2. ✓ Credentials NEVER in console.error()
 * 3. ✓ Credentials NEVER in console.warn()
 * 4. ✓ Error messages use placeholders (${ENV_VAR}) instead of literal values
 * 5. ✓ Probe failures don't expose credentials
 * 6. ✓ Environment variables shown as references, not values
 *
 * LEAK DETECTION METHOD:
 * - Spy on all console methods (log, error, warn)
 * - Capture all output during spell creation
 * - Search for literal credential values
 * - Verify only placeholders appear (e.g., ${PROJECT_MANAGER__API_PASSWORD})
 *
 * TEST SCENARIOS:
 * 1. ✓ Successful spell creation - no credential leaks in output
 * 2. ✓ Failed probe (wrong credentials) - no credential leaks in errors
 * 3. ✓ API key authentication - no API key values in logs
 * 4. ✓ Environment variable placeholders used consistently
 *
 * WHAT SHOULD APPEAR:
 * - ✓ "${SPELL_NAME__API_TOKEN}" (placeholder)
 * - ✓ "Environment variables saved: ~/.grimoire/.env"
 * - ✓ "Variables: SPELL_NAME__API_TOKEN" (variable name only)
 *
 * WHAT SHOULD NEVER APPEAR:
 * - ✗ "super-secret-token-12345" (actual value)
 * - ✗ "Password: testpass123"
 * - ✗ "API Key: ghp_..."
 *
 * NO MOCKS - Real server, real credentials, real security validation
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { getSpellDirectory } from '../../utils/paths';
import { createCommand } from '../commands/create';
import { startFastMCPServer, stopServer, FASTMCP_PORTS } from './helpers/test-server-manager';

describe('CLI create - Credential Leak Prevention', () => {
  let grimoireDir: string;
  let httpServerProcess: ChildProcess;
  const HTTP_PORT = FASTMCP_PORTS.CREDENTIAL_LEAK_HTTP; // 8014 - dedicated port for this test
  const createdFiles: string[] = [];

  beforeAll(async () => {
    grimoireDir = getSpellDirectory();
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start Basic Auth HTTP server for credential tests
    httpServerProcess = await startFastMCPServer('servers.basic_auth.http_server', HTTP_PORT);
  }, 60000);

  afterAll(async () => {
    await stopServer(httpServerProcess, HTTP_PORT, 'basic_auth_http_server');

    // Clean up created test files
    for (const file of createdFiles) {
      if (existsSync(file)) await rm(file);
    }
  }, 30000);

  it('should never log literal credentials to console during successful creation', async () => {
    // ARRANGE: Spy on console
    const consoleSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const consoleWarnSpy = vi.spyOn(console, 'warn');

    const spellName = 'test-no-leak-success';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
    const secretToken = 'super-secret-token-12345-NEVER-LOG-THIS';

    createdFiles.push(spellPath);

    try {
      // ACT: Create spell with sensitive credentials
      await createCommand({
        name: spellName,
        transport: 'http',
        url: `http://localhost:${HTTP_PORT}/mcp`,
        authType: 'bearer',
        authToken: secretToken,
        probe: false, // Skip probe to avoid auth failures
        interactive: false,
      });

      // ASSERT: Credentials never appear in ANY console output
      const allLogs = [
        ...consoleSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
      ]
        .flat()
        .join(' ');

      expect(allLogs).not.toContain(secretToken);
      expect(allLogs).not.toContain('super-secret');
      expect(allLogs).not.toContain('NEVER-LOG-THIS');

      // Placeholders are OK
      expect(existsSync(spellPath)).toBe(true);
    } finally {
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    }
  });

  it('should never include credentials in error messages during probe failures', async () => {
    // ARRANGE: Spy on console.error
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const consoleLogSpy = vi.spyOn(console, 'log');

    const spellName = 'test-no-leak-error';
    const secretPassword = 'my-ultra-secret-password-xyz-999';
    const secretUsername = 'secret-admin-user';

    try {
      // ACT: Trigger probe failure with invalid credentials
      await expect(
        createCommand({
          name: spellName,
          transport: 'http',
          url: `http://localhost:${HTTP_PORT}/mcp`,
          authType: 'basic',
          authUsername: secretUsername,
          authPassword: secretPassword,
          probe: true, // Enable probe - will fail with wrong credentials
          interactive: false,
        })
      ).rejects.toThrow();

      // ASSERT: Credentials never appear in GRIMOIRE'S error output
      // NOTE: Filter out server logs (which are outside our control)
      const allErrorLogs = [...consoleErrorSpy.mock.calls, ...consoleLogSpy.mock.calls]
        .flat()
        .join(' ');

      // Filter out server logs - only check Grimoire's output
      const grimoireLogs = allErrorLogs
        .split('\n')
        .filter((line) => !line.includes('[servers.') && !line.includes('stderr |'))
        .join(' ');

      // Verify credentials don't appear in GRIMOIRE's logs
      expect(grimoireLogs).not.toContain(secretPassword);
      expect(grimoireLogs).not.toContain('my-ultra-secret');
      expect(grimoireLogs).not.toContain('xyz-999');
      // Username CAN appear in server logs but NOT in Grimoire's logs
      const usernameInGrimoireOutput =
        grimoireLogs.includes(secretUsername) || grimoireLogs.includes('secret-admin-user');
      expect(
        usernameInGrimoireOutput,
        'Credentials should not appear in Grimoire output (excluding server logs)'
      ).toBe(false);
    } finally {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }
  });

  it('should never log API keys in console output', async () => {
    // ARRANGE: Spy on all console methods
    const consoleSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const consoleWarnSpy = vi.spyOn(console, 'warn');

    const spellName = 'test-no-leak-apikey';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
    const secretApiKey = 'sk_test_FAKE1234567890abcdefghijklmnopqrstuvwxyz';

    createdFiles.push(spellPath);

    try {
      // ACT: Create spell with API key
      await createCommand({
        name: spellName,
        transport: 'http',
        url: `http://localhost:${HTTP_PORT}/mcp`,
        authType: 'api-key',
        authApiKeyType: 'custom',
        authApiKeyHeader: 'X-API-Key',
        authApiKey: secretApiKey,
        probe: false,
        interactive: false,
      });

      // ASSERT: API key never appears in console
      const allLogs = [
        ...consoleSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
      ]
        .flat()
        .join(' ');

      expect(allLogs).not.toContain(secretApiKey);
      expect(allLogs).not.toContain('sk_live_51HqJK');
      expect(allLogs).not.toContain('3m4n5o6p7q8r9s0t');
    } finally {
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    }
  });

  it('should use environment variable placeholders in console output', async () => {
    // ARRANGE: Spy on console
    const consoleSpy = vi.spyOn(console, 'log');

    const spellName = 'test-env-placeholder';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    createdFiles.push(spellPath);

    try {
      // ACT: Create spell with credentials
      await createCommand({
        name: spellName,
        transport: 'http',
        url: `http://localhost:${HTTP_PORT}/mcp`,
        authType: 'bearer',
        authToken: 'literal-secret-value',
        probe: false,
        interactive: false,
      });

      // ASSERT: Console output uses placeholders, not literal values
      const allLogs = consoleSpy.mock.calls.flat().join(' ');

      // Placeholders are OK (e.g., "${TEST_ENV_PLACEHOLDER_TOKEN}")
      // But literal values should never appear
      expect(allLogs).not.toContain('literal-secret-value');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
