/**
 * Integration test for CLI create command with environment variables
 * Tests that authenticated MCP servers can be probed and used correctly
 */

import { describe, it, expect, afterAll } from 'vitest';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { createCommand } from '../commands/create';
import { getSpellDirectory } from '../../utils/paths';

describe('CLI create command with environment variables', () => {
  const testSpells: string[] = [];

  afterAll(() => {
    // Cleanup test spells
    const spellDir = getSpellDirectory();
    for (const spellName of testSpells) {
      const filePath = join(spellDir, `${spellName}.spell.yaml`);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
    }
  });

  it('should create spell with environment variables in non-interactive mode', async () => {
    const spellName = 'test-env-spell';
    testSpells.push(spellName);

    await createCommand({
      name: spellName,
      transport: 'stdio',
      command: 'npx',
      args: ['tsx', 'tests/fixtures/test-servers/stdio-auth-test-server.ts'],
      env: {
        TEST_API_KEY: 'test-secret-key-123',
      },
      interactive: false,
      probe: false, // Don't probe in this test - just verify file creation
    });

    // Verify file was created
    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    // Verify content includes environment variables
    const content = readFileSync(filePath, 'utf-8');
    const config = parse(content);

    expect(config.name).toBe(spellName);
    expect(config.server.transport).toBe('stdio');
    expect(config.server.command).toBe('npx');
    expect(config.server.args).toEqual([
      'tsx',
      'tests/fixtures/test-servers/stdio-auth-test-server.ts',
    ]);
    expect(config.server.env).toEqual({
      TEST_API_KEY: 'test-secret-key-123',
    });
  });

  it('should successfully probe authenticated server with correct env var', async () => {
    const spellName = 'test-auth-probe';
    testSpells.push(spellName);

    await createCommand({
      name: spellName,
      transport: 'stdio',
      command: 'npx',
      args: ['tsx', 'tests/fixtures/test-servers/stdio-auth-test-server.ts'],
      env: {
        TEST_API_KEY: 'test-secret-key-123',
      },
      interactive: false,
      probe: true, // Probe to verify authentication works
    });

    // Verify file was created
    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    // Verify content includes auto-generated steering (proof probe succeeded)
    const content = readFileSync(filePath, 'utf-8');
    const config = parse(content);

    expect(config.steering).toBeDefined();
    expect(config.steering).toContain('get_protected_data');
    expect(config.steering).toContain('check_auth_status');
    expect(config.keywords).toContain('get');
    expect(config.keywords).toContain('protected');
  }, 45000); // 45s timeout for probe

  it('should handle environment variable with ${VAR} syntax', async () => {
    const spellName = 'test-env-var-ref';
    testSpells.push(spellName);

    // Set an actual environment variable for this test
    process.env.MY_TEST_KEY = 'test-secret-key-123';

    await createCommand({
      name: spellName,
      transport: 'stdio',
      command: 'npx',
      args: ['tsx', 'tests/fixtures/test-servers/stdio-auth-test-server.ts'],
      env: {
        TEST_API_KEY: '${MY_TEST_KEY}', // Reference to shell environment variable
      },
      interactive: false,
      probe: false,
    });

    // Verify file was created with ${VAR} syntax preserved
    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('${MY_TEST_KEY}');

    // Cleanup
    delete process.env.MY_TEST_KEY;
  });

  it('should create spell without env vars when not provided', async () => {
    const spellName = 'test-no-env';
    testSpells.push(spellName);

    await createCommand({
      name: spellName,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      interactive: false,
      probe: false,
    });

    // Verify file was created
    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    // Verify env section is NOT added if not provided
    const content = readFileSync(filePath, 'utf-8');
    const config = parse(content);

    // env is null because template has env: with only comments (YAML parser behavior)
    expect(config.server.env).toBeNull();
  });

  it('should handle empty env object', async () => {
    const spellName = 'test-empty-env';
    testSpells.push(spellName);

    await createCommand({
      name: spellName,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      env: {}, // Empty object
      interactive: false,
      probe: false,
    });

    // Verify file was created
    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    // Verify env section is NOT added for empty object
    const content = readFileSync(filePath, 'utf-8');
    const config = parse(content);

    // env is null because template has env: with only comments (YAML parser behavior)
    expect(config.server.env).toBeNull();
  });
});
