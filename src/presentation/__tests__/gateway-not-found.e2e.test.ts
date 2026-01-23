/**
 * Gateway E2E Test: Not Found (No Match <0.3)
 *
 * PURPOSE:
 * Validates Tier 3b intent resolution where no spells match the query
 * Tests that gateway returns not_found with list of available spells
 *
 * STRATEGY:
 * Create 3 spells with specific domains (weather, news, system)
 * Query with completely unrelated keywords (space exploration)
 * Expected: No keyword or semantic match → all confidence <0.3 → filtered out
 *
 * FLOW:
 * 1. Setup isolated test directory
 * 2. Start 3 FastMCP servers with different domains
 * 3. Create 3 spells with domain-specific keywords
 * 4. Start Gateway, wait for indexing
 * 5. Query with completely unrelated topic
 * 6. Validate status='not_found' with empty matches
 * 7. Verify available spells list provided
 * 8. Cleanup
 *
 * SPELLS:
 * - weather-info: keywords [weather, forecast, temperature] → weather-http
 * - news-info: keywords [news, articles, headlines] → news-sse
 * - system-info: keywords [system, monitor, resources] → system-sse
 *
 * QUERY: "launch spaceship to mars and activate warp drive"
 * Expected: Space exploration vs weather/news/system → no match → confidence <0.3
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
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from '../../cli/__tests__/helpers/test-server-manager';
import { createCommand, type CreateOptions } from '../../cli/commands/create';
import { logger } from '../../utils/logger';

describe('Gateway E2E - Not Found (Tier 3b: <0.3)', () => {
  let weatherServer: ChildProcess;
  let newsServer: ChildProcess;
  let systemServer: ChildProcess;
  let gateway: GrimoireServer;

  const weatherPort = FASTMCP_PORTS.GATEWAY_PARALLEL_WEATHER; // 8046 - Unique for not-found
  const newsPort = FASTMCP_PORTS.GATEWAY_PARALLEL_GITHUB; // 8047 - Unique for not-found
  const systemPort = FASTMCP_PORTS.GATEWAY_PARALLEL_ROUTING_A; // 8048 - Unique for not-found

  let grimoireDir: string;
  const testPrefix = 'gateway-not-found';

  beforeAll(async () => {
    logger.info('TEST', '=== Starting Not Found Test Setup ===');

    // ARRANGE: Setup isolated test directory
    grimoireDir = setupTestGrimoireDir(testPrefix);
    logger.info('TEST', 'Test directory created', { grimoireDir });

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start 3 servers: Weather (API Key), News (API Key), System (No Auth)
    logger.info('TEST', 'Starting Weather HTTP server', { port: weatherPort });
    weatherServer = await startFastMCPServer('servers.api_key.http_server', weatherPort);

    logger.info('TEST', 'Starting News SSE server', { port: newsPort });
    newsServer = await startFastMCPServer('servers.api_key.sse_server', newsPort);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    logger.info('TEST', 'Starting System Monitor SSE server', { port: systemPort });
    systemServer = await startFastMCPServer('servers.no_auth.sse_server', systemPort);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Create spell 1: nf-weather-info (weather tools: get_current_weather, get_forecast, get_weather_alerts)
    logger.info('TEST', 'Creating spell 1: nf-weather-info');
    const weatherOptions: CreateOptions = {
      name: 'nf-weather-info',
      transport: 'http',
      url: `http://localhost:${weatherPort}/mcp`,
      authType: 'bearer',
      authToken: FASTMCP_CREDENTIALS.API_KEY,
      keywords: ['weather', 'forecast', 'alerts'],
      description: 'Get weather forecasts and temperature data',
      interactive: false,
      probe: true,
    };
    await createCommand(weatherOptions);
    expect(existsSync(join(grimoireDir, 'nf-weather-info.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 1 created with keywords', { keywords: weatherOptions.keywords });

    // Create spell 2: nf-news-info (news tools: get_latest_news, search_news, get_trending_topics)
    logger.info('TEST', 'Creating spell 2: nf-news-info');
    const newsOptions: CreateOptions = {
      name: 'nf-news-info',
      transport: 'sse',
      url: `http://localhost:${newsPort}/sse`,
      authType: 'bearer',
      authToken: FASTMCP_CREDENTIALS.API_KEY,
      keywords: ['news', 'articles', 'trending'],
      description: 'Get latest news articles and headlines',
      interactive: false,
      probe: true,
    };
    await createCommand(newsOptions);
    expect(existsSync(join(grimoireDir, 'nf-news-info.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 2 created with keywords', { keywords: newsOptions.keywords });

    // Create spell 3: nf-system-info (system tools: get_cpu_usage, get_memory_stats, get_disk_usage)
    logger.info('TEST', 'Creating spell 3: nf-system-info');
    const systemOptions: CreateOptions = {
      name: 'nf-system-info',
      transport: 'sse',
      url: `http://localhost:${systemPort}/sse`,
      keywords: ['cpu', 'memory', 'disk'],
      description: 'Monitor system resources and performance',
      interactive: false,
      probe: true,
    };
    await createCommand(systemOptions);
    expect(existsSync(join(grimoireDir, 'nf-system-info.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 3 created with keywords', { keywords: systemOptions.keywords });

    // Start Gateway
    logger.info('TEST', 'Starting Gateway');
    gateway = new GrimoireServer();
    await gateway.start();
    logger.info('TEST', 'Waiting 2s for spell indexing...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.info('TEST', '=== Not Found Test Setup Complete ===');
  }, 60000);

  afterAll(async () => {
    logger.info('TEST', '=== Starting Not Found Test Cleanup ===');

    if (gateway) {
      logger.info('TEST', 'Shutting down Gateway');
      await gateway.shutdown();
    }

    logger.info('TEST', 'Stopping servers');
    await stopServer(weatherServer, weatherPort, 'weather_http_server');
    await stopServer(newsServer, newsPort, 'news_sse_server');
    await stopServer(systemServer, systemPort, 'system_sse_server');

    logger.info('TEST', 'Cleaning up test directory');
    await cleanupTestGrimoireDir(grimoireDir);
    logger.info('TEST', '=== Not Found Test Cleanup Complete ===');
  }, 30000);

  it('should return not_found when query has no matching spells', async () => {
    logger.info('TEST', '=== Starting Not Found Test Case ===');

    // Get initial tools (should be 2 grimoire tools only)
    const toolsBefore = gateway.getAvailableTools();
    logger.info('TEST', 'Tools before query', {
      count: toolsBefore.length,
      tools: toolsBefore.map((t) => t.name),
    });
    expect(toolsBefore.length).toBe(2); // resolve_intent, activate_spell

    // ACT: Query with completely unrelated topic
    const query = 'launch spaceship to mars and activate warp drive';
    logger.info('TEST', 'Calling resolve_intent', {
      query,
      note: 'Keywords: launch, spaceship, mars, warp, drive (space exploration)',
      spellDomains: 'weather, news, system (no overlap)',
      expectedMatch: 'no match (confidence <0.3)',
    });

    const response = await gateway.handleResolveIntentCall({ query });

    logger.info('TEST', 'Response received', {
      status: response.status,
      matchCount: response.matches?.length || 0,
      matches: response.matches,
      availableSpellsCount: response.availableSpells?.length || 0,
      availableSpells: response.availableSpells,
    });

    // ASSERT: Status is not_found (Tier 3b)
    expect(response.status).toBe('not_found');

    // ASSERT: No matches property (undefined when not_found, not empty array)
    expect(response.matches).toBeUndefined();

    // ASSERT: No server spawned (tools unchanged)
    const toolsAfter = gateway.getAvailableTools();
    logger.info('TEST', 'Tools after query', {
      count: toolsAfter.length,
      tools: toolsAfter.map((t) => t.name),
    });
    expect(toolsAfter.length).toBe(toolsBefore.length);

    // ASSERT: Available spells list provided for user guidance (array of {name, description} objects)
    expect(response.availableSpells).toBeDefined();
    expect(response.availableSpells!.length).toBe(3);

    const spellNames = response.availableSpells!.map((s: any) => s.name);
    expect(spellNames).toContain('nf-weather-info');
    expect(spellNames).toContain('nf-news-info');
    expect(spellNames).toContain('nf-system-info');

    // ASSERT: Message indicates no match
    expect(response.message).toBeDefined();
    expect(response.message?.toLowerCase()).toContain('no relevant tools');

    logger.info('TEST', '=== Not Found Test Case Complete ===');
  });
});
