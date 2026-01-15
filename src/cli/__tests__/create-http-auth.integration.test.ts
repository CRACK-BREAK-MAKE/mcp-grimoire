/**
 * Integration tests for CLI create command with HTTP/SSE authentication
 * Tests Bearer token authentication for HTTP/SSE transports
 *
 * See ADR-0012 for Bearer token authentication strategy
 */

import { describe, it, expect, afterAll } from 'vitest';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { createCommand } from '../commands/create';
import { getSpellDirectory } from '../../utils/paths';

describe('CLI create command with HTTP authentication', () => {
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

  it('should create HTTP spell with Bearer token', async () => {
    const spellName = 'test-http-bearer';
    testSpells.push(spellName);

    await createCommand({
      name: spellName,
      transport: 'http',
      url: 'http://localhost:3333/mcp',
      auth: {
        type: 'bearer',
        token: 'test-token-123',
      },
      interactive: false,
      probe: false,
    });

    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    const config = parse(content);

    expect(config.name).toBe(spellName);
    expect(config.server.transport).toBe('http');
    expect(config.server.url).toBe('http://localhost:3333/mcp');
    expect(config.server.auth).toEqual({
      type: 'bearer',
      token: 'test-token-123',
    });
  });

  it('should handle custom headers', async () => {
    const spellName = 'test-http-custom-headers';
    testSpells.push(spellName);

    await createCommand({
      name: spellName,
      transport: 'http',
      url: 'http://localhost:3333/mcp',
      headers: {
        'X-API-Key': 'custom-key',
        'X-Custom-Header': 'custom-value',
      },
      interactive: false,
      probe: false,
    });

    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    const config = parse(content);

    expect(config.server.headers).toEqual({
      'X-API-Key': 'custom-key',
      'X-Custom-Header': 'custom-value',
    });
  });

  it('should expand ${VAR} in Bearer token', async () => {
    const spellName = 'test-http-env-var';
    testSpells.push(spellName);

    process.env.MY_HTTP_TOKEN = 'test-token-123';

    await createCommand({
      name: spellName,
      transport: 'http',
      url: 'http://localhost:3333/mcp',
      auth: {
        type: 'bearer',
        token: '${MY_HTTP_TOKEN}',
      },
      interactive: false,
      probe: false,
    });

    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('${MY_HTTP_TOKEN}');

    delete process.env.MY_HTTP_TOKEN;
  });

  it('should create SSE spell with Bearer token', async () => {
    const spellName = 'test-sse-bearer';
    testSpells.push(spellName);

    await createCommand({
      name: spellName,
      transport: 'sse',
      url: 'http://localhost:3334/sse',
      auth: {
        type: 'bearer',
        token: 'sse-token-456',
      },
      interactive: false,
      probe: false,
    });

    const spellDir = getSpellDirectory();
    const filePath = join(spellDir, `${spellName}.spell.yaml`);
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    const config = parse(content);

    expect(config.server.transport).toBe('sse');
    expect(config.server.auth).toEqual({
      type: 'bearer',
      token: 'sse-token-456',
    });
  });
});
