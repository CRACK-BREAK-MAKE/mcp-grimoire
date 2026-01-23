/**
 * Gateway E2E Test: Low Confidence - Weak Matches (Tier 3a: 0.3-0.49)
 *
 * Scenario: Query has very weak matches with all spells
 *
 * Expected Behavior:
 * - status: "low_confidence"
 * - No auto-spawn
 * - Return weak matches for user guidance
 * - Suggest clarification to user
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GrimoireServer } from '../gateway';
import {
  setupTestGrimoireDir,
  cleanupTestGrimoireDir,
} from '../../cli/__tests__/helpers/test-path-manager';
import { createCommand, type CreateOptions } from '../../cli/commands/create';
import { join } from 'path';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
} from '../../../tests/utils/fastmcp-server-manager';
import type { ChildProcess } from 'child_process';

describe('Gateway E2E - Low Confidence (Tier 3a)', () => {
  let grimoireDir: string;
  let gateway: GrimoireServer;

  let weatherProcess: ChildProcess;
  let newsProcess: ChildProcess;
  let databaseProcess: ChildProcess;

  beforeAll(async () => {
    // Setup isolated test directory
    grimoireDir = setupTestGrimoireDir('gateway-low-confidence');
    console.log(`[TEST] Isolated test directory: ${grimoireDir}`);

    // Start three diverse servers
    console.log(`[TEST] Starting 3 diverse servers...`);
    weatherProcess = await startFastMCPServer(
      'api_key.http_server',
      FASTMCP_PORTS.GATEWAY_API_KEY_HTTP
    );
    newsProcess = await startFastMCPServer('api_key.sse_server', FASTMCP_PORTS.GATEWAY_API_KEY_SSE);
    databaseProcess = await startFastMCPServer(
      'security_keys.http_server',
      FASTMCP_PORTS.GATEWAY_SECURITY_KEYS_HTTP
    );

    // Wait for SSE server readiness
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log(`[TEST] ✓ All 3 servers started`);

    // Create three spells with very different domains
    const spells: Array<{
      name: string;
      port: number;
      transport: 'http' | 'sse';
      description: string;
      auth: any;
    }> = [
      {
        name: 'weather-service',
        port: FASTMCP_PORTS.GATEWAY_API_KEY_HTTP,
        transport: 'http',
        description: 'Weather forecasting and alerts',
        auth: { authType: 'bearer', authBearerToken: 'test-api-key-12345' },
      },
      {
        name: 'news-aggregator',
        port: FASTMCP_PORTS.GATEWAY_API_KEY_SSE,
        transport: 'sse',
        description: 'Latest news and trending topics',
        auth: { authType: 'bearer', authBearerToken: 'test-api-key-12345' },
      },
      {
        name: 'database-analyzer',
        port: FASTMCP_PORTS.GATEWAY_SECURITY_KEYS_HTTP,
        transport: 'http',
        description: 'SQL query execution and analysis',
        auth: {
          authType: 'multiple_keys',
          authHeaders: [
            { key: 'X-GitHub-Token', value: 'ghp_test1234567890abcdefghijklmnopqrstuvwxyz' },
            { key: 'X-Brave-Key', value: 'BSA1234567890abcdefghijklmnopqrstuvwxyz' },
          ],
        },
      },
    ];

    for (const spell of spells) {
      const spellPath = join(grimoireDir, `${spell.name}.spell.yaml`);
      const serverUrl = `http://localhost:${spell.port}${spell.transport === 'sse' ? '/sse' : ''}`;

      const options: CreateOptions = {
        spellName: spell.name,
        description: spell.description,
        transport: spell.transport,
        url: serverUrl,
        ...spell.auth,
        interactive: false,
        probe: true,
      };

      await createCommand(options);
      console.log(`[TEST] ✓ Created spell: ${spell.name}`);
    }

    // Start Gateway
    console.log(`[TEST] Starting Gateway...`);
    gateway = new GrimoireServer();
    await gateway.start();
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for indexing
    console.log(`[TEST] ✓ Gateway started, 3 spells indexed`);
  }, 60000);

  afterAll(async () => {
    console.log(`[TEST] Cleaning up...`);

    if (gateway) {
      await gateway.shutdown();
      console.log(`[TEST] ✓ Gateway stopped`);
    }

    await stopServer(weatherProcess, FASTMCP_PORTS.GATEWAY_API_KEY_HTTP, 'weather');
    await stopServer(newsProcess, FASTMCP_PORTS.GATEWAY_API_KEY_SSE, 'news');
    await stopServer(databaseProcess, FASTMCP_PORTS.GATEWAY_SECURITY_KEYS_HTTP, 'database');
    console.log(`[TEST] ✓ All servers stopped`);

    await cleanupTestGrimoireDir(grimoireDir);
    console.log(`[TEST] ✓ Test directory cleaned`);
  }, 30000);

  it('should return low confidence matches (no auto-spawn)', async () => {
    // ACT: Very vague query with weak match to all spells
    const query = 'help me with some stuff please';
    console.log(`\n[TEST] Calling resolve_intent with: "${query}"`);

    const response = await gateway.handleResolveIntentCall({ query });

    // ASSERT: Low confidence, no spawn
    console.log(`[TEST] Response:`, JSON.stringify(response, null, 2));

    // Should return low confidence status
    expect(response.status).toBe('low_confidence');
    expect(response.matches).toBeDefined();
    expect(response.matches!.length).toBeGreaterThan(0);

    // All matches should have low confidence (0.3-0.49)
    for (const match of response.matches!) {
      expect(match.confidence).toBeGreaterThanOrEqual(0.3);
      expect(match.confidence).toBeLessThan(0.5);
      expect(['weather-service', 'news-aggregator', 'database-analyzer']).toContain(match.name);
    }

    // No servers should be spawned
    const tools = gateway.getAvailableTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual(['resolve_intent', 'activate_spell']); // Only gateway tools

    console.log(`[TEST] ✅ Low confidence matches returned, no auto-spawn`);
  });

  it('should provide guidance message for user clarification', async () => {
    // ACT: Another vague query
    const query = 'do something useful';
    console.log(`\n[TEST] Calling resolve_intent with: "${query}"`);

    const response = await gateway.handleResolveIntentCall({ query });

    // ASSERT: Response includes guidance
    expect(response.status).toBe('low_confidence');
    expect(response.message).toBeDefined();
    expect(response.message).toContain('low confidence'); // Should explain the issue

    // Should list available spells as options
    expect(response.matches).toBeDefined();
    expect(response.matches!.length).toBeGreaterThan(0);

    console.log(`[TEST] Response message: ${response.message}`);
    console.log(`[TEST] ✅ Guidance message provided for user clarification`);
  });
});
