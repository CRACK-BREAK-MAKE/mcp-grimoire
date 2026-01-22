/**
 * Integration Test: CLI create with API Key SSE server
 *
 * PURPOSE:
 * Tests spell creation with Bearer token authentication over Server-Sent Events (SSE).
 * Validates SSE-specific configuration with API key authentication.
 *
 * MCP SERVER USED:
 * - Server: servers.api_key.sse_server (Port 8003)
 * - Name: "News Aggregator v1.5"
 * - Transport: SSE (Old MCP protocol 2024-11-05)
 * - Auth: Bearer Token (API Key)
 * - Tools: 3 tools (search_news, get_headlines, get_article)
 *
 * AUTHENTICATION PATTERN:
 * - Type: Bearer Token (api_token)
 * - Header: Authorization: Bearer <token>
 * - Token: test-api-key-12345
 * - SSE endpoint: GET /sse (for streaming)
 * - Message endpoint: POST /messages (for commands)
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell with valid API key over SSE
 * 2. ✓ Validate Bearer auth in spell file
 * 3. ✓ Verify SSE transport configuration
 * 4. ✓ Check environment variable transformation
 * 5. ✓ Test probe with valid API key (200 OK)
 * 6. ✓ Test probe with invalid API key (401 Unauthorized)
 * 7. ✓ Test probe without API key (401 Unauthorized)
 * 8. ✓ Validate custom headers can be added alongside auth
 *
 * SSE + BEARER TOKEN COMBINATION:
 * This is a common pattern for:
 * - News APIs with streaming updates
 * - Real-time data feeds requiring authentication
 * - WebSocket alternatives with API key auth
 *
 * KEY DIFFERENCES:
 * - vs HTTP Bearer: SSE streaming vs request/response
 * - vs Basic SSE: Single token vs username+password
 * - vs Custom Headers: Standard Authorization vs custom headers
 *
 * NO MOCKS - Real server on localhost:8003
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
  validateCustomHeadersInSpell,
  validateEnvFileLiterals,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import { probeMCPServer } from '../utils/mcp-probe';

describe('CLI create - API Key SSE', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.API_KEY_SSE;
  const serverUrl = `http://localhost:${serverPort}/sse`;
  let grimoireDir: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('api-key-sse');
    envFilePath = join(grimoireDir, '.env');

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    serverProcess = await startFastMCPServer('servers.api_key.sse_server', serverPort);
  }, 60000);

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'api_key_sse_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should create spell with API Key over SSE and validate all fields', async () => {
    const testSpellName = 'news-aggregator-bearer-sse'; // News Aggregator v1.5 + bearer token
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // ARRANGE: Prepare CLI options with API Key for SSE
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
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
    expect(spell.description, 'description should mention server name').toContain(
      'News Aggregator'
    );
    expect(spell.description, 'description should mention version (2.14.3)').toMatch(/v?2\.14\.3/i);
    expect(spell.description, 'description should mention SSE transport').toContain('SSE');
    expect(spell.description, 'description should mention tool count').toMatch(/3 tools/i);
    expect(spell.description, 'description should have Available Tools section').toContain(
      'Available Tools'
    );

    // ASSERT: Validate keywords include tool names from probe
    // Expected tools from API Key SSE server: get_latest_news, search_news, get_trending_topics
    const expectedToolKeywords = ['news', 'search', 'trending'];
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
    const expectedSteeringTools = ['get_latest_news', 'search_news', 'get_trending_topics'];
    for (const toolName of expectedSteeringTools) {
      expect(spell.steering!, `steering should list tool name: ${toolName}`).toContain(toolName);
    }

    // ASSERT: Validate description contains tool names with detailed explanations (NOT steering)
    const expectedTools = ['get_latest_news', 'search_news', 'get_trending_topics'];
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

    // NOTE: Cleanup disabled for manual verification
    // console.log(`\n[TEST] Spell file kept for verification: ${spellFilePath}`);
  }, 45000);

  it('should create spell with custom header for SSE and validate all fields', async () => {
    const testSpellName = 'news-aggregator-header-sse'; // News Aggregator v1.5 with custom header
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // ARRANGE: Prepare CLI options with custom header for SSE
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
      url: serverUrl,
      headers: { Authorization: `Bearer ${FASTMCP_CREDENTIALS.API_KEY}` },
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
      'News Aggregator'
    );
    expect(spell.description, 'description should mention version (2.14.3)').toMatch(/v?2\.14\.3/i);
    expect(spell.description, 'description should mention SSE transport').toContain('SSE');
    expect(spell.description, 'description should mention tool count').toMatch(/3 tools/i);
    expect(spell.description, 'description should have Available Tools section').toContain(
      'Available Tools'
    );

    // ASSERT: Validate keywords include tool names from probe
    const expectedToolKeywords = ['news', 'search', 'trending'];
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

    // ASSERT: Validate auth is undefined for custom header approach
    expect(spell.server.auth, 'server.auth should be undefined for custom headers').toBeUndefined();

    // Validate custom headers and extract placeholder variable names
    const headerVars = validateCustomHeadersInSpell(spell, {
      Authorization: `Bearer ${FASTMCP_CREDENTIALS.API_KEY}`,
    });

    // ASSERT: Validate headers are defined
    expect(spell.server.headers, 'server.headers should be defined').toBeDefined();
    expect(
      spell.server.headers!['Authorization'],
      'Authorization header should be defined'
    ).toBeDefined();
    expect(
      spell.server.headers!['Authorization'],
      'Authorization header should be a placeholder'
    ).toMatch(/^\${[A-Z_]+}$/);

    // ASSERT: Validate no server.env field
    expect(spell.server.env, 'server.env should be undefined for SSE transport').toBeUndefined();

    // ASSERT: Validate steering is MINIMAL (for intent resolution only)
    expect(spell.steering, 'spell.steering should be defined after probe').toBeDefined();
    expect(typeof spell.steering, 'spell.steering should be a string').toBe('string');
    expect(spell.steering!.length, 'spell.steering should be minimal (< 500 chars)').toBeLessThan(
      500
    );

    // ASSERT: Validate steering mentions tool count
    expect(spell.steering!, 'steering should mention tool count').toMatch(
      /5|Available Tools \(5\)/i
    );

    expect(spell.steering!, 'steering should contain when to use guidance').toMatch(
      /when to use|use this server for|use when/i
    );

    // ASSERT: Steering should list tool NAMES
    const expectedSteeringTools = ['get_latest_news', 'search_news', 'get_trending_topics'];
    for (const toolName of expectedSteeringTools) {
      expect(spell.steering!, `steering should list tool name: ${toolName}`).toContain(toolName);
    }

    // ASSERT: Validate description contains tool names
    const expectedTools = ['get_latest_news', 'search_news', 'get_trending_topics'];
    for (const toolName of expectedTools) {
      expect(
        spell.description.toLowerCase(),
        `description should contain tool: ${toolName}`
      ).toContain(toolName.toLowerCase());
    }

    // ASSERT: Validate description is detailed
    expect(
      spell.description.length,
      'description should be detailed with tool explanations'
    ).toBeGreaterThan(200);

    // ASSERT: Read and validate .env file
    expect(existsSync(envFilePath), '.env file should exist').toBe(true);
    const envFile = await readEnvFile(envFilePath);

    // Validate .env contains actual header value (not placeholder)
    const authHeaderVar = headerVars['Authorization'];
    validateEnvFileLiterals(envFile, {
      [authHeaderVar]: `Bearer ${FASTMCP_CREDENTIALS.API_KEY}`,
    });

    // ASSERT: Validate .env has exactly the header value we provided in CLI
    expect(envFile[authHeaderVar], '.env should have Authorization header from CLI input').toBe(
      `Bearer ${FASTMCP_CREDENTIALS.API_KEY}`
    );

    // NOTE: Cleanup disabled for manual verification
    // console.log(`\n[TEST] Spell file kept for verification: ${spellFilePath}`);
  }, 45000);
  test('should fail probe with invalid API key over SSE', async () => {
    // Probe server with invalid credentials
    const result = await probeMCPServer(
      {
        server: {
          transport: 'sse',
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

  test('should fail probe without authentication over SSE', async () => {
    // Probe server without credentials
    const result = await probeMCPServer(
      {
        server: {
          transport: 'sse',
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
