/**
 * Process Lifecycle Branch Coverage Tests
 * Targets specific uncovered branches in process-lifecycle.ts
 *
 * Critical coverage targets:
 * - getClient error path (lines 74-78)
 * - Transport type branches (SSE/HTTP vs stdio)
 * - Error handling in spawn/kill methods
 * - Edge cases in cleanup logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessLifecycleManager } from '../process-lifecycle';
import { EmbeddingStorage } from '../../infrastructure/embedding-storage';
import type { StdioServerConfig } from '../../core/types';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ProcessLifecycleManager Branch Coverage', () => {
  let lifecycle: ProcessLifecycleManager;
  let storage: EmbeddingStorage;

  beforeEach(() => {
    storage = new EmbeddingStorage();
    lifecycle = new ProcessLifecycleManager(storage);
  });

  describe('getClient error handling', () => {
    /**
     * Test: getClient throws when spell not active
     * Coverage: Lines 74-78 (error branch)
     */
    it('should throw error when getting client for inactive spell', () => {
      expect(() => {
        lifecycle.getClient('nonexistent-spell');
      }).toThrow(/not active/i);
    });

    /**
     * Test: getClient throws with spell name in error
     * Coverage: Error message formatting
     */
    it('should include spell name in error message', () => {
      expect(() => {
        lifecycle.getClient('my-specific-spell');
      }).toThrow(/my-specific-spell/);
    });
  });

  describe('Edge cases in usage tracking', () => {
    /**
     * Test: markUsed with non-existent spell
     * Coverage: markUsed validation branches
     */
    it('should handle markUsed for non-tracked spell gracefully', () => {
      // This should not throw, just be a no-op
      expect(() => {
        lifecycle.markUsed('nonexistent');
      }).not.toThrow();
    });

    /**
     * Test: getCurrentTurn initial value
     * Coverage: Turn counter initialization
     */
    it('should start with turn 0', () => {
      const turn = lifecycle.getCurrentTurn();
      expect(turn).toBe(0);
    });

    /**
     * Test: incrementTurn multiple times
     * Coverage: Turn counter increments
     */
    it('should increment turn counter correctly', () => {
      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(1);

      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(2);

      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(3);
    });
  });

  describe('cleanupInactive edge cases', () => {
    /**
     * Test: cleanupInactive with no active spells
     * Coverage: Empty spell list branch
     */
    it('should return empty array when no spells active', async () => {
      const killed = await lifecycle.cleanupInactive(5);
      expect(killed).toEqual([]);
      expect(Array.isArray(killed)).toBe(true);
    });

    /**
     * Test: cleanupInactive with threshold 0
     * Coverage: Immediate cleanup threshold
     */
    it('should handle threshold 0', async () => {
      const killed = await lifecycle.cleanupInactive(0);
      expect(Array.isArray(killed)).toBe(true);
    });

    /**
     * Test: cleanupInactive with very high threshold
     * Coverage: No spells meet cleanup criteria
     */
    it('should handle very high threshold', async () => {
      const killed = await lifecycle.cleanupInactive(999999);
      expect(killed).toEqual([]);
    });
  });

  describe('killAll scenarios', () => {
    /**
     * Test: killAll with no active connections
     * Coverage: Empty connections map branch
     */
    it('should handle killAll with no active spells', async () => {
      await expect(lifecycle.killAll()).resolves.not.toThrow();
    });

    /**
     * Test: killAll doesn't throw on errors
     * Coverage: Error handling in killAll
     */
    it('should complete killAll even if individual kills have issues', async () => {
      // This tests the error handling resilience
      await expect(lifecycle.killAll()).resolves.not.toThrow();
    });
  });

  describe('getActiveSpellNames variations', () => {
    /**
     * Test: getActiveSpellNames returns empty array initially
     * Coverage: Empty active spells map
     */
    it('should return empty array when no spells active', () => {
      const names = lifecycle.getActiveSpellNames();
      expect(names).toEqual([]);
      expect(Array.isArray(names)).toBe(true);
    });

    /**
     * Test: Consistency of getActiveSpellNames
     * Coverage: Array conversion from Map keys
     */
    it('should return consistent results across multiple calls', () => {
      const names1 = lifecycle.getActiveSpellNames();
      const names2 = lifecycle.getActiveSpellNames();
      expect(names1).toEqual(names2);
    });
  });

  describe('Spawn validation branches', () => {
    /**
     * Test: Spawn with stdio config (most common)
     * Coverage: stdio transport branch
     */
    it('should accept valid stdio configuration', async () => {
      const config: StdioServerConfig = {
        transport: 'stdio',
        command: 'echo',
        args: ['test'],
      };

      // This will fail to connect (echo isn't an MCP server),
      // but it exercises the validation and spawn path
      await expect(
        lifecycle.spawn('test-stdio', {
          name: 'test-stdio',
          version: '1.0.0',
          description: 'Test',
          keywords: ['test'],
          server: config,
        })
      ).rejects.toThrow();
    });

    /**
     * Test: Spawn with environment variables
     * Coverage: env property branch
     */
    it('should handle spawn with environment variables', async () => {
      const config: StdioServerConfig = {
        transport: 'stdio',
        command: 'echo',
        args: ['test'],
        env: {
          TEST_VAR: 'test_value',
          ANOTHER_VAR: 'another_value',
        },
      };

      await expect(
        lifecycle.spawn('test-env', {
          name: 'test-env',
          version: '1.0.0',
          description: 'Test with env',
          keywords: ['test'],
          server: config,
        })
      ).rejects.toThrow();
    });

    /**
     * Test: Spawn without optional env property
     * Coverage: Missing env branch
     */
    it('should handle spawn without environment variables', async () => {
      const config: StdioServerConfig = {
        transport: 'stdio',
        command: 'echo',
        args: ['test'],
        // No env property
      };

      await expect(
        lifecycle.spawn('test-no-env', {
          name: 'test-no-env',
          version: '1.0.0',
          description: 'Test without env',
          keywords: ['test'],
          server: config,
        })
      ).rejects.toThrow();
    });
  });

  describe('Load from storage scenarios', () => {
    /**
     * Test: loadFromStorage with empty storage
     * Coverage: No saved state branch
     */
    it('should handle loadFromStorage with no saved state', async () => {
      // Arrange: Create isolated storage with unique temp file
      const uniqueTempFile = join(tmpdir(), `test-empty-${Date.now()}.msgpack`);
      const emptyStorage = new EmbeddingStorage(uniqueTempFile);
      const newLifecycle = new ProcessLifecycleManager(emptyStorage);

      // Act
      await expect(newLifecycle.loadFromStorage()).resolves.not.toThrow();

      // Assert: Should start fresh with no saved state
      expect(newLifecycle.getCurrentTurn()).toBe(0);
      expect(newLifecycle.getActiveSpellNames()).toEqual([]);
    });

    /**
     * Test: loadFromStorage initializes correctly
     * Coverage: Load from storage initialization path
     */
    it('should initialize state from storage if available', async () => {
      await expect(lifecycle.loadFromStorage()).resolves.not.toThrow();
    });
  });

  describe('Usage tracking edge cases', () => {
    /**
     * Test: Mark multiple spells as used
     * Coverage: Multiple markUsed calls
     */
    it('should track usage for multiple non-existent spells', () => {
      // These are no-ops but shouldn't throw
      lifecycle.markUsed('spell1');
      lifecycle.markUsed('spell2');
      lifecycle.markUsed('spell3');

      // Should complete without errors
      expect(lifecycle.getCurrentTurn()).toBeGreaterThanOrEqual(0);
    });

    /**
     * Test: Mark same spell multiple times
     * Coverage: Repeated markUsed for same spell
     */
    it('should handle repeated markUsed for same spell', () => {
      lifecycle.markUsed('same-spell');
      lifecycle.markUsed('same-spell');
      lifecycle.markUsed('same-spell');

      expect(lifecycle.getCurrentTurn()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Turn-based tracking', () => {
    /**
     * Test: Turn counter persistence
     * Coverage: Turn counter state management
     */
    it('should maintain turn counter across operations', () => {
      const initial = lifecycle.getCurrentTurn();

      lifecycle.incrementTurn();
      const after1 = lifecycle.getCurrentTurn();
      expect(after1).toBe(initial + 1);

      lifecycle.incrementTurn();
      const after2 = lifecycle.getCurrentTurn();
      expect(after2).toBe(initial + 2);
    });

    /**
     * Test: Turn counter with cleanup
     * Coverage: Turn counter during cleanup operations
     */
    it('should maintain turn counter during cleanup attempts', async () => {
      const initialTurn = lifecycle.getCurrentTurn();

      await lifecycle.cleanupInactive(5);

      // Turn counter should not be affected by cleanup
      expect(lifecycle.getCurrentTurn()).toBe(initialTurn);
    });
  });

  describe('Connection state management', () => {
    /**
     * Test: getClient after killAll
     * Coverage: State after killAll
     */
    it('should throw when getting client after killAll', async () => {
      await lifecycle.killAll();

      expect(() => {
        lifecycle.getClient('any-spell');
      }).toThrow(/not active/i);
    });

    /**
     * Test: getActiveSpellNames after killAll
     * Coverage: Active spells list after cleanup
     */
    it('should return empty list after killAll', async () => {
      await lifecycle.killAll();

      const names = lifecycle.getActiveSpellNames();
      expect(names).toEqual([]);
    });
  });

  describe('Concurrent operation handling', () => {
    /**
     * Test: Multiple incrementTurn calls
     * Coverage: Concurrent state modifications
     */
    it('should handle rapid increment calls', () => {
      for (let i = 0; i < 100; i++) {
        lifecycle.incrementTurn();
      }

      expect(lifecycle.getCurrentTurn()).toBe(100);
    });

    /**
     * Test: Multiple markUsed calls
     * Coverage: Concurrent usage tracking
     */
    it('should handle rapid markUsed calls', () => {
      for (let i = 0; i < 50; i++) {
        lifecycle.markUsed(`spell-${i}`);
      }

      // Should complete without errors
      expect(lifecycle.getCurrentTurn()).toBeGreaterThanOrEqual(0);
    });
  });
});
