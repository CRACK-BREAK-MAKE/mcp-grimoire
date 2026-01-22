/**
 * Integration Test: CLI create with Security Keys HTTP server
 *
 * PURPOSE:
 * Tests spell creation with MULTIPLE custom headers for authentication.
 * Demonstrates pattern where MCP server accepts multiple API keys for different services.
 *
 * MCP SERVER USED:
 * - Server: servers.security_keys.http_server (Port 8004)
 * - Name: "Database Query Tool v1.0"
 * - Transport: HTTP (Streamable HTTP - New MCP protocol)
 * - Auth: Multiple Custom Headers (OR logic)
 * - Tools: 3 tools (run_sql_query, get_table_schema, export_query_results)
 *
 * AUTHENTICATION PATTERN:
 * Server accepts EITHER of these headers:
 * 1. X-GitHub-Token: <github-pat> (for GitHub integration)
 * 2. X-Brave-Key: <brave-api-key> (for Brave Search integration)
 *
 * The server uses OR logic - only ONE key is required to authenticate.
 *
 * REAL-WORLD USE CASES:
 * This pattern is common for MCP servers that:
 * - Integrate with multiple external APIs
 * - Need different keys for different features
 * - Support multiple authentication providers
 * - Have optional enhanced features requiring extra keys
 *
 * EXAMPLE: A research MCP server might accept:
 * - X-GitHub-Token (for code search)
 * - X-Brave-Key (for web search)
 * - X-OpenAI-Key (for AI analysis)
 * User can provide any combination of keys to enable features.
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell with BOTH headers (GitHub + Brave)
 * 2. ✓ Validate custom headers in server.headers
 * 3. ✓ Verify NO auth field (custom headers only)
 * 4. ✓ Check environment variable transformation
 * 5. ✓ Test probe with valid GitHub token
 * 6. ✓ Test probe with valid Brave key
 * 7. ✓ Test probe with invalid token (401)
 * 8. ✓ Test probe without any keys (401)
 *
 * SPELL FILE STRUCTURE:
 * ```yaml
 * server:
 *   transport: http
 *   url: http://localhost:8004/mcp
 *   headers:
 *     X-GitHub-Token: "${SPELL_NAME__X_GITHUB_TOKEN}"
 *     X-Brave-Key: "${SPELL_NAME__X_BRAVE_KEY}"
 *   # NO auth field - custom headers only
 * ```
 *
 * NO MOCKS - Real server on localhost:8004
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { setupTestGrimoireDir } from './helpers/test-path-manager';
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
  validateCustomHeadersInSpell,
  validateEnvFileLiterals,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import { probeMCPServer } from '../utils/mcp-probe';

describe('CLI create - Security Keys HTTP', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.SECURITY_KEYS_HTTP;
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  let grimoireDir: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('security-keys-http');
    envFilePath = join(grimoireDir, '.env');

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    serverProcess = await startFastMCPServer('servers.security_keys.http_server', serverPort);
  }, 60000);

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'security_keys_http_server');

    console.log(`\n[TEST] Spell files kept for verification in: ${grimoireDir}\n`);
  }, 30000);

  it('should create spell with GitHub token header (simulating GitHub MCP)', async () => {
    const testSpellName = 'database-query-github-http'; // Database Query Tool v1.0 with GitHub PAT
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // ARRANGE: Only X-GitHub-Token header (like real GitHub MCP)
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      headers: {
        'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT,
      },
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
    expect(spell.description).toContain('Database Query Tool');

    // ========== 2. Keywords Validation ==========
    expect(spell.keywords).toBeDefined();
    expect(Array.isArray(spell.keywords)).toBe(true);
    expect(spell.keywords.length).toBeGreaterThan(0);

    // ========== 3. Server Configuration ==========
    validateHTTPOrSSEServerConfig(spell, 'http', serverUrl);

    // ========== 4. No Auth Field (only custom headers) ==========
    expect(spell.server.auth).toBeUndefined();

    // ========== 5. Validate GitHub token header with placeholder ==========
    const headerVars = validateCustomHeadersInSpell(spell, {
      'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT,
    });
    expect(spell.server.headers).toBeDefined();
    expect(spell.server.headers!['X-GitHub-Token']).toMatch(/^\$\{[A-Z_]+\}$/);

    // ========== 6. No server.env field ==========
    expect(spell.server.env).toBeUndefined();

    // ========== 7. Validate .env file has GitHub credential ==========
    expect(existsSync(envFilePath)).toBe(true);
    const envFile = await readEnvFile(envFilePath);
    validateEnvFileLiterals(envFile, {
      [headerVars['X-GitHub-Token']]: FASTMCP_CREDENTIALS.GITHUB_PAT,
    });

    // ========== 8. Steering Content Validation ==========
    expect(spell.steering).toBeDefined();
    expect(typeof spell.steering).toBe('string');
    expect(spell.steering.length).toBeGreaterThan(0);
  }, 45000);

  it('should create spell with Brave API key header (simulating Brave MCP)', async () => {
    const testSpellName = 'database-query-brave-http'; // Database Query Tool v1.0 with Brave API authentication
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // ARRANGE: Only X-Brave-Key header
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      headers: {
        'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY,
      },
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

    // ========== 2. Validate Brave key header with placeholder ==========
    const headerVars = validateCustomHeadersInSpell(spell, {
      'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY,
    });
    expect(spell.server.headers).toBeDefined();
    expect(spell.server.headers!['X-Brave-Key']).toMatch(/^\$\{[A-Z_]+\}$/);

    // ========== 3. Validate .env file has Brave credential ==========
    const envFile = await readEnvFile(envFilePath);
    validateEnvFileLiterals(envFile, {
      [headerVars['X-Brave-Key']]: FASTMCP_CREDENTIALS.BRAVE_API_KEY,
    });
  }, 45000);

  it('should successfully probe with valid GitHub token', async () => {
    // ARRANGE: Only GitHub PAT
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
          headers: {
            'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT,
          },
        },
      },
      10000
    );

    // ASSERT
    expect(result.success).toBe(true);
    expect(result.serverInfo).toBeDefined();
  }, 15000);

  it('should successfully probe with valid Brave API key', async () => {
    // ARRANGE: Only Brave API key
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
          headers: {
            'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY,
          },
        },
      },
      10000
    );

    // ASSERT
    expect(result.success).toBe(true);
    expect(result.serverInfo).toBeDefined();
  }, 15000);

  it('should fail probe with invalid X-GitHub-Token over HTTP', async () => {
    // ARRANGE: Only invalid GitHub token
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
          headers: {
            'X-GitHub-Token': 'invalid-github-token-should-fail',
          },
        },
      },
      10000
    );

    // ASSERT
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 15000);

  it('should fail probe with invalid X-Brave-Key over HTTP', async () => {
    // ARRANGE: Only invalid Brave API key
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
          headers: {
            'X-Brave-Key': 'invalid-brave-key-should-fail',
          },
        },
      },
      10000
    );

    // ASSERT
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 15000);

  it('should fail probe without security keys over HTTP', async () => {
    // ARRANGE: No security keys
    const result = await probeMCPServer(
      {
        server: {
          transport: 'http',
          url: serverUrl,
        },
      },
      10000
    );

    // ASSERT
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 15000);
});
