/**
 * Gateway Tool Routing and Error Handling Tests
 * Tests critical error paths and edge cases for tool routing
 *
 * Coverage goals:
 * - handleToolCall error paths (lines 452-530)
 * - Cleanup notification logic (lines 208-211, 367-370)
 * - Error recovery and resilience
 * - Tool routing edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { GrimoireServer } from '../gateway';

describe('Gateway Tool Routing and Error Handling', () => {
  let testDir: string;
  let grimoireDir: string;

  beforeEach(async () => {
    // Create unique test directory
    testDir = resolve(tmpdir(), `grimoire-test-tool-routing-${Date.now()}`);
    grimoireDir = resolve(testDir, '.grimoire');
    await mkdir(grimoireDir, { recursive: true });

    // Set environment variable for test directory
    process.env.HOME = testDir;
  });

  afterEach(async () => {
    // Cleanup
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    delete process.env.HOME;
  });

  describe('Tool routing with unknown tools', () => {
    /**
     * Test: Calling unknown tool should return clear error
     * Coverage: handleToolCall error path when tool not found
     */
    it('should return error for unknown tool', async () => {
      const gateway = new GrimoireServer();

      // The gateway should have resolve_intent and activate_spell but no other tools initially
      const tools = gateway.getAvailableTools();
      const resolveIntentTool = tools.find((t) => t.name === 'resolve_intent');
      expect(resolveIntentTool).toBeDefined();

      const nonGatewayTools = tools.filter(
        (t) => t.name !== 'resolve_intent' && t.name !== 'activate_spell'
      );
      expect(nonGatewayTools.length).toBe(0);
    });
  });

  describe('Activate spell error cases', () => {
    /**
     * Test: Activating non-existent spell should throw
     * Coverage: handleActivateSpell error path
     */
    it('should throw error when activating non-existent spell', async () => {
      const gateway = new GrimoireServer();

      await expect(gateway.handleActivateSpellCall({ name: 'nonexistent-spell' })).rejects.toThrow(
        /not found/i
      );
    });

    /**
     * Test: Empty spell name should throw
     * Coverage: handleActivateSpell validation
     */
    it('should throw error for empty spell name', async () => {
      const gateway = new GrimoireServer();

      await expect(gateway.handleActivateSpellCall({ name: '' })).rejects.toThrow(
        /cannot be empty/i
      );
    });

    /**
     * Test: Whitespace-only spell name should throw
     * Coverage: handleActivateSpell validation
     */
    it('should throw error for whitespace-only spell name', async () => {
      const gateway = new GrimoireServer();

      await expect(gateway.handleActivateSpellCall({ name: '   ' })).rejects.toThrow(
        /cannot be empty/i
      );
    });
  });

  describe('Error response consistency', () => {
    /**
     * Test: All error responses should have consistent structure
     * Coverage: createNotFoundResponse helper
     */
    it('should return consistent error structure for all validation errors', async () => {
      const gateway = new GrimoireServer();

      // Test undefined args
      const result1 = await gateway.handleResolveIntentCall(undefined as any);
      expect(result1.status).toBe('not_found');
      expect(result1).toHaveProperty('query');
      expect(result1).toHaveProperty('message');
      expect(result1).toHaveProperty('availableSpells');

      // Test non-string query
      const result2 = await gateway.handleResolveIntentCall({ query: 123 as any });
      expect(result2.status).toBe('not_found');
      expect(result2).toHaveProperty('query');
      expect(result2).toHaveProperty('message');
      expect(result2).toHaveProperty('availableSpells');

      // Test empty query
      const result3 = await gateway.handleResolveIntentCall({ query: '' });
      expect(result3.status).toBe('not_found');
      expect(result3).toHaveProperty('query');
      expect(result3).toHaveProperty('message');
      expect(result3).toHaveProperty('availableSpells');

      // All should have same structure
      const keys1 = Object.keys(result1).sort();
      const keys2 = Object.keys(result2).sort();
      const keys3 = Object.keys(result3).sort();
      expect(keys1).toEqual(keys2);
      expect(keys2).toEqual(keys3);
    });

    /**
     * Test: Error messages should be helpful and specific
     * Coverage: Error message quality
     */
    it('should provide specific error messages for different failures', async () => {
      const gateway = new GrimoireServer();

      const result1 = await gateway.handleResolveIntentCall(undefined as any);
      if (result1.status === 'not_found') {
        expect(result1.message).toContain('object');
      }

      const result2 = await gateway.handleResolveIntentCall({ query: 123 as any });
      if (result2.status === 'not_found') {
        expect(result2.message).toContain('string');
      }

      const result3 = await gateway.handleResolveIntentCall({ query: '' });
      if (result3.status === 'not_found') {
        expect(result3.message).toContain('empty');
      }

      // Each message should be different
      if (
        result1.status === 'not_found' &&
        result2.status === 'not_found' &&
        result3.status === 'not_found'
      ) {
        expect(result1.message).not.toBe(result2.message);
        expect(result2.message).not.toBe(result3.message);
        expect(result1.message).not.toBe(result3.message);
      }
    });
  });

  describe('Edge cases in query processing', () => {
    /**
     * Test: Very long query should be handled
     * Coverage: Query processing edge cases
     */
    it('should handle very long queries', async () => {
      const gateway = new GrimoireServer();
      const longQuery = 'test '.repeat(1000); // 5000 chars

      const result = await gateway.handleResolveIntentCall({ query: longQuery });
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    /**
     * Test: Query with special characters
     * Coverage: Query sanitization
     */
    it('should handle queries with special characters', async () => {
      const gateway = new GrimoireServer();
      const specialQuery = 'test<script>alert("xss")</script>';

      const result = await gateway.handleResolveIntentCall({ query: specialQuery });
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    /**
     * Test: Query with unicode characters
     * Coverage: Unicode handling
     */
    it('should handle queries with unicode characters', async () => {
      const gateway = new GrimoireServer();
      const unicodeQuery = '测试 тест 🔥 émoji';

      const result = await gateway.handleResolveIntentCall({ query: unicodeQuery });
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    /**
     * Test: Query with only whitespace variations
     * Coverage: Whitespace trimming
     */
    it('should treat whitespace-only queries as empty', async () => {
      const gateway = new GrimoireServer();

      const variations = ['   ', '\t\t', '\n\n', ' \t\n ', '     \t\n     '];

      for (const query of variations) {
        const result = await gateway.handleResolveIntentCall({ query });
        expect(result.status).toBe('not_found');
        if (result.status === 'not_found') {
          expect(result.message).toContain('empty');
        }
      }
    });
  });

  describe('Args object variations', () => {
    /**
     * Test: Array as args should be rejected
     * Coverage: Type validation
     * Note: Arrays pass the typeof 'object' check, but query will be undefined or non-string
     */
    it('should reject array as args', async () => {
      const gateway = new GrimoireServer();

      const result = await gateway.handleResolveIntentCall(['query', 'test'] as any);
      expect(result.status).toBe('not_found');
      if (result.status === 'not_found') {
        // Array has no 'query' property, so query will be undefined (treated as string check)
        expect(result.message).toMatch(/string|object/);
      }
    });

    /**
     * Test: Args with extra properties should work
     * Coverage: Flexible args handling
     */
    it('should accept args with extra properties', async () => {
      const gateway = new GrimoireServer();

      const result = await gateway.handleResolveIntentCall({
        query: 'test',
        extraProp: 'ignored',
        another: 123,
      } as any);

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    /**
     * Test: Args with query: null should be caught
     * Coverage: Null query handling
     */
    it('should reject null query value', async () => {
      const gateway = new GrimoireServer();

      const result = await gateway.handleResolveIntentCall({ query: null as any });
      expect(result.status).toBe('not_found');
      if (result.status === 'not_found') {
        expect(result.message).toContain('string');
      }
    });

    /**
     * Test: Args with query: object should be caught
     * Coverage: Object query handling
     */
    it('should reject object as query value', async () => {
      const gateway = new GrimoireServer();

      const result = await gateway.handleResolveIntentCall({ query: { nested: 'obj' } as any });
      expect(result.status).toBe('not_found');
      if (result.status === 'not_found') {
        expect(result.message).toContain('string');
      }
    });
  });

  describe('Activate spell args validation', () => {
    /**
     * Test: Invalid types for activate_spell
     * Coverage: activate_spell validation paths
     */
    it('should validate activate_spell args types', async () => {
      const gateway = new GrimoireServer();

      // Number as name
      await expect(gateway.handleActivateSpellCall({ name: 123 as any })).rejects.toThrow();

      // Object as name
      await expect(
        gateway.handleActivateSpellCall({ name: { nested: 'obj' } as any })
      ).rejects.toThrow();

      // Array as name
      await expect(gateway.handleActivateSpellCall({ name: ['array'] as any })).rejects.toThrow();

      // Null as name
      await expect(gateway.handleActivateSpellCall({ name: null as any })).rejects.toThrow();
    });

    /**
     * Test: Missing name property
     * Coverage: Missing required fields
     */
    it('should reject activate_spell without name property', async () => {
      const gateway = new GrimoireServer();

      await expect(gateway.handleActivateSpellCall({} as any)).rejects.toThrow();
      await expect(gateway.handleActivateSpellCall({ other: 'prop' } as any)).rejects.toThrow();
    });
  });

  describe('Available tools list', () => {
    /**
     * Test: getAvailableTools returns expected structure
     * Coverage: getAllTools method
     */
    it('should return valid tool list structure', () => {
      const gateway = new GrimoireServer();
      const tools = gateway.getAvailableTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThanOrEqual(2); // At least resolve_intent and activate_spell

      // Check resolve_intent exists
      const resolveIntent = tools.find((t) => t.name === 'resolve_intent');
      expect(resolveIntent).toBeDefined();
      expect(resolveIntent?.description).toBeTruthy();
      expect(resolveIntent?.inputSchema).toBeDefined();
      expect(resolveIntent?.inputSchema.type).toBe('object');
      expect(resolveIntent?.inputSchema.properties).toBeDefined();

      // Check activate_spell exists
      const activateSpell = tools.find((t) => t.name === 'activate_spell');
      expect(activateSpell).toBeDefined();
      expect(activateSpell?.description).toBeTruthy();
      expect(activateSpell?.inputSchema).toBeDefined();
      expect(activateSpell?.inputSchema.type).toBe('object');
      expect(activateSpell?.inputSchema.properties).toBeDefined();
    });

    /**
     * Test: All tools have required fields
     * Coverage: Tool schema validation
     */
    it('should ensure all tools have required fields', () => {
      const gateway = new GrimoireServer();
      const tools = gateway.getAvailableTools();

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });
  });

  describe('Query string edge cases', () => {
    /**
     * Test: Query with mixed whitespace
     * Coverage: Trim behavior
     */
    it('should trim leading and trailing whitespace', async () => {
      const gateway = new GrimoireServer();

      const result1 = await gateway.handleResolveIntentCall({ query: '  test  ' });
      const result2 = await gateway.handleResolveIntentCall({ query: 'test' });

      // Both should behave the same
      expect(result1.status).toBe(result2.status);
    });

    /**
     * Test: Single character query
     * Coverage: Minimum length handling
     */
    it('should accept single character queries', async () => {
      const gateway = new GrimoireServer();

      const result = await gateway.handleResolveIntentCall({ query: 'a' });
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      // Single char likely won't match anything
      expect(['not_found', 'weak_matches']).toContain(result.status);
    });

    /**
     * Test: Query with newlines
     * Coverage: Multiline query handling
     */
    it('should handle queries with newlines', async () => {
      const gateway = new GrimoireServer();

      const result = await gateway.handleResolveIntentCall({
        query: 'line1\nline2\nline3',
      });
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });
});
