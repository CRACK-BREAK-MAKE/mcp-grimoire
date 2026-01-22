/**
 * Integration Test: CLI create with API Key HTTP server (Custom Header)
 *
 * PURPOSE:
 * Tests spell creation using custom headers INSTEAD of auth field.
 * Demonstrates alternative authentication pattern for APIs that don't use standard Authorization header.
 *
 * MCP SERVER USED:
 * - Server: servers.security_keys.http_server (Port 8004)
 * - Name: "Database Query Tool v1.0"
 * - Transport: HTTP
 * - Auth: Custom headers (X-Brave-Key) - NO auth field
 * - Tools: 3 tools (run_sql_query, get_table_schema, export_query_results)
 *
 * AUTHENTICATION PATTERN:
 * - Type: Custom header (NOT in auth field)
 * - Header: X-Brave-Key: <api-key>
 * - No auth.type or auth.token fields in spell
 * - Credentials in server.headers instead
 *
 * WHY THIS TEST EXISTS:
 * Some MCP servers use custom headers for API keys (e.g., X-API-Key, X-Brave-Key)
 * instead of standard Authorization header. This test validates that pattern works.
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell with custom header (X-Brave-Key)
 * 2. ✓ Validate NO auth field in spell (custom headers only)
 * 3. ✓ Verify header stored in server.headers
 * 4. ✓ Check environment variable transformation for header value
 * 5. ✓ Validate probe works with custom header
 *
 * COMPARISON WITH BEARER TOKEN:
 * - Bearer: auth.type=bearer, auth.token=${ENV_VAR}
 * - Custom Header: server.headers={"X-Header": "${ENV_VAR}"}
 *
 * NO MOCKS - Real server on localhost:8004
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

describe('CLI create - API Key HTTP Custom Header', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.SECURITY_KEYS_HTTP;
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'test-api-key-http-header-spell';
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

    serverProcess = await startFastMCPServer('servers.security_keys.http_server', serverPort);
  }, 60000);

  afterAll(async () => {
    await stopServer(serverProcess, serverPort, 'security_keys_http_server');

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }
  }, 30000);

  it('should create spell with custom header (no auth field)', async () => {
    // ARRANGE: Use custom header instead of auth (use X-Brave-Key which the security_keys server accepts)
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
    validateBasicSpellStructure(spell, testSpellName);
    validateHTTPOrSSEServerConfig(spell, 'http', serverUrl);

    // Validate auth is undefined
    expect(spell.server.auth, 'server.auth should be undefined when using headers').toBeUndefined();

    // Validate custom headers
    const headerVars = validateCustomHeadersInSpell(spell, {
      'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY,
    });

    expect(spell.server.env).toBeUndefined();

    // Validate .env
    expect(existsSync(envFilePath)).toBe(true);
    const envFile = await readEnvFile(envFilePath);
    validateEnvFileLiterals(envFile, {
      [headerVars['X-Brave-Key']]: FASTMCP_CREDENTIALS.BRAVE_API_KEY,
    });
  }, 45000);
});
