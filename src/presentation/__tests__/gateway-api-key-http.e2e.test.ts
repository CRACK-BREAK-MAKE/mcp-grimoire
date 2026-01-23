/**
 * Gateway E2E Test: API Key HTTP Server
 *
 * PURPOSE:
 * Validates intent resolution with Bearer token authentication (API Key)
 * Tests high-confidence auto-spawn (≥0.85) with HTTP transport
 *
 * MCP SERVER:
 * - Server: servers.api_key.http_server
 * - Port: 8019
 * - Transport: HTTP
 * - Auth: Bearer (API Key)
 * - Domain: Weather Service
 * - Tools: get_current_weather, get_forecast, get_weather_alerts
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

describe('Gateway E2E - API Key HTTP', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;

  const serverPort = FASTMCP_PORTS.GATEWAY_API_KEY_HTTP_TIER1; // 8019
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'gateway-api-key-http';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = setupTestGrimoireDir('gateway-api-key-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    serverProcess = await startFastMCPServer('servers.api_key.http_server', serverPort);

    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      authType: 'bearer',
      authToken: FASTMCP_CREDENTIALS.API_KEY,
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
    await stopServer(serverProcess, serverPort, 'api_key_http_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should auto-spawn API Key HTTP server via resolve_intent', async () => {
    const toolsBeforeSpawn = gateway.getAvailableTools();
    expect(toolsBeforeSpawn.length).toBe(2);

    const query = 'get current weather forecast and weather alerts for my city';
    const response = await gateway.handleResolveIntentCall({ query });

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);

    const toolsAfterSpawn = gateway.getAvailableTools();
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('get_current_weather');
    expect(toolNames).toContain('get_forecast');
    expect(toolNames).toContain('get_weather_alerts');
  });
});
