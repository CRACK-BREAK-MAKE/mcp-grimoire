/**
 * Gateway E2E Test: Turn-Based Cleanup (5-turn inactivity threshold)
 *
 * PURPOSE:
 * Validates ADR-0006 turn-based lifecycle - servers are killed after 5 turns of inactivity
 * Tests that active servers stay alive while inactive ones are cleaned up
 *
 * STRATEGY:
 * Spawn 2 servers, use only one repeatedly, verify the other is killed after 5 turns
 * Tool count tracking: 2 grimoire → 5 (server1) → 8 (server1+server2) → 5 (server2 only)
 *
 * FLOW:
 * 1. Setup isolated test directory
 * 2. Start 2 FastMCP servers (Math HTTP, Weather HTTP)
 * 3. Create 2 spells
 * 4. Start Gateway, wait for indexing
 * 5. Turn 1: Query spell1 → spawns server1 (2 grimoire + 3 spell1 = 5 tools)
 * 6. Turn 2: Query spell2 → spawns server2 (2 grimoire + 3 spell1 + 3 spell2 = 8 tools)
 * 7. Turns 3-7: Query spell2 five more times (server1 idle, server2 active)
 * 8. After turn 7: server1 idle for 6 turns (7-1=6 ≥ 5) → KILLED
 * 9. Verify tools: 2 grimoire + 3 spell2 = 5 tools (server1 tools removed)
 * 10. Cleanup
 *
 * SPELLS:
 * - math-tools: keywords [calculate, math, convert] → no-auth-http (port 8023)
 *   Tools: calculate, convert_units, generate_random
 * - weather-tools: keywords [weather, forecast, temperature] → api-key-http (port 8021)
 *   Tools: get_current_weather, get_forecast, get_weather_alerts
 *
 * TURN TRACKING:
 * - incrementTurn() called automatically on every resolve_intent
 * - markUsed(spellName) called automatically when spell spawns
 * - cleanupInactive(5) called automatically after spawn
 * - getAvailableTools() returns 2 grimoire tools + all active spell tools
 *
 * NO MOCKS - Real servers, real spells, real turn-based cleanup
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
import { logger } from '../../utils/logger';

describe('Gateway E2E - Turn-Based Cleanup (ADR-0006)', () => {
  let mathServer: ChildProcess;
  let weatherServer: ChildProcess;
  let gateway: GrimoireServer;

  const mathPort = FASTMCP_PORTS.GATEWAY_TIER2_POSTGRES; // 8028 - Unique for turn-cleanup
  const weatherPort = FASTMCP_PORTS.GATEWAY_TIER2_MYSQL; // 8029 - Unique for turn-cleanup

  let grimoireDir: string;
  const testPrefix = 'gateway-turn-cleanup';

  beforeAll(async () => {
    logger.info('TEST', '=== Starting Turn-Based Cleanup Test Setup ===');

    // ARRANGE: Setup isolated test directory
    grimoireDir = setupTestGrimoireDir(testPrefix);
    logger.info('TEST', 'Test directory created', { grimoireDir });

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start 2 servers: Math (No Auth) and Weather (API Key)
    logger.info('TEST', 'Starting Math HTTP server', { port: mathPort });
    mathServer = await startFastMCPServer('servers.no_auth.http_server', mathPort);

    logger.info('TEST', 'Starting Weather HTTP server', { port: weatherPort });
    weatherServer = await startFastMCPServer('servers.api_key.http_server', weatherPort);

    // Create spell 1: tc-math-tools (tc = turn-cleanup)
    logger.info('TEST', 'Creating spell 1: tc-math-tools');
    const mathOptions: CreateOptions = {
      name: 'tc-math-tools',
      transport: 'http',
      url: `http://localhost:${mathPort}/mcp`,
      interactive: false,
      probe: true,
    };
    await createCommand(mathOptions);
    expect(existsSync(join(grimoireDir, 'tc-math-tools.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 1 created: tc-math-tools', {
      keywords: mathOptions.keywords,
      expectedTools: ['calculate', 'convert_units', 'generate_random'],
    });

    // Create spell 2: tc-weather-tools
    logger.info('TEST', 'Creating spell 2: tc-weather-tools');
    const weatherOptions: CreateOptions = {
      name: 'tc-weather-tools',
      transport: 'http',
      url: `http://localhost:${weatherPort}/mcp`,
      authType: 'bearer',
      authToken: FASTMCP_CREDENTIALS.API_KEY,
      interactive: false,
      probe: true,
    };
    await createCommand(weatherOptions);
    expect(existsSync(join(grimoireDir, 'tc-weather-tools.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 2 created: tc-weather-tools', {
      keywords: weatherOptions.keywords,
      expectedTools: ['get_current_weather', 'get_forecast', 'get_weather_alerts'],
    });

    // Start Gateway
    logger.info('TEST', 'Starting Gateway');
    gateway = new GrimoireServer();
    await gateway.start();
    logger.info('TEST', 'Waiting 2s for spell indexing...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.info('TEST', '=== Turn-Based Cleanup Test Setup Complete ===');
  }, 60000);

  afterAll(async () => {
    logger.info('TEST', '=== Starting Turn-Based Cleanup Test Cleanup ===');

    if (gateway) {
      logger.info('TEST', 'Shutting down Gateway');
      await gateway.shutdown();
    }

    logger.info('TEST', 'Stopping servers');
    await stopServer(mathServer, mathPort, 'math_http_server');
    await stopServer(weatherServer, weatherPort, 'weather_http_server');

    logger.info('TEST', 'Cleaning up test directory');
    await cleanupTestGrimoireDir(grimoireDir);
    logger.info('TEST', '=== Turn-Based Cleanup Test Cleanup Complete ===');
  }, 30000);

  it('should cleanup inactive server after 5 turns of inactivity', async () => {
    logger.info('TEST', '=== Starting Turn-Based Cleanup Test Case ===');

    // Initial state: 2 grimoire tools only
    let tools = gateway.getAvailableTools();
    logger.info('TEST', '[INITIAL] Tool count', {
      count: tools.length,
      tools: tools.map((t) => t.name),
      expected: 'resolve_intent, activate_spell',
    });
    expect(tools.length).toBe(2);

    // TURN 1: Query spell1 → spawns server1 (tc-math-tools)
    logger.info('TEST', '[TURN 1] Querying tc-math-tools to spawn server1');
    const response1 = await gateway.handleResolveIntentCall({
      query: 'calculate math expression and convert units',
    });

    logger.info('TEST', '[TURN 1] Response', {
      status: response1.status,
      spell: response1.spell?.name,
      confidence: response1.spell?.confidence,
    });
    expect(response1.status).toBe('activated');
    expect(response1.spell?.name).toBe('tc-math-tools');

    // Verify server1 spawned: 2 grimoire + 3 math = 5 tools
    tools = gateway.getAvailableTools();
    logger.info('TEST', '[TURN 1] Tool count after spawn', {
      count: tools.length,
      tools: tools.map((t) => t.name),
      expected: '5 tools (2 grimoire + 3 math)',
    });
    expect(tools.length).toBe(5);
    expect(tools.map((t) => t.name)).toContain('calculate');
    expect(tools.map((t) => t.name)).toContain('convert_units');
    expect(tools.map((t) => t.name)).toContain('generate_random');

    // TURN 2: Query spell2 → spawns server2 (tc-weather-tools)
    logger.info('TEST', '[TURN 2] Querying tc-weather-tools to spawn server2');
    const response2 = await gateway.handleResolveIntentCall({
      query: 'get weather forecast and temperature',
    });

    logger.info('TEST', '[TURN 2] Response', {
      status: response2.status,
      spell: response2.spell?.name,
      confidence: response2.spell?.confidence,
    });
    expect(response2.status).toBe('activated');
    expect(response2.spell?.name).toBe('tc-weather-tools');

    // Verify server2 spawned: 2 grimoire + 3 math + 3 weather = 8 tools
    tools = gateway.getAvailableTools();
    logger.info('TEST', '[TURN 2] Tool count after spawn', {
      count: tools.length,
      tools: tools.map((t) => t.name),
      expected: '8 tools (2 grimoire + 3 math + 3 weather)',
    });
    expect(tools.length).toBe(8);
    expect(tools.map((t) => t.name)).toContain('calculate'); // math-tools
    expect(tools.map((t) => t.name)).toContain('get_current_weather'); // weather-tools

    // TURNS 3-7: Query spell2 five more times (server1 idle, server2 active)
    logger.info(
      'TEST',
      '[TURNS 3-7] Querying tc-weather-tools 5 more times (tc-math-tools becomes idle)'
    );
    for (let turn = 3; turn <= 7; turn++) {
      logger.info('TEST', `[TURN ${turn}] Querying tc-weather-tools`, {
        note: `tc-math-tools idle since turn 1 (${turn - 1} turns idle)`,
      });

      const response = await gateway.handleResolveIntentCall({
        query: 'get weather forecast and temperature alerts',
      });

      logger.info('TEST', `[TURN ${turn}] Response`, {
        status: response.status,
        spell: response.spell?.name,
        alreadyActive: response.message?.includes('already active') || false,
      });

      // Should indicate already active after turn 2
      if (turn > 2) {
        expect(response.status).toBe('activated');
        expect(response.spell?.name).toBe('tc-weather-tools');
      }
    }

    // After turn 7: tc-math-tools idle for 6 turns (7-1=6 ≥ 5 threshold) → KILLED
    logger.info('TEST', '[AFTER TURN 7] Checking if tc-math-tools was cleaned up');
    tools = gateway.getAvailableTools();
    logger.info('TEST', '[AFTER TURN 7] Final tool count', {
      count: tools.length,
      tools: tools.map((t) => t.name),
      expected: '5 tools (2 grimoire + 3 weather) - math-tools killed',
    });

    // ASSERT: math-tools killed (tools removed)
    expect(tools.length).toBe(5); // 2 grimoire + 3 weather (math-tools killed)
    expect(tools.map((t) => t.name)).not.toContain('calculate');
    expect(tools.map((t) => t.name)).not.toContain('convert_units');
    expect(tools.map((t) => t.name)).not.toContain('generate_random');

    // ASSERT: weather-tools still alive
    expect(tools.map((t) => t.name)).toContain('get_current_weather');
    expect(tools.map((t) => t.name)).toContain('get_forecast');
    expect(tools.map((t) => t.name)).toContain('get_weather_alerts');

    logger.info('TEST', '=== Turn-Based Cleanup Test Case Complete ===', {
      result: 'SUCCESS - tc-math-tools killed after 5 turns idle, tc-weather-tools still active',
    });
  });
});
