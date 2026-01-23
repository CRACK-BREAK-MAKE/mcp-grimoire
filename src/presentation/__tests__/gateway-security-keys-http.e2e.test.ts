/**
 * Gateway E2E Test: Security Keys HTTP Server
 *
 * PURPOSE:
 * Validates intent resolution with custom header authentication
 * Tests high-confidence auto-spawn (≥0.85) with HTTP transport
 *
 * MCP SERVER:
 * - Server: servers.security_keys.http_server
 * - Port: 8021
 * - Transport: HTTP
 * - Auth: Custom Headers
 * - Domain: Data Analytics
 * - Tools: analyze_dataset, get_table_schema, export_query_results
 *
 * NO MOCKS - Real HTTP server, real spell, real gateway
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  setupTestGrimoireDir,
  cleanupTestGrimoireDir,
} from '../../cli/__tests__/helpers/test-path-manager';
import { GrimoireServer } from '../gateway';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from '../../cli/__tests__/helpers/test-server-manager';
import { createCommand, type CreateOptions } from '../../cli/commands/create';

describe('Gateway E2E - Security Keys HTTP', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;

  const serverPort = FASTMCP_PORTS.GATEWAY_SEC_KEYS_HTTP_TIER1; // 8021
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'gateway-security-keys-http';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = setupTestGrimoireDir('gateway-security-keys-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    serverProcess = await startFastMCPServer('servers.security_keys.http_server', serverPort);

    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      headers: {
        'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT,
        'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY,
      },
      interactive: false,
      probe: true,
    };

    await createCommand(options);
    expect(existsSync(spellFilePath)).toBe(true);

    gateway = new GrimoireServer();
    await gateway.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 60000);

  afterAll(async () => {
    if (gateway) await gateway.shutdown();
    await stopServer(serverProcess, serverPort, 'security_keys_http_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should auto-spawn Security Keys HTTP server via resolve_intent', async () => {
    const toolsBeforeSpawn = gateway.getAvailableTools();
    expect(toolsBeforeSpawn.length).toBe(2);

    const query = 'run sql query get table schema and export query results';
    const response = await gateway.handleResolveIntentCall({ query });

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);

    const toolsAfterSpawn = gateway.getAvailableTools();
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('run_sql_query');
    expect(toolNames).toContain('get_table_schema');
    expect(toolNames).toContain('export_query_results');
  });
});
