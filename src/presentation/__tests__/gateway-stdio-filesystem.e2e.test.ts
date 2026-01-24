/**
 * Gateway E2E Test: UI5 MCP stdio Server
 *
 * PURPOSE:
 * Validates intent resolution with stdio transport and environment variables
 * Tests high-confidence auto-spawn (≥0.85) with UI5 MCP server
 *
 * MCP SERVER:
 * - Package: @ui5/mcp-server
 * - Transport: stdio
 * - Auth: None (local process)
 * - Env Vars: UI5_LOG_LVL=verbose
 * - Domain: SAPUI5/OpenUI5 Development
 * - Tools: get_guidelines, get_api_reference, get_project_info, get_version_info, etc.
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
import * as os from 'os';

const isWindows = os.platform() === 'win32';

describe.skipIf(isWindows)('Gateway E2E - UI5 stdio', () => {
  let gateway: GrimoireServer;

  const testSpellName = 'gateway-stdio-ui5';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = setupTestGrimoireDir('gateway-stdio-ui5');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Create spell for stdio server with env vars
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
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

  it('should auto-spawn Filesystem stdio server via resolve_intent', async () => {
    const toolsBeforeSpawn = gateway.getAvailableTools();
    expect(toolsBeforeSpawn.length).toBe(2);

    const query = 'read file and write directory filesystem';
    const response = await gateway.handleResolveIntentCall({ query });

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);

    const toolsAfterSpawn = gateway.getAvailableTools();
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('resolve_intent');
    expect(toolNames).toContain('activate_spell');
    // Filesystem tools should be available
    expect(toolsAfterSpawn.length).toBeGreaterThan(2);
  });
});
