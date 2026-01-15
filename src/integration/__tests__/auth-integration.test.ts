/**
 * Comprehensive Authentication Integration Tests
 * Tests ALL auth types (Bearer, OAuth) with ALL transports (HTTP, SSE)
 *
 * Pattern: Arrange-Act-Assert-Cleanup
 * - Arrange: Spin up real authenticated MCP servers
 * - Act: Test our code handles auth like users would in the wild
 * - Assert: Validate authentication works end-to-end
 * - Cleanup: Shut down servers and delete created files
 *
 * Covers:
 * - Phase 1: Bearer Token with HTTP transport
 * - Phase 1: Bearer Token with SSE transport
 * - Phase 2: OAuth Client Credentials with HTTP transport
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createCommand } from '../../cli/commands/create';
import { getSpellDirectory } from '../../utils/paths';
import { parse } from 'yaml';
import type { SpellConfig, HTTPServerConfig, SSEServerConfig } from '../../core/types';

describe('Authentication Integration Tests - Wild West Scenarios', () => {
  // Server processes
  let sseBearerServer: ChildProcess;
  let httpBearerServer: ChildProcess;
  let oauthTokenServer: ChildProcess;
  let httpOAuthServer: ChildProcess;

  // Server ports
  const SSE_BEARER_PORT = 3100;
  const HTTP_BEARER_PORT = 3200;
  const OAUTH_TOKEN_PORT = 3300;
  const HTTP_OAUTH_PORT = 3400;

  // Test credentials
  const BEARER_TOKEN = 'test-bearer-token-123';
  const OAUTH_CLIENT_ID = 'test-client-id';
  const OAUTH_CLIENT_SECRET = 'test-client-secret';

  // Created spells for cleanup
  const testSpells: string[] = [];

  // Helper to wait for server ready message
  const waitForServer = (
    process: ChildProcess,
    readyMessage: string,
    serverName: string
  ): Promise<number> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${serverName} failed to start within 15s`));
      }, 15000);

      const checkOutput = (data: Buffer) => {
        const output = data.toString();
        const match = output.match(new RegExp(`${readyMessage}:(\\d+)`));
        if (match) {
          clearTimeout(timeout);
          const port = parseInt(match[1], 10);
          console.log(`✅ ${serverName} started on port ${port}`);
          resolve(port);
        }
      };

      process.stdout?.on('data', checkOutput);
      process.stderr?.on('data', checkOutput);

      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  };

  // ==================== ARRANGE ====================
  beforeAll(async () => {
    console.log('\n🚀 Starting authenticated test servers...\n');

    // Start SSE server with Bearer auth
    sseBearerServer = spawn('tsx', [
      'tests/fixtures/test-servers/sse-bearer-auth-server.ts',
      String(SSE_BEARER_PORT),
    ], {
      env: { ...process.env, TEST_AUTH_TOKEN: BEARER_TOKEN },
    });
    await waitForServer(sseBearerServer, 'SSE_BEARER_SERVER_READY', 'SSE Bearer Server');

    // Start HTTP server with Bearer auth
    httpBearerServer = spawn('tsx', [
      'tests/fixtures/test-servers/http-bearer-auth-server.ts',
      String(HTTP_BEARER_PORT),
    ], {
      env: { ...process.env, TEST_AUTH_TOKEN: BEARER_TOKEN },
    });
    await waitForServer(httpBearerServer, 'HTTP_BEARER_SERVER_READY', 'HTTP Bearer Server');

    // Start OAuth token server
    oauthTokenServer = spawn('tsx', [
      'tests/fixtures/test-servers/oauth-token-server.ts',
      String(OAUTH_TOKEN_PORT),
    ]);
    await waitForServer(oauthTokenServer, 'OAUTH_TOKEN_SERVER_READY', 'OAuth Token Server');

    // Start HTTP server with OAuth
    httpOAuthServer = spawn('tsx', [
      'tests/fixtures/test-servers/http-oauth-server.ts',
      String(HTTP_OAUTH_PORT),
    ], {
      env: {
        ...process.env,
        TOKEN_INTROSPECTION_URL: `http://localhost:${OAUTH_TOKEN_PORT}/introspect`,
      },
    });
    await waitForServer(httpOAuthServer, 'HTTP_OAUTH_SERVER_READY', 'HTTP OAuth Server');

    console.log('\n✅ All test servers started successfully\n');
  }, 30000);

  // ==================== CLEANUP ====================
  afterAll(async () => {
    console.log('\n🧹 Cleaning up test servers and files...\n');

    // Kill servers
    const servers = [
      { process: sseBearerServer, name: 'SSE Bearer' },
      { process: httpBearerServer, name: 'HTTP Bearer' },
      { process: oauthTokenServer, name: 'OAuth Token' },
      { process: httpOAuthServer, name: 'HTTP OAuth' },
    ];

    for (const { process: proc, name } of servers) {
      if (proc) {
        proc.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          proc.on('exit', () => resolve());
          setTimeout(() => resolve(), 1000);
        });
        console.log(`🧹 Killed ${name} server`);
      }
    }

    // Delete test spell files
    const spellDir = getSpellDirectory();
    for (const spellName of testSpells) {
      const filePath = join(spellDir, `${spellName}.spell.yaml`);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
        console.log(`🧹 Deleted ${filePath}`);
      }
    }

    console.log('\n✅ Cleanup complete\n');
  }, 15000);

  // ==================== PHASE 1: BEARER TOKEN AUTHENTICATION ====================

  describe('Phase 1: Bearer Token Authentication', () => {
    describe('HTTP Transport', () => {
      it('should successfully authenticate and probe HTTP server with Bearer token', async () => {
        const spellName = 'test-http-bearer-success';
        testSpells.push(spellName);

        // ACT: Create spell with Bearer token (like a real user would)
        await createCommand({
          name: spellName,
          transport: 'http',
          url: `http://localhost:${HTTP_BEARER_PORT}/mcp`,
          auth: {
            type: 'bearer',
            token: BEARER_TOKEN,
          },
          interactive: false,
          probe: true, // CRITICAL: This calls lifecycle.spawn()
        });

        // ASSERT: Spell file was created
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        expect(existsSync(filePath), `Spell file should exist at ${filePath}`).toBe(true);

        // ASSERT: Spell has correct structure
        const content = readFileSync(filePath, 'utf-8');
        const spell = parse(content) as SpellConfig;
        const httpConfig = spell.server as HTTPServerConfig;

        expect(spell.name).toBe(spellName);
        expect(httpConfig.transport).toBe('http');
        expect(httpConfig.url).toBe(`http://localhost:${HTTP_BEARER_PORT}/mcp`);
        expect(httpConfig.auth?.type).toBe('bearer');
        expect(httpConfig.auth?.token).toBe(BEARER_TOKEN);

        // ASSERT: Keywords extracted from tools (proof authentication worked)
        expect(spell.keywords.length).toBeGreaterThan(5);
        expect(spell.keywords).toContain('get');
        expect(spell.keywords).toContain('protected');
        expect(spell.keywords).toContain('data');
        expect(spell.keywords).not.toContain('keyword1'); // Not placeholder

        // ASSERT: Steering generated (proof tools were retrieved)
        expect(spell.steering).toBeDefined();
        expect(spell.steering).toContain('get_protected_data');
        expect(spell.steering).toContain('check_auth_status');
        expect(spell.steering).toContain('echo');

        console.log('✅ HTTP Bearer authentication: SUCCESS');
      }, 60000);

      it('should reject HTTP server with invalid Bearer token', async () => {
        const spellName = 'test-http-bearer-fail';
        testSpells.push(spellName);

        // ACT: Try with INVALID token
        await expect(
          createCommand({
            name: spellName,
            transport: 'http',
            url: `http://localhost:${HTTP_BEARER_PORT}/mcp`,
            auth: {
              type: 'bearer',
              token: 'invalid-wrong-token',
            },
            interactive: false,
            probe: true,
          })
        ).rejects.toThrow();

        // ASSERT: Spell file NOT created
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        expect(existsSync(filePath)).toBe(false);

        console.log('✅ HTTP Bearer rejection: SUCCESS');
      }, 60000);

      it('should expand environment variables in Bearer token', async () => {
        const spellName = 'test-http-bearer-env';
        testSpells.push(spellName);

        // ACT: Set env var and use ${VAR} syntax
        process.env.TEST_HTTP_BEARER = BEARER_TOKEN;

        await createCommand({
          name: spellName,
          transport: 'http',
          url: `http://localhost:${HTTP_BEARER_PORT}/mcp`,
          auth: {
            type: 'bearer',
            token: '${TEST_HTTP_BEARER}',
          },
          interactive: false,
          probe: true,
        });

        // ASSERT: Spell created with ${VAR} preserved
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        const content = readFileSync(filePath, 'utf-8');

        expect(content).toContain('${TEST_HTTP_BEARER}');

        const spell = parse(content) as SpellConfig;
        expect(spell.keywords).toContain('get');
        expect(spell.steering).toContain('get_protected_data');

        delete process.env.TEST_HTTP_BEARER;

        console.log('✅ HTTP Bearer env expansion: SUCCESS');
      }, 60000);
    });

    describe('SSE Transport', () => {
      it('should successfully authenticate and probe SSE server with Bearer token', async () => {
        const spellName = 'test-sse-bearer-success';
        testSpells.push(spellName);

        // ACT: Create spell with SSE + Bearer token
        await createCommand({
          name: spellName,
          transport: 'sse',
          url: `http://localhost:${SSE_BEARER_PORT}/sse`,
          auth: {
            type: 'bearer',
            token: BEARER_TOKEN,
          },
          interactive: false,
          probe: true,
        });

        // ASSERT: Spell file created
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        expect(existsSync(filePath)).toBe(true);

        // ASSERT: Spell structure correct
        const content = readFileSync(filePath, 'utf-8');
        const spell = parse(content) as SpellConfig;
        const sseConfig = spell.server as SSEServerConfig;

        expect(spell.name).toBe(spellName);
        expect(sseConfig.transport).toBe('sse');
        expect(sseConfig.url).toBe(`http://localhost:${SSE_BEARER_PORT}/sse`);
        expect(sseConfig.auth?.type).toBe('bearer');
        expect(sseConfig.auth?.token).toBe(BEARER_TOKEN);

        // ASSERT: Tools retrieved (proof auth worked)
        expect(spell.keywords).toContain('get');
        expect(spell.keywords).toContain('protected');
        expect(spell.steering).toContain('get_protected_data');

        console.log('✅ SSE Bearer authentication: SUCCESS');
      }, 60000);

      it('should reject SSE server with invalid Bearer token', async () => {
        const spellName = 'test-sse-bearer-fail';
        testSpells.push(spellName);

        // ACT: Try with invalid token
        await expect(
          createCommand({
            name: spellName,
            transport: 'sse',
            url: `http://localhost:${SSE_BEARER_PORT}/sse`,
            auth: {
              type: 'bearer',
              token: 'invalid-token',
            },
            interactive: false,
            probe: true,
          })
        ).rejects.toThrow();

        // ASSERT: No spell file created
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        expect(existsSync(filePath)).toBe(false);

        console.log('✅ SSE Bearer rejection: SUCCESS');
      }, 60000);
    });
  });

  // ==================== PHASE 2: OAUTH CLIENT CREDENTIALS ====================

  describe('Phase 2: OAuth Client Credentials Authentication', () => {
    describe('HTTP Transport with OAuth', () => {
      it('should successfully authenticate with OAuth Client Credentials', async () => {
        const spellName = 'test-http-oauth-success';
        testSpells.push(spellName);

        // ACT: Create spell with OAuth credentials
        await createCommand({
          name: spellName,
          transport: 'http',
          url: `http://localhost:${HTTP_OAUTH_PORT}/mcp`,
          auth: {
            type: 'client_credentials',
            clientId: OAUTH_CLIENT_ID,
            clientSecret: OAUTH_CLIENT_SECRET,
            tokenUrl: `http://localhost:${OAUTH_TOKEN_PORT}/token`,
            scope: 'api.read',
          },
          interactive: false,
          probe: true,
        });

        // ASSERT: Spell created
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        expect(existsSync(filePath)).toBe(true);

        // ASSERT: Spell structure
        const content = readFileSync(filePath, 'utf-8');
        const spell = parse(content) as SpellConfig;
        const httpConfig = spell.server as HTTPServerConfig;

        expect(spell.name).toBe(spellName);
        expect(httpConfig.transport).toBe('http');
        expect(httpConfig.auth?.type).toBe('client_credentials');
        expect(httpConfig.auth?.clientId).toBe(OAUTH_CLIENT_ID);
        expect(httpConfig.auth?.clientSecret).toBe(OAUTH_CLIENT_SECRET);
        expect(httpConfig.auth?.tokenUrl).toBe(`http://localhost:${OAUTH_TOKEN_PORT}/token`);

        // ASSERT: Tools retrieved (proof OAuth worked)
        expect(spell.keywords).toContain('get');
        expect(spell.keywords).toContain('oauth');
        expect(spell.steering).toContain('get_oauth_protected_data');
        expect(spell.steering).toContain('check_oauth_status');

        console.log('✅ OAuth Client Credentials authentication: SUCCESS');
      }, 60000);

      it('should reject OAuth with invalid client credentials', async () => {
        const spellName = 'test-http-oauth-fail';
        testSpells.push(spellName);

        // ACT: Try with invalid credentials
        await expect(
          createCommand({
            name: spellName,
            transport: 'http',
            url: `http://localhost:${HTTP_OAUTH_PORT}/mcp`,
            auth: {
              type: 'client_credentials',
              clientId: 'invalid-client',
              clientSecret: 'invalid-secret',
              tokenUrl: `http://localhost:${OAUTH_TOKEN_PORT}/token`,
            },
            interactive: false,
            probe: true,
          })
        ).rejects.toThrow();

        // ASSERT: No spell created
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        expect(existsSync(filePath)).toBe(false);

        console.log('✅ OAuth rejection: SUCCESS');
      }, 60000);

      it('should expand environment variables in OAuth secrets', async () => {
        const spellName = 'test-http-oauth-env';
        testSpells.push(spellName);

        // ACT: Use env vars for secrets
        process.env.OAUTH_CLIENT_ID = OAUTH_CLIENT_ID;
        process.env.OAUTH_CLIENT_SECRET = OAUTH_CLIENT_SECRET;

        await createCommand({
          name: spellName,
          transport: 'http',
          url: `http://localhost:${HTTP_OAUTH_PORT}/mcp`,
          auth: {
            type: 'client_credentials',
            clientId: '${OAUTH_CLIENT_ID}',
            clientSecret: '${OAUTH_CLIENT_SECRET}',
            tokenUrl: `http://localhost:${OAUTH_TOKEN_PORT}/token`,
          },
          interactive: false,
          probe: true,
        });

        // ASSERT: Spell created with ${VAR} preserved
        const spellDir = getSpellDirectory();
        const filePath = join(spellDir, `${spellName}.spell.yaml`);
        const content = readFileSync(filePath, 'utf-8');

        expect(content).toContain('${OAUTH_CLIENT_ID}');
        expect(content).toContain('${OAUTH_CLIENT_SECRET}');

        const spell = parse(content) as SpellConfig;
        expect(spell.steering).toContain('get_oauth_protected_data');

        delete process.env.OAUTH_CLIENT_ID;
        delete process.env.OAUTH_CLIENT_SECRET;

        console.log('✅ OAuth env expansion: SUCCESS');
      }, 60000);
    });
  });
});
