/**
 * Gateway E2E Test: CAP.js stdio Server
 *
 * PURPOSE:
 * Validates intent resolution with stdio transport (local command execution)
 * Tests high-confidence auto-spawn (≥0.85) with CAP.js MCP server
 *
 * MCP SERVER:
 * - Package: @cap-js/mcp-server
 * - Transport: stdio
 * - Auth: None (local process)
 * - Domain: SAP CAP/CDS Development
 * - Tools: search_model, search_docs
 *
 * NO MOCKS - Real stdio server, real spell, real gateway
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  setupTestGrimoireDir,
  cleanupTestGrimoireDir,
} from '../../cli/__tests__/helpers/test-path-manager';
import { GrimoireServer } from '../gateway';
import { createCommand, type CreateOptions } from '../../cli/commands/create';

describe('Gateway E2E - CAP.js stdio', () => {
  let gateway: GrimoireServer;

  const testSpellName = 'gateway-stdio-capjs';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = setupTestGrimoireDir('gateway-stdio-capjs');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Create spell for stdio server
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@cap-js/mcp-server'],
      interactive: false,
      probe: true,
    };

    await createCommand(options);
    expect(existsSync(spellFilePath)).toBe(true);

    gateway = new GrimoireServer();
    await gateway.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 60000);

  afterAll(async () => {
    if (gateway) await gateway.shutdown();
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should auto-spawn CAP.js stdio server via resolve_intent', async () => {
    const toolsBeforeSpawn = gateway.getAvailableTools();
    expect(toolsBeforeSpawn.length).toBe(2);

    const query = 'search model and docs for cds cap entities';
    const response = await gateway.handleResolveIntentCall({ query });

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);

    const toolsAfterSpawn = gateway.getAvailableTools();
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('search_model');
    expect(toolNames).toContain('search_docs');
  });
});
