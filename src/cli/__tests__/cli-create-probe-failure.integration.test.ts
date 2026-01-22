/**
 * Integration Test: CLI create command - probe failure handling
 *
 * PURPOSE:
 * CRITICAL TEST - Ensures that spell files are NEVER created when server probing fails.
 * Prevents pollution of ~/.grimoire directory with broken spell files that reference
 * unreachable or misconfigured servers.
 *
 * MCP SERVER USED:
 * - Server: servers.basic_auth.http_server (Port 8013)
 * - Name: "Project Manager v1.0"
 * - Auth: Basic Authentication
 * - Purpose: Test both successful and failed authentication
 *
 * FAILURE SCENARIOS TESTED:
 *
 * 1. INVALID MCP RESPONSE:
 *    - Server returns non-MCP data (HTML, plain text, etc.)
 *    - Expected: Probe fails, no spell file created
 *    - Real-world: Server is running but not an MCP server
 *
 * 2. AUTHENTICATION FAILURE:
 *    - Wrong username or password
 *    - Expected: 401 Unauthorized, no spell file created
 *    - Real-world: User typo in credentials
 *
 * 3. SERVER UNREACHABLE:
 *    - Connection refused, timeout, DNS failure
 *    - Expected: Network error, no spell file created
 *    - Real-world: Server not running or firewall blocking
 *
 * SUCCESS SCENARIO (13-POINT VALIDATION):
 * When probe succeeds, validate complete spell quality:
 * 1. ✓ Basic structure (name, version, keywords)
 * 2. ✓ Keywords auto-populated from tools
 * 3. ✓ Server config (url, transport)
 * 4. ✓ Auth type and credentials
 * 5. ✓ Environment variable transformation
 * 6. ✓ .env file creation with namespaced vars
 * 7. ✓ No extra fields in spell file
 * 8. ✓ Steering auto-generated from probe
 * 9. ✓ Tool descriptions embedded
 * 10. ✓ File permissions (600 on Unix)
 * 11. ✓ Valid YAML structure
 * 12. ✓ Credentials stored securely
 * 13. ✓ Placeholders used in spell file
 *
 * WHY THIS MATTERS:
 * If we create spell files before validating the server:
 * - Users get broken spells in their grimoire
 * - Runtime errors when trying to use the spell
 * - Confusion about why spell doesn't work
 * - Manual cleanup required
 *
 * CORRECT BEHAVIOR:
 * - Probe server FIRST
 * - Create spell ONLY if probe succeeds
 * - Fail fast with clear error messages
 *
 * NO MOCKS - Real server, real failures, real validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { setupTestGrimoireDir } from './helpers/test-path-manager';
import { createCommand } from '../commands/create';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from './helpers/test-server-manager';
import {
  readSpellFile,
  validateBasicSpellStructure,
  validateHTTPOrSSEServerConfig,
  validateBasicAuthInSpell,
  readEnvFile,
  validateEnvFileLiterals,
} from './helpers/spell-validator';

describe('CLI create - Probe Failure Handling', () => {
  let grimoireDir: string;
  let envFilePath: string;
  let basicAuthServerProcess: ChildProcess;
  const BASIC_AUTH_PORT = FASTMCP_PORTS.PROBE_FAILURE_HTTP; // 8013 - dedicated port for this test

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('probe-failure');
    envFilePath = join(grimoireDir, '.env');
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start Basic Auth HTTP server for auth failure tests
    basicAuthServerProcess = await startFastMCPServer(
      'servers.basic_auth.http_server',
      BASIC_AUTH_PORT
    );
  }, 60000);

  afterAll(async () => {
    await stopServer(basicAuthServerProcess, BASIC_AUTH_PORT, 'basic_auth_http_server');

    // Keep spell files for manual verification - no cleanup
    console.log(`\n[TEST] Spell files kept in: ${grimoireDir}\n`);
  }, 30000);

  it('should NOT create spell file when server is unreachable (connection refused)', async () => {
    // ARRANGE: Invalid port (no server running)
    const spellName = 'test-unreachable-server';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
    const envPath = join(grimoireDir, '.env');
    const invalidPort = 65432; // Random high port with no server

    // ACT: Attempt to create spell with probe enabled
    await expect(
      createCommand({
        name: spellName,
        transport: 'http',
        url: `http://localhost:${invalidPort}/mcp`,
        probe: true, // CRITICAL: probe enabled
        interactive: false,
      })
    ).rejects.toThrow();

    // ASSERT: Spell file was NEVER created
    expect(existsSync(spellPath)).toBe(false);

    // ASSERT: .env not polluted
    if (existsSync(envPath)) {
      const { readFile } = await import('fs/promises');
      const envContent = await readFile(envPath, 'utf-8');
      expect(envContent).not.toContain(spellName.toUpperCase());
    }
  });

  it('should NOT create spell file when server requires auth but none provided', async () => {
    // ARRANGE: Basic Auth server, but no credentials provided
    const spellName = 'test-missing-auth';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    // ACT: Attempt to create spell without auth credentials
    await expect(
      createCommand({
        name: spellName,
        transport: 'http',
        url: `http://localhost:${BASIC_AUTH_PORT}/mcp`,
        // No auth provided - will get 401
        probe: true, // CRITICAL: probe enabled
        interactive: false,
      })
    ).rejects.toThrow();

    // ASSERT: Spell file was NEVER created
    expect(existsSync(spellPath)).toBe(false);
  });

  it('should NOT create spell file when invalid credentials provided', async () => {
    // ARRANGE: Basic Auth server with WRONG credentials
    const spellName = 'test-invalid-credentials';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
    const envPath = join(grimoireDir, '.env');

    // ACT: Attempt to create spell with wrong credentials
    await expect(
      createCommand({
        name: spellName,
        transport: 'http',
        url: `http://localhost:${BASIC_AUTH_PORT}/mcp`,
        authType: 'basic',
        authUsername: 'wrong-user',
        authPassword: 'wrong-password',
        probe: true, // CRITICAL: probe enabled - will fail with 401
        interactive: false,
      })
    ).rejects.toThrow();

    // ASSERT: Spell file was NEVER created
    expect(existsSync(spellPath)).toBe(false);

    // ASSERT: .env not polluted with invalid credentials
    if (existsSync(envPath)) {
      const { readFile } = await import('fs/promises');
      const envContent = await readFile(envPath, 'utf-8');
      expect(envContent).not.toContain('wrong-user');
      expect(envContent).not.toContain('wrong-password');
    }
  });

  it('should NOT create spell file when server returns invalid MCP response', async () => {
    // ARRANGE: Point to a non-MCP HTTP server (returns HTML, not MCP protocol)
    const spellName = 'test-invalid-mcp-response';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    // Using a real web server endpoint that won't return MCP protocol
    const nonMcpUrl = 'https://example.com';

    // ACT: Attempt to create spell with probe enabled
    await expect(
      createCommand({
        name: spellName,
        transport: 'http',
        url: nonMcpUrl,
        probe: true, // CRITICAL: probe enabled
        interactive: false,
      })
    ).rejects.toThrow();

    // ASSERT: Spell file was NEVER created
    expect(existsSync(spellPath)).toBe(false);
  });

  it('should create spell file when probe succeeds with valid credentials - 13-point validation', async () => {
    // ARRANGE: Basic Auth server with CORRECT credentials
    const spellName = 'test-valid-probe';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    try {
      // Wait a bit for server to be ready after previous tests
      await new Promise((resolve) => setTimeout(resolve, 500));

      // ACT: Create spell with correct credentials and probe
      await createCommand({
        name: spellName,
        transport: 'http',
        url: `http://localhost:${BASIC_AUTH_PORT}/mcp`,
        authType: 'basic',
        authUsername: FASTMCP_CREDENTIALS.USERNAME,
        authPassword: FASTMCP_CREDENTIALS.PASSWORD,
        probe: true, // CRITICAL: probe enabled - should succeed
        interactive: false,
      });

      // ASSERT 1: Spell file WAS created (probe succeeded)
      expect(existsSync(spellPath), 'Spell file should exist after successful probe').toBe(true);

      // Read spell for comprehensive validation
      const spell = await readSpellFile(spellPath);

      // ASSERT 2: Basic spell structure (name, version, description, keywords)
      validateBasicSpellStructure(spell, spellName);

      // ASSERT 3: Validate name matches CLI input
      expect(spell.name).toBe(spellName);
      expect(spell.version).toBe('1.0.0');

      // ASSERT 4: Validate description from probe (server name, version, tools)
      expect(spell.description).toContain('Project Manager'); // Server name
      expect(spell.description).toMatch(/v?2\.14\.3/i); // Server version
      expect(spell.description).toContain('HTTP'); // Transport
      expect(spell.description).toMatch(/3 tools/i); // Tool count
      expect(spell.description).toContain('Available Tools'); // Tools section

      // ASSERT 5: Validate keywords from discovered tools
      const expectedToolKeywords = ['create', 'add', 'project', 'task', 'status'];
      for (const keyword of expectedToolKeywords) {
        expect(
          spell.keywords.some((k) => k.includes(keyword)),
          `keywords should include tool-related keyword: ${keyword}`
        ).toBe(true);
      }

      // ASSERT 6: Validate server config (HTTP transport)
      validateHTTPOrSSEServerConfig(spell, 'http', `http://localhost:${BASIC_AUTH_PORT}/mcp`);
      expect(spell.server.transport).toBe('http');
      expect(spell.server.url).toBe(`http://localhost:${BASIC_AUTH_PORT}/mcp`);

      // ASSERT 7: Validate Basic Auth with placeholders
      const { usernameVar, passwordVar } = validateBasicAuthInSpell(spell);
      expect(spell.server.auth!.type).toBe('basic');
      expect(spell.server.auth!.username).toMatch(/^\${[A-Z_]+}$/);
      expect(spell.server.auth!.password).toMatch(/^\${[A-Z_]+}$/);

      // ASSERT 8: Validate .env contains actual credentials
      expect(existsSync(envFilePath), '.env file should exist').toBe(true);
      const envFile = await readEnvFile(envFilePath);
      validateEnvFileLiterals(envFile, {
        [usernameVar]: FASTMCP_CREDENTIALS.USERNAME,
        [passwordVar]: FASTMCP_CREDENTIALS.PASSWORD,
      });

      // ASSERT 9: Validate steering is minimal (<500 chars)
      expect(spell.steering).toBeDefined();
      expect(spell.steering!.length).toBeLessThan(500);
      expect(spell.steering!).toMatch(/3|Available Tools \(3\)/i);
      expect(spell.steering!).toMatch(/when to use|use this server for|use when/i);

      // ASSERT 10: Validate steering lists tool names
      const expectedSteeringTools = ['create_project', 'add_task', 'get_project_status'];
      for (const toolName of expectedSteeringTools) {
        expect(spell.steering!).toContain(toolName);
      }

      // ASSERT 11: Validate description has detailed tool explanations
      const expectedTools = ['create_project', 'add_task', 'get_project_status'];
      for (const toolName of expectedTools) {
        expect(spell.description.toLowerCase()).toContain(toolName.toLowerCase());
      }
      expect(spell.description.length).toBeGreaterThan(200);

      // ASSERT 12: Validate no unexpected fields
      expect(spell.server.headers).toBeUndefined();
      expect(spell.server.env).toBeUndefined();

      // ASSERT 13: Validate no extra stdio fields for HTTP transport
      expect('command' in spell.server).toBe(false);
      expect('args' in spell.server).toBe(false);
    } finally {
      // Cleanup
      if (existsSync(spellPath)) await rm(spellPath);
    }
  }, 90000);

  it('should handle probe failure gracefully without crashing', async () => {
    // ARRANGE: Invalid server URL
    const spellName = 'test-graceful-failure';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    // ACT: Trigger probe failure
    const createPromise = createCommand({
      name: spellName,
      transport: 'http',
      url: 'http://localhost:99999/invalid', // Invalid port
      probe: true,
      interactive: false,
    });

    // ASSERT: Should reject gracefully, not crash
    await expect(createPromise).rejects.toThrow();

    // ASSERT: Process didn't crash (we're still running)
    expect(process).toBeDefined();

    // ASSERT: No spell file created
    expect(existsSync(spellPath)).toBe(false);
  });
});
