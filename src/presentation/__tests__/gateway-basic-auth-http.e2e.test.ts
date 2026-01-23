/**
 * Gateway E2E Test: Basic Auth HTTP Server
 *
 * PURPOSE:
 * Validates complete flow from resolve_intent → server spawning → tool availability
 * Tests high-confidence intent resolution (≥0.85) with Basic Auth HTTP server
 *
 * FLOW:
 * 1. Setup isolated test directory (.test-grimoire/gateway-basic-auth-http/)
 * 2. Start FastMCP server (Basic Auth HTTP)
 * 3. Create spell file using CLI (in isolated directory)
 * 4. Start Gateway (indexes spell from test directory)
 * 5. Call resolve_intent with matching query
 * 6. Validate auto-spawn behavior (high confidence)
 * 7. Verify tools available
 * 8. Cleanup: Stop gateway, stop server, remove test directory
 *
 * MCP SERVER:
 * - Server: servers.basic_auth.http_server
 * - Port: 8017
 * - Transport: HTTP
 * - Auth: Basic (testuser/testpass123)
 * - Tools: create_project, add_task, get_project_status
 *
 * TEST ISOLATION:
 * - Uses GRIMOIRE_HOME override to point to .test-grimoire/gateway-basic-auth-http/
 * - Prevents pollution of ~/.grimoire
 * - Automatic cleanup in afterAll
 * - Parallel-safe (unique directory per test)
 *
 * NO MOCKS - Real server, real spell, real gateway
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

describe('Gateway E2E - Basic Auth HTTP', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;

  const serverPort = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP_TIER1; // 8017
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'gateway-basic-auth-http';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    // ARRANGE: Setup isolated test directory
    grimoireDir = setupTestGrimoireDir('gateway-basic-auth-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    // Ensure test directory exists
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start FastMCP server
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', serverPort);

    // Create spell file using CLI (will use GRIMOIRE_HOME from setupTestGrimoireDir)
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD,
      interactive: false,
      probe: true,
    };

    await createCommand(options);
    expect(existsSync(spellFilePath), 'Spell file should be created in test directory').toBe(true);

    // Start Gateway and wait for spell indexing
    gateway = new GrimoireServer();
    await gateway.start();

    // Wait for spell watcher to index the file from test directory
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 60000);

  afterAll(async () => {
    // CLEANUP: Stop gateway, stop server, remove test directory
    if (gateway) {
      await gateway.shutdown();
    }

    await stopServer(serverProcess, serverPort, 'basic_auth_http_server');

    // Cleanup test directory (removes spell file and directory)
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should auto-spawn server via resolve_intent with high confidence', async () => {
    // ACT: Get tools before spawning
    const toolsBeforeSpawn = gateway.getAvailableTools();

    expect(toolsBeforeSpawn.length).toBe(2); // resolve_intent, activate_spell
    expect(toolsBeforeSpawn.some((t) => t.name === 'resolve_intent')).toBe(true);
    expect(toolsBeforeSpawn.some((t) => t.name === 'activate_spell')).toBe(true);

    // ACT: Call resolve_intent with matching query
    const query = 'create project and add task using project management';

    const response = await gateway.handleResolveIntentCall({ query });

    // ASSERT: High confidence auto-spawn (≥0.85)
    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85); // High confidence threshold
    expect(response.tools).toBeDefined();
    expect(response.tools!.length).toBeGreaterThan(0);

    // ASSERT: Verify tools now available from spawned server
    const toolsAfterSpawn = gateway.getAvailableTools();

    // Should have: resolve_intent, activate_spell + child server tools
    expect(toolsAfterSpawn.length).toBeGreaterThan(toolsBeforeSpawn.length);

    // Verify specific tools from Basic Auth server
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('add_task');
    expect(toolNames).toContain('get_project_status');
  });
});
