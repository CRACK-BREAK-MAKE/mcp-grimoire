/**
 * Integration Test: CLI create with No Auth SSE server
 *
 * PURPOSE:
 * Tests spell creation for public MCP servers over SSE transport without authentication.
 * Validates SSE-specific configuration for unauthenticated servers.
 *
 * MCP SERVER USED:
 * - Server: servers.no_auth.sse_server (Port 8008)
 * - Name: "System Monitor v1.0"
 * - Transport: SSE (Old MCP protocol 2024-11-05)
 * - Auth: NONE (public server)
 * - Tools: 3 tools (get_cpu_usage, get_memory_stats, get_disk_usage)
 *
 * AUTHENTICATION PATTERN:
 * - Type: None
 * - No credentials required
 * - Public SSE endpoint: GET /sse
 * - Public message endpoint: POST /messages
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell without authentication over SSE
 * 2. ✓ Validate NO auth fields in spell
 * 3. ✓ Verify SSE endpoints configured correctly
 * 4. ✓ Test probe succeeds without credentials
 * 5. ✓ Validate steering generated from tools
 *
 * KEY DIFFERENCE FROM NO_AUTH_HTTP:
 * - Transport: SSE (streaming) vs HTTP (request/response)
 * - Protocol: Old MCP (2024) vs New MCP (2025)
 * - Connection: Long-lived vs short-lived
 *
 * NO MOCKS - Real server on localhost:8008
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { getSpellDirectory } from '../../utils/paths';
import { startFastMCPServer, stopServer, FASTMCP_PORTS } from './helpers/test-server-manager';
import {
  readSpellFile,
  validateBasicSpellStructure,
  validateHTTPOrSSEServerConfig,
  validateNoAuthOrHeaders,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import { probeMCPServer } from '../utils/mcp-probe';

describe('CLI create - No Auth SSE', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.NO_AUTH_SSE;
  const serverUrl = `http://localhost:${serverPort}/sse`;
  const testSpellName = 'system-monitor';
  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = getSpellDirectory();
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    serverProcess = await startFastMCPServer('servers.no_auth.sse_server', serverPort);
  }, 60000);

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'no_auth_sse_server');

    // SKIP CLEANUP: Keep spell files for manual verification
    // TODO: Re-enable cleanup once all tests are verified
    // if (existsSync(spellFilePath)) {
    //   await rm(spellFilePath);
    // }
    console.log(`\n[TEST] Spell file kept for verification: ${spellFilePath}\n`);
  }, 30000);

  it('should create spell without authentication for SSE and validate all fields', async () => {
    // ARRANGE
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
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
    expect(spell.description).toContain('No Auth SSE Server');
    expect(spell.description).toContain('2.14.3');
    expect(spell.description).toContain('SSE');
    expect(spell.description).toContain('tool');

    // ========== 2. Keywords Validation ==========
    expect(spell.keywords).toBeDefined();
    expect(Array.isArray(spell.keywords)).toBe(true);
    expect(spell.keywords.length).toBeGreaterThan(0);

    // ========== 3. Server Configuration ==========
    validateHTTPOrSSEServerConfig(spell, 'sse', serverUrl);
    expect(spell.server.transport).toBe('sse');
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

  it('should successfully probe server without authentication over SSE', async () => {
    // ARRANGE: No auth required - should succeed
    const result = await probeMCPServer(
      {
        server: {
          transport: 'sse',
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
