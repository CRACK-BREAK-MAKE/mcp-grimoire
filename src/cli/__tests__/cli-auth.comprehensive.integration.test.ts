/**
 * Comprehensive CLI Authentication Integration Test
 * Tests CLI creation of spells with ALL authentication types
 *
 * Validates:
 * - CLI can create spells with Bearer token auth (HTTP/SSE)
 * - CLI can create spells with OAuth Client Credentials (HTTP)
 * - CLI can create spells with env vars (stdio)
 * - Generated spell files contain correct auth config
 * - Environment variable references (${VAR}) preserved in YAML
 * - Spell files have all connection details needed
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { parse } from 'yaml';
import type {
  SpellConfig,
  StdioServerConfig,
  SSEServerConfig,
  HTTPServerConfig,
} from '../../core/types';

describe('CLI Authentication Comprehensive Integration Test', () => {
  const cliBin = join(process.cwd(), 'dist/cli.js');
  const grimoireDir = join(homedir(), '.grimoire');
  const createdSpells: string[] = [];

  let sseBearerServer: ChildProcess | null = null;
  let sseBearerPort: number | null = null;
  let httpBearerServer: ChildProcess | null = null;
  let httpBearerPort: number | null = null;
  let oauthTokenServer: ChildProcess | null = null;
  let oauthTokenPort: number | null = null;
  let httpOAuthServer: ChildProcess | null = null;
  let httpOAuthPort: number | null = null;

  const BEARER_TOKEN = 'test-bearer-token-123';
  const OAUTH_CLIENT_ID = 'test-client-id';
  const OAUTH_CLIENT_SECRET = 'test-client-secret';

  // Arrange: Spin up authenticated test servers
  beforeAll(async () => {
    // Build the CLI
    execSync('pnpm build', { stdio: 'pipe' });

    console.log('🚀 Starting authenticated test servers...');

    // Start SSE Bearer server
    await new Promise<void>((resolve, reject) => {
      sseBearerServer = spawn(
        'tsx',
        ['tests/fixtures/test-servers/sse-bearer-auth-server.ts', '0'],
        { env: { ...process.env, TEST_AUTH_TOKEN: BEARER_TOKEN } }
      );

      const timeout = setTimeout(() => {
        reject(new Error('SSE Bearer server failed to start'));
      }, 15000);

      const checkOutput = (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/SSE_BEARER_SERVER_READY:(\d+)/);
        if (match) {
          sseBearerPort = parseInt(match[1], 10);
          clearTimeout(timeout);
          console.log(`✅ SSE Bearer server started on port ${sseBearerPort}`);
          resolve();
        }
      };

      sseBearerServer.stdout?.on('data', checkOutput);
      sseBearerServer.stderr?.on('data', checkOutput);
      sseBearerServer.on('error', reject);
    });

    // Start HTTP Bearer server
    await new Promise<void>((resolve, reject) => {
      httpBearerServer = spawn(
        'tsx',
        ['tests/fixtures/test-servers/http-bearer-auth-server.ts', '0'],
        { env: { ...process.env, TEST_AUTH_TOKEN: BEARER_TOKEN } }
      );

      const timeout = setTimeout(() => {
        reject(new Error('HTTP Bearer server failed to start'));
      }, 15000);

      const checkOutput = (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/HTTP_BEARER_SERVER_READY:(\d+)/);
        if (match) {
          httpBearerPort = parseInt(match[1], 10);
          clearTimeout(timeout);
          console.log(`✅ HTTP Bearer server started on port ${httpBearerPort}`);
          resolve();
        }
      };

      httpBearerServer.stdout?.on('data', checkOutput);
      httpBearerServer.stderr?.on('data', checkOutput);
      httpBearerServer.on('error', reject);
    });

    // Start OAuth token server
    await new Promise<void>((resolve, reject) => {
      oauthTokenServer = spawn('tsx', ['tests/fixtures/test-servers/oauth-token-server.ts', '0']);

      const timeout = setTimeout(() => {
        reject(new Error('OAuth token server failed to start'));
      }, 15000);

      const checkOutput = (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/OAUTH_TOKEN_SERVER_READY:(\d+)/);
        if (match) {
          oauthTokenPort = parseInt(match[1], 10);
          clearTimeout(timeout);
          console.log(`✅ OAuth token server started on port ${oauthTokenPort}`);
          resolve();
        }
      };

      oauthTokenServer.stdout?.on('data', checkOutput);
      oauthTokenServer.stderr?.on('data', checkOutput);
      oauthTokenServer.on('error', reject);
    });

    // Start HTTP OAuth server
    await new Promise<void>((resolve, reject) => {
      httpOAuthServer = spawn('tsx', ['tests/fixtures/test-servers/http-oauth-server.ts', '0'], {
        env: {
          ...process.env,
          TOKEN_INTROSPECTION_URL: `http://localhost:${oauthTokenPort}/introspect`,
        },
      });

      const timeout = setTimeout(() => {
        reject(new Error('HTTP OAuth server failed to start'));
      }, 15000);

      const checkOutput = (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/HTTP_OAUTH_SERVER_READY:(\d+)/);
        if (match) {
          httpOAuthPort = parseInt(match[1], 10);
          clearTimeout(timeout);
          console.log(`✅ HTTP OAuth server started on port ${httpOAuthPort}`);
          resolve();
        }
      };

      httpOAuthServer.stdout?.on('data', checkOutput);
      httpOAuthServer.stderr?.on('data', checkOutput);
      httpOAuthServer.on('error', reject);
    });

    console.log('✅ All authenticated test servers started');
  }, 45000);

  // Cleanup
  afterAll(() => {
    console.log('🧹 Cleaning up...');

    const servers = [
      { process: sseBearerServer, name: 'SSE Bearer' },
      { process: httpBearerServer, name: 'HTTP Bearer' },
      { process: oauthTokenServer, name: 'OAuth Token' },
      { process: httpOAuthServer, name: 'HTTP OAuth' },
    ];

    for (const { process: proc, name } of servers) {
      if (proc) {
        proc.kill('SIGKILL');
        console.log(`🧹 Killed ${name} server`);
      }
    }

    for (const spellName of createdSpells) {
      const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
      try {
        if (existsSync(spellPath)) {
          unlinkSync(spellPath);
          console.log(`🧹 Deleted ${spellPath}`);
        }
      } catch {
        // Ignore
      }
    }
  });

  describe('stdio with environment variables', () => {
    it('should create stdio spell with env vars for credentials', async () => {
      const spellName = 'test-cli-stdio-env';
      createdSpells.push(spellName);

      // Set test env var
      process.env.TEST_DB_PASSWORD = 'secret123';

      // Act: Create spell via CLI with env vars
      const cmd =
        'node "' +
        cliBin +
        '" create -n ' +
        spellName +
        ' -t stdio --command "tsx" --args "tests/fixtures/test-servers/stdio-auth-test-server.ts" --env TEST_API_KEY=test-secret-key-123 --env "DB_PASSWORD=\\${TEST_DB_PASSWORD}" --no-interactive --probe';

      const output = execSync(cmd, { encoding: 'utf-8' });

      // Assert: Spell file exists
      const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
      expect(existsSync(spellPath)).toBe(true);

      // Assert: Spell contains env vars
      const content = readFileSync(spellPath, 'utf-8');
      const spell = parse(content) as SpellConfig;

      expect(spell.name).toBe(spellName);
      expect(spell.server.transport).toBe('stdio');

      const stdioConfig = spell.server as StdioServerConfig;
      expect(stdioConfig.env).toBeDefined();
      expect(stdioConfig.env!['TEST_API_KEY']).toBe('test-secret-key-123');
      expect(stdioConfig.env!['DB_PASSWORD']).toBe('${TEST_DB_PASSWORD}'); // Preserved

      // Assert: File content preserves ${VAR} syntax
      expect(content).toContain('${TEST_DB_PASSWORD}');

      // Assert: Probing succeeded (proof env vars worked)
      expect(spell.keywords).toContain('get');
      expect(spell.steering).toContain('get_protected_data');

      delete process.env.TEST_DB_PASSWORD;
    }, 60000);
  });

  describe('SSE with Bearer token', () => {
    it('should create SSE spell with Bearer token auth', async () => {
      if (!sseBearerPort) throw new Error('SSE Bearer server not started');

      const spellName = 'test-cli-sse-bearer';
      createdSpells.push(spellName);

      // Set env var for token
      process.env.SSE_AUTH_TOKEN = BEARER_TOKEN;

      // Act: Create via CLI (non-interactive, passing auth via env)
      const cmd =
        'node "' +
        cliBin +
        '" create -n ' +
        spellName +
        ' -t sse --url "http://localhost:' +
        sseBearerPort +
        '/sse" --auth-type bearer --auth-token "\\${SSE_AUTH_TOKEN}" --no-interactive --probe';

      const output = execSync(cmd, { encoding: 'utf-8' });

      // Assert: Spell file created
      const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
      expect(existsSync(spellPath)).toBe(true);

      // Assert: Spell has auth config
      const content = readFileSync(spellPath, 'utf-8');
      const spell = parse(content) as SpellConfig;

      expect(spell.name).toBe(spellName);
      expect(spell.server.transport).toBe('sse');

      const sseConfig = spell.server as SSEServerConfig;
      expect(sseConfig.url).toBe(`http://localhost:${sseBearerPort}/sse`);
      expect(sseConfig.auth).toBeDefined();
      expect(sseConfig.auth!.type).toBe('bearer');
      expect(sseConfig.auth!.token).toBe('${SSE_AUTH_TOKEN}'); // Preserved

      // Assert: File preserves ${VAR}
      expect(content).toContain('${SSE_AUTH_TOKEN}');
      expect(content).toContain('type: bearer');

      // Assert: Probing succeeded (proof auth worked)
      expect(spell.keywords).toContain('get');
      expect(spell.steering).toContain('get_protected_data');

      delete process.env.SSE_AUTH_TOKEN;
    }, 60000);
  });

  describe('HTTP with Bearer token', () => {
    it('should create HTTP spell with Bearer token auth', async () => {
      if (!httpBearerPort) throw new Error('HTTP Bearer server not started');

      const spellName = 'test-cli-http-bearer';
      createdSpells.push(spellName);

      // Set env var for token
      process.env.HTTP_AUTH_TOKEN = BEARER_TOKEN;

      // Act: Create via CLI
      const cmd =
        'node "' +
        cliBin +
        '" create -n ' +
        spellName +
        ' -t http --url "http://localhost:' +
        httpBearerPort +
        '/mcp" --auth-type bearer --auth-token "\\${HTTP_AUTH_TOKEN}" --no-interactive --probe';

      const output = execSync(cmd, { encoding: 'utf-8' });

      // Assert: Spell file created
      const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
      expect(existsSync(spellPath)).toBe(true);

      // Assert: Spell has auth config
      const content = readFileSync(spellPath, 'utf-8');
      const spell = parse(content) as SpellConfig;

      expect(spell.name).toBe(spellName);
      expect(spell.server.transport).toBe('http');

      const httpConfig = spell.server as HTTPServerConfig;
      expect(httpConfig.url).toBe(`http://localhost:${httpBearerPort}/mcp`);
      expect(httpConfig.auth).toBeDefined();
      expect(httpConfig.auth!.type).toBe('bearer');
      expect(httpConfig.auth!.token).toBe('${HTTP_AUTH_TOKEN}'); // Preserved

      // Assert: File preserves ${VAR}
      expect(content).toContain('${HTTP_AUTH_TOKEN}');

      // Assert: Probing succeeded
      expect(spell.keywords).toContain('get');
      expect(spell.steering).toContain('get_protected_data');

      delete process.env.HTTP_AUTH_TOKEN;
    }, 60000);
  });

  describe('HTTP with OAuth Client Credentials', () => {
    it('should create HTTP spell with OAuth auth', async () => {
      if (!httpOAuthPort || !oauthTokenPort) {
        throw new Error('OAuth servers not started');
      }

      const spellName = 'test-cli-http-oauth';
      createdSpells.push(spellName);

      // Set env vars for OAuth credentials
      process.env.OAUTH_CLIENT_ID = OAUTH_CLIENT_ID;
      process.env.OAUTH_CLIENT_SECRET = OAUTH_CLIENT_SECRET;

      // Act: Create via CLI with OAuth
      const cmd =
        'node "' +
        cliBin +
        '" create -n ' +
        spellName +
        ' -t http --url "http://localhost:' +
        httpOAuthPort +
        '/mcp" --auth-type client_credentials --auth-client-id "\\${OAUTH_CLIENT_ID}" --auth-client-secret "\\${OAUTH_CLIENT_SECRET}" --auth-token-url "http://localhost:' +
        oauthTokenPort +
        '/token" --auth-scope "api.read" --no-interactive --probe';

      const output = execSync(cmd, { encoding: 'utf-8' });

      // Assert: Spell file created
      const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
      expect(existsSync(spellPath)).toBe(true);

      // Assert: Spell has OAuth config
      const content = readFileSync(spellPath, 'utf-8');
      const spell = parse(content) as SpellConfig;

      expect(spell.name).toBe(spellName);
      expect(spell.server.transport).toBe('http');

      const httpConfig = spell.server as HTTPServerConfig;
      expect(httpConfig.auth).toBeDefined();
      expect(httpConfig.auth!.type).toBe('client_credentials');
      expect(httpConfig.auth!.clientId).toBe('${OAUTH_CLIENT_ID}'); // Preserved
      expect(httpConfig.auth!.clientSecret).toBe('${OAUTH_CLIENT_SECRET}'); // Preserved
      expect(httpConfig.auth!.tokenUrl).toBe(`http://localhost:${oauthTokenPort}/token`);
      expect(httpConfig.auth!.scope).toBe('api.read');

      // Assert: File preserves ${VAR} for secrets
      expect(content).toContain('${OAUTH_CLIENT_ID}');
      expect(content).toContain('${OAUTH_CLIENT_SECRET}');
      expect(content).toContain('type: client_credentials');

      // Assert: Probing succeeded (proof OAuth worked)
      expect(spell.keywords).toContain('get');
      expect(spell.steering).toContain('get_oauth_protected_data');

      delete process.env.OAUTH_CLIENT_ID;
      delete process.env.OAUTH_CLIENT_SECRET;
    }, 60000);
  });

  describe('Spell file completeness', () => {
    it('should create spell files with ALL necessary connection details', () => {
      // Verify every created spell has complete config
      for (const spellName of createdSpells) {
        const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
        const content = readFileSync(spellPath, 'utf-8');
        const spell = parse(content) as SpellConfig;

        // 1. Basic metadata
        expect(spell.name).toBeDefined();
        expect(spell.version).toBeDefined();
        expect(spell.description).toBeDefined();

        // 2. Keywords (from probing)
        expect(spell.keywords).toBeDefined();
        expect(spell.keywords.length).toBeGreaterThan(0);

        // 3. Server config complete
        expect(spell.server).toBeDefined();
        expect(spell.server.transport).toBeDefined();

        // 4. Transport-specific config
        if (spell.server.transport === 'stdio') {
          const stdioConfig = spell.server as StdioServerConfig;
          expect(stdioConfig.command).toBeDefined();
          expect(stdioConfig.args).toBeDefined();
        } else if (spell.server.transport === 'sse') {
          const sseConfig = spell.server as SSEServerConfig;
          expect(sseConfig.url).toBeDefined();
        } else if (spell.server.transport === 'http') {
          const httpConfig = spell.server as HTTPServerConfig;
          expect(httpConfig.url).toBeDefined();
        }

        // 5. Steering (from probing)
        expect(spell.steering).toBeDefined();
        expect(spell.steering!.length).toBeGreaterThan(100); // Substantial content

        console.log(`✅ Spell ${spellName} has complete connection details`);
      }
    });
  });

  describe('CLI usability validation', () => {
    it('should validate all created spells successfully', () => {
      for (const spellName of createdSpells) {
        const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);
        const cmd = `node "${cliBin}" validate "${spellPath}"`;
        const output = execSync(cmd, { encoding: 'utf-8' });

        expect(output).toContain('Validation Passed');
        expect(output).not.toContain('Validation Failed');
      }
    });

    it('should list all created spells with auth info', () => {
      const cmd = `node "${cliBin}" list`;
      const output = execSync(cmd, { encoding: 'utf-8' });

      // Should list all created spells
      for (const spellName of createdSpells) {
        expect(output).toContain(spellName);
      }

      // Should show transport types
      expect(output).toMatch(/stdio|sse|http/);
    });
  });
});
