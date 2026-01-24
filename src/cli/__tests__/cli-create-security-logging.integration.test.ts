/**
 * Integration Test: CLI create command security & logging
 *
 * PURPOSE:
 * Validates that credentials are never exposed in console output during
 * spell creation. Ensures logging practices follow security best practices.
 *
 * MCP SERVER USED:
 * - Server: servers.no_auth.http_server (Port 8016)
 * - Transport: HTTP
 * - Auth: None (but test injects credentials to validate logging)
 *
 * SECURITY PRINCIPLES TESTED:
 *
 * 1. CONSOLE OUTPUT SAFETY:
 *    - ✓ console.log() never contains credential values
 *    - ✓ console.error() never contains credential values
 *    - ✓ console.warn() never contains credential values
 *    - ✓ Only environment variable names logged, not values
 *
 * 2. ACCEPTABLE LOGGING:
 *    - ✓ "Environment variables saved: ~/.grimoire/.env"
 *    - ✓ "Variables: SPELL_NAME__API_TOKEN" (name only)
 *    - ✓ "Using ${SPELL_NAME__API_TOKEN}" (placeholder)
 *    - ✓ "Spell created: /path/to/spell.yaml"
 *
 * 3. FORBIDDEN LOGGING:
 *    - ✗ "Password: testpass123" (literal value)
 *    - ✗ "API Token: sk_test_..." (literal value)
 *    - ✗ "Authorization: Bearer actual-token" (header value)
 *    - ✗ "value=super-secret-..." (any credential value)
 *
 * DETECTION METHOD:
 * - Spy on all console methods
 * - Capture output during spell creation
 * - Search for literal credential strings
 * - Validate only placeholders appear
 *
 * WHY THIS MATTERS:
 * Credentials in logs can be:
 * - Captured in CI/CD logs
 * - Saved to terminal history
 * - Exposed in screenshots
 * - Leaked to log aggregation services
 * - Visible to other users on shared systems
 *
 * BEST PRACTICE:
 * Always use placeholders (${ENV_VAR_NAME}) in user-facing output.
 * Log variable names, not variable values.
 *
 * REAL SECURITY - Tests actual console output
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';
import { createCommand, type CreateOptions } from '../commands/create';
import { startFastMCPServer, stopServer, FASTMCP_PORTS } from './helpers/test-server-manager';

describe('CLI create - Security & Logging', () => {
  let grimoireDir: string;
  let httpServerProcess: ChildProcess;
  const createdFiles: string[] = [];
  const HTTP_PORT = FASTMCP_PORTS.SECURITY_LOGGING_HTTP; // 8016 - dedicated port for this test

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('security-logging');
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start HTTP server
    httpServerProcess = await startFastMCPServer('servers.no_auth.http_server', HTTP_PORT);
  }, 60000);

  afterAll(async () => {
    await stopServer(httpServerProcess, HTTP_PORT, 'no_auth_http_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should never log literal credentials to console', async () => {
    // ARRANGE: Set up test data and spies
    const spellName = 'sec-log-spell';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
    const envPath = join(grimoireDir, '.env');

    createdFiles.push(spellPath, envPath);

    // Mock console methods to capture output
    const consoleLogSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const consoleWarnSpy = vi.spyOn(console, 'warn');

    const secretToken = 'super-secret-token-12345';

    // ACT: Create spell with probe=true to validate real server
    await createCommand({
      name: spellName,
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      authType: 'bearer',
      authToken: secretToken,
      probe: true, // CRITICAL: Enable probe to validate server and populate .env
      interactive: false,
    });

    // ASSERT: Check all console outputs
    const allLogs = [
      ...consoleLogSpy.mock.calls.flat(),
      ...consoleErrorSpy.mock.calls.flat(),
      ...consoleWarnSpy.mock.calls.flat(),
    ].join('\n');

    // Credentials should NEVER appear in logs
    expect(allLogs).not.toContain(secretToken);

    // But env var NAME should appear (CLI shows 'Variables: SEC_LOG_SPELL__BEARER_TOKEN')
    expect(allLogs).toContain('BEARER_TOKEN');

    // Verify spell was created and has proper structure
    expect(existsSync(spellPath)).toBe(true);
    expect(existsSync(envPath)).toBe(true);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should log environment variable names but not values', async () => {
    // ARRANGE: Set up test data and spies
    const spellName = 'sec-log-env';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
    const envPath = join(grimoireDir, '.env');

    createdFiles.push(spellPath, envPath);

    const consoleLogSpy = vi.spyOn(console, 'log');
    const secretPassword = 'my-secret-password-abc123';

    // ACT: Create spell with probe=true to validate real server
    await createCommand({
      name: spellName,
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      authType: 'basic',
      authUsername: 'testuser',
      authPassword: secretPassword,
      probe: true, // CRITICAL: Enable probe to validate server and populate .env
      interactive: false,
    });

    // ASSERT: Check all console outputs
    const allLogs = consoleLogSpy.mock.calls.flat().join('\n');

    // Password should NEVER appear
    expect(allLogs).not.toContain(secretPassword);

    // But env var NAMES should appear (CLI shows 'Variables: API_USERNAME, API_PASSWORD')
    expect(allLogs).toContain('API_USERNAME');
    expect(allLogs).toContain('API_PASSWORD');

    // Verify spell was created and has proper structure
    expect(existsSync(spellPath)).toBe(true);
    expect(existsSync(envPath)).toBe(true);

    consoleLogSpy.mockRestore();
  });
});
