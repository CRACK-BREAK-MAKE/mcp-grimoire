/**
 * Integration Test: CLI create with No Auth HTTP server
 *
 * PURPOSE:
 * Tests spell creation for public MCP servers that require NO authentication.
 * Validates that spell works without auth fields or custom headers.
 *
 * MCP SERVER USED:
 * - Server: servers.no_auth.http_server (Port 8007)
 * - Name: "Calculator & Utilities v1.0"
 * - Transport: HTTP (Streamable HTTP - New MCP protocol)
 * - Auth: NONE (public server)
 * - Tools: 3 tools (add, multiply, calculate)
 *
 * AUTHENTICATION PATTERN:
 * - Type: None
 * - No auth.type, auth.token, auth.username, or auth.password fields
 * - No custom headers required
 * - Server is publicly accessible
 *
 * USE CASES:
 * - Public utility servers (calculators, formatters, converters)
 * - Internal corporate servers (no auth on private network)
 * - Development/testing servers
 * - MCP servers that rely on network-level security
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell without any authentication
 * 2. ✓ Validate NO auth fields in spell
 * 3. ✓ Validate NO custom headers in spell
 * 4. ✓ Verify probe works without credentials
 * 5. ✓ Check spell structure is valid
 *
 * NO MOCKS - Real server on localhost:8007
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';
import { startFastMCPServer, stopServer, FASTMCP_PORTS } from './helpers/test-server-manager';
import {
  readSpellFile,
  validateBasicSpellStructure,
  validateHTTPOrSSEServerConfig,
  validateNoAuthOrHeaders,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import { probeMCPServer } from '../utils/mcp-probe';

describe('CLI create - No Auth HTTP', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.NO_AUTH_HTTP;
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'calculator-utilities-http'; // Calculator & Utilities v1.0
  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('no-auth-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    serverProcess = await startFastMCPServer('servers.no_auth.http_server', serverPort);
  }, 60000);

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'no_auth_http_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should create spell without any authentication and validate all fields', async () => {
    // ARRANGE: No auth options provided
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      interactive: false,
      probe: true,
    };

    // ACT
    await createCommand(options);

    // ASSERT
    expect(existsSync(spellFilePath)).toBe(true);

    const spell = await readSpellFile(spellFilePath);

    // ========== 1. Basic Structure Validation ==========
    validateBasicSpellStructure(spell, testSpellName);
    expect(spell.name).toBe(testSpellName);
    expect(spell.version).toBe('1.0.0');
    expect(spell.description).toBeDefined();
    expect(spell.description).toContain('No Auth HTTP Server');
    expect(spell.description).toContain('2.14.3');
    expect(spell.description).toContain('HTTP');
    expect(spell.description).toContain('tool');

    // ========== 2. Keywords Validation ==========
    expect(spell.keywords).toBeDefined();
    expect(Array.isArray(spell.keywords)).toBe(true);
    expect(spell.keywords.length).toBeGreaterThan(0);

    // ========== 3. Server Configuration ==========
    validateHTTPOrSSEServerConfig(spell, 'http', serverUrl);
    expect(spell.server.transport).toBe('http');
    expect(spell.server.url).toBe(serverUrl);

    // ========== 4. No Auth Validation ==========
    validateNoAuthOrHeaders(spell);
    expect(spell.server.auth).toBeUndefined();
    expect(spell.server.headers).toBeUndefined();

    // ========== 5. No server.env field ==========
    expect(spell.server.env).toBeUndefined();

    // ========== 6. No Extra Fields ==========
    const validFields = ['name', 'version', 'description', 'server', 'keywords', 'steering'];
    const actualFields = Object.keys(spell);
    const extraFields = actualFields.filter((field) => !validFields.includes(field));
    expect(extraFields).toHaveLength(0);

    // ========== 7. Steering Content Validation ==========
    expect(spell.steering).toBeDefined();
    expect(typeof spell.steering).toBe('string');
    expect(spell.steering.length).toBeGreaterThan(0);
    expect(spell.steering.length).toBeLessThan(500);

    // ========== 8. Description Contains Tool Information ==========
    expect(spell.description).toContain('tool');
    expect(spell.description.length).toBeGreaterThan(50);
  }, 45000);

  it('should successfully probe server without authentication over HTTP', async () => {
    // ARRANGE: No auth required - should succeed
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
        },
      },
      10000
    );

    // ASSERT: Should succeed since server requires no auth
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  }, 15000);
});
