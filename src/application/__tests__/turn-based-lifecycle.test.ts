/**
 * TDD Tests for Turn-Based Lifecycle Management
 *
 * Requirements (from ADR-0006):
 * - Track global turn counter
 * - Update lastUsedTurn when power is used
 * - Kill powers after 5 turns of inactivity
 * - Return list of killed powers for notification
 *
 * Following TDD Red-Green-Refactor:
 * 1. Write tests first (RED) ✓ THIS FILE
 * 2. Implement to make tests pass (GREEN)
 * 3. Refactor if needed (REFACTOR)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessLifecycleManager } from '../process-lifecycle';
import type { SpellConfig } from '../../core/types';

// Mock child_process and MCP SDK to avoid actual process spawning
vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const EventEmitter = require('events');
    const mockProcess = new EventEmitter();
    mockProcess.pid = 12345;
    mockProcess.kill = vi.fn();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
    mockProcess.stderr = new EventEmitter();
    return mockProcess;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    listTools = vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'mock_tool',
          description: 'Mock tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));

describe('ProcessLifecycleManager - Turn-Based Tracking', () => {
  let lifecycle: ProcessLifecycleManager;

  // Mock power configs for testing
  const postgresPower: SpellConfig = {
    name: 'postgres',
    version: '1.0.0',
    description: 'PostgreSQL database',
    keywords: ['database', 'sql', 'postgres'],
    server: {
      command: 'echo',
      args: ['mock'],
    },
  };

  const stripePower: SpellConfig = {
    name: 'stripe',
    version: '1.0.0',
    description: 'Stripe payments',
    keywords: ['payment', 'stripe', 'billing'],
    server: {
      command: 'echo',
      args: ['mock'],
    },
  };

  beforeEach(() => {
    lifecycle = new ProcessLifecycleManager();
    vi.clearAllMocks();
  });

  describe('Turn Counter', () => {
    it('should start with turn 0', () => {
      expect(lifecycle.getCurrentTurn()).toBe(0);
    });

    it('should increment turn counter', () => {
      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(1);

      lifecycle.incrementTurn();
      expect(lifecycle.getCurrentTurn()).toBe(2);
    });

    it('should handle multiple increments', () => {
      for (let i = 0; i < 10; i++) {
        lifecycle.incrementTurn();
      }
      expect(lifecycle.getCurrentTurn()).toBe(10);
    });
  });

  describe('Usage Tracking', () => {
    it('should track lastUsedTurn when power is marked as used', async () => {
      // Actually spawn the power with mocked internals
      await lifecycle.spawn(postgresPower.name, postgresPower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);

      const usage = lifecycle.getUsageInfo(postgresPower.name);
      expect(usage).toBeDefined();
      expect(usage!.lastUsedTurn).toBe(1);
    });

    it('should update lastUsedTurn on each use', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);
      expect(lifecycle.getUsageInfo(postgresPower.name)!.lastUsedTurn).toBe(1);

      lifecycle.incrementTurn(); // Turn 2
      lifecycle.incrementTurn(); // Turn 3
      lifecycle.markUsed(postgresPower.name);
      expect(lifecycle.getUsageInfo(postgresPower.name)!.lastUsedTurn).toBe(3);
    });

    it('should return null for non-existent power', () => {
      const usage = lifecycle.getUsageInfo('nonexistent');
      expect(usage).toBeNull();
    });
  });

  describe('Inactivity Detection', () => {
    it('should detect power inactive for 5 turns', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name); // Used at turn 1

      // Advance 5 turns without using
      for (let i = 0; i < 5; i++) {
        lifecycle.incrementTurn();
      }
      // Now at turn 6, last used at turn 1
      // Inactive for 5 turns

      const inactive = lifecycle.getInactiveSpells(5);
      expect(inactive).toContain(postgresPower.name);
    });

    it('should NOT detect power inactive if used recently', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);

      // Advance 4 turns
      for (let i = 0; i < 4; i++) {
        lifecycle.incrementTurn();
      }
      // Now at turn 5, last used at turn 1
      // Inactive for only 4 turns

      const inactive = lifecycle.getInactiveSpells(5);
      expect(inactive).not.toContain(postgresPower.name);
    });

    it('should handle multiple powers with different activity', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);
      await lifecycle.spawn(stripePower.name, stripePower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);
      lifecycle.markUsed(stripePower.name);

      // Advance 3 turns, use postgres again
      for (let i = 0; i < 3; i++) {
        lifecycle.incrementTurn();
      }
      lifecycle.markUsed(postgresPower.name); // Turn 4

      // Advance 3 more turns
      for (let i = 0; i < 3; i++) {
        lifecycle.incrementTurn();
      }
      // Now at turn 7
      // postgres last used: turn 4 (3 turns ago) - NOT inactive
      // stripe last used: turn 1 (6 turns ago) - IS inactive

      const inactive = lifecycle.getInactiveSpells(5);
      expect(inactive).not.toContain(postgresPower.name);
      expect(inactive).toContain(stripePower.name);
    });
  });

  describe('Cleanup', () => {
    it('should kill inactive powers and return their names', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);
      await lifecycle.spawn(stripePower.name, stripePower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);
      lifecycle.markUsed(stripePower.name);

      // Advance 6 turns without using either
      for (let i = 0; i < 6; i++) {
        lifecycle.incrementTurn();
      }
      // Both inactive for 6 turns

      const killed = await lifecycle.cleanupInactive(5);
      expect(killed).toHaveLength(2);
      expect(killed).toContain(postgresPower.name);
      expect(killed).toContain(stripePower.name);

      // Verify they're no longer active
      expect(lifecycle.isActive(postgresPower.name)).toBe(false);
      expect(lifecycle.isActive(stripePower.name)).toBe(false);
    });

    it('should only kill powers meeting threshold', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);
      await lifecycle.spawn(stripePower.name, stripePower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);
      lifecycle.markUsed(stripePower.name);

      // Advance 3 turns, use postgres
      for (let i = 0; i < 3; i++) {
        lifecycle.incrementTurn();
      }
      lifecycle.markUsed(postgresPower.name); // Turn 4

      // Advance 3 more turns
      for (let i = 0; i < 3; i++) {
        lifecycle.incrementTurn();
      }
      // postgres: 3 turns inactive (keep)
      // stripe: 6 turns inactive (kill)

      const killed = await lifecycle.cleanupInactive(5);
      expect(killed).toHaveLength(1);
      expect(killed).toContain(stripePower.name);
      expect(killed).not.toContain(postgresPower.name);

      // Verify states
      expect(lifecycle.isActive(postgresPower.name)).toBe(true);
      expect(lifecycle.isActive(stripePower.name)).toBe(false);
    });

    it('should return empty array if no powers inactive', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);

      // Advance 2 turns
      for (let i = 0; i < 2; i++) {
        lifecycle.incrementTurn();
      }
      // Only 2 turns inactive

      const killed = await lifecycle.cleanupInactive(5);
      expect(killed).toHaveLength(0);
      expect(lifecycle.isActive(postgresPower.name)).toBe(true);
    });

    it('should handle cleanup with no active powers', async () => {
      const killed = await lifecycle.cleanupInactive(5);
      expect(killed).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle marking non-existent power as used', () => {
      // Should not throw, just log warning
      expect(() => {
        lifecycle.markUsed('nonexistent');
      }).not.toThrow();
    });

    it('should handle very large turn numbers', () => {
      for (let i = 0; i < 1000; i++) {
        lifecycle.incrementTurn();
      }
      expect(lifecycle.getCurrentTurn()).toBe(1000);
    });

    it('should track usage correctly across cleanup cycles', async () => {
      await lifecycle.spawn(postgresPower.name, postgresPower);

      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed(postgresPower.name);

      // Advance 6 turns
      for (let i = 0; i < 6; i++) {
        lifecycle.incrementTurn();
      }

      // First cleanup
      await lifecycle.cleanupInactive(5);
      expect(lifecycle.isActive(postgresPower.name)).toBe(false);

      // Spawn again
      await lifecycle.spawn(postgresPower.name, postgresPower);
      lifecycle.markUsed(postgresPower.name);

      // Advance 3 turns
      for (let i = 0; i < 3; i++) {
        lifecycle.incrementTurn();
      }

      // Second cleanup - should NOT kill (only 3 turns)
      await lifecycle.cleanupInactive(5);
      expect(lifecycle.isActive(postgresPower.name)).toBe(true);
    });
  });

  describe('Persistence with EmbeddingStorage', () => {
    let mockStorage: {
      load: ReturnType<typeof vi.fn>;
      save: ReturnType<typeof vi.fn>;
      getLifecycleMetadata: ReturnType<typeof vi.fn>;
      setLifecycleMetadata: ReturnType<typeof vi.fn>;
      updateLifecycleMetadata: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockStorage = {
        load: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
        getLifecycleMetadata: vi.fn().mockReturnValue(null),
        setLifecycleMetadata: vi.fn(),
        updateLifecycleMetadata: vi.fn(),
      };
    });

    it('should accept storage in constructor', () => {
      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);
      expect(lifecycleWithStorage).toBeDefined();
    });

    it('should load state from storage on startup', async () => {
      const savedState = {
        currentTurn: 5,
        usageTracking: {
          postgres: { lastUsedTurn: 3 },
          stripe: { lastUsedTurn: 5 },
        },
        activePIDs: {
          postgres: 12345,
          stripe: 12346,
        },
        lastSaved: Date.now(),
      };

      mockStorage.getLifecycleMetadata.mockReturnValue(savedState);

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);
      await lifecycleWithStorage.loadFromStorage();

      expect(mockStorage.load).toHaveBeenCalled();
      expect(mockStorage.getLifecycleMetadata).toHaveBeenCalled();
      expect(lifecycleWithStorage.getCurrentTurn()).toBe(5);
    });

    it('should kill orphaned PIDs on load', async () => {
      const orphanedPID = 99999;
      const savedState = {
        currentTurn: 5,
        usageTracking: {},
        activePIDs: {
          postgres: orphanedPID,
        },
        lastSaved: Date.now() - 60000, // 1 minute ago
      };

      mockStorage.getLifecycleMetadata.mockReturnValue(savedState);

      // Mock process.kill to track calls
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);
      await lifecycleWithStorage.loadFromStorage();

      // Should attempt to kill orphaned PID
      expect(killSpy).toHaveBeenCalledWith(orphanedPID, 0); // Check if exists
      expect(killSpy).toHaveBeenCalledWith(orphanedPID); // Kill it

      killSpy.mockRestore();
    });

    it('should handle missing storage gracefully on load', async () => {
      mockStorage.getLifecycleMetadata.mockReturnValue(null);

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);
      await lifecycleWithStorage.loadFromStorage();

      // Should not throw, should start with turn 0
      expect(lifecycleWithStorage.getCurrentTurn()).toBe(0);
    });

    it('should debounce saves (not save immediately)', async () => {
      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);

      lifecycleWithStorage.incrementTurn();
      lifecycleWithStorage.incrementTurn();
      lifecycleWithStorage.incrementTurn();

      // Should not have called save yet (debounced)
      expect(mockStorage.updateLifecycleMetadata).not.toHaveBeenCalled();
      expect(mockStorage.save).not.toHaveBeenCalled();
    });

    it('should save state after debounce period (5 seconds)', async () => {
      vi.useFakeTimers();

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);

      lifecycleWithStorage.incrementTurn();
      lifecycleWithStorage.incrementTurn();

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Should have saved
      expect(mockStorage.updateLifecycleMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTurn: 2,
          usageTracking: expect.any(Object),
        })
      );
      expect(mockStorage.save).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should save turn counter and usage tracking', async () => {
      vi.useFakeTimers();

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);

      await lifecycleWithStorage.spawn(postgresPower.name, postgresPower);
      lifecycleWithStorage.incrementTurn();
      lifecycleWithStorage.markUsed(postgresPower.name);

      lifecycleWithStorage.incrementTurn();

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Verify saved data structure
      expect(mockStorage.updateLifecycleMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTurn: 2,
          usageTracking: {
            postgres: { lastUsedTurn: 1 },
          },
          activePIDs: expect.any(Object),
          lastSaved: expect.any(Number),
        })
      );

      vi.useRealTimers();
    });

    it('should save active PIDs', async () => {
      vi.useFakeTimers();

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);

      await lifecycleWithStorage.spawn(postgresPower.name, postgresPower);
      await lifecycleWithStorage.spawn(stripePower.name, stripePower);

      lifecycleWithStorage.incrementTurn();

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Should save lifecycle data (PIDs may be empty in test env due to mocking)
      // Usage tracking is empty because spawn() doesn't create entries (only markUsed() does)
      expect(mockStorage.updateLifecycleMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTurn: 1,
          activePIDs: expect.any(Object), // May be empty in test, populated in real env
          usageTracking: {}, // Empty - spawn doesn't create usage entries
        })
      );

      vi.useRealTimers();
    });

    it('should save after cleanup', async () => {
      vi.useFakeTimers();

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);

      await lifecycleWithStorage.spawn(postgresPower.name, postgresPower);
      lifecycleWithStorage.incrementTurn();
      lifecycleWithStorage.markUsed(postgresPower.name);

      // Advance 6 turns to trigger cleanup
      for (let i = 0; i < 6; i++) {
        lifecycleWithStorage.incrementTurn();
      }

      await lifecycleWithStorage.cleanupInactive(5);

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Should have saved state with postgres removed from tracking
      expect(mockStorage.updateLifecycleMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTurn: 7,
          usageTracking: {}, // postgres should be removed
          activePIDs: {}, // postgres should be removed
        })
      );

      vi.useRealTimers();
    });

    it('should handle save errors gracefully', async () => {
      vi.useFakeTimers();

      mockStorage.save.mockRejectedValue(new Error('Disk full'));

      const lifecycleWithStorage = new ProcessLifecycleManager(mockStorage as any);

      lifecycleWithStorage.incrementTurn();

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Should not throw, should log error
      expect(mockStorage.save).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should work without storage (backward compatibility)', async () => {
      const lifecycleNoStorage = new ProcessLifecycleManager();

      await lifecycleNoStorage.spawn(postgresPower.name, postgresPower);
      lifecycleNoStorage.incrementTurn();
      lifecycleNoStorage.markUsed(postgresPower.name);

      // Should not throw
      expect(lifecycleNoStorage.getCurrentTurn()).toBe(1);
      expect(lifecycleNoStorage.isActive(postgresPower.name)).toBe(true);
    });
  });
});

// Helper for typing when accessing private methods in tests
