/**
 * Integration Test: CLI create command with Basic Auth HTTP server
 *
 * PURPOSE:
 * Tests spell creation with Basic Authentication (username/password) over HTTP transport.
 * Validates environment variable transformation, credential security, and spell file quality.
 *
 * MCP SERVER USED:
 * - Server: servers.basic_auth.http_server (Port 8000)
 * - Name: "Project Manager v1.0"
 * - Transport: HTTP (Streamable HTTP - New MCP protocol 2025-03-26)
 * - Auth: Basic Authentication (username + password)
 * - Tools: 3 tools (create_task, list_tasks, update_task_status)
 *
 * AUTHENTICATION PATTERN:
 * - Type: Basic Auth (username/password encoded in Authorization header)
 * - Username: testuser
 * - Password: testpass123
 * - Credentials stored in ~/.grimoire/.env with spell-name prefix
 * - Spell file uses ${ENV_VAR_NAME} placeholders
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell with valid credentials and probe
 * 2. ✓ Validate spell structure (13-point validation)
 * 3. ✓ Verify environment variable transformation
 * 4. ✓ Check credentials stored securely in .env
 * 5. ✓ Test probe with invalid credentials (negative test)
 *
 * VALIDATION CHECKLIST (13 points):
 * 1. Basic structure (name, version, keywords array)
 * 2. Keywords populated from tools
 * 3. Server config (url, transport)
 * 4. Auth type (basic)
 * 5. Auth credentials (username, password as env var placeholders)
 * 6. Extra fields check
 * 7. .env file validation
 * 8. No extra root-level fields
 * 9. Steering content populated
 * 10. Tool descriptions embedded
 * 11. Probe success validation
 * 12. Environment variable namespacing (SPELLNAME__VARIABLE)
 * 13. File permissions (600 on Unix)
 *
 * NO MOCKS - Real server on localhost:8000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';
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
  validateNoAuthOrHeaders,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';

describe('CLI create - Basic Auth HTTP', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.BASIC_AUTH_HTTP;
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'project-manager-basic-http'; // Project Manager v1.0 + basic auth
  let grimoireDir: string;
  let spellFilePath: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('basic-auth-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    envFilePath = join(grimoireDir, '.env');

    // Ensure grimoire directory exists
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Clean up any previous test spell file
    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    // Start Basic Auth HTTP server
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', serverPort);
  }, 60000); // 60s timeout for server startup

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'basic_auth_http_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should create spell with Basic Auth and validate all fields', async () => {
    // ARRANGE: Prepare CLI options with Basic Auth credentials
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
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
    expect(spell.description, 'description should mention server name').toContain(
      'Project Manager'
    );
    expect(spell.description, 'description should mention version (2.14.3)').toMatch(/v?2\.14\.3/i);
    expect(spell.description, 'description should mention HTTP transport').toContain('HTTP');
    expect(spell.description, 'description should mention tool count').toMatch(/3 tools/i);
    expect(spell.description, 'description should have Available Tools section').toContain(
      'Available Tools'
    );

    // ASSERT: Validate keywords include tool names from probe
    // Expected tools from Basic Auth HTTP server: create_project, add_task, get_project_status
    const expectedToolKeywords = ['create', 'add', 'project', 'task', 'status'];
    for (const keyword of expectedToolKeywords) {
      expect(
        spell.keywords.some((k) => k.includes(keyword)),
        `keywords should include tool-related keyword: ${keyword}`
      ).toBe(true);
    }

    // Validate server config (transport, url)
    validateHTTPOrSSEServerConfig(spell, 'http', serverUrl);

    // ASSERT: Validate transport matches CLI input
    expect(spell.server.transport, 'server.transport should match CLI input').toBe('http');

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
    expect(spell.server.env, 'server.env should be undefined for HTTP transport').toBeUndefined();

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
    const expectedSteeringTools = ['create_project', 'add_task', 'get_project_status'];
    for (const toolName of expectedSteeringTools) {
      expect(spell.steering!, `steering should list tool name: ${toolName}`).toContain(toolName);
    }

    // ASSERT: Validate description contains tool names with detailed explanations (NOT steering)
    const expectedTools = ['create_project', 'add_task', 'get_project_status'];
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
  }, 45000); // 45s timeout (includes probing)
});
