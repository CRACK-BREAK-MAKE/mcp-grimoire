/**
 * Integration Test: CLI create command with API Key HTTP server
 *
 * PURPOSE:
 * Tests spell creation with Bearer token authentication (API Key pattern) over HTTP.
 * Validates single API key authentication and environment variable management.
 *
 * MCP SERVER USED:
 * - Server: servers.api_key.http_server (Port 8002)
 * - Name: "Weather API v2.0"
 * - Transport: HTTP (Streamable HTTP - New MCP protocol)
 * - Auth: Bearer Token (API Key in Authorization header)
 * - Tools: 3 tools (get_current_weather, get_forecast, get_weather_alerts)
 *
 * AUTHENTICATION PATTERN:
 * - Type: Bearer Token (api_token)
 * - Header: Authorization: Bearer <token>
 * - Token: test-api-key-12345
 * - Single credential (token only, no username/password)
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell with valid API key and probe
 * 2. ✓ Validate Bearer auth configuration in spell file
 * 3. ✓ Verify environment variable transformation (api_token)
 * 4. ✓ Check .env file contains API_TOKEN variable
 * 5. ✓ Test probe with invalid API key (401 Unauthorized)
 * 6. ✓ Test probe without API key (401 Unauthorized)
 *
 * COMPARISON WITH BASIC AUTH:
 * - Basic Auth: username + password (2 credentials)
 * - Bearer Token: single token (1 credential)
 * - Header format: "Authorization: Bearer <token>" vs "Authorization: Basic <base64>"
 *
 * NO MOCKS - Real server on localhost:8002
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
  validateBearerAuthInSpell,
  validateEnvFileLiterals,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import { probeMCPServer } from '../utils/mcp-probe';

describe('CLI create - API Key HTTP', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.API_KEY_HTTP;
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'weather-api-bearer-http'; // Weather API v2.0 with bearer token
  let grimoireDir: string;
  let spellFilePath: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('api-key-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    envFilePath = join(grimoireDir, '.env');

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    serverProcess = await startFastMCPServer('servers.api_key.http_server', serverPort);
  }, 60000); // 60s timeout for server startup

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'api_key_http_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should create spell with API Key and validate all fields', async () => {
    // ARRANGE: Prepare CLI options with API Key
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      authType: 'bearer',
      authToken: FASTMCP_CREDENTIALS.API_KEY,
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
    expect(spell.description, 'description should mention server name').toContain('Weather API');
    expect(spell.description, 'description should mention version (2.14.3)').toMatch(/v?2\.14\.3/i);
    expect(spell.description, 'description should mention HTTP transport').toContain('HTTP');
    expect(spell.description, 'description should mention tool count').toMatch(/3 tools/i);
    expect(spell.description, 'description should have Available Tools section').toContain(
      'Available Tools'
    );

    // ASSERT: Validate keywords include tool names from probe
    // Expected tools from API Key HTTP server: get_current_weather, get_forecast, get_weather_alerts
    const expectedToolKeywords = ['weather', 'forecast', 'alert'];
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

    // Validate Bearer Auth (API Key) and extract placeholder variable name
    const tokenVar = validateBearerAuthInSpell(spell);

    // ASSERT: Validate auth type matches CLI input
    expect(spell.server.auth!.type, 'auth.type should match CLI input').toBe('bearer');

    // ASSERT: Validate auth token is placeholder (not actual value)
    expect(spell.server.auth!.token, 'auth.token should be a placeholder').toMatch(/^\${[A-Z_]+}$/);

    // ASSERT: Validate no extra fields
    expect(
      spell.server.headers,
      'server.headers should be undefined for Bearer Auth'
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
    const expectedSteeringTools = ['get_current_weather', 'get_forecast', 'get_weather_alerts'];
    for (const toolName of expectedSteeringTools) {
      expect(spell.steering!, `steering should list tool name: ${toolName}`).toContain(toolName);
    }

    // ASSERT: Validate description contains tool names with detailed explanations (NOT steering)
    const expectedTools = ['get_current_weather', 'get_forecast', 'get_weather_alerts'];
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

    // Validate .env contains actual API key value (not placeholder)
    validateEnvFileLiterals(envFile, {
      [tokenVar]: FASTMCP_CREDENTIALS.API_KEY,
    });

    // ASSERT: Validate .env has exactly the API key we provided in CLI
    expect(envFile[tokenVar], '.env should have API key from CLI input').toBe(
      FASTMCP_CREDENTIALS.API_KEY
    );
  }, 45000); // 45s timeout for test execution

  it('should fail probe with invalid API key over HTTP', async () => {
    // Probe server with invalid credentials
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
          auth: {
            type: 'bearer',
            token: 'invalid-key-that-should-fail',
          },
        },
      },
      10000
    );

    // Should fail authentication
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 15000);

  it('should fail probe without authentication over HTTP', async () => {
    // Probe server without credentials
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
          // No auth provided - server requires authentication
        },
      },
      10000
    );

    // Should fail authentication
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 15000);
});
