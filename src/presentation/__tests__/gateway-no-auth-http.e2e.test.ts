/**
 * Gateway E2E Test: No Auth HTTP Server
 *
 * PURPOSE:
 * Validates intent resolution without authentication
 * Tests high-confidence auto-spawn (≥0.85) with HTTP transport
 *
 * MCP SERVER:
 * - Server: servers.no_auth.http_server
 * - Port: 8023
 * - Transport: HTTP
 * - Auth: None
 * - Domain: System Monitor
 * - Tools: get_cpu_usage, get_memory_stats, get_disk_usage
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
} from '../../cli/__tests__/helpers/test-server-manager';
import { createCommand, type CreateOptions } from '../../cli/commands/create';

describe('Gateway E2E - No Auth HTTP', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;

  const serverPort = FASTMCP_PORTS.GATEWAY_NO_AUTH_HTTP_TIER1; // 8023
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'gateway-no-auth-http';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = setupTestGrimoireDir('gateway-no-auth-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    serverProcess = await startFastMCPServer('servers.no_auth.http_server', serverPort);

    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
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
    await stopServer(serverProcess, serverPort, 'no_auth_http_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should auto-spawn No Auth HTTP server via resolve_intent', async () => {
    const toolsBeforeSpawn = gateway.getAvailableTools();
    expect(toolsBeforeSpawn.length).toBe(2);

    const query = 'calculate expression convert units and generate random numbers';
    const response = await gateway.handleResolveIntentCall({ query });

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);

    const toolsAfterSpawn = gateway.getAvailableTools();
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('calculate');
    expect(toolNames).toContain('convert_units');
    expect(toolNames).toContain('generate_random');
  });
});
