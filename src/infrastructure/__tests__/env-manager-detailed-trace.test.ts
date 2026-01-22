/**
 * Detailed trace test to understand the exact flow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { EnvManager } from '../env-manager';

describe('EnvManager - Detailed Trace', () => {
  let testDir: string;
  let envFilePath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'env-trace-'));
    envFilePath = join(testDir, '.env');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should trace the exact flow of create command simulation', async () => {
    console.log('\n[TRACE] Starting simulation of create command flow');

    // Simulate what basic-auth-http test does
    const projectManagerVars = {
      PROJECT_MANAGER__API_USERNAME: 'testuser',
      PROJECT_MANAGER__API_PASSWORD: 'testpass123',
    };

    console.log('[TRACE] Test 1: Creating EnvManager for project-manager');
    const manager1 = new EnvManager(envFilePath);
    console.log('[TRACE] Test 1: Calling load()');
    await manager1.load();

    console.log('[TRACE] Test 1: Writing variables:', Object.keys(projectManagerVars));
    for (const [key, value] of Object.entries(projectManagerVars)) {
      console.log(`[TRACE] Test 1: Setting ${key}=${value}`);
      await manager1.set(key, value);
      console.log(`[TRACE] Test 1: Completed ${key}`);
    }

    // Read file to verify
    let content = await readFile(envFilePath, 'utf-8');
    console.log('[TRACE] File after Test 1:');
    console.log(content);

    // Now simulate api-key-sse test writing at the same time
    const newsAggregatorVars = {
      NEWS_AGGREGATOR_BEARER__API_TOKEN: 'test-api-key-12345',
    };

    console.log('[TRACE] Test 2: Creating EnvManager for news-aggregator');
    const manager2 = new EnvManager(envFilePath);
    console.log('[TRACE] Test 2: Calling load()');
    await manager2.load();

    console.log('[TRACE] Test 2: Writing variables:', Object.keys(newsAggregatorVars));
    for (const [key, value] of Object.entries(newsAggregatorVars)) {
      console.log(`[TRACE] Test 2: Setting ${key}=${value}`);
      await manager2.set(key, value);
      console.log(`[TRACE] Test 2: Completed ${key}`);
    }

    content = await readFile(envFilePath, 'utf-8');
    console.log('[TRACE] File after Test 2:');
    console.log(content);

    // Now verify all variables are present
    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    console.log('[TRACE] Total lines:', lines.length);
    console.log('[TRACE] Lines:', lines);

    expect(lines).toContain('PROJECT_MANAGER__API_USERNAME=testuser');
    expect(lines).toContain('PROJECT_MANAGER__API_PASSWORD=testpass123');
    expect(lines).toContain('NEWS_AGGREGATOR_BEARER__API_TOKEN=test-api-key-12345');
  });

  it('should trace concurrent writes in detail', async () => {
    console.log('\n[TRACE CONCURRENT] Starting concurrent write simulation');

    const writes: Array<Promise<void>> = [];
    const vars = [
      { spell: 'test1', key: 'TEST1__VAR', value: 'value1' },
      { spell: 'test2', key: 'TEST2__VAR', value: 'value2' },
      { spell: 'test3', key: 'TEST3__USERNAME', value: 'user3' },
      { spell: 'test3', key: 'TEST3__PASSWORD', value: 'pass3' },
    ];

    for (const { spell, key, value } of vars) {
      const promise = (async () => {
        console.log(`[TRACE CONCURRENT] ${spell}: Creating manager`);
        const manager = new EnvManager(envFilePath);
        console.log(`[TRACE CONCURRENT] ${spell}: Loading`);
        await manager.load();
        console.log(`[TRACE CONCURRENT] ${spell}: Setting ${key}`);
        await manager.set(key, value);
        console.log(`[TRACE CONCURRENT] ${spell}: Done ${key}`);
      })();

      writes.push(promise);
    }

    await Promise.all(writes);

    const content = await readFile(envFilePath, 'utf-8');
    console.log('[TRACE CONCURRENT] Final file content:');
    console.log(content);

    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    console.log('[TRACE CONCURRENT] Total variables:', lines.length);

    expect(lines.length).toBe(4);
    expect(lines).toContain('TEST1__VAR=value1');
    expect(lines).toContain('TEST2__VAR=value2');
    expect(lines).toContain('TEST3__USERNAME=user3');
    expect(lines).toContain('TEST3__PASSWORD=pass3');
  });
});
