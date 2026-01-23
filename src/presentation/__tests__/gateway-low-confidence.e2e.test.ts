/**
 * Gateway E2E Test: Low Confidence - Not Found (Tier 3b: <0.3)
 *
 * PURPOSE:
 * Validates Tier 3b intent resolution where query has no meaningful match with spells
 * Tests that gateway returns not_found with available spells list for AI agent guidance
 *
 * STRATEGY:
 * Create 2 spells with domain-specific keywords (project management, data analytics)
 * Query with completely unrelated keywords that produce no meaningful match
 * Expected: No keyword match, no semantic match → confidence <0.3 → not_found
 *
 * FLOW:
 * 1. Setup isolated test directory
 * 2. Start 2 FastMCP servers on unique ports (8050, 8051)
 * 3. Create 2 spells with domain-specific keywords
 * 4. Start Gateway, wait for indexing
 * 5. Query with completely unrelated keywords
 * 6. Validate status='not_found' with available spells list
 * 7. Verify NO server spawned (tools list unchanged)
 * 8. Verify available spells provided for AI agent guidance
 * 9. Cleanup
 *
 * SPELLS:
 * - lc-project-mgmt: keywords [project, task, management] → basic-auth-http (port 8050)
 * - lc-data-analytics: keywords [analytics, data, report] → security-keys-http (port 8051)
 *
 * QUERY: Unrelated keywords that produce confidence <0.3
 * Expected: No keyword or semantic match → confidence <0.3 → not_found status
 *
 * NOTE: Tier 3a (0.3-0.49 "weak_matches") is difficult to reproduce consistently
 * as it requires precise semantic similarity. This test validates the more common
 * Tier 3b case where confidence is below the 0.3 threshold.
 *
 * NO MOCKS - Real servers, real spells, real HybridResolver matching
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
  FASTMCP_CREDENTIALS,
} from '../../cli/__tests__/helpers/test-server-manager';
import { createCommand, type CreateOptions } from '../../cli/commands/create';
import { logger } from '../../utils/logger';

// Define unique ports for low-confidence testb: <0.3conflicts with other tests)
const LC_PORT_PROJECT = 8050; // Not used in test-server-manager.ts
const LC_PORT_ANALYTICS = 8051; // Not used in test-server-manager.ts

describe('Gateway E2E - Low Confidence (Tier 3a: 0.3-0.49)', () => {
  let projectServer: ChildProcess;
  let analyticsServer: ChildProcess;
  let gateway: GrimoireServer;

  let grimoireDir: string;
  const testPrefix = 'gateway-low-confidence';

  beforeAll(async () => {
    logger.info('TEST', '=== Starting Low Confidence Test Setup ===');

    // ARRANGE: Setup isolated test directory
    grimoireDir = setupTestGrimoireDir(testPrefix);
    logger.info('TEST', 'Test directory created', { grimoireDir });

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start 2 servers: Project Management (Basic Auth), Data Analytics (Security Keys)
    logger.info('TEST', 'Starting Project Management HTTP server', { port: LC_PORT_PROJECT });
    projectServer = await startFastMCPServer('servers.basic_auth.http_server', LC_PORT_PROJECT);

    logger.info('TEST', 'Starting Data Analytics HTTP server', { port: LC_PORT_ANALYTICS });
    analyticsServer = await startFastMCPServer(
      'servers.security_keys.http_server',
      LC_PORT_ANALYTICS
    );

    // Create spell 1: lc-project-mgmt (tools: create_project, add_task, get_project_status)
    logger.info('TEST', 'Creating spell 1: lc-project-mgmt');
    const projectOptions: CreateOptions = {
      name: 'lc-project-mgmt',
      transport: 'http',
      url: `http://localhost:${LC_PORT_PROJECT}/mcp`,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD,
      keywords: ['project', 'task', 'management'],
      description: 'Project and task management operations',
      interactive: false,
      probe: true,
    };
    await createCommand(projectOptions);
    expect(existsSync(join(grimoireDir, 'lc-project-mgmt.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 1 created with keywords', { keywords: projectOptions.keywords });

    // Create spell 2: lc-data-analytics (tools: analyze_dataset, generate_report, calculate_statistics)
    logger.info('TEST', 'Creating spell 2: lc-data-analytics');
    const analyticsOptions: CreateOptions = {
      name: 'lc-data-analytics',
      transport: 'http',
      url: `http://localhost:${LC_PORT_ANALYTICS}/mcp`,
      headers: {
        'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT,
        'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY,
      },
      keywords: ['analytics', 'data', 'report'],
      description: 'Data analytics and reporting operations',
      interactive: false,
      probe: true,
    };
    await createCommand(analyticsOptions);
    expect(existsSync(join(grimoireDir, 'lc-data-analytics.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 2 created with keywords', { keywords: analyticsOptions.keywords });

    // Start Gateway
    logger.info('TEST', 'Starting Gateway');
    gateway = new GrimoireServer();
    await gateway.start();
    logger.info('TEST', 'Waiting 2s for spell indexing...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.info('TEST', '=== Low Confidence Test Setup Complete ===');
  }, 60000);

  afterAll(async () => {
    logger.info('TEST', '=== Starting Low Confidence Test Cleanup ===');

    if (gateway) {
      logger.info('TEST', 'Shutting down Gateway');
      await gateway.shutdown();
    }

    logger.info('TEST', 'Stopping servers');
    await stopServer(projectServer, LC_PORT_PROJECT, 'project_management_http_server');
    await stopServer(analyticsServer, LC_PORT_ANALYTICS, 'data_analytics_http_server');

    logger.info('TEST', 'Cleaning up test directory');
    await cleanupTestGrimoireDir(grimoireDir);
    logger.info('TEST', '=== Low Confidence Test Cleanup Complete ===');
  }, 30000);

  it('should return not_found when query has no meaningful match', async () => {
    logger.info('TEST', '=== Starting Not Found Test Case ===');

    // Get initial tools (should be 2 grimoire tools only)
    const toolsBefore = gateway.getAvailableTools();
    logger.info('TEST', 'Tools before query', {
      count: toolsBefore.length,
      tools: toolsBefore.map((t) => t.name),
    });
    expect(toolsBefore.length).toBe(2); // resolve_intent, activate_spell

    // ACT: Query with completely unrelated keywords
    const query = 'what is the capital of India?';
    logger.info('TEST', 'Calling resolve_intent', {
      query,
      note: 'Keywords: capital, India (no meaningful match to project/analytics)',
      spellDomains: 'project/task/management, analytics/data/report',
      expectedMatch: 'no keyword or semantic match → confidence <0.3 → not_found',
    });

    const response = await gateway.handleResolveIntentCall({ query });

    logger.info('TEST', 'Response received', {
      status: response.status,
      availableSpellsCount: response.availableSpells?.length || 0,
      availableSpells: response.availableSpells?.map((s) => s.name),
    });

    // ASSERT: Status is not_found (Tier 3b: confidence <0.3)
    expect(response.status).toBe('not_found');

    // ASSERT: No matches returned (confidence below 0.3 threshold)
    expect(response.matches).toBeUndefined();

    // ASSERT: Available spells list provided for AI agent guidance
    expect(response.availableSpells).toBeDefined();
    expect(response.availableSpells!.length).toBe(2);

    const spellNames = response.availableSpells!.map((s) => s.name);
    expect(spellNames).toContain('lc-project-mgmt');
    expect(spellNames).toContain('lc-data-analytics');

    // ASSERT: No server spawned (tools unchanged)
    const toolsAfter = gateway.getAvailableTools();
    logger.info('TEST', 'Tools after query', {
      count: toolsAfter.length,
      tools: toolsAfter.map((t) => t.name),
    });
    expect(toolsAfter.length).toBe(2); // Still only resolve_intent, activate_spell

    // ASSERT: Response includes guidance message
    expect(response.message).toBeDefined();
    expect(response.message).toContain('No relevant tools found');
    logger.info('TEST', 'Guidance message', { message: response.message });

    logger.info('TEST', '✅ Not found returned with available spells, no auto-spawn');
  });

  it('should provide available spells with descriptions for AI agent', async () => {
    logger.info('TEST', '=== Starting Available Spells List Test Case ===');

    // ACT: Another unrelated query
    const query = 'what is artificial intelligence?';
    logger.info('TEST', 'Calling resolve_intent', { query });

    const response = await gateway.handleResolveIntentCall({ query });

    logger.info('TEST', 'Response received', {
      status: response.status,
      availableSpellsCount: response.availableSpells?.length || 0,
    });

    // ASSERT: Status is not_found
    expect(response.status).toBe('not_found');

    // ASSERT: Response includes guidance message
    expect(response.message).toBeDefined();
    logger.info('TEST', 'Message contains guidance', { message: response.message });

    // ASSERT: Available spells are listed with descriptions
    expect(response.availableSpells).toBeDefined();
    expect(response.availableSpells!.length).toBe(2);

    // ASSERT: Each spell has required fields for AI agent
    response.availableSpells!.forEach((spell) => {
      expect(spell.name).toBeDefined();
      expect(spell.description).toBeDefined();
      expect(['lc-project-mgmt', 'lc-data-analytics']).toContain(spell.name);
      logger.info('TEST', 'Spell available for AI agent', {
        name: spell.name,
        description: spell.description,
      });
    });

    logger.info('TEST', '✅ Available spells list provided for AI agent guidance');
  });
});
