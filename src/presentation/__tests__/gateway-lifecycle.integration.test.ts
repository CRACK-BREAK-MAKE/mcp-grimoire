/**
 * Gateway Lifecycle Integration Tests
 *
 * Tests turn-based lifecycle management (ADR-0006):
 * - Turn counter incrementing
 * - 5-turn inactivity cleanup
 * - Persistence and orphan cleanup
 * - Real-world e-commerce workflow
 *
 * These tests follow TDD - written BEFORE implementation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';
import { ProcessLifecycleManager } from '../../application/process-lifecycle';
import { EmbeddingStorage } from '../../infrastructure/embedding-storage';
import { ToolRouter } from '../tool-router';
import type { SpellConfig, Tool } from '../../core/types';

describe('Gateway Lifecycle Integration', () => {
  let tempCachePath: string;
  let embeddingStorage: EmbeddingStorage;
  let lifecycle: ProcessLifecycleManager;
  let router: ToolRouter;

  // Mock spell configurations
  const createMockSpellConfig = (name: string, toolNames: string[]): SpellConfig => ({
    name,
    version: '1.0.0',
    description: `Test ${name} server`,
    keywords: [name, 'test', 'mock'],
    server: {
      transport: 'stdio',
      command: 'echo',
      args: ['mock'],
    },
    steering: `Test steering for ${name}`,
  });

  const createMockTools = (spellName: string, toolNames: string[]): Tool[] =>
    toolNames.map((name) => ({
      name,
      description: `${spellName} tool: ${name}`,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    }));

  beforeAll(async () => {
    // Create temp directory for test cache
    const testId = `lifecycle-test-${Date.now()}`;
    tempCachePath = join(tmpdir(), `${testId}.msgpack`);
  });

  afterAll(async () => {
    // Cleanup: Remove test cache file
    try {
      await rm(tempCachePath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Reset for each test
    embeddingStorage = new EmbeddingStorage(tempCachePath);
    await embeddingStorage.load();
    lifecycle = new ProcessLifecycleManager(embeddingStorage);
    router = new ToolRouter();

    // Mock process spawning (we're not testing actual MCP server spawning here)
    vi.spyOn(lifecycle, 'spawn').mockImplementation(async (name: string, config: SpellConfig) => {
      const tools = createMockTools(name, ['tool1', 'tool2']);
      const mockProcess = { pid: Math.floor(Math.random() * 10000), kill: vi.fn() };
      const mockClient = {
        close: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({ content: [] }),
      };

      // Simulate successful spawn by setting internal state
      // @ts-expect-error - Accessing private property for testing
      lifecycle.activeSpells.set(name, {
        name,
        process: mockProcess,
        tools,
        lastUsedTurn: lifecycle.getCurrentTurn(),
      });

      // @ts-expect-error - Accessing private property for testing
      lifecycle.connections.set(name, {
        client: mockClient,
        transport: {} as any,
        process: mockProcess,
      });

      // NOTE: Don't set usageTracking here - spawn() should NOT create usage tracking
      // Usage tracking is only created by markUsed()

      return tools;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Turn Counter', () => {
    it('should start at turn 0', () => {
      expect(lifecycle.getCurrentTurn()).toBe(0);
    });

    it('should increment turn on each call', () => {
      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(1);

      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(2);

      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(3);
    });

    it('should increment turn even when spell already active', async () => {
      const config = createMockSpellConfig('postgres', ['query', 'insert']);

      // First spawn
      await lifecycle.spawn('postgres', config);
      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(1);

      // Try to spawn again (should be no-op but turn increments)
      await lifecycle.spawn('postgres', config);
      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(2);
    });

    it('should track usage on markUsed', async () => {
      const config = createMockSpellConfig('postgres', ['query']);
      await lifecycle.spawn('postgres', config);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed('postgres');

      const usage = lifecycle.getUsageInfo('postgres');
      expect(usage).toEqual({ lastUsedTurn: 1 });

      lifecycle.incrementTurn(); // Turn 2
      lifecycle.incrementTurn(); // Turn 3
      lifecycle.markUsed('postgres');

      const updatedUsage = lifecycle.getUsageInfo('postgres');
      expect(updatedUsage).toEqual({ lastUsedTurn: 3 });
    });
  });

  describe('5-Turn Cleanup (ADR-0006)', () => {
    it('should NOT kill spell used within 5 turns', async () => {
      const config = createMockSpellConfig('postgres', ['query']);
      await lifecycle.spawn('postgres', config);

      // Turn 1-5: Keep using postgres
      for (let i = 1; i <= 5; i++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('postgres');
      }

      // Check for cleanup - should NOT kill postgres
      const inactiveSpells = lifecycle.getInactiveSpells(5);
      expect(inactiveSpells).toHaveLength(0);
      expect(lifecycle.isActive('postgres')).toBe(true);
    });

    it('should kill spell after 6 turns of inactivity', async () => {
      const config = createMockSpellConfig('postgres', ['query']);
      await lifecycle.spawn('postgres', config);

      // Turn 1: Use postgres
      lifecycle.incrementTurn();
      lifecycle.markUsed('postgres');

      // Turn 2-7: Don't use postgres
      for (let i = 2; i <= 7; i++) {
        lifecycle.incrementTurn();
      }

      // At turn 7, postgres last used at turn 1 → 7-1=6 turns idle
      const inactiveSpells = lifecycle.getInactiveSpells(5);
      expect(inactiveSpells).toContain('postgres');

      // Cleanup should kill postgres
      const killedSpells = await lifecycle.cleanupInactive(5);
      expect(killedSpells).toContain('postgres');
      expect(lifecycle.isActive('postgres')).toBe(false);
    });

    it('should kill multiple inactive spells simultaneously', async () => {
      const postgresConfig = createMockSpellConfig('postgres', ['query']);
      const stripeConfig = createMockSpellConfig('stripe', ['charge']);

      await lifecycle.spawn('postgres', postgresConfig);
      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed('postgres');

      await lifecycle.spawn('stripe', stripeConfig);
      lifecycle.incrementTurn(); // Turn 2
      lifecycle.markUsed('stripe');

      // Turn 3-8: Don't use either
      for (let i = 3; i <= 8; i++) {
        lifecycle.incrementTurn();
      }

      // Both should be inactive
      const inactiveSpells = lifecycle.getInactiveSpells(5);
      expect(inactiveSpells).toContain('postgres');
      expect(inactiveSpells).toContain('stripe');

      // Cleanup should kill both
      const killedSpells = await lifecycle.cleanupInactive(5);
      expect(killedSpells).toHaveLength(2);
      expect(killedSpells).toContain('postgres');
      expect(killedSpells).toContain('stripe');
    });

    it('should preserve active spells during cleanup', async () => {
      const postgresConfig = createMockSpellConfig('postgres', ['query']);
      const stripeConfig = createMockSpellConfig('stripe', ['charge']);
      const capJsConfig = createMockSpellConfig('cap-js', ['search']);

      // Turn 1: Spawn postgres
      await lifecycle.spawn('postgres', postgresConfig);
      lifecycle.incrementTurn();
      lifecycle.markUsed('postgres');

      // Turn 2: Spawn stripe
      await lifecycle.spawn('stripe', stripeConfig);
      lifecycle.incrementTurn();
      lifecycle.markUsed('stripe');

      // Turn 3-7: Use stripe only (postgres idle)
      for (let i = 3; i <= 7; i++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('stripe');
      }

      // Turn 8: Spawn cap-js (postgres now 7 turns idle)
      await lifecycle.spawn('cap-js', capJsConfig);
      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');

      // Cleanup should kill postgres but preserve stripe and cap-js
      const killedSpells = await lifecycle.cleanupInactive(5);
      expect(killedSpells).toContain('postgres');
      expect(lifecycle.isActive('postgres')).toBe(false);
      expect(lifecycle.isActive('stripe')).toBe(true);
      expect(lifecycle.isActive('cap-js')).toBe(true);
    });

    it('should handle cleanup of spell with 0 turns (never used)', async () => {
      // This is an edge case - spell spawned but never marked as used
      const config = createMockSpellConfig('postgres', ['query']);

      // Manually add spell without marking used
      await lifecycle.spawn('postgres', config);
      // Don't call markUsed()

      // Advance 6 turns
      for (let i = 1; i <= 6; i++) {
        lifecycle.incrementTurn();
      }

      // Spell was spawned at turn 0, now at turn 6, but never used
      // getInactiveSpells should skip it (no usage tracking entry)
      const inactiveSpells = lifecycle.getInactiveSpells(5);
      expect(inactiveSpells).toHaveLength(0); // No usage entry, so not considered inactive
    });
  });

  describe('Real-World Scenario: E-commerce Workflow', () => {
    it('should replicate ADR-0006 example (14-turn workflow)', async () => {
      const postgresConfig = createMockSpellConfig('postgres', ['query']);
      const stripeConfig = createMockSpellConfig('stripe', ['charge', 'refund']);
      const capJsConfig = createMockSpellConfig('cap-js', ['search_docs', 'deploy']);

      // Turn 1-3: Use postgres
      await lifecycle.spawn('postgres', postgresConfig);
      for (let turn = 1; turn <= 3; turn++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('postgres');
      }
      expect(lifecycle.getCurrentTurn()).toBe(3);
      expect(lifecycle.isActive('postgres')).toBe(true);

      // Turn 4-7: Use stripe (postgres idle 1-4 turns)
      await lifecycle.spawn('stripe', stripeConfig);
      for (let turn = 4; turn <= 7; turn++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('stripe');
      }
      expect(lifecycle.getCurrentTurn()).toBe(7);
      expect(lifecycle.isActive('postgres')).toBe(true); // Still active (only 4 turns idle)
      expect(lifecycle.isActive('stripe')).toBe(true);

      // Turn 8: Spawn cap-js (postgres idle 5 turns)
      await lifecycle.spawn('cap-js', capJsConfig);
      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');
      expect(lifecycle.getCurrentTurn()).toBe(8);

      // Turn 9: Use cap-js, postgres KILLED (6 turns idle)
      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');

      const killedAtTurn9 = await lifecycle.cleanupInactive(5);
      expect(killedAtTurn9).toContain('postgres'); // 9-3=6 turns idle
      expect(lifecycle.isActive('postgres')).toBe(false);
      expect(lifecycle.isActive('stripe')).toBe(true); // 9-7=2 turns idle
      expect(lifecycle.isActive('cap-js')).toBe(true); // Just used

      // Turn 10-13: Continue using cap-js only
      for (let turn = 10; turn <= 13; turn++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('cap-js');
      }
      expect(lifecycle.getCurrentTurn()).toBe(13);

      // Turn 14: Use cap-js, stripe KILLED (7 turns idle)
      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');

      const killedAtTurn14 = await lifecycle.cleanupInactive(5);
      expect(killedAtTurn14).toContain('stripe'); // 14-7=7 turns idle
      expect(lifecycle.isActive('postgres')).toBe(false);
      expect(lifecycle.isActive('stripe')).toBe(false);
      expect(lifecycle.isActive('cap-js')).toBe(true);

      // Result: Started with 3 active spells, ended with 1 (67% reduction)
      expect(lifecycle.getActiveSpellNames()).toEqual(['cap-js']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle tool call errors without breaking turn counter', async () => {
      const config = createMockSpellConfig('postgres', ['query']);
      await lifecycle.spawn('postgres', config);

      // Simulate error during tool call
      lifecycle.incrementTurn();
      // Even if tool call errors, turn should increment
      expect(lifecycle.getCurrentTurn()).toBe(1);

      // Next turn should work normally
      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(2);
    });

    it('should handle rapid sequential activations', async () => {
      const config1 = createMockSpellConfig('postgres', ['query']);
      const config2 = createMockSpellConfig('stripe', ['charge']);
      const config3 = createMockSpellConfig('cap-js', ['search']);

      // Activate 3 spells in quick succession
      await lifecycle.spawn('postgres', config1);
      lifecycle.incrementTurn();
      lifecycle.markUsed('postgres');

      await lifecycle.spawn('stripe', config2);
      lifecycle.incrementTurn();
      lifecycle.markUsed('stripe');

      await lifecycle.spawn('cap-js', config3);
      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');

      // All should be active
      expect(lifecycle.getActiveSpellNames()).toHaveLength(3);
      expect(lifecycle.isActive('postgres')).toBe(true);
      expect(lifecycle.isActive('stripe')).toBe(true);
      expect(lifecycle.isActive('cap-js')).toBe(true);
    });
  });

  describe('Persistence and Orphan Cleanup', () => {
    it('should persist turn counter and usage tracking to disk', async () => {
      const config = createMockSpellConfig('postgres', ['query']);
      await lifecycle.spawn('postgres', config);

      lifecycle.incrementTurn();
      lifecycle.markUsed('postgres');
      lifecycle.incrementTurn();
      lifecycle.incrementTurn();

      expect(lifecycle.getCurrentTurn()).toBe(3);

      // Trigger save (debounced, so wait)
      await new Promise((resolve) => setTimeout(resolve, 6000)); // Wait 6s for 5s debounce

      // Force a final save to ensure data is persisted before we reload
      await embeddingStorage.save();

      // Create new instance to load saved state
      const newEmbeddingStorage = new EmbeddingStorage(tempCachePath);
      await newEmbeddingStorage.load();
      const newLifecycle = new ProcessLifecycleManager(newEmbeddingStorage);
      await newLifecycle.loadFromStorage();

      // Verify state restored
      expect(newLifecycle.getCurrentTurn()).toBe(3);
      const usage = newLifecycle.getUsageInfo('postgres');
      expect(usage).toEqual({ lastUsedTurn: 1 });
    });

    it('should restore state from disk on restart', async () => {
      // First session: Create some state
      const config = createMockSpellConfig('postgres', ['query']);
      await lifecycle.spawn('postgres', config);

      for (let i = 1; i <= 5; i++) {
        lifecycle.incrementTurn();
        if (i % 2 === 0) {
          lifecycle.markUsed('postgres');
        }
      }

      // Wait for debounced save
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Second session: Reload from disk
      const newEmbeddingStorage = new EmbeddingStorage(tempCachePath);
      await newEmbeddingStorage.load();
      const newLifecycle = new ProcessLifecycleManager(newEmbeddingStorage);
      await newLifecycle.loadFromStorage();

      // Verify turn counter restored
      expect(newLifecycle.getCurrentTurn()).toBe(5);

      // Verify usage tracking restored
      const usage = newLifecycle.getUsageInfo('postgres');
      expect(usage?.lastUsedTurn).toBe(4); // Last marked at turn 4
    });

    it('should kill orphaned child processes on startup', async () => {
      // Simulate orphaned PID in storage
      embeddingStorage.updateLifecycleMetadata({
        currentTurn: 10,
        usageTracking: { postgres: { lastUsedTurn: 5 } },
        activePIDs: { postgres: 99999 }, // Fake PID
        lastSaved: Date.now(),
      });
      await embeddingStorage.save();

      // Create new lifecycle instance - should attempt to kill PID 99999
      const newEmbeddingStorage = new EmbeddingStorage(tempCachePath);
      await newEmbeddingStorage.load();
      const newLifecycle = new ProcessLifecycleManager(newEmbeddingStorage);

      // Spy on process.kill - mock to not throw (simulate PID exists)
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

      await newLifecycle.loadFromStorage();

      // Verify kill was attempted
      expect(killSpy).toHaveBeenCalledWith(99999, 0); // Check if exists
      expect(killSpy).toHaveBeenCalledWith(99999); // Kill it

      killSpy.mockRestore();
    });

    it('should handle missing persistence file gracefully (first run)', async () => {
      // Create lifecycle with non-existent cache file
      const nonExistentPath = join(tmpdir(), `non-existent-${Date.now()}.msgpack`);
      const freshStorage = new EmbeddingStorage(nonExistentPath);
      await freshStorage.load(); // Should not throw

      const freshLifecycle = new ProcessLifecycleManager(freshStorage);
      await freshLifecycle.loadFromStorage(); // Should not throw

      // Should start with fresh state
      expect(freshLifecycle.getCurrentTurn()).toBe(0);
      expect(freshLifecycle.getActiveSpellNames()).toHaveLength(0);
    });
  });
});
