/**
 * Integration Test: CLI create command with Basic Auth SSE server
 *
 * PURPOSE:
 * Tests spell creation with Basic Authentication over Server-Sent Events (SSE) transport.
 * Validates SSE-specific configuration and credential management.
 *
 * MCP SERVER USED:
 * - Server: servers.basic_auth.sse_server (Port 8001)
 * - Name: "File Storage Service v1.0"
 * - Transport: SSE (Old MCP protocol 2024-11-05: GET /sse + POST /messages)
 * - Auth: Basic Authentication (username + password)
 * - Tools: 3 tools (upload_file, download_file, list_files)
 *
 * AUTHENTICATION PATTERN:
 * - Type: Basic Auth (username/password in Authorization header)
 * - Username: testuser
 * - Password: testpass123
 * - SSE endpoint: GET /sse (for streaming events)
 * - POST endpoint: POST /messages (for sending commands)
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell with valid Basic Auth credentials
 * 2. ✓ Validate SSE-specific server configuration
 * 3. ✓ Verify environment variable transformation
 * 4. ✓ Check .env file structure and literals
 * 5. ✓ Validate steering generated from probe results
 *
 * KEY DIFFERENCES FROM HTTP:
 * - Transport: SSE vs HTTP
 * - Endpoint pattern: /sse vs /mcp
 * - Protocol: Old MCP (2024) vs New MCP (2025)
 * - Connection: Long-lived stream vs request/response
 *
 * NO MOCKS - Real server on localhost:8001
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { getSpellDirectory } from '../../utils/paths';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from './helpers/test-server-manager';
import {
  readSpellFile,
  readEnvFile,
  validateBasicSpellStructure,
  validateHTTPOrSSEServerConfig,
  validateBasicAuthInSpell,
  validateEnvFileLiterals,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';

describe('CLI create - Basic Auth SSE', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.BASIC_AUTH_SSE;
  const serverUrl = `http://localhost:${serverPort}/sse`;
  const testSpellName = 'file-storage-service';
  let grimoireDir: string;
  let spellFilePath: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = getSpellDirectory();
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    envFilePath = join(grimoireDir, '.env');

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    serverProcess = await startFastMCPServer('servers.basic_auth.sse_server', serverPort);
  }, 60000);

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'basic_auth_sse_server');

    // SKIP CLEANUP: Keep spell files for manual verification
    // TODO: Re-enable cleanup once all tests are verified
    // if (existsSync(spellFilePath)) {
    //   await rm(spellFilePath);
    // }
    console.log(`\n[TEST] Spell file kept for verification: ${spellFilePath}\n`);
  }, 30000);

  it('should create spell with Basic Auth for SSE transport and validate all fields', async () => {
    // ARRANGE: Prepare CLI options with Basic Auth credentials
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
      url: serverUrl,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD,
      interactive: false, // CRITICAL: disable interactive mode
      probe: true, // Enable probing to validate server
    };

    // ACT: Create spell via CLI command (programmatic API for testing)
    await createCommand(options);

    // ASSERT: Validate spell file exists
    expect(existsSync(spellFilePath), 'Spell file should exist').toBe(true);

    // ASSERT: Read and validate spell structure
    const spell = await readSpellFile(spellFilePath);

    // Validate basic structure (name, version, description, keywords)
    validateBasicSpellStructure(spell, testSpellName);

    // ASSERT: Validate name matches CLI input
    expect(spell.name, 'spell.name should match CLI input').toBe(testSpellName);
    expect(spell.version, 'spell.version should be 1.0.0').toBe('1.0.0');

    // ASSERT: Validate description mentions server name, version, transport, tool count
    expect(spell.description, 'description should mention server name').toContain('File Storage');
    expect(spell.description, 'description should mention version (2.14.3)').toMatch(/v?2\.14\.3/i);
    expect(spell.description, 'description should mention SSE transport').toContain('SSE');
    expect(spell.description, 'description should mention tool count').toMatch(/3 tools/i);
    expect(spell.description, 'description should have Available Tools section').toContain(
      'Available Tools'
    );

    // ASSERT: Validate keywords include tool names from probe
    // Expected tools from Basic Auth SSE server: upload_file, list_files, delete_file
    const expectedToolKeywords = ['upload', 'list', 'delete', 'file', 'files'];
    for (const keyword of expectedToolKeywords) {
      expect(
        spell.keywords.some((k) => k.includes(keyword)),
        `keywords should include tool-related keyword: ${keyword}`
      ).toBe(true);
    }

    // Validate server config (transport, url)
    validateHTTPOrSSEServerConfig(spell, 'sse', serverUrl);

    // ASSERT: Validate transport matches CLI input
    expect(spell.server.transport, 'server.transport should match CLI input').toBe('sse');

    // ASSERT: Validate URL matches CLI input
    expect(spell.server.url, 'server.url should match CLI input').toBe(serverUrl);
    expect(spell.server.url, 'server.url should be a valid HTTP URL').toMatch(/^http:\/\//);

    // Validate Basic Auth and extract placeholder variable names
    const { usernameVar, passwordVar } = validateBasicAuthInSpell(spell);

    // ASSERT: Validate auth type matches CLI input
    expect(spell.server.auth!.type, 'auth.type should match CLI input').toBe('basic');

    // ASSERT: Validate auth username and password are placeholders (not actual values)
    expect(spell.server.auth!.username, 'auth.username should be a placeholder').toMatch(
      /^\${[A-Z_]+}$/
    );
    expect(spell.server.auth!.password, 'auth.password should be a placeholder').toMatch(
      /^\${[A-Z_]+}$/
    );

    // ASSERT: Validate no extra fields
    expect(
      spell.server.headers,
      'server.headers should be undefined for Basic Auth'
    ).toBeUndefined();
    expect(spell.server.env, 'server.env should be undefined for SSE transport').toBeUndefined();

    // ASSERT: Validate steering is MINIMAL (for intent resolution only)
    expect(spell.steering, 'spell.steering should be defined after probe').toBeDefined();
    expect(typeof spell.steering, 'spell.steering should be a string').toBe('string');
    expect(spell.steering!.length, 'spell.steering should be minimal (< 500 chars)').toBeLessThan(
      500
    );

    // ASSERT: Validate steering mentions tool count but NOT tool definitions
    expect(spell.steering!, 'steering should mention tool count').toMatch(
      /3|Available Tools \(3\)/i
    );

    expect(spell.steering!, 'steering should contain when to use guidance').toMatch(
      /when to use|use this server for|use when/i
    );

    // ASSERT: Steering should list tool NAMES (not descriptions) for intent matching
    const expectedSteeringTools = ['upload_file', 'list_files', 'delete_file'];
    for (const toolName of expectedSteeringTools) {
      expect(spell.steering!, `steering should list tool name: ${toolName}`).toContain(toolName);
    }

    // ASSERT: Validate description contains tool names with detailed explanations (NOT steering)
    const expectedTools = ['upload_file', 'list_files', 'delete_file'];
    for (const toolName of expectedTools) {
      expect(
        spell.description.toLowerCase(),
        `description should contain tool: ${toolName}`
      ).toContain(toolName.toLowerCase());
    }

    // ASSERT: Validate description has "Available Tools" section with details
    expect(spell.description, 'description should have detailed tool list').toContain(
      'Available Tools'
    );

    // ASSERT: Validate description explains tool functionality (detailed, not minimal)
    expect(
      spell.description.length,
      'description should be detailed with tool explanations'
    ).toBeGreaterThan(200);

    // ASSERT: Read and validate .env file
    expect(existsSync(envFilePath), '.env file should exist').toBe(true);
    const envFile = await readEnvFile(envFilePath);

    // Validate .env contains actual credential values (not placeholders)
    validateEnvFileLiterals(envFile, {
      [usernameVar]: FASTMCP_CREDENTIALS.USERNAME,
      [passwordVar]: FASTMCP_CREDENTIALS.PASSWORD,
    });

    // ASSERT: Validate .env has exactly the credentials we provided in CLI
    expect(envFile[usernameVar], '.env should have username from CLI input').toBe(
      FASTMCP_CREDENTIALS.USERNAME
    );
    expect(envFile[passwordVar], '.env should have password from CLI input').toBe(
      FASTMCP_CREDENTIALS.PASSWORD
    );
  }, 45000);
});
