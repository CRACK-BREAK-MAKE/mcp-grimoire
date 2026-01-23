/**
 * Gateway E2E Test: Multiple Matches (Medium Confidence 0.5-0.84)
 *
 * PURPOSE:
 * Validates Tier 2 intent resolution where multiple spells match with medium confidence
 * Tests that gateway returns alternatives instead of auto-spawning
 *
 * STRATEGY:
 * Create 3 spells with overlapping keywords to trigger weak match penalty (~0.82 confidence)
 * Query has 4 meaningful words, each spell matches only 1 keyword → weak penalty (-0.1)
 * Keyword score: 0.9 + (1/4 * 0.1) - 0.1 = 0.825
 *
 * FLOW:
 * 1. Setup isolated test directory
 * 2. Start 3 FastMCP servers (Weather HTTP, News SSE, Analytics SSE)
 * 3. Create 3 spells with carefully chosen keywords
 * 4. Start Gateway, wait for indexing
 * 5. Query with ambiguous terms that match all 3 spells weakly
 * 6. Validate status='multiple_matches' with confidence 0.5-0.84
 * 7. Verify NO server spawned (tools list unchanged)
 * 8. Cleanup
 *
 * SPELLS:
 * - weather-data: keywords [weather, data, information] → weather-http (port 8021)
 * - news-data: keywords [news, data, information] → news-sse (port 8026)
 * - analytics-data: keywords [analytics, data, reports] → analytics-sse (port 8032)
 *
 * QUERY: "show me some data information about reports"
 * Expected: Each spell matches 1-2 keywords → ~0.82 confidence each
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

describe('Gateway E2E - Multiple Matches (Tier 2: 0.5-0.84)', () => {
  let weatherServer: ChildProcess;
  let newsServer: ChildProcess;
  let analyticsServer: ChildProcess;
  let gateway: GrimoireServer;

  const weatherPort = FASTMCP_PORTS.GATEWAY_CLEANUP_SERVER_A; // 8042 - Unique for multiple-matches
  const newsPort = FASTMCP_PORTS.GATEWAY_CLEANUP_SERVER_B; // 8043 - Unique for multiple-matches
  const analyticsPort = FASTMCP_PORTS.GATEWAY_CLEANUP_TOOLS_CHANGED; // 8044 - Unique for multiple-matches

  let grimoireDir: string;
  const testPrefix = 'gateway-multiple-matches';

  beforeAll(async () => {
    logger.info('TEST', '=== Starting Multiple Matches Test Setup ===');

    // ARRANGE: Setup isolated test directory
    grimoireDir = setupTestGrimoireDir(testPrefix);
    logger.info('TEST', 'Test directory created', { grimoireDir });

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start 3 servers: Weather (API Key), News (API Key), Analytics (Security Keys)
    logger.info('TEST', 'Starting Weather HTTP server', { port: weatherPort });
    weatherServer = await startFastMCPServer('servers.api_key.http_server', weatherPort);

    logger.info('TEST', 'Starting News SSE server', { port: newsPort });
    newsServer = await startFastMCPServer('servers.api_key.sse_server', newsPort);
    await new Promise((resolve) => setTimeout(resolve, 1500)); // SSE startup delay

    logger.info('TEST', 'Starting Analytics SSE server', { port: analyticsPort });
    analyticsServer = await startFastMCPServer('servers.security_keys.sse_server', analyticsPort);
    await new Promise((resolve) => setTimeout(resolve, 1500)); // SSE startup delay

    // Create spell 1: mm-weather-data (weather tools: get_current_weather, get_forecast, get_weather_alerts)
    logger.info('TEST', 'Creating spell 1: mm-weather-data');
    const weatherOptions: CreateOptions = {
      name: 'mm-weather-data',
      transport: 'http',
      url: `http://localhost:${weatherPort}/mcp`,
      authType: 'bearer',
      authToken: FASTMCP_CREDENTIALS.API_KEY,
      keywords: ['weather', 'forecast', 'data'],
      description: 'Get weather information and forecasts',
      interactive: false,
      probe: true,
    };
    await createCommand(weatherOptions);
    expect(existsSync(join(grimoireDir, 'mm-weather-data.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 1 created: mm-weather-data');

    // Create spell 2: mm-news-data (news tools: get_latest_news, search_news, get_trending_topics)
    logger.info('TEST', 'Creating spell 2: mm-news-data');
    const newsOptions: CreateOptions = {
      name: 'mm-news-data',
      transport: 'sse',
      url: `http://localhost:${newsPort}/sse`,
      authType: 'bearer',
      authToken: FASTMCP_CREDENTIALS.API_KEY,
      keywords: ['news', 'trending', 'data'],
      description: 'Get news articles and trending topics',
      interactive: false,
      probe: true,
    };
    await createCommand(newsOptions);
    expect(existsSync(join(grimoireDir, 'mm-news-data.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 2 created: mm-news-data');

    // Create spell 3: mm-analytics-data (analytics tools: analyze_dataset, generate_report, calculate_statistics)
    logger.info('TEST', 'Creating spell 3: mm-analytics-data');
    const analyticsOptions: CreateOptions = {
      name: 'mm-analytics-data',
      transport: 'sse',
      url: `http://localhost:${analyticsPort}/sse`,
      headers: {
        'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT,
        'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY,
      },
      keywords: ['analytics', 'report', 'data'],
      description: 'Analyze datasets and generate reports',
      interactive: false,
      probe: true,
    };
    await createCommand(analyticsOptions);
    expect(existsSync(join(grimoireDir, 'mm-analytics-data.spell.yaml'))).toBe(true);
    logger.info('TEST', 'Spell 3 created: mm-analytics-data');

    // Start Gateway
    logger.info('TEST', 'Starting Gateway');
    gateway = new GrimoireServer();
    await gateway.start();
    logger.info('TEST', 'Waiting 2s for spell indexing...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logger.info('TEST', '=== Multiple Matches Test Setup Complete ===');
  }, 60000);

  afterAll(async () => {
    logger.info('TEST', '=== Starting Multiple Matches Test Cleanup ===');

    if (gateway) {
      logger.info('TEST', 'Shutting down Gateway');
      await gateway.shutdown();
    }

    logger.info('TEST', 'Stopping servers');
    await stopServer(weatherServer, weatherPort, 'weather_http_server');
    await stopServer(newsServer, newsPort, 'news_sse_server');
    await stopServer(analyticsServer, analyticsPort, 'analytics_sse_server');

    logger.info('TEST', 'Cleaning up test directory');
    await cleanupTestGrimoireDir(grimoireDir);
    logger.info('TEST', '=== Multiple Matches Test Cleanup Complete ===');
  }, 30000);

  it('should return multiple_matches when query has ambiguous medium confidence', async () => {
    logger.info('TEST', '=== Starting Multiple Matches Test Case ===');

    // Get initial tools (should be 2 grimoire tools only)
    const toolsBefore = gateway.getAvailableTools();
    logger.info('TEST', 'Tools before query', {
      count: toolsBefore.length,
      tools: toolsBefore.map((t) => t.name),
    });
    expect(toolsBefore.length).toBe(2); // resolve_intent, activate_spell

    // ACT: Query with ambiguous terms matching all 3 spells weakly
    const query = 'show me some data information about reports';
    logger.info('TEST', 'Calling resolve_intent', { query });

    const response = await gateway.handleResolveIntentCall({
      query,
    });

    logger.info('TEST', 'Response received', {
      status: response.status,
      matchCount: response.matches?.length,
      matches: response.matches?.map((m) => ({ name: m.spellName, confidence: m.confidence })),
    });

    // ASSERT: Status is multiple_matches (Tier 2)
    expect(response.status).toBe('multiple_matches');
    expect(response.matches).toBeDefined();
    expect(response.matches!.length).toBeGreaterThanOrEqual(2);

    // ASSERT: All confidences in medium range (0.5-0.84)
    response.matches!.forEach((match) => {
      logger.info('TEST', 'Validating match confidence', {
        spell: match.spellName,
        confidence: match.confidence,
      });
      expect(match.confidence).toBeGreaterThanOrEqual(0.5);
      expect(match.confidence).toBeLessThan(0.85);
    });

    // ASSERT: No server spawned (tools unchanged)
    const toolsAfter = gateway.getAvailableTools();
    logger.info('TEST', 'Tools after query', {
      count: toolsAfter.length,
      tools: toolsAfter.map((t) => t.name),
    });
    expect(toolsAfter.length).toBe(toolsBefore.length);

    // ASSERT: Message indicates multiple matches
    expect(response.message).toBeDefined();
    expect(response.message).toContain('multiple');

    logger.info('TEST', '=== Multiple Matches Test Case Complete ===');
  });
});
