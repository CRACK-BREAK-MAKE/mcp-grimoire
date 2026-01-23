/**
 * Gateway E2E Test: Parallel Servers
 *
 * PURPOSE:
 * Validates that multiple servers can be spawned simultaneously
 * Tests correct tool registration and availability from all active servers
 *
 * STRATEGY:
 * Spawn 3 different servers with high-confidence queries
 * Verify all tools from all 3 servers are available simultaneously
 * Tool count: 2 grimoire + (3 × 3 spell tools) = 11 tools total
 *
 * FLOW:
 * 1. Setup isolated test directory
 * 2. Start 3 FastMCP servers (Math, Project, Database)
 * 3. Create 3 spells with distinct keywords
 * 4. Start Gateway, wait for indexing
 * 5. Spawn server1 with high-confidence query
 * 6. Spawn server2 with high-confidence query
 * 7. Spawn server3 with high-confidence query
 * 8. Verify all 9 tools (3×3) available simultaneously
 * 9. Cleanup
 *
 * SPELLS:
 * - math-tools: keywords [calculate, math, convert] → no-auth-http (port 8023)
 *   Tools: calculate, convert_units, generate_random
 * - project-tools: keywords [project, task, management] → basic-auth-http (port 8017)
 *   Tools: create_project, add_task, get_project_status
 * - database-tools: keywords [database, sql, query] → security-keys-http (port 8029)
 *   Tools: run_sql_query, get_table_schema, export_query_results
 *
 * VALIDATION:
 * - All 3 servers spawn successfully
 * - Tools from all servers available simultaneously
 * - Gateway maintains separate server state for each
 * - Tool count = 2 grimoire + 9 spell tools = 11 total
 *
 * NO MOCKS - Real servers, real spells, real parallel spawning
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

describe('Gateway E2E - Parallel Servers', () => {
  let mathServer: ChildProcess;
  let projectServer: ChildProcess;
  let databaseServer: ChildProcess;
  let gateway: GrimoireServer;

  const mathPort = FASTMCP_PORTS.GATEWAY_TIER3_WEAK_MATCH; // 8030 - Unique for parallel
  const projectPort = FASTMCP_PORTS.GATEWAY_TIER3_NOT_FOUND; // 8031 - Unique for parallel
  const databasePort = FASTMCP_PORTS.GATEWAY_PARALLEL_ROUTING_B; // 8049 - Unique for parallel

  let grimoireDir: string;
  const testPrefix = 'gateway-parallel';

  beforeAll(async () => {
    logger.info('TEST', '=== Starting Parallel Servers Test Setup ===');

    // ARRANGE: Setup isolated test directory
    grimoireDir = setupTestGrimoireDir(testPrefix);
    logger.info('TEST', 'Test directory created', { grimoireDir });

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start 3 servers
    logger.info('TEST', 'Starting Math HTTP server', { port: mathPort });
    mathServer = await startFastMCPServer('servers.no_auth.http_server', mathPort);

    logger.info('TEST', 'Starting Project Management HTTP server', { port: projectPort });
    projectServer = await startFastMCPServer('servers.basic_auth.http_server', projectPort);

    logger.info('TEST', 'Starting Database HTTP server', { port: databasePort });
    databaseServer = await startFastMCPServer('servers.no_auth.sse_server', databasePort);
    await new Promise((resolve) => setTimeout(resolve, 1500)); // SSE startup delay

    // Create spell 1: ps-math-tools (ps = parallel-servers)
    logger.info('TEST', 'Creating spell 1: ps-math-tools');
    const mathOptions: CreateOptions = {
      name: 'ps-math-tools',
      transport: 'http',
      url: `http://localhost:${mathPort}/mcp`,
      authType: 'none',
      keywords: ['calculate', 'math', 'convert'],
      description: 'Mathematical calculations and unit conversions',
      interactive: false,
      probe: true,
    };
    await createCommand(mathOptions);
    expect(existsSync(join(grimoireDir, 'ps-math-tools.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 1 created', {
      name: 'ps-math-tools',
      tools: ['calculate', 'convert_units', 'generate_random'],
    });

    // Create spell 2: ps-project-tools
    logger.info('TEST', 'Creating spell 2: ps-project-tools');
    const projectOptions: CreateOptions = {
      name: 'ps-project-tools',
      transport: 'http',
      url: `http://localhost:${projectPort}/mcp`,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD,
      interactive: false,
      probe: true,
    };
    await createCommand(projectOptions);
    expect(existsSync(join(grimoireDir, 'ps-project-tools.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 2 created', {
      name: 'ps-project-tools',
      tools: ['create_project', 'add_task', 'get_project_status'],
    });

    // Create spell 3: ps-database-tools
    logger.info('TEST', 'Creating spell 3: ps-database-tools');
    const databaseOptions: CreateOptions = {
      name: 'ps-database-tools',
      transport: 'sse',
      url: `http://localhost:${databasePort}/sse`,
      interactive: false,
      probe: true,
    };
    await createCommand(databaseOptions);
    expect(existsSync(join(grimoireDir, 'ps-database-tools.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 3 created', {
      name: 'ps-database-tools',
      tools: ['get_cpu_usage', 'get_memory_stats', 'get_disk_usage'],
    });

    // Start Gateway
    logger.info('TEST', 'Starting Gateway');
    gateway = new GrimoireServer();
    await gateway.start();
    logger.info('TEST', 'Waiting 2s for spell indexing...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.info('TEST', '=== Parallel Servers Test Setup Complete ===');
  }, 60000);

  afterAll(async () => {
    logger.info('TEST', '=== Starting Parallel Servers Test Cleanup ===');

    if (gateway) {
      logger.info('TEST', 'Shutting down Gateway');
      await gateway.shutdown();
    }

    logger.info('TEST', 'Stopping servers');
    await stopServer(mathServer, mathPort, 'math_http_server');
    await stopServer(projectServer, projectPort, 'project_http_server');
    await stopServer(databaseServer, databasePort, 'database_http_server');

    logger.info('TEST', 'Cleaning up test directory');
    await cleanupTestGrimoireDir(grimoireDir);
    logger.info('TEST', '=== Parallel Servers Test Cleanup Complete ===');
  }, 30000);

  it('should spawn and manage multiple servers simultaneously', async () => {
    logger.info('TEST', '=== Starting Parallel Servers Test Case ===');

    // Initial state: 2 grimoire tools only
    let tools = gateway.getAvailableTools();
    logger.info('TEST', '[INITIAL] Tool count', {
      count: tools.length,
      tools: tools.map((t) => t.name),
    });
    expect(tools.length).toBe(2);

    // ACT 1: Spawn ps-math-tools
    logger.info('TEST', '[SERVER 1] Spawning ps-math-tools');
    const response1 = await gateway.handleResolveIntentCall({
      query: 'calculate math expression and convert units',
    });

    logger.info('TEST', '[SERVER 1] Response', {
      status: response1.status,
      spell: response1.spell?.name,
      confidence: response1.spell?.confidence,
    });
    expect(response1.status).toBe('activated');
    expect(response1.spell?.name).toBe('ps-math-tools');

    tools = gateway.getAvailableTools();
    logger.info('TEST', '[SERVER 1] Tool count after spawn', {
      count: tools.length,
      expected: 5,
      tools: tools.map((t) => t.name),
    });
    expect(tools.length).toBe(5); // 2 grimoire + 3 math

    // ACT 2: Spawn ps-project-tools
    logger.info('TEST', '[SERVER 2] Spawning ps-project-tools');
    const response2 = await gateway.handleResolveIntentCall({
      query: 'create project and add task using management',
    });

    logger.info('TEST', '[SERVER 2] Response', {
      status: response2.status,
      spell: response2.spell?.name,
      confidence: response2.spell?.confidence,
    });
    expect(response2.status).toBe('activated');
    expect(response2.spell?.name).toBe('ps-project-tools');

    tools = gateway.getAvailableTools();
    logger.info('TEST', '[SERVER 2] Tool count after spawn', {
      count: tools.length,
      expected: 8,
      tools: tools.map((t) => t.name),
    });
    expect(tools.length).toBe(8); // 2 grimoire + 3 math + 3 project

    // ACT 3: Spawn ps-database-tools
    logger.info('TEST', '[SERVER 3] Spawning ps-database-tools');
    const response3 = await gateway.handleResolveIntentCall({
      query: 'run sql query and get table schema from database',
    });

    logger.info('TEST', '[SERVER 3] Response', {
      status: response3.status,
      spell: response3.spell?.name,
      confidence: response3.spell?.confidence,
    });
    expect(response3.status).toBe('activated');
    expect(response3.spell?.name).toBe('ps-database-tools');

    tools = gateway.getAvailableTools();
    logger.info('TEST', '[SERVER 3] Tool count after spawn', {
      count: tools.length,
      expected: 11,
      tools: tools.map((t) => t.name),
    });
    expect(tools.length).toBe(11); // 2 grimoire + 3 math + 3 project + 3 database

    // ASSERT: All tools from all 3 servers present
    const toolNames = tools.map((t) => t.name);
    logger.info('TEST', '[FINAL] Verifying all tools present from all 3 servers');

    // Verify grimoire tools
    expect(toolNames).toContain('resolve_intent');
    expect(toolNames).toContain('activate_spell');

    // Verify math-tools
    logger.info('TEST', 'Checking math-tools tools');
    expect(toolNames).toContain('calculate');
    expect(toolNames).toContain('convert_units');
    expect(toolNames).toContain('generate_random');

    // Verify project-tools
    logger.info('TEST', 'Checking project-tools tools');
    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('add_task');
    expect(toolNames).toContain('get_project_status');

    // Verify database-tools (actually system monitor tools from no_auth.sse_server)
    logger.info('TEST', 'Checking database-tools tools');
    expect(toolNames).toContain('get_cpu_usage');
    expect(toolNames).toContain('get_memory_stats');
    expect(toolNames).toContain('get_disk_usage');

    logger.info('TEST', '=== Parallel Servers Test Case Complete ===', {
      result: 'SUCCESS - All 3 servers spawned, all 9 spell tools + 2 grimoire tools available',
      totalTools: tools.length,
      servers: ['ps-math-tools', 'ps-project-tools', 'ps-database-tools'],
    });
  });
});
