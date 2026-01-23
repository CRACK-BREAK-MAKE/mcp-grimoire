/**
 * Gateway E2E Test: API Key SSE Server
 *
 * PURPOSE:
 * Validates intent resolution with Bearer token authentication over SSE
 * Tests high-confidence auto-spawn (≥0.85) with SSE transport
 *
 * MCP SERVER:
 * - Server: servers.api_key.sse_server
 * - Port: 8020
 * - Transport: SSE
 * - Auth: Bearer (API Key)
 * - Domain: News Aggregator
 * - Tools: get_latest_news, search_news, get_trending_topics
 *
 * NO MOCKS - Real SSE server, real spell, real gateway
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

describe('Gateway E2E - API Key SSE', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;

  const serverPort = FASTMCP_PORTS.GATEWAY_API_KEY_SSE_TIER1; // 8020
  const serverUrl = `http://localhost:${serverPort}/sse`;
  const testSpellName = 'gateway-api-key-sse';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = setupTestGrimoireDir('gateway-api-key-sse');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start SSE server - it stays running for spell creation (probe) and gateway connection
    serverProcess = await startFastMCPServer('servers.api_key.sse_server', serverPort);
    // Wait for server to be fully ready before probe
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
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
    await stopServer(serverProcess, serverPort, 'api_key_sse_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should auto-spawn API Key SSE server via resolve_intent', async () => {
    const toolsBeforeSpawn = gateway.getAvailableTools();
    expect(toolsBeforeSpawn.length).toBe(2);

    const query = 'get latest news and search news for trending topics';
    const response = await gateway.handleResolveIntentCall({ query });

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);

    const toolsAfterSpawn = gateway.getAvailableTools();
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('get_latest_news');
    expect(toolNames).toContain('search_news');
    expect(toolNames).toContain('get_trending_topics');
  });
});
