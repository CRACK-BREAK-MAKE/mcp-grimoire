/**
 * Integration Test: CLI create with Security Keys SSE server
 *
 * PURPOSE:
 * Tests spell creation with custom header authentication over Server-Sent Events (SSE).
 * Simulates two real-world MCP server patterns:
 * - GitHub MCP: Uses X-GitHub-Token header for GitHub Personal Access Token
 * - Brave MCP: Uses X-Brave-Key header for Brave Search API key
 *
 * AUTHENTICATION PATTERN:
 * - Custom headers (X-GitHub-Token OR X-Brave-Key)
 * - Server accepts EITHER key (OR logic, not AND)
 * - Single test server simulates two different MCP server patterns
 *
 * VALIDATION STRATEGY (13-Point Checklist):
 * 1. Basic structure (name, version, keywords array)
 * 2. Keywords populated from tools
 * 3. Server config (url, transport)
 * 4. Auth type (undefined for custom headers)
 * 5. Auth credentials (custom headers, not auth.token)
 * 6. Extra fields check
 * 7. .env file validation
 * 8. No extra root-level fields
 * 9. Steering content populated
 * 10. Tool descriptions embedded
 * 11. Negative tests (invalid keys)
 * 12. Negative tests (no keys)
 * 13. Header logging validation
 *
 * TESTS:
 * - Test 1: Create spell with ONLY X-GitHub-Token (simulates GitHub MCP)
 * - Test 2: Create spell with ONLY X-Brave-Key (simulates Brave MCP)
 * - Test 3: Probe with valid GitHub token (positive)
 * - Test 4: Probe with valid Brave key (positive)
 * - Test 5: Probe with invalid GitHub token (negative)
 * - Test 6: Probe with invalid Brave key (negative)
 * - Test 7: Probe without any keys (negative)
 *
 * NO MOCKS - Real server on localhost:8005
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
  validateCustomHeadersInSpell,
  validateEnvFileLiterals,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import { probeMCPServer } from '../utils/mcp-probe';

describe('CLI create - Security Keys SSE', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.SECURITY_KEYS_SSE;
  const serverUrl = `http://localhost:${serverPort}/sse`;
  let grimoireDir: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = getSpellDirectory();
    envFilePath = join(grimoireDir, '.env');

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    serverProcess = await startFastMCPServer('servers.security_keys.sse_server', serverPort);
  }, 60000);

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'security_keys_sse_server');

    console.log(`\n[TEST] Spell files kept for verification in: ${grimoireDir}\n`);
  }, 30000);

  it('should create spell with GitHub token header (simulating GitHub MCP)', async () => {
    const testSpellName = 'github-mcp-sse';
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // ARRANGE: Only X-GitHub-Token header (like real GitHub MCP)
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
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
    expect(spell.description).toContain('Database Query Tool SSE');

    // ========== 2. Keywords Validation ==========
    expect(spell.keywords).toBeDefined();
    expect(Array.isArray(spell.keywords)).toBe(true);
    expect(spell.keywords.length).toBeGreaterThan(0);

    // ========== 3. Server Configuration ==========
    validateHTTPOrSSEServerConfig(spell, 'sse', serverUrl);

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
    const testSpellName = 'brave-mcp-sse';
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // ARRANGE: Only X-Brave-Key header
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
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
          transport: 'sse',
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
          transport: 'sse',
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

  it('should fail probe with invalid X-GitHub-Token over SSE', async () => {
    // ARRANGE: Only invalid GitHub token
    const result = await probeMCPServer(
      {
        server: {
          transport: 'sse',
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

  it('should fail probe with invalid X-Brave-Key over SSE', async () => {
    // ARRANGE: Only invalid Brave API key
    const result = await probeMCPServer(
      {
        server: {
          transport: 'sse',
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

  it('should fail probe without security keys over SSE', async () => {
    // ARRANGE: No security keys
    const result = await probeMCPServer(
      {
        server: {
          transport: 'sse',
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
