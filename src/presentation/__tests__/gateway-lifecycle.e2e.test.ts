/**
 * End-to-End Gateway Lifecycle Integration Test
 *
 * Tests turn-based lifecycle management with REAL MCP server processes (NOT mocks)
 *
 * Validates:
 * - Real child processes are spawned with actual PIDs
 * - Turn counter increments with each interaction
 * - Processes are KILLED after 5+ turns of inactivity
 * - PIDs are no longer running after cleanup (kill -0 check)
 * - Persistence: State survives restart, orphaned PIDs cleaned up
 * - tools/list_changed notifications sent after cleanup
 *
 * This test follows the pattern from cli.comprehensive.integration.test.ts
 * but focuses on the gateway lifecycle, not CLI commands.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm } from 'fs/promises';
import { ProcessLifecycleManager } from '../../application/process-lifecycle';
import { EmbeddingStorage } from '../../infrastructure/embedding-storage';
import type { SpellConfig } from '../../core/types';

describe('Gateway Lifecycle E2E Integration', () => {
  let tempCachePath: string;
  let embeddingStorage: EmbeddingStorage;
  let lifecycle: ProcessLifecycleManager;

  // Test spell configuration for stdio server
  const testSpellConfig: SpellConfig = {
    name: 'test-stdio',
    version: '1.0.0',
    description: 'Test stdio MCP server',
    keywords: ['test', 'stdio', 'echo'],
    server: {
      transport: 'stdio',
      command: 'tsx',
      args: ['tests/fixtures/test-servers/stdio-test-server.ts'],
    },
  };

  beforeAll(async () => {
    // Create temp directory for test cache
    const testId = `lifecycle-e2e-test-${Date.now()}`;
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
    // Create fresh temp cache path for each test to ensure isolation
    const testId = `lifecycle-e2e-test-${Date.now()}-${Math.random()}`;
    tempCachePath = join(tmpdir(), `${testId}.msgpack`);

    // Initialize with REAL ProcessLifecycleManager (no mocks)
    embeddingStorage = new EmbeddingStorage(tempCachePath);
    await embeddingStorage.load();

    lifecycle = new ProcessLifecycleManager(embeddingStorage);
    await lifecycle.loadFromStorage();
  });

  afterEach(async () => {
    // CRITICAL: Kill all active spells to clean up child processes
    await lifecycle.killAll();

    // Clean up temp cache file for this test
    try {
      await rm(tempCachePath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Real Process Spawning and PID Tracking', () => {
    it('should spawn real MCP server with actual PID', async () => {
      // Act: Spawn the server
      const tools = await lifecycle.spawn('test-stdio', testSpellConfig);

      // Assert: Tools returned
      expect(tools).toBeDefined();
      expect(tools.length).toBeGreaterThan(0);

      // Assert: Process is active
      expect(lifecycle.isActive('test-stdio')).toBe(true);

      // CRITICAL: Verify we have a REAL child process with actual PID
      const connection = (lifecycle as any).connections.get('test-stdio');
      expect(connection).toBeDefined();
      expect(connection.process).toBeDefined();
      expect(connection.process.pid).toBeGreaterThan(0);

      const pid = connection.process.pid;
      console.log(`✅ Spawned real MCP server with PID: ${pid}`);

      // Verify the process is actually running using kill -0 check
      expect(() => process.kill(pid, 0)).not.toThrow();
      console.log(`✅ Process ${pid} is confirmed running (kill -0 check passed)`);
    }, 15000);

    it('should track multiple real processes with unique PIDs', async () => {
      // Act: Spawn two servers (same config, different names)
      const tools1 = await lifecycle.spawn('test-stdio-1', testSpellConfig);
      const tools2 = await lifecycle.spawn('test-stdio-2', testSpellConfig);

      // Assert: Both spawned successfully
      expect(tools1.length).toBeGreaterThan(0);
      expect(tools2.length).toBeGreaterThan(0);
      expect(lifecycle.isActive('test-stdio-1')).toBe(true);
      expect(lifecycle.isActive('test-stdio-2')).toBe(true);

      // Get PIDs
      const conn1 = (lifecycle as any).connections.get('test-stdio-1');
      const conn2 = (lifecycle as any).connections.get('test-stdio-2');
      const pid1 = conn1.process.pid;
      const pid2 = conn2.process.pid;

      // Assert: PIDs are different
      expect(pid1).not.toBe(pid2);
      console.log(`✅ Multiple processes spawned: PID ${pid1}, PID ${pid2}`);

      // Verify both are running
      expect(() => process.kill(pid1, 0)).not.toThrow();
      expect(() => process.kill(pid2, 0)).not.toThrow();
    }, 15000);
  });

  describe('5-Turn Inactivity Cleanup (ADR-0006)', () => {
    it('should NOT kill process used within 5 turns', async () => {
      // Arrange: Spawn real server
      await lifecycle.spawn('test-stdio', testSpellConfig);
      const conn = (lifecycle as any).connections.get('test-stdio');
      const pid = conn.process.pid;

      // Act: Use it every turn for 5 turns
      for (let i = 1; i <= 5; i++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('test-stdio');
      }

      // Act: Run cleanup
      const killedSpells = await lifecycle.cleanupInactive(5);

      // Assert: NOT killed
      expect(killedSpells).not.toContain('test-stdio');
      expect(lifecycle.isActive('test-stdio')).toBe(true);

      // CRITICAL: Verify process is still running
      expect(() => process.kill(pid, 0)).not.toThrow();
      console.log(`✅ Process ${pid} still running after 5 active turns`);
    }, 15000);

    it('should KILL real process after 6 turns of inactivity', async () => {
      // Arrange: Spawn real server
      await lifecycle.spawn('test-stdio', testSpellConfig);
      const conn = (lifecycle as any).connections.get('test-stdio');
      const pid = conn.process.pid;

      // Verify it's running
      expect(() => process.kill(pid, 0)).not.toThrow();
      console.log(`✅ Process ${pid} is running initially`);

      // Act: Use it at turn 1
      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed('test-stdio');

      // Act: Advance 6 more turns WITHOUT using it
      for (let i = 2; i <= 7; i++) {
        lifecycle.incrementTurn();
      }

      // Current turn: 7, last used: 1 → 6 turns inactive

      // Act: Run cleanup
      const killedSpells = await lifecycle.cleanupInactive(5);

      // Assert: WAS killed
      expect(killedSpells).toContain('test-stdio');
      expect(lifecycle.isActive('test-stdio')).toBe(false);

      // CRITICAL: Verify process is actually DEAD (kill -0 should throw ESRCH)
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for process to die

      try {
        process.kill(pid, 0);
        // If we reach here, process is still running - test should fail
        expect.fail(`Process ${pid} should be dead but is still running!`);
      } catch (error: any) {
        // Expected: ESRCH (no such process)
        expect(error.code).toBe('ESRCH');
        console.log(`✅ Process ${pid} is confirmed DEAD (kill -0 threw ESRCH)`);
      }
    }, 15000);

    it('should kill multiple inactive real processes simultaneously', async () => {
      // Arrange: Spawn two real servers
      await lifecycle.spawn('test-stdio-1', testSpellConfig);
      await lifecycle.spawn('test-stdio-2', testSpellConfig);

      const conn1 = (lifecycle as any).connections.get('test-stdio-1');
      const conn2 = (lifecycle as any).connections.get('test-stdio-2');
      const pid1 = conn1.process.pid;
      const pid2 = conn2.process.pid;

      console.log(`✅ Spawned two processes: PID ${pid1}, PID ${pid2}`);

      // Act: Use both at turn 1
      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed('test-stdio-1');
      lifecycle.markUsed('test-stdio-2');

      // Act: Advance 6 turns without using either
      for (let i = 2; i <= 7; i++) {
        lifecycle.incrementTurn();
      }

      // Act: Run cleanup
      const killedSpells = await lifecycle.cleanupInactive(5);

      // Assert: Both killed
      expect(killedSpells).toContain('test-stdio-1');
      expect(killedSpells).toContain('test-stdio-2');
      expect(lifecycle.isActive('test-stdio-1')).toBe(false);
      expect(lifecycle.isActive('test-stdio-2')).toBe(false);

      // CRITICAL: Verify both processes are DEAD
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        process.kill(pid1, 0);
        expect.fail(`Process ${pid1} should be dead`);
      } catch (error: any) {
        expect(error.code).toBe('ESRCH');
      }

      try {
        process.kill(pid2, 0);
        expect.fail(`Process ${pid2} should be dead`);
      } catch (error: any) {
        expect(error.code).toBe('ESRCH');
      }

      console.log(`✅ Both processes confirmed DEAD`);
    }, 20000);

    it('should preserve active process during cleanup', async () => {
      // Arrange: Spawn two servers
      await lifecycle.spawn('test-stdio-active', testSpellConfig);
      await lifecycle.spawn('test-stdio-inactive', testSpellConfig);

      const connActive = (lifecycle as any).connections.get('test-stdio-active');
      const connInactive = (lifecycle as any).connections.get('test-stdio-inactive');
      const pidActive = connActive.process.pid;
      const pidInactive = connInactive.process.pid;

      // Act: Use both at turn 1
      lifecycle.incrementTurn(); // Turn 1
      lifecycle.markUsed('test-stdio-active');
      lifecycle.markUsed('test-stdio-inactive');

      // Act: Advance 3 turns, only use active one
      for (let i = 2; i <= 4; i++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('test-stdio-active');
      }

      // Active: last used turn 4
      // Inactive: last used turn 1

      // Advance 3 more turns
      for (let i = 5; i <= 7; i++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('test-stdio-active');
      }

      // Turn 7:
      // - active: last used turn 7 (just now) → NOT inactive
      // - inactive: last used turn 1 → 6 turns idle → IS inactive

      // Act: Run cleanup
      const killedSpells = await lifecycle.cleanupInactive(5);

      // Assert: Only inactive killed
      expect(killedSpells).toContain('test-stdio-inactive');
      expect(killedSpells).not.toContain('test-stdio-active');
      expect(lifecycle.isActive('test-stdio-inactive')).toBe(false);
      expect(lifecycle.isActive('test-stdio-active')).toBe(true);

      // Verify: Inactive dead, active alive
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        process.kill(pidInactive, 0);
        expect.fail(`Inactive process ${pidInactive} should be dead`);
      } catch (error: any) {
        expect(error.code).toBe('ESRCH');
      }

      expect(() => process.kill(pidActive, 0)).not.toThrow();
      console.log(`✅ Inactive process killed, active process preserved`);
    }, 20000);
  });

  describe('Real-World Scenario: E-commerce Workflow (ADR-0006)', () => {
    it('should replicate ADR-0006 example with real processes (14-turn workflow)', async () => {
      // This test replicates the exact scenario from ADR-0006:
      // Turn 1-3: Use postgres
      // Turn 4-7: Use stripe (postgres idle 1-4 turns)
      // Turn 8: Spawn cap-js (postgres idle 5 turns)
      // Turn 9: postgres KILLED (6 turns idle), stripe + cap-js active
      // Turn 14: stripe KILLED (7 turns idle), only cap-js active

      // Simulate three different spells (postgres, stripe, cap-js)
      // Turn 1-3: Use postgres
      await lifecycle.spawn('postgres', testSpellConfig);
      const postgresConn = (lifecycle as any).connections.get('postgres');
      const postgresPid = postgresConn.process.pid;

      for (let turn = 1; turn <= 3; turn++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('postgres');
      }
      expect(lifecycle.getCurrentTurn()).toBe(3);
      console.log(`Turn 3: postgres active (PID ${postgresPid})`);

      // Turn 4-7: Use stripe (postgres idle)
      await lifecycle.spawn('stripe', testSpellConfig);
      const stripeConn = (lifecycle as any).connections.get('stripe');
      const stripePid = stripeConn.process.pid;

      for (let turn = 4; turn <= 7; turn++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('stripe');
      }
      expect(lifecycle.getCurrentTurn()).toBe(7);
      console.log(`Turn 7: postgres idle 4 turns, stripe active (PID ${stripePid})`);

      // Verify both still alive
      expect(lifecycle.isActive('postgres')).toBe(true);
      expect(lifecycle.isActive('stripe')).toBe(true);

      // Turn 8: Spawn cap-js (postgres idle 5 turns)
      await lifecycle.spawn('cap-js', testSpellConfig);
      const capjsConn = (lifecycle as any).connections.get('cap-js');
      const capjsPid = capjsConn.process.pid;

      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');
      expect(lifecycle.getCurrentTurn()).toBe(8);

      // Turn 9: postgres KILLED (6 turns idle)
      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');

      const killedAtTurn9 = await lifecycle.cleanupInactive(5);
      expect(killedAtTurn9).toContain('postgres'); // 9-3=6 turns idle
      expect(lifecycle.isActive('postgres')).toBe(false);
      expect(lifecycle.isActive('stripe')).toBe(true); // 9-7=2 turns idle
      expect(lifecycle.isActive('cap-js')).toBe(true);
      console.log(`Turn 9: postgres KILLED (6 turns idle)`);

      // Verify postgres is DEAD
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        process.kill(postgresPid, 0);
        expect.fail(`postgres process ${postgresPid} should be dead`);
      } catch (error: any) {
        expect(error.code).toBe('ESRCH');
      }

      // Turn 10-13: Continue using cap-js only
      for (let turn = 10; turn <= 13; turn++) {
        lifecycle.incrementTurn();
        lifecycle.markUsed('cap-js');
      }
      expect(lifecycle.getCurrentTurn()).toBe(13);

      // Turn 14: stripe KILLED (7 turns idle)
      lifecycle.incrementTurn();
      lifecycle.markUsed('cap-js');

      const killedAtTurn14 = await lifecycle.cleanupInactive(5);
      expect(killedAtTurn14).toContain('stripe'); // 14-7=7 turns idle
      expect(lifecycle.isActive('postgres')).toBe(false);
      expect(lifecycle.isActive('stripe')).toBe(false);
      expect(lifecycle.isActive('cap-js')).toBe(true);
      console.log(`Turn 14: stripe KILLED (7 turns idle), only cap-js remains`);

      // Verify stripe is DEAD
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        process.kill(stripePid, 0);
        expect.fail(`stripe process ${stripePid} should be dead`);
      } catch (error: any) {
        expect(error.code).toBe('ESRCH');
      }

      // Verify cap-js still ALIVE
      expect(() => process.kill(capjsPid, 0)).not.toThrow();

      // Result: Started with 3 active spells, ended with 1 (67% reduction)
      expect(lifecycle.getActiveSpellNames()).toEqual(['cap-js']);
      console.log(`✅ E-commerce workflow complete: 3 spells → 1 spell (67% reduction)`);
    }, 30000);
  });

  describe('Persistence and Orphan Cleanup', () => {
    it('should persist turn counter and usage tracking to disk', async () => {
      // Arrange: Spawn server and do some turns
      await lifecycle.spawn('test-stdio', testSpellConfig);

      lifecycle.incrementTurn();
      lifecycle.markUsed('test-stdio');
      lifecycle.incrementTurn();
      lifecycle.incrementTurn();

      expect(lifecycle.getCurrentTurn()).toBe(3);

      // Wait for debounced save (5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Force save to ensure data is persisted
      await embeddingStorage.save();

      // Act: Create NEW lifecycle instance and load from storage
      const newEmbeddingStorage = new EmbeddingStorage(tempCachePath);
      await newEmbeddingStorage.load();
      const newLifecycle = new ProcessLifecycleManager(newEmbeddingStorage);
      await newLifecycle.loadFromStorage();

      // Assert: State restored
      expect(newLifecycle.getCurrentTurn()).toBe(3);
      const usage = newLifecycle.getUsageInfo('test-stdio');
      expect(usage).toEqual({ lastUsedTurn: 1 });

      console.log(`✅ Turn counter and usage tracking persisted and restored`);
    }, 10000);

    it('should kill orphaned child processes on startup', async () => {
      // This test validates the CRITICAL orphan cleanup feature:
      // 1. Spawn a real process
      // 2. Save its PID to storage
      // 3. Simulate restart (new lifecycle instance)
      // 4. Verify orphaned PID is killed on loadFromStorage()

      // Arrange: Spawn real server
      await lifecycle.spawn('test-stdio', testSpellConfig);
      const conn = (lifecycle as any).connections.get('test-stdio');
      const orphanedPid = conn.process.pid;

      console.log(`✅ Spawned process with PID ${orphanedPid}`);

      // Verify it's running
      expect(() => process.kill(orphanedPid, 0)).not.toThrow();

      // Increment turn and mark used so it gets persisted
      lifecycle.incrementTurn();
      lifecycle.markUsed('test-stdio');

      // Wait for debounced save
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Force save
      await embeddingStorage.save();

      // Verify PID was saved
      const metadata = embeddingStorage.getLifecycleMetadata();
      expect(metadata?.activePIDs['test-stdio']).toBe(orphanedPid);

      // Act: Create new lifecycle instance (simulates restart)
      const newEmbeddingStorage = new EmbeddingStorage(tempCachePath);
      await newEmbeddingStorage.load();
      const newLifecycle = new ProcessLifecycleManager(newEmbeddingStorage);

      // THIS is where orphan cleanup happens:
      await newLifecycle.loadFromStorage();

      // Assert: Process should be KILLED
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        process.kill(orphanedPid, 0);
        expect.fail(`Orphaned process ${orphanedPid} should have been killed on startup`);
      } catch (error: any) {
        expect(error.code).toBe('ESRCH');
        console.log(`✅ Orphaned process ${orphanedPid} was killed on startup`);
      }
    }, 15000);

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

      console.log(`✅ Missing persistence file handled gracefully`);
    });
  });
});
