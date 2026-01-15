/**
 * Real-world Integration Test: Simulate User's Exact Scenario
 *
 * Scenario:
 * 1. User starts gateway with 2 spells configured (cityhopper-cabs, skystream-airlines)
 * 2. Query 1: "search for nearby cabs" → should activate cityhopper-cabs
 * 3. Verify: Gateway tools (resolve_intent, activate_spell) + child tools available
 * 4. Query 2: "flight customer login" → should be able to use resolve_intent again
 * 5. Verify: resolve_intent is STILL available after first activation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrimoireServer } from '../gateway';
import type { SpellConfig } from '../../core/types';

describe('Gateway Real Workflow Integration Test', () => {
  let gateway: GrimoireServer;
  let tempCachePath: string;

  // Mock the SSE spells from user's scenario
  const cityhopperCabsSpell: SpellConfig = {
    name: 'cityhopper-cabs',
    version: '1.0.0',
    description: 'City transportation and cab booking service',
    keywords: ['find', 'nearby', 'cabs', 'estimate', 'fare', 'book', 'cancel', 'booking'],
    server: {
      transport: 'sse',
      url: 'http://127.0.0.1:8000/sse',
    },
    steering: 'Use for cab booking operations',
  };

  const skystreamAirlinesSpell: SpellConfig = {
    name: 'skystream-airlines',
    version: '1.0.0',
    description: 'Airline booking and customer management',
    keywords: [
      'flight',
      'airline',
      'travel',
      'booking',
      'airport',
      'aviation',
      'tickets',
      'passenger',
    ],
    server: {
      transport: 'sse',
      url: 'http://127.0.0.1:9000/sse',
    },
    steering: 'Use for airline operations',
  };

  beforeEach(async () => {
    gateway = new GrimoireServer();

    // Create unique cache path
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    tempCachePath = join(tmpdir(), `real-workflow-test-${Date.now()}.msgpack`);

    // Mock discovery
    const mockSpells = new Map<string, SpellConfig>([
      ['cityhopper-cabs', cityhopperCabsSpell],
      ['skystream-airlines', skystreamAirlinesSpell],
    ]);

    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpells').mockReturnValue(mockSpells);
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpell').mockImplementation((name: string) =>
      mockSpells.get(name)
    );

    // Mock lifecycle to simulate SSE server spawning
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'spawn').mockImplementation(
      async (name: string, _config: SpellConfig) => {
        // Return mock tools based on spell name
        if (name === 'cityhopper-cabs') {
          return [
            {
              name: 'find_nearby_cabs',
              description: 'Finds drivers currently available near a specific location',
              inputSchema: { type: 'object', properties: {}, required: [] },
            },
            {
              name: 'estimate_fare',
              description: 'Calculates estimated fare',
              inputSchema: {
                type: 'object',
                properties: { miles: { type: 'number' } },
                required: ['miles'],
              },
            },
            {
              name: 'book_cab',
              description: 'Books the nearest available cab',
              inputSchema: { type: 'object', properties: {}, required: [] },
            },
            {
              name: 'cancel_booking',
              description: 'Cancels a ride',
              inputSchema: { type: 'object', properties: {}, required: [] },
            },
          ];
        } else if (name === 'skystream-airlines') {
          return [
            {
              name: 'search_flights',
              description: 'Search available flights',
              inputSchema: { type: 'object', properties: {}, required: [] },
            },
            {
              name: 'book_flight',
              description: 'Book a flight',
              inputSchema: { type: 'object', properties: {}, required: [] },
            },
            {
              name: 'customer_login',
              description: 'Customer login and authentication',
              inputSchema: { type: 'object', properties: {}, required: [] },
            },
          ];
        }
        return [];
      }
    );

    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'isActive').mockReturnValue(false);

    // Mock notifyToolsChanged
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway, 'notifyToolsChanged').mockImplementation(() => {
      // Silent mock
    });

    // Initialize resolver with unique cache
    // @ts-expect-error - Accessing private property for testing
    if (!gateway.resolver) {
      const { EmbeddingService } = await import('../../infrastructure/embedding-service');
      const { EmbeddingStorage } = await import('../../infrastructure/embedding-storage');
      const { HybridResolver } = await import('../../application/hybrid-resolver');

      // @ts-expect-error - Accessing private property for testing
      gateway.embeddingService = await EmbeddingService.getInstance();
      // @ts-expect-error - Accessing private property for testing
      gateway.embeddingStorage = new EmbeddingStorage(tempCachePath);
      // @ts-expect-error - Accessing private property for testing
      await gateway.embeddingStorage.load();
      // @ts-expect-error - Accessing private property for testing
      gateway.resolver = new HybridResolver(gateway.embeddingService, gateway.embeddingStorage);

      // Index test spells
      for (const config of mockSpells.values()) {
        // @ts-expect-error - Accessing private property for testing
        await gateway.resolver.indexSpell(config);
      }
    }
  });

  afterEach(async () => {
    // Cleanup cache file
    try {
      const { unlink } = await import('fs/promises');
      await unlink(tempCachePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should reproduce user scenario: gateway tools disappear after first activation', async () => {
    console.log('\n=== SIMULATING USER SCENARIO ===\n');

    // Step 1: Initial state - Gateway tools only
    console.log('Step 1: Check initial tool list');
    const initialTools = gateway.getAvailableTools();
    console.log(
      `Initial tools (${initialTools.length}):`,
      initialTools.map((t) => t.name)
    );

    expect(initialTools.length).toBe(2);
    expect(initialTools.map((t) => t.name)).toContain('resolve_intent');
    expect(initialTools.map((t) => t.name)).toContain('activate_spell');

    // Step 2: First query - "search for nearby cabs"
    console.log('\nStep 2: First query - "search for nearby cabs"');
    const response1 = await gateway.handleResolveIntentCall({
      query: 'search for nearby cabs',
    });

    console.log('Response 1:', JSON.stringify(response1, null, 2));
    expect(response1.status).toBe('activated');

    if (response1.status === 'activated') {
      expect(response1.spell.name).toBe('cityhopper-cabs');
    }

    // Step 3: Verify tools list after first activation
    console.log('\nStep 3: Check tool list after cityhopper-cabs activation');
    const toolsAfterFirst = gateway.getAvailableTools();
    console.log(
      `Tools after first activation (${toolsAfterFirst.length}):`,
      toolsAfterFirst.map((t) => t.name)
    );

    // CRITICAL: Should have 2 gateway + 4 cityhopper-cabs = 6 tools
    expect(toolsAfterFirst.length).toBe(6);

    // Gateway tools must STILL be present
    const toolNamesAfterFirst = toolsAfterFirst.map((t) => t.name);
    expect(toolNamesAfterFirst).toContain('resolve_intent');
    expect(toolNamesAfterFirst).toContain('activate_spell');

    // Child tools should be present
    expect(toolNamesAfterFirst).toContain('find_nearby_cabs');
    expect(toolNamesAfterFirst).toContain('estimate_fare');
    expect(toolNamesAfterFirst).toContain('book_cab');
    expect(toolNamesAfterFirst).toContain('cancel_booking');

    console.log('✅ After first activation: Gateway tools are present');

    // Step 4: Second query - "flight customer login"
    console.log('\nStep 4: Second query - "flight customer login"');

    // This should work because resolve_intent is available
    const response2 = await gateway.handleResolveIntentCall({
      query: 'flight customer login',
    });

    console.log('Response 2:', JSON.stringify(response2, null, 2));

    // Step 5: Verify tools list after second activation
    console.log('\nStep 5: Check tool list after potential second activation');
    const toolsAfterSecond = gateway.getAvailableTools();
    console.log(
      `Tools after second activation (${toolsAfterSecond.length}):`,
      toolsAfterSecond.map((t) => t.name)
    );

    // CRITICAL: Gateway tools must STILL be present
    const toolNamesAfterSecond = toolsAfterSecond.map((t) => t.name);
    expect(toolNamesAfterSecond).toContain('resolve_intent');
    expect(toolNamesAfterSecond).toContain('activate_spell');

    console.log('✅ After second activation: Gateway tools are STILL present');

    // If second spell activated, verify its tools are present too
    if (response2.status === 'activated') {
      expect(response2.spell.name).toBe('skystream-airlines');
      expect(toolNamesAfterSecond).toContain('search_flights');
      expect(toolNamesAfterSecond).toContain('customer_login');
    }

    console.log('\n=== TEST PASSED: Gateway tools persist across multiple activations ===\n');
  });

  it('should allow calling child spell tools after activation', async () => {
    // Activate cityhopper-cabs
    await gateway.handleResolveIntentCall({
      query: 'search for nearby cabs',
    });

    // Verify we can get the tools list
    const tools = gateway.getAvailableTools();
    expect(tools.map((t) => t.name)).toContain('find_nearby_cabs');

    // Try to call a child tool (this would fail if tools weren't properly registered)
    // Note: In real scenario, this would route to the actual SSE server
    // Here we just verify the router knows about the tool
    // @ts-expect-error - Accessing private property for testing
    const hasChildTool = gateway.router.hasTool('find_nearby_cabs');
    expect(hasChildTool).toBe(true);

    // Verify the router knows which spell owns the tool
    // @ts-expect-error - Accessing private property for testing
    const owningSpell = gateway.router.findSpellForTool('find_nearby_cabs');
    expect(owningSpell).toBe('cityhopper-cabs');
  });

  it('should handle rapid sequential activations without losing gateway tools', async () => {
    // Rapid fire: Activate first spell
    const response1 = await gateway.handleResolveIntentCall({
      query: 'search for nearby cabs',
    });
    expect(response1.status).toBe('activated');

    // Immediately check tools
    let tools = gateway.getAvailableTools();
    expect(tools.map((t) => t.name)).toContain('resolve_intent');

    // Rapid fire: Activate second spell
    const response2 = await gateway.handleResolveIntentCall({
      query: 'book airline flight',
    });

    // Check tools again
    tools = gateway.getAvailableTools();
    expect(tools.map((t) => t.name)).toContain('resolve_intent');
    expect(tools.map((t) => t.name)).toContain('activate_spell');

    // Both should still work
    console.log(
      'Final tool list:',
      tools.map((t) => t.name)
    );
  });
});
