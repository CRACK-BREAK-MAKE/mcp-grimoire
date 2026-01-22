/**
 * Gateway Integration Test: Basic HTTP Server - Simple Test
 *
 * PURPOSE:
 * Minimal E2E test to validate the gateway integration flow:
 * 1. Start FastMCP HTTP server (Basic Auth)
 * 2. Create spell file using CLI
 * 3. Start Gateway (Grimoire MCP server)
 * 4. Call resolve_intent to trigger auto-spawn
 * 5. Validate server was spawned and tools are available
 *
 * This is a simplified test to understand the flow before writing complex tests.
 *
 * MCP SERVER USED:
 * - Server: servers.basic_auth.http_server
 * - Port: 8017 (GATEWAY_TEST_SIMPLE)
 * - Transport: HTTP
 * - Auth: Basic (username/password)
 *
 * NO MOCKS - Real server, real spell, real gateway
 */

/* eslint-disable no-console */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { getSpellDirectory } from '../../utils/paths';
import { GrimoireServer } from '../gateway';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from '../../cli/__tests__/helpers/test-server-manager';
import { createCommand, type CreateOptions } from '../../cli/commands/create';

describe('Gateway E2E - Basic HTTP Simple Test', () => {
  let serverProcess: ChildProcess;
  const serverPort = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP_TIER1; // 8017
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'gateway-simple-test-basic-http';
  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    // Get grimoire directory
    grimoireDir = getSpellDirectory();
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    // Ensure grimoire directory exists
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Clean up any previous test spell
    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    // Start Basic Auth HTTP server on port 8017
    console.log(`[TEST] Starting Basic Auth HTTP server on port ${serverPort}...`);
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', serverPort);
    console.log(`[TEST] Server started successfully on port ${serverPort}`);
  }, 60000);

  afterAll(async () => {
    // Stop server
    console.log(`[TEST] Stopping server on port ${serverPort}...`);
    await stopServer(serverProcess, serverPort, 'basic_auth_http_server');

    // Clean up spell file
    if (existsSync(spellFilePath)) {
      console.log(`[TEST] Cleaning up spell file: ${spellFilePath}`);
      await rm(spellFilePath);
    }
  }, 30000);

  it('should auto-spawn Basic Auth HTTP server via resolve_intent', async () => {
    // STEP 1: Create spell file using CLI (like existing CLI tests)
    console.log(`\n[TEST] STEP 1: Creating spell file for ${testSpellName}...`);
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
    expect(existsSync(spellFilePath), 'Spell file should be created').toBe(true);
    console.log(`[TEST] ✓ Spell file created: ${spellFilePath}`);

    // Wait for spell file watcher to index the spell
    console.log(`[TEST] Waiting for spell indexing...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // STEP 2: Start Gateway (Grimoire MCP server)
    console.log(`\n[TEST] STEP 2: Starting Grimoire Gateway...`);
    const gateway = new GrimoireServer();
    await gateway.start();
    console.log(`[TEST] ✓ Gateway started`);

    // STEP 3: Get gateway tools before spawning
    const toolsBeforeSpawn = gateway.getAvailableTools();
    console.log(`\n[TEST] STEP 3: Gateway tools before spawning:`);
    console.log(`  - Total tools: ${toolsBeforeSpawn.length}`);
    console.log(
      `  - Tool names: ${toolsBeforeSpawn.map((t: { name: string }) => t.name).join(', ')}`
    );
    expect(toolsBeforeSpawn.length).toBe(2); // Only resolve_intent and activate_spell
    expect(toolsBeforeSpawn.some((t: { name: string }) => t.name === 'resolve_intent')).toBe(true);
    expect(toolsBeforeSpawn.some((t: { name: string }) => t.name === 'activate_spell')).toBe(true);

    // STEP 4: Call resolve_intent with a query that matches our spell keywords
    console.log(`\n[TEST] STEP 4: Calling resolve_intent...`);
    // Use a descriptive query that matches our spell's tool keywords (create_project, add_task, get_project_status)
    const query = 'create project and add task using project management';
    console.log(`  - Query: "${query}"`);

    const response = await gateway.handleResolveIntentCall({ query });

    console.log(`\n[TEST] STEP 5: Analyzing resolve_intent response...`);
    console.log(`  - Response status: ${response.status}`);
    console.log(`  - Response:`, JSON.stringify(response, null, 2));

    // ASSERT: Response should be "activated" (Tier 1: high confidence auto-spawn)
    expect(response.status).toBe('activated');

    if (response.status === 'activated') {
      console.log(`  - Spell name: ${response.spell.name}`);
      console.log(`  - Confidence: ${response.spell.confidence}`);
      console.log(`  - Tools count: ${response.tools.length}`);

      expect(response.spell.name).toBe(testSpellName);
      expect(response.spell.confidence).toBeGreaterThanOrEqual(0.85); // Tier 1 threshold
      expect(response.tools.length).toBeGreaterThan(0); // Should have child server tools
    }

    // STEP 6: Verify gateway tools now include child server tools
    console.log(`\n[TEST] STEP 6: Verifying gateway tools after spawning...`);
    const toolsAfterSpawn = gateway.getAvailableTools();
    console.log(`  - Total tools: ${toolsAfterSpawn.length}`);
    console.log(
      `  - Tool names: ${toolsAfterSpawn.map((t: { name: string }) => t.name).join(', ')}`
    );

    // Should have: resolve_intent, activate_spell, + child server tools (create_task, list_tasks, update_task_status)
    expect(toolsAfterSpawn.length).toBeGreaterThan(2);

    const gatewayTools = toolsAfterSpawn.filter((t: { name: string }) =>
      ['resolve_intent', 'activate_spell'].includes(t.name)
    );
    expect(gatewayTools.length).toBe(2);

    const childTools = toolsAfterSpawn.filter(
      (t: { name: string }) => !['resolve_intent', 'activate_spell'].includes(t.name)
    );
    expect(childTools.length).toBeGreaterThan(0);
    console.log(
      `  - Gateway tools: ${gatewayTools.map((t: { name: string }) => t.name).join(', ')}`
    );
    console.log(
      `  - Child server tools: ${childTools.map((t: { name: string }) => t.name).join(', ')}`
    );

    // CLEANUP: Shutdown gateway
    console.log(`\n[TEST] CLEANUP: Shutting down gateway...`);
    await gateway.shutdown();
    console.log(`[TEST] ✓ Gateway shut down successfully\n`);
  }, 90000); // 90s timeout
});
