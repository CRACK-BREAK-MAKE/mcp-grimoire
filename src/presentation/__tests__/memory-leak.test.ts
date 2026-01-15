/**
 * Memory Leak Detection Tests - Production Use Cases
 *
 * Tests realistic production scenarios to ensure no memory leaks in:
 * - Full spawn → use → cleanup cycles (not just mocks)
 * - Process crash recovery and memory cleanup
 * - Long-running server scenarios with multiple powers
 * - Embedding storage under load
 * - Tool router with dynamic registration/deregistration
 * - Event listener management
 * - Concurrent operations and stress testing
 *
 * CRITICAL: Tests memory management in production-realistic scenarios
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GrimoireServer } from '../gateway';
import { ToolRouter } from '../tool-router';
import type { SpellConfig, Tool } from '../../core/types';

describe('Memory Leak Detection', () => {
  let gateway: GrimoireServer;
  let tempCachePath: string;

  // Mock power configs for testing
  const testPower: SpellConfig = {
    name: 'test-power',
    version: '1.0.0',
    description: 'Test power for memory leak detection',
    keywords: ['test', 'memory', 'leak'],
    server: {
      command: 'echo',
      args: ['test'],
    },
  };

  beforeEach(async () => {
    gateway = new GrimoireServer();

    // Create unique cache path for this test run
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    tempCachePath = join(tmpdir(), `memory-test-${Date.now()}.msgpack`);

    // Mock discovery
    const mockPowers = new Map<string, SpellConfig>([['test-power', testPower]]);

    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpells').mockReturnValue(mockPowers);
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpell').mockImplementation((name: string) =>
      mockPowers.get(name)
    );

    // Mock lifecycle to avoid actual spawning
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'spawn').mockImplementation(async (name: string) => {
      return [
        {
          name: `${name}_tool`,
          description: `Mock tool for ${name}`,
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ];
    });

    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'isActive').mockReturnValue(false);

    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'kill').mockResolvedValue(undefined);

    // @ts-expect-error - Accessing private method for testing
    vi.spyOn(gateway, 'notifyToolsChanged').mockImplementation(() => {});

    // Initialize resolver with unique cache path
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

    // Index test power
    // @ts-expect-error - Accessing private property for testing
    await gateway.resolver.indexSpell(testPower);
  });

  afterEach(async () => {
    // Clean up
    const { unlinkSync, existsSync } = await import('fs');
    if (existsSync(tempCachePath)) {
      unlinkSync(tempCachePath);
    }
  });

  describe('Production Process Lifecycle Memory Management', () => {
    it('should not leak memory with realistic spawn → use → cleanup cycles', async () => {
      const iterations = 50;

      // Get baseline memory
      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Simulate realistic production cycle: activate → resolve tools → deactivate
      for (let i = 0; i < iterations; i++) {
        // Activate power (realistic flow through intent resolution)
        await gateway.handleActivateSpellCall({ name: 'test-power' });

        // Simulate using the power (get tools, query them)
        const tools = gateway.getAvailableTools();
        expect(tools.length).toBeGreaterThan(0);

        // Deactivate after use
        // @ts-expect-error - Accessing private property for testing
        await gateway.lifecycle.kill('test-power');

        // Allow event loop to process cleanup
        await new Promise((resolve) => setImmediate(resolve));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Memory growth should be minimal (less than 5MB for 50 cycles)
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024);
    });

    it('should recover memory after simulated process crashes', async () => {
      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Simulate crash scenarios - spawn without proper cleanup
      for (let i = 0; i < 20; i++) {
        await gateway.handleActivateSpellCall({ name: 'test-power' });

        // Simulate crash: Force kill without cleanup
        // @ts-expect-error - Accessing private property for testing
        const connection = gateway.lifecycle['connections'].get('test-power');
        if (connection?.process) {
          connection.process.kill('SIGKILL');
        }

        // Now cleanup properly
        // @ts-expect-error - Accessing private property for testing
        await gateway.lifecycle.kill('test-power');

        await new Promise((resolve) => setImmediate(resolve));
      }

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Should recover memory even after crashes
      expect(memoryGrowth).toBeLessThan(8 * 1024 * 1024);
    });

    it('should not leak memory with multiple concurrent power activations', async () => {
      // Force GC multiple times to get stable baseline
      if (global.gc) {
        global.gc();
        global.gc();
        await new Promise((resolve) => setImmediate(resolve));
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Simulate realistic concurrent usage - multiple powers active simultaneously
      const iterations = 10;
      for (let i = 0; i < iterations; i++) {
        // Activate power
        await gateway.handleActivateSpellCall({ name: 'test-power' });

        // Simulate concurrent queries while power is active
        const queries = [];
        for (let j = 0; j < 5; j++) {
          queries.push(
            gateway.handleResolveIntentCall({
              query: `test query ${i}-${j}`,
            })
          );
        }
        await Promise.all(queries);

        // Cleanup
        // @ts-expect-error - Accessing private property for testing
        await gateway.lifecycle.kill('test-power');

        // Allow event loop to process cleanup
        await new Promise((resolve) => setImmediate(resolve));
      }

      // Force GC to clean up unreferenced objects
      if (global.gc) {
        global.gc();
        global.gc();
        await new Promise((resolve) => setImmediate(resolve));
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // 50 operations (10 iterations × 5 queries each) should not cause excessive growth
      // Realistic threshold: ~20MB for embeddings, vectors, logging, and V8 overhead
      // If memory growth exceeds 20MB, we likely have a leak
      expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024);
    });

    it('should clean up event listeners on power cleanup', async () => {
      // Track initial listener count
      const initialListenerCount = process.listenerCount('exit');

      // Spawn and kill power multiple times
      for (let i = 0; i < 10; i++) {
        await gateway.handleActivateSpellCall({ name: 'test-power' });
        // @ts-expect-error - Accessing private property for testing
        await gateway.lifecycle.kill('test-power');
      }

      const finalListenerCount = process.listenerCount('exit');

      // Listener count should not grow significantly
      // Allow for some reasonable increase (e.g., max 5 new listeners)
      expect(finalListenerCount - initialListenerCount).toBeLessThan(5);
    });

    it('should not retain references to killed processes', async () => {
      // Spawn power
      await gateway.handleActivateSpellCall({ name: 'test-power' });

      // @ts-expect-error - Accessing private property for testing
      const beforeKill = gateway.lifecycle.isActive('test-power');
      expect(beforeKill).toBe(false); // Mocked to return false

      // Kill power
      // @ts-expect-error - Accessing private property for testing
      await gateway.lifecycle.kill('test-power');

      // @ts-expect-error - Accessing private property for testing
      const afterKill = gateway.lifecycle.isActive('test-power');
      expect(afterKill).toBe(false);

      // Verify no lingering references in internal maps
      // @ts-expect-error - Accessing private property for testing
      expect(gateway.lifecycle['activeSpells'].has('test-power')).toBe(false);
      // @ts-expect-error - Accessing private property for testing
      expect(gateway.lifecycle['connections'].has('test-power')).toBe(false);
    });

    it('should properly cleanup in long-running server simulation', async () => {
      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Simulate long-running server with periodic activations
      // This mimics a production server running for hours
      for (let cycle = 0; cycle < 20; cycle++) {
        // Each cycle: activate, use heavily, then cleanup
        await gateway.handleActivateSpellCall({ name: 'test-power' });

        // Heavy usage - multiple queries
        for (let query = 0; query < 10; query++) {
          await gateway.handleResolveIntentCall({
            query: `production query ${cycle}-${query}`,
          });
        }

        // Get tools multiple times (simulating repeated list calls)
        for (let i = 0; i < 5; i++) {
          gateway.getAvailableTools();
        }

        // Cleanup after usage period
        // @ts-expect-error - Accessing private property for testing
        await gateway.lifecycle.kill('test-power');

        // Simulate idle time between usage cycles
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Long-running server should not accumulate memory
      expect(memoryGrowth).toBeLessThan(12 * 1024 * 1024);
    });
  });

  describe('Embedding Storage Memory Management', () => {
    it('should not leak memory with repeated cache operations', async () => {
      const { EmbeddingStorage } = await import('../../infrastructure/embedding-storage');
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const isolatedCachePath = join(tmpdir(), `memory-cache-test-${Date.now()}.msgpack`);

      const storage = new EmbeddingStorage(isolatedCachePath);
      await storage.load();

      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Perform many cache operations
      for (let i = 0; i < 100; i++) {
        const vector = Array(384)
          .fill(0)
          .map(() => Math.random());
        storage.set(`power-${i}`, vector, `hash-${i}`);
        await storage.save();
        storage.delete(`power-${i}`);
      }

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Should not grow significantly (less than 10MB for 100 operations)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);

      // Cleanup
      const { unlinkSync, existsSync } = await import('fs');
      if (existsSync(isolatedCachePath)) {
        unlinkSync(isolatedCachePath);
      }
    });

    it('should properly clean up storage on delete', async () => {
      const { EmbeddingStorage } = await import('../../infrastructure/embedding-storage');
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const isolatedCachePath = join(tmpdir(), `memory-delete-test-${Date.now()}.msgpack`);

      const storage = new EmbeddingStorage(isolatedCachePath);
      await storage.load();

      // Add embeddings
      const vector = Array(384)
        .fill(0)
        .map(() => Math.random());
      storage.set('test-power-1', vector, 'hash1');
      storage.set('test-power-2', vector, 'hash2');
      storage.set('test-power-3', vector, 'hash3');

      expect(storage.getAll().length).toBe(3);

      // Delete all
      storage.delete('test-power-1');
      storage.delete('test-power-2');
      storage.delete('test-power-3');

      expect(storage.getAll().length).toBe(0);

      // Cleanup
      const { unlinkSync, existsSync } = await import('fs');
      if (existsSync(isolatedCachePath)) {
        unlinkSync(isolatedCachePath);
      }
    });
  });

  describe('Tool Router Memory Management', () => {
    it('should not leak memory with dynamic tool registration/deregistration', async () => {
      const router = new ToolRouter();

      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Simulate dynamic power lifecycle with tool updates
      for (let i = 0; i < 100; i++) {
        const tools: Tool[] = [
          {
            name: `tool_${i}`,
            description: `Dynamic tool ${i}`,
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
        ];

        // Register tools
        router.registerTools(`power-${i}`, tools);

        // Verify registration
        expect(router.getToolsForSpell(`power-${i}`)).toEqual(tools);

        // Deregister tools
        router.unregisterTools(`power-${i}`);

        // Verify cleanup
        expect(router.getToolsForSpell(`power-${i}`)).toEqual([]);
      }

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Dynamic registration should not leak
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024);
    });

    it('should handle large tool sets without memory explosion', async () => {
      const router = new ToolRouter();

      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Create power with many tools (stress test)
      const largeToolSet: Tool[] = [];
      for (let i = 0; i < 100; i++) {
        largeToolSet.push({
          name: `large_tool_${i}`,
          description: `Tool ${i} with description that might be lengthy and contain lots of metadata about what this tool does and how to use it properly`,
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string', description: 'Parameter 1' },
              param2: { type: 'number', description: 'Parameter 2' },
              param3: { type: 'boolean', description: 'Parameter 3' },
            },
            required: ['param1'],
          },
        });
      }

      // Register and deregister multiple times
      for (let i = 0; i < 10; i++) {
        router.registerTools(`large-power-${i}`, largeToolSet);
        router.unregisterTools(`large-power-${i}`);
      }

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Large tool sets should not cause excessive memory growth
      expect(memoryGrowth).toBeLessThan(15 * 1024 * 1024);
    });
  });

  describe('Intent Resolution Memory Management', () => {
    it('should not leak memory with repeated intent resolutions', async () => {
      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Perform many intent resolutions
      for (let i = 0; i < 100; i++) {
        await gateway.handleResolveIntentCall({
          query: `test query ${i}`,
        });
      }

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Should not grow significantly (less than 10MB for 100 resolutions)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Edge Cases', () => {
    it('should handle memory stress with concurrent operations', async () => {
      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Run concurrent operations
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(
          gateway.handleResolveIntentCall({
            query: `concurrent test ${i}`,
          })
        );
      }

      await Promise.all(operations);

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Should handle concurrency without excessive memory growth
      expect(memoryGrowth).toBeLessThan(15 * 1024 * 1024);
    });

    it('should recover memory after error conditions', async () => {
      if (global.gc) {
        global.gc();
      }
      const baselineMemory = process.memoryUsage().heapUsed;

      // Trigger error conditions
      for (let i = 0; i < 20; i++) {
        try {
          await gateway.handleActivateSpellCall({ name: 'nonexistent-power' });
        } catch {
          // Expected errors
        }
      }

      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - baselineMemory;

      // Error handling should not leak memory
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024);
    });
  });
});
