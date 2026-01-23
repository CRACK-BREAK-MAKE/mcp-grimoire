/**
 * Gateway E2E Test: Basic Auth SSE Server
 *
 * PURPOSE:
 * Validates intent resolution and spawning with Basic Auth SSE transport
 * Tests high-confidence auto-spawn (≥0.85) with SSE (Server-Sent Events)
 *
 * MCP SERVER:
 * - Server: servers.basic_auth.sse_server
 * - Port: 8018
 * - Transport: SSE
 * - Auth: Basic (testuser/testpass123)
 * - Tools: create_project, add_task, get_project_status
 *
 * NO MOCKS - Real SSE server, real spell, real gateway
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  setupTestGrimoireDir,
  cleanupTestGrimoireDir,
} from '../../cli/__tests__/helpers/test-path-manager';
import { GrimoireServer } from '../gateway';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from '../../cli/__tests__/helpers/test-server-manager';
import { createCommand, type CreateOptions } from '../../cli/commands/create';

describe('Gateway E2E - Basic Auth SSE', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;

  const serverPort = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_SSE_TIER1; // 8018
  const serverUrl = `http://localhost:${serverPort}/sse`;
  const testSpellName = 'gateway-basic-auth-sse';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = setupTestGrimoireDir('gateway-basic-auth-sse');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start SSE server - it stays running for spell creation (probe) and gateway connection
    serverProcess = await startFastMCPServer('servers.basic_auth.sse_server', serverPort);
    // Wait for server to be fully ready before probe
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const options: CreateOptions = {
      name: testSpellName,
      transport: 'sse',
      url: serverUrl,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD,
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
    await stopServer(serverProcess, serverPort, 'basic_auth_sse_server');
    await cleanupTestGrimoireDir(grimoireDir);
  }, 30000);

  it('should auto-spawn SSE server via resolve_intent with high confidence', async () => {
    const toolsBeforeSpawn = gateway.getAvailableTools();
    expect(toolsBeforeSpawn.length).toBe(2);

    const query = 'upload file list files and get file info for storage';
    const response = await gateway.handleResolveIntentCall({ query });

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);

    const toolsAfterSpawn = gateway.getAvailableTools();
    expect(toolsAfterSpawn.length).toBeGreaterThan(2);

    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('upload_file');
    expect(toolNames).toContain('list_files');
    expect(toolNames).toContain('delete_file');
  });
});
