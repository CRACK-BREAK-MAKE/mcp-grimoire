/**
 * Integration Test: EnvManager Race Condition Detection
 *
 * This test specifically verifies that concurrent writes to the .env file
 * are properly serialized and no data is lost due to race conditions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { EnvManager } from '../env-manager';

describe('EnvManager - Race Condition Tests', () => {
  let testDir: string;
  let envFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await mkdtemp(join(tmpdir(), 'env-race-test-'));
    envFilePath = join(testDir, '.env');
  });

  afterEach(async () => {
    // Clean up
    await rm(testDir, { recursive: true, force: true });
  });

  it('should handle 10 concurrent writes without data loss', async () => {
    const manager = new EnvManager(envFilePath);
    const writeCount = 10;
    const writes: Promise<void>[] = [];

    // Launch 10 concurrent writes with different keys
    for (let i = 0; i < writeCount; i++) {
      writes.push(manager.set(`TEST_KEY_${i}`, `value_${i}`));
    }

    // Wait for all writes to complete
    await Promise.all(writes);

    // Read the file and verify all keys are present
    const content = await readFile(envFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

    // Should have exactly 10 environment variables
    expect(lines.length).toBe(writeCount);

    // Verify each key is present with correct value
    for (let i = 0; i < writeCount; i++) {
      const expectedLine = `TEST_KEY_${i}=value_${i}`;
      expect(lines).toContain(expectedLine);
    }
  });

  it('should handle 50 concurrent writes without data loss', async () => {
    const manager = new EnvManager(envFilePath);
    const writeCount = 50;
    const writes: Promise<void>[] = [];

    // Launch 50 concurrent writes
    for (let i = 0; i < writeCount; i++) {
      writes.push(manager.set(`CONCURRENT_${i}`, `val_${i}`));
    }

    // Wait for all writes
    await Promise.all(writes);

    // Read and verify
    const content = await readFile(envFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

    expect(lines.length).toBe(writeCount);

    for (let i = 0; i < writeCount; i++) {
      const expectedLine = `CONCURRENT_${i}=val_${i}`;
      expect(lines, `Missing: ${expectedLine}`).toContain(expectedLine);
    }
  });

  it('should handle multiple EnvManager instances writing to same file', async () => {
    const writeCount = 20;
    const writes: Promise<void>[] = [];

    // Create multiple instances writing to the same file
    for (let i = 0; i < writeCount; i++) {
      const manager = new EnvManager(envFilePath);
      writes.push(manager.set(`MULTI_INSTANCE_${i}`, `value_${i}`));
    }

    await Promise.all(writes);

    // Verify all writes succeeded
    const content = await readFile(envFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

    expect(lines.length).toBe(writeCount);

    for (let i = 0; i < writeCount; i++) {
      const expectedLine = `MULTI_INSTANCE_${i}=value_${i}`;
      expect(lines, `Missing: ${expectedLine}`).toContain(expectedLine);
    }
  });

  it('should handle concurrent updates to the same key', async () => {
    const manager = new EnvManager(envFilePath);
    const updateCount = 100;
    const writes: Promise<void>[] = [];

    // Write initial value
    await manager.set('SHARED_KEY', 'initial');

    // Launch 100 concurrent updates to the same key
    for (let i = 0; i < updateCount; i++) {
      writes.push(manager.set('SHARED_KEY', `update_${i}`));
    }

    await Promise.all(writes);

    // Verify file has exactly one entry (no duplicates)
    const content = await readFile(envFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.startsWith('SHARED_KEY='));

    expect(lines.length, 'Should have exactly one SHARED_KEY entry').toBe(1);
    expect(lines[0]).toMatch(/^SHARED_KEY=update_\d+$/);
  });

  it('should handle mixed operations: new keys and updates', async () => {
    const manager = new EnvManager(envFilePath);
    const writes: Promise<void>[] = [];

    // Write some initial values
    await manager.set('KEY_A', 'initial_a');
    await manager.set('KEY_B', 'initial_b');
    await manager.set('KEY_C', 'initial_c');

    // Now do concurrent: some updates, some new keys
    for (let i = 0; i < 10; i++) {
      writes.push(manager.set('KEY_A', `updated_a_${i}`)); // Updates
      writes.push(manager.set('KEY_B', `updated_b_${i}`)); // Updates
      writes.push(manager.set(`NEW_KEY_${i}`, `new_value_${i}`)); // New keys
    }

    await Promise.all(writes);

    // Verify: 3 original keys + 10 new keys = 13 total
    const content = await readFile(envFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

    expect(lines.length).toBe(13);

    // Verify no duplicates
    const keyA = lines.filter((line) => line.startsWith('KEY_A='));
    const keyB = lines.filter((line) => line.startsWith('KEY_B='));
    const keyC = lines.filter((line) => line.startsWith('KEY_C='));

    expect(keyA.length, 'KEY_A should appear exactly once').toBe(1);
    expect(keyB.length, 'KEY_B should appear exactly once').toBe(1);
    expect(keyC.length, 'KEY_C should appear exactly once').toBe(1);
  });

  it('should preserve existing content when adding new keys concurrently', async () => {
    const manager = new EnvManager(envFilePath);

    // Write some initial content
    await manager.set('EXISTING_1', 'value1');
    await manager.set('EXISTING_2', 'value2');
    await manager.set('EXISTING_3', 'value3');

    // Verify initial state
    let content = await readFile(envFilePath, 'utf-8');
    expect(content).toContain('EXISTING_1=value1');
    expect(content).toContain('EXISTING_2=value2');
    expect(content).toContain('EXISTING_3=value3');

    // Now add 30 new keys concurrently
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 30; i++) {
      writes.push(manager.set(`NEW_${i}`, `newval_${i}`));
    }

    await Promise.all(writes);

    // Verify existing keys are still there
    content = await readFile(envFilePath, 'utf-8');
    expect(content).toContain('EXISTING_1=value1');
    expect(content).toContain('EXISTING_2=value2');
    expect(content).toContain('EXISTING_3=value3');

    // Verify all new keys are present
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    expect(lines.length).toBe(33); // 3 existing + 30 new

    for (let i = 0; i < 30; i++) {
      expect(content).toContain(`NEW_${i}=newval_${i}`);
    }
  });

  it('should handle stress test: 100 concurrent writes from different instances', async () => {
    const writeCount = 100;
    const writes: Promise<void>[] = [];

    // Simulate what happens in parallel test execution:
    // Multiple test files, each creating a spell, each writing env vars
    for (let i = 0; i < writeCount; i++) {
      const manager = new EnvManager(envFilePath);
      writes.push(manager.set(`STRESS_TEST_${i}`, `stress_value_${i}`));
    }

    await Promise.all(writes);

    // Verify ALL writes succeeded
    const content = await readFile(envFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

    console.log(`\n[RACE TEST] Expected: ${writeCount} variables`);
    console.log(`[RACE TEST] Found: ${lines.length} variables`);

    if (lines.length !== writeCount) {
      console.log('[RACE TEST] MISSING VARIABLES:');
      for (let i = 0; i < writeCount; i++) {
        const expectedLine = `STRESS_TEST_${i}=stress_value_${i}`;
        if (!lines.includes(expectedLine)) {
          console.log(`  - ${expectedLine}`);
        }
      }
    }

    expect(lines.length, `Race condition detected! Lost ${writeCount - lines.length} writes`).toBe(
      writeCount
    );

    // Verify each specific key
    for (let i = 0; i < writeCount; i++) {
      const expectedLine = `STRESS_TEST_${i}=stress_value_${i}`;
      expect(lines, `Missing: ${expectedLine}`).toContain(expectedLine);
    }
  });

  it('should handle realistic integration test scenario: simulating parallel test files', async () => {
    // This simulates what happens in the real integration tests:
    // Multiple test files running in parallel, each creating spells with unique names
    // All writing to the SAME .env file

    const testScenarios = [
      { spell: 'weather-api', vars: { WEATHER_API__API_TOKEN: 'test-api-key-12345' } },
      {
        spell: 'news-aggregator-bearer',
        vars: { NEWS_AGGREGATOR_BEARER__API_TOKEN: 'test-api-key-12345' },
      },
      {
        spell: 'project-manager',
        vars: {
          PROJECT_MANAGER__API_USERNAME: 'testuser',
          PROJECT_MANAGER__API_PASSWORD: 'testpass123',
        },
      },
      {
        spell: 'file-storage-service',
        vars: {
          FILE_STORAGE_SERVICE__API_USERNAME: 'testuser',
          FILE_STORAGE_SERVICE__API_PASSWORD: 'testpass123',
        },
      },
      {
        spell: 'github-mcp-sse',
        vars: { GITHUB_MCP_SSE__X_GITHUB_TOKEN: 'ghp_test1234567890abcdefghijklmnopqrstuvwxyz' },
      },
      {
        spell: 'brave-mcp-sse',
        vars: { BRAVE_MCP_SSE__X_BRAVE_KEY: 'BSA1234567890abcdefghijklmnopqrstuvwxyz' },
      },
      {
        spell: 'github-mcp-http',
        vars: { GITHUB_MCP_HTTP__X_GITHUB_TOKEN: 'ghp_test1234567890abcdefghijklmnopqrstuvwxyz' },
      },
      {
        spell: 'brave-mcp-http',
        vars: { BRAVE_MCP_HTTP__X_BRAVE_KEY: 'BSA1234567890abcdefghijklmnopqrstuvwxyz' },
      },
      {
        spell: 'test-api-key-sse-header',
        vars: { TEST_API_KEY_SSE_HEADER__AUTHORIZATION: 'Bearer test-api-key-12345' },
      },
      { spell: 'ui5-mcp', vars: { UI5_LOG_LVL: 'verbose' } },
      {
        spell: 'test-no-leak-success',
        vars: { TEST_NO_LEAK_SUCCESS__API_TOKEN: 'super-secret-token' },
      },
      {
        spell: 'test-env-placeholder',
        vars: { TEST_ENV_PLACEHOLDER__API_TOKEN: 'literal-secret-value' },
      },
    ];

    const allWrites: Promise<void>[] = [];
    const expectedVars = new Map<string, string>();

    // Simulate parallel test execution: each test creates a new EnvManager instance
    // and writes its variables
    for (const scenario of testScenarios) {
      const manager = new EnvManager(envFilePath);

      for (const [key, value] of Object.entries(scenario.vars)) {
        expectedVars.set(key, value);
        allWrites.push(manager.set(key, value));
      }
    }

    // Wait for all writes to complete (like tests would)
    await Promise.all(allWrites);

    // Read the file and verify EVERY variable is present
    const content = await readFile(envFilePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

    console.log(`\n[INTEGRATION SIMULATION] Expected: ${expectedVars.size} variables`);
    console.log(`[INTEGRATION SIMULATION] Found: ${lines.length} variables`);

    if (lines.length !== expectedVars.size) {
      console.log('[INTEGRATION SIMULATION] MISSING VARIABLES:');
      for (const [key, value] of expectedVars.entries()) {
        const expectedLine = `${key}=${value}`;
        if (!lines.includes(expectedLine)) {
          console.log(`  - ${expectedLine}`);
        }
      }
    }

    expect(
      lines.length,
      `Integration test race condition! Expected ${expectedVars.size} but got ${lines.length}`
    ).toBe(expectedVars.size);

    // Verify each specific variable
    for (const [key, value] of expectedVars.entries()) {
      const expectedLine = `${key}=${value}`;
      expect(lines, `Missing: ${expectedLine}`).toContain(expectedLine);
    }
  });
});
