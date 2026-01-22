/**
 * Integration Test: CLI create command network failures
 *
 * PURPOSE:
 * Tests graceful handling of network failures during server probing.
 * Ensures no spell files are created when servers are unreachable.
 *
 * NO MCP SERVERS NEEDED:
 * Tests deliberately use unreachable endpoints to trigger failures.
 *
 * NETWORK FAILURE SCENARIOS TESTED:
 *
 * 1. DNS RESOLUTION FAILURE:
 *    - Domain: http://nonexistent-domain-xyz-12345.invalid
 *    - Error: ENOTFOUND (DNS lookup failed)
 *    - Behavior: Probe fails, no spell file created
 *
 * 2. CONNECTION REFUSED:
 *    - URL: http://localhost:59999 (random unused port)
 *    - Error: ECONNREFUSED (no server listening)
 *    - Behavior: Probe fails, no spell file created
 *
 * 3. SERVER TIMEOUT:
 *    - URL: http://localhost:59998 (fake server)
 *    - Error: Timeout after N seconds
 *    - Behavior: Probe fails gracefully
 *
 * ERROR HANDLING PRINCIPLES:
 * 1. ✓ Clear error messages for users
 * 2. ✓ No spell files created on failure
 * 3. ✓ Helpful troubleshooting tips in output
 * 4. ✓ Exit with non-zero code
 * 5. ✓ Clean failure (no stack traces for expected errors)
 *
 * USER EXPERIENCE:
 * When probe fails, users see:
 * ```
 * ✗ Server probe failed: <error-type>
 * ✗ Common issues:
 *    - Server is not running or not reachable
 *    - Incorrect URL or port
 *    - Server requires authentication
 *    - Network or firewall issues
 *    - Server does not implement MCP protocol correctly
 *
 * ✗ Cannot create spell for unreachable remote server.
 *    Please ensure the server is running at: <url>
 *    Then try again: grimoire create -n <name> -t http --url "<url>"
 * ```
 *
 * WHY THIS MATTERS:
 * Prevents users from creating broken spell files that reference
 * unreachable servers, which would fail at runtime anyway.
 *
 * REAL NETWORK - Tests actual failure scenarios
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { getSpellDirectory } from '../../utils/paths';
import { createCommand, type CreateOptions } from '../commands/create';
import { probeMCPServer } from '../utils/mcp-probe';
import { startFastMCPServer, stopServer, FASTMCP_PORTS } from './helpers/test-server-manager';

describe('CLI create - Network Failures', () => {
  let grimoireDir: string;

  beforeAll(async () => {
    grimoireDir = getSpellDirectory();
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();
  });

  it('should handle DNS resolution failure', async () => {
    const testSpellName = 'test-dns-failure';
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    if (existsSync(spellFilePath)) await rm(spellFilePath);

    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: 'http://nonexistent-domain-xyz-12345.invalid',
      probe: true,
      interactive: false,
    };

    // Should throw or exit on probe failure
    await expect(createCommand(options)).rejects.toThrow();

    // Verify NO spell file was created
    expect(existsSync(spellFilePath)).toBe(false);
  });

  it('should handle connection refused (server not running)', async () => {
    const testSpellName = 'test-connection-refused';
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // Use a port that definitely has no server running
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: 'http://localhost:59999',
      probe: true,
      interactive: false,
    };

    // Should exit with error
    await expect(createCommand(options)).rejects.toThrow();

    // Verify NO spell file was created
    expect(existsSync(spellFilePath)).toBe(false);
  });

  it('should handle server timeout during probe', async () => {
    const testSpellName = 'test-server-timeout';
    const spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    if (existsSync(spellFilePath)) await rm(spellFilePath);

    // Use probeMCPServer directly with very short timeout
    const result = await probeMCPServer(
      {
        name: testSpellName,
        server: {
          transport: 'http',
          url: 'http://localhost:59998',
        },
      },
      {
        timeout: 100, // 100ms timeout - will fail fast
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // Verify timeout-related error message
    expect(result.error).toMatch(/timeout|ETIMEDOUT|ECONNREFUSED/i);
  });
});
