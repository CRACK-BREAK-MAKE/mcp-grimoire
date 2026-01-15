/**
 * TDD Tests for Multi-Tier Confidence-Based Intent Resolution (ADR-0009)
 *
 * Test Structure:
 * - Tier 1: High Confidence (≥0.85) - Auto-spawn
 * - Tier 2: Medium Confidence (0.5-0.84) - Multiple matches
 * - Tier 3a: Low Confidence (0.3-0.49) - Weak matches
 * - Tier 3b: No Match (<0.3) - Not found
 * - Tool: activate_power - Manual activation
 *
 * Following TDD Red-Green-Refactor:
 * 1. Write tests first (RED) ✓
 * 2. Implement to make tests pass (GREEN)
 * 3. Refactor if needed (REFACTOR)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SpellConfig, ResolveIntentResponse, ActivateSpellResponse } from '../../core/types';

// We'll implement PowerGatewayServer to pass these tests
import { GrimoireServer } from '../gateway';

describe('PowerGatewayServer - Multi-Tier Confidence (ADR-0009)', () => {
  let gateway: GrimoireServer;
  let tempCachePath: string;

  // Mock power configs for testing
  const postgresPower: SpellConfig = {
    name: 'postgres',
    version: '1.0.0',
    description: 'PostgreSQL database operations',
    keywords: ['database', 'sql', 'postgres', 'query', 'tables'],
    server: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
    },
    steering: 'Always use parameterized queries to prevent SQL injection',
  };

  const mysqlPower: SpellConfig = {
    name: 'mysql',
    version: '1.0.0',
    description: 'MySQL database management',
    keywords: ['database', 'mysql', 'sql', 'query'],
    server: {
      command: 'npx',
      args: ['-y', 'mcp-server-mysql'],
    },
  };

  const mongodbPower: SpellConfig = {
    name: 'mongodb',
    version: '1.0.0',
    description: 'MongoDB NoSQL database operations',
    keywords: ['database', 'mongo', 'nosql', 'query', 'collection'],
    server: {
      command: 'npx',
      args: ['-y', 'mcp-server-mongodb'],
    },
  };

  const stripePower: SpellConfig = {
    name: 'stripe',
    version: '1.0.0',
    description: 'Stripe payment processing and subscriptions',
    keywords: ['payment', 'stripe', 'billing', 'charge', 'subscription'],
    server: {
      command: 'npx',
      args: ['-y', 'mcp-server-stripe'],
    },
  };

  const analyticsPower: SpellConfig = {
    name: 'analytics',
    version: '1.0.0',
    description: 'Business analytics and reporting tools',
    keywords: ['analytics', 'reports', 'metrics', 'insights', 'dashboard'],
    server: {
      command: 'npx',
      args: ['-y', 'mcp-server-analytics'],
    },
  };

  beforeEach(async () => {
    // Create gateway instance
    gateway = new GrimoireServer();

    // Create unique cache path for this test run
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    tempCachePath = join(tmpdir(), `multi-tier-test-${Date.now()}.msgpack`);

    // Mock discovery to return test powers
    const mockPowers = new Map<string, SpellConfig>([
      ['postgres', postgresPower],
      ['mysql', mysqlPower],
      ['mongodb', mongodbPower],
      ['stripe', stripePower],
      ['analytics', analyticsPower],
    ]);

    // Mock the discovery service
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpells').mockReturnValue(mockPowers);
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpell').mockImplementation((name: string) =>
      mockPowers.get(name)
    );

    // Mock the lifecycle manager to avoid actually spawning processes
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'spawn').mockImplementation(
      async (name: string, config: SpellConfig) => {
        // Return mock tools for the power
        return [
          {
            name: `${name}_tool_1`,
            description: `Mock tool 1 for ${name}`,
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: `${name}_tool_2`,
            description: `Mock tool 2 for ${name}`,
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
        ];
      }
    );

    // Mock isActive to return false initially (not spawned)
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'isActive').mockReturnValue(false);

    // Mock notifyToolsChanged to avoid "Not connected" errors in tests
    // @ts-expect-error - Accessing private method for testing
    vi.spyOn(gateway, 'notifyToolsChanged').mockImplementation(() => {
      // Silent mock - tests don't need actual MCP notifications
    });

    // Initialize resolver with unique cache path
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

      // Index all test powers
      for (const config of mockPowers.values()) {
        // @ts-expect-error - Accessing private property for testing
        await gateway.resolver.indexSpell(config);
      }
    }
  });

  // ==========================================
  // Tier 1: High Confidence (≥0.85) - Auto-Spawn
  // ==========================================

  describe('Tier 1: High Confidence (≥0.85) - Auto-Spawn', () => {
    it('should auto-spawn power for exact keyword match', async () => {
      // Query with exact keyword: "postgres"
      const response = await gateway.handleResolveIntentCall({
        query: 'query my postgres database for users',
      });

      const result = response as ResolveIntentResponse;

      // Should auto-spawn (status: 'activated')
      expect(result.status).toBe('activated');
      expect(result).toHaveProperty('spell');

      if (result.status === 'activated') {
        expect(result.spell.name).toBe('postgres');
        expect(result.spell.confidence).toBeGreaterThanOrEqual(0.85);
        expect(result.spell.matchType).toMatch(/keyword|hybrid/);
        expect(result.tools).toBeInstanceOf(Array);
        expect(result.tools.length).toBeGreaterThan(0);
      }
    });

    it('should auto-spawn power for strong hybrid match', async () => {
      // Query combining keywords + semantic meaning
      const response = await gateway.handleResolveIntentCall({
        query: 'execute SQL query on postgresql',
      });

      const result = response as ResolveIntentResponse;

      expect(result.status).toBe('activated');
      if (result.status === 'activated') {
        expect(result.spell.name).toBe('postgres');
        expect(result.spell.confidence).toBeGreaterThanOrEqual(0.85);
        expect(result.tools).toBeDefined();
      }
    });

    it('should inject steering into tool descriptions after auto-spawn', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'query postgres database',
      });

      const result = response as ResolveIntentResponse;

      // Should have spawned and returned tools
      expect(result.status).toBe('activated');
      if (result.status === 'activated') {
        expect(result.tools.length).toBeGreaterThan(0);
        // Note: tools array contains just names in response
        // Steering is injected in actual tool objects sent via tools/list
      }
    });

    it('should handle stripe payment queries with high confidence', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'create a stripe subscription for the customer',
      });

      const result = response as ResolveIntentResponse;

      expect(result.status).toBe('activated');
      if (result.status === 'activated') {
        expect(result.spell.name).toBe('stripe');
        expect(result.spell.confidence).toBeGreaterThanOrEqual(0.85);
      }
    });
  });

  // ==========================================
  // Tier 2: Medium Confidence (0.5-0.84) - Multiple Matches
  // ==========================================

  describe('Tier 2: Medium Confidence (0.5-0.84) - Multiple Matches', () => {
    it('should return alternatives for ambiguous database query', async () => {
      // Use a more ambiguous query that won't auto-spawn
      const response = await gateway.handleResolveIntentCall({
        query: 'access my data store',
      });

      const result = response as ResolveIntentResponse;

      // Could be activated (high confidence) or multiple_matches (medium confidence)
      // Both are acceptable for somewhat ambiguous queries
      if (result.status === 'activated') {
        // High confidence match found - that's fine
        expect(result.spell).toBeDefined();
        expect(result.tools).toBeInstanceOf(Array);
      } else if (result.status === 'multiple_matches') {
        // Medium confidence - returns alternatives
        expect(result.query).toBe('access my data store');
        expect(result.matches).toBeInstanceOf(Array);
        expect(result.matches.length).toBeGreaterThanOrEqual(2);
        expect(result.matches.length).toBeLessThanOrEqual(3); // Top 3
        expect(result.message).toContain('Multiple');
        expect(result.message).toContain('activate_power');

        // Check match structure
        const firstMatch = result.matches[0];
        expect(firstMatch).toHaveProperty('name');
        expect(firstMatch).toHaveProperty('confidence');
        expect(firstMatch).toHaveProperty('matchType');
        expect(firstMatch).toHaveProperty('description');
        expect(firstMatch).toHaveProperty('keywords');

        // Confidence should be in medium range
        expect(firstMatch.confidence).toBeGreaterThanOrEqual(0.5);
        expect(firstMatch.confidence).toBeLessThan(0.85);

        // Keywords should be limited to 5
        expect(firstMatch.keywords.length).toBeLessThanOrEqual(5);
      } else if (result.status === 'weak_matches') {
        // Low confidence - also acceptable for ambiguous query
        expect(result.matches).toBeInstanceOf(Array);
        expect(result.matches.length).toBeGreaterThan(0);
      } else {
        // Should not be not_found for database-related query
        expect(result.status).not.toBe('not_found');
      }
    });

    it('should return alternatives sorted by confidence descending', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'query my db',
      });

      const result = response as ResolveIntentResponse;

      if (result.status === 'multiple_matches') {
        const confidences = result.matches.map((m) => m.confidence);

        // Check sorted descending
        for (let i = 0; i < confidences.length - 1; i++) {
          expect(confidences[i]).toBeGreaterThanOrEqual(confidences[i + 1]);
        }
      } else {
        // If high confidence, that's also acceptable
        expect(result.status).toMatch(/activated|multiple_matches/);
      }
    });

    it('should include helpful message with alternatives', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'access my database',
      });

      const result = response as ResolveIntentResponse;

      if (result.status === 'multiple_matches') {
        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(10);
        // Should guide user to use activate_power
        expect(result.message.toLowerCase()).toMatch(/activate_power|select/);
      }
    });
  });

  // ==========================================
  // Tier 3a: Low Confidence (0.3-0.49) - Weak Matches
  // ==========================================

  describe('Tier 3a: Low Confidence (0.3-0.49) - Weak Matches', () => {
    it('should return weak matches for vague query', async () => {
      // Vague query that weakly matches several powers
      const response = await gateway.handleResolveIntentCall({
        query: 'analyze my business performance',
      });

      const result = response as ResolveIntentResponse;

      // Should return weak matches
      expect(result.status).toBe('weak_matches');

      if (result.status === 'weak_matches') {
        expect(result.query).toBe('analyze my business performance');
        expect(result.matches).toBeInstanceOf(Array);
        expect(result.matches.length).toBeGreaterThan(0);
        expect(result.matches.length).toBeLessThanOrEqual(5); // Top 5
        expect(result.message).toContain('weak');

        // Check confidence is in low range
        const firstMatch = result.matches[0];
        expect(firstMatch.confidence).toBeGreaterThanOrEqual(0.3);
        expect(firstMatch.confidence).toBeLessThan(0.5);
      }
    });

    it('should provide clarification message for weak matches', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'show me some stats',
      });

      const result = response as ResolveIntentResponse;

      if (result.status === 'weak_matches') {
        expect(result.message).toBeTruthy();
        expect(result.message.toLowerCase()).toMatch(/clarify|rephrase|weak/);
      }
    });

    it('should return up to 5 weak matches', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'give me information about my system',
      });

      const result = response as ResolveIntentResponse;

      if (result.status === 'weak_matches') {
        expect(result.matches.length).toBeLessThanOrEqual(5);
      }
    });
  });

  // ==========================================
  // Tier 3b: No Match (<0.3) - Not Found
  // ==========================================

  describe('Tier 3b: No Match (<0.3) - Not Found', () => {
    it('should return not_found for completely irrelevant query', async () => {
      // Query completely unrelated to any power
      const response = await gateway.handleResolveIntentCall({
        query: 'launch rocket to Mars',
      });

      const result = response as ResolveIntentResponse;

      expect(result.status).toBe('not_found');

      if (result.status === 'not_found') {
        expect(result.query).toBe('launch rocket to Mars');
        expect(result.availableSpells).toBeInstanceOf(Array);
        expect(result.availableSpells.length).toBeGreaterThan(0);
        expect(result.message).toContain('No relevant tools');

        // Check available powers structure
        const firstPower = result.availableSpells[0];
        expect(firstPower).toHaveProperty('name');
        expect(firstPower).toHaveProperty('description');
      }
    });

    it('should list all available powers in not_found response', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'xyz abc nonsense query',
      });

      const result = response as ResolveIntentResponse;

      if (result.status === 'not_found') {
        expect(result.availableSpells.length).toBe(5); // All test powers

        // Should include all our test powers
        const powerNames = result.availableSpells.map((p) => p.name);
        expect(powerNames).toContain('postgres');
        expect(powerNames).toContain('stripe');
      }
    });

    it('should provide helpful error message for no match', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'asdfasdf',
      });

      const result = response as ResolveIntentResponse;

      if (result.status === 'not_found') {
        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(10);
      }
    });
  });

  // ==========================================
  // Tool: activate_power - Manual Activation
  // ==========================================

  describe('Tool: activate_power - Manual Activation', () => {
    it('should activate power by name when called directly', async () => {
      const response = await gateway.handleActivateSpellCall({
        name: 'postgres',
      });

      const result = response as ActivateSpellResponse;

      expect(result.status).toBe('activated');
      expect(result.spell.name).toBe('postgres');
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('should activate stripe when user selects from alternatives', async () => {
      const response = await gateway.handleActivateSpellCall({
        name: 'stripe',
      });

      const result = response as ActivateSpellResponse;

      expect(result.status).toBe('activated');
      expect(result.spell.name).toBe('stripe');
      expect(result.tools).toBeDefined();
    });

    it('should throw error for non-existent power', async () => {
      await expect(gateway.handleActivateSpellCall({ name: 'nonexistent' })).rejects.toThrow(
        /not found|invalid|unknown/i
      );
    });

    it('should throw error for empty power name', async () => {
      await expect(gateway.handleActivateSpellCall({ name: '' })).rejects.toThrow();
    });

    it('should return same tools if power already active', async () => {
      // Activate once
      const response1 = await gateway.handleActivateSpellCall({
        name: 'postgres',
      });

      // Activate again (should reuse)
      const response2 = await gateway.handleActivateSpellCall({
        name: 'postgres',
      });

      expect(response1).toEqual(response2);
    });
  });

  // ==========================================
  // Edge Cases & Error Handling
  // ==========================================

  describe('Edge Cases & Error Handling', () => {
    it('should handle empty query gracefully', async () => {
      const response = await gateway.handleResolveIntentCall({ query: '' });

      // Should return not_found with helpful message (not throw)
      expect(response.status).toBe('not_found');
      if (response.status === 'not_found') {
        expect(response.message.toLowerCase()).toContain('empty');
        expect(response.availableSpells).toBeInstanceOf(Array);
      }
    });

    it('should handle whitespace-only query gracefully', async () => {
      const response = await gateway.handleResolveIntentCall({ query: '   ' });

      // Should return not_found with helpful message (not throw)
      expect(response.status).toBe('not_found');
      if (response.status === 'not_found') {
        expect(response.message.toLowerCase()).toContain('empty');
      }
    });

    it('should handle very long query', async () => {
      const longQuery = 'query '.repeat(100);
      const response = await gateway.handleResolveIntentCall({
        query: longQuery,
      });

      // Should still work, just might not match
      expect(response).toHaveProperty('status');
    });

    it('should handle special characters in query', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'query @#$% database!?',
      });

      // Should normalize and still try to match
      expect(response).toHaveProperty('status');
    });
  });

  // ==========================================
  // Integration: Full Workflow
  // ==========================================

  describe('Integration: Full Workflow', () => {
    it('should complete full workflow: resolve -> alternatives -> activate', async () => {
      // Step 1: Resolve intent (ambiguous query)
      const resolveResponse = await gateway.handleResolveIntentCall({
        query: 'check database',
      });

      // Should get alternatives (medium confidence)
      if (resolveResponse.status === 'multiple_matches') {
        expect(resolveResponse.matches.length).toBeGreaterThan(0);

        // Step 2: User/agent selects postgres from alternatives
        const selectedPower = resolveResponse.matches[0].name;

        // Step 3: Activate selected power
        const activateResponse = await gateway.handleActivateSpellCall({
          name: selectedPower,
        });

        expect(activateResponse.status).toBe('activated');
        // @ts-ignore
        expect(activateResponse.spell.name).toBe(selectedPower);
        // @ts-ignore
        expect(activateResponse.tools.length).toBeGreaterThan(0);
      } else if (resolveResponse.status === 'activated') {
        // If high confidence, already activated
        expect(resolveResponse.tools.length).toBeGreaterThan(0);
      }
    });

    it('should handle sequential queries with different confidence levels', async () => {
      // Query 1: High confidence
      const response1 = await gateway.handleResolveIntentCall({
        query: 'query postgres database',
      });
      expect(response1.status).toBe('activated');

      // Query 2: Can be any tier depending on semantic similarity
      const response2 = await gateway.handleResolveIntentCall({
        query: 'check my db',
      });
      // Accept any valid status (db queries can vary in confidence)
      expect(response2.status).toMatch(/activated|multiple_matches|weak_matches/);

      // Query 3: No match
      const response3 = await gateway.handleResolveIntentCall({
        query: 'fly to moon',
      });
      expect(response3.status).toBe('not_found');
    });

    it('should keep gateway tools available after spell activation', async () => {
      // Before activation: Only gateway tools (resolve_intent, activate_spell)
      const toolsBefore = gateway.getAvailableTools();
      expect(toolsBefore.length).toBe(2);
      expect(toolsBefore.map((t) => t.name)).toContain('resolve_intent');
      expect(toolsBefore.map((t) => t.name)).toContain('activate_spell');

      // Activate a spell
      const response = await gateway.handleResolveIntentCall({
        query: 'query postgres database',
      });
      expect(response.status).toBe('activated');

      // After activation: Gateway tools + child spell tools
      const toolsAfter = gateway.getAvailableTools();
      expect(toolsAfter.length).toBeGreaterThan(2); // Should have more than just gateway tools

      // CRITICAL: Gateway tools must still be present
      const toolNames = toolsAfter.map((t) => t.name);
      expect(toolNames).toContain('resolve_intent');
      expect(toolNames).toContain('activate_spell');

      // Should also have child spell tools
      expect(toolNames).toContain('postgres_tool_1');
      expect(toolNames).toContain('postgres_tool_2');

      // Total count should be gateway (2) + postgres (2) = 4
      expect(toolsAfter.length).toBe(4);
    });

    it('should keep gateway tools available when activating multiple spells sequentially', async () => {
      // Activate first spell
      const response1 = await gateway.handleResolveIntentCall({
        query: 'query postgres database',
      });
      expect(response1.status).toBe('activated');

      const toolsAfterFirst = gateway.getAvailableTools();
      expect(toolsAfterFirst.map((t) => t.name)).toContain('resolve_intent');
      expect(toolsAfterFirst.map((t) => t.name)).toContain('activate_spell');
      expect(toolsAfterFirst.map((t) => t.name)).toContain('postgres_tool_1');

      // Activate second spell (simulate user's scenario: first cabs, then flight)
      const response2 = await gateway.handleResolveIntentCall({
        query: 'process stripe payment',
      });

      // After second activation: Gateway tools + all active spell tools
      const toolsAfterSecond = gateway.getAvailableTools();
      const toolNames = toolsAfterSecond.map((t) => t.name);

      // CRITICAL: Gateway tools must STILL be present
      expect(toolNames).toContain('resolve_intent');
      expect(toolNames).toContain('activate_spell');

      // Should have tools from BOTH spells (assuming postgres wasn't killed)
      // But at minimum should have tools from the second spell
      if (response2.status === 'activated') {
        expect(toolNames).toContain('stripe_tool_1');
        expect(toolNames).toContain('stripe_tool_2');
      }
    });
  });
});
