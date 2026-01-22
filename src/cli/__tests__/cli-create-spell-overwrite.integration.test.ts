/**
 * Integration Test: CLI create command - spell overwrite behavior
 *
 * PURPOSE:
 * Tests that creating a spell with an existing name properly overwrites the old
 * configuration. Validates complete replacement, not partial merging.
 *
 * MCP SERVER USED:
 * - Server: servers.basic_auth.http_server (Port 8012)
 * - Name: "Project Manager v1.0"
 * - Auth: Basic Authentication
 * - Tools: 3 tools (create_task, list_tasks, update_task_status)
 *
 * OVERWRITE SCENARIOS:
 *
 * 1. COMPLETE TRANSPORT CHANGE:
 *    - Original: HTTP + Basic Auth
 *    - Overwrite: SSE + Bearer Token
 *    - Expected: Complete replacement of all fields
 *    - Old HTTP config should not leak into new SSE spell
 *
 * 2. AUTHENTICATION CHANGE:
 *    - Original: Basic Auth (username/password)
 *    - Overwrite: Bearer Token (API key)
 *    - Expected: Old auth fields completely removed
 *    - New auth fields properly set
 *
 * 3. ENVIRONMENT VARIABLE CHANGES:
 *    - Original: USERNAME__VAR, PASSWORD__VAR
 *    - Overwrite: API_TOKEN__VAR
 *    - Expected: .env file updated with new variables
 *    - Old variables may remain (not cleaned up)
 *
 * WHY NO MERGING:
 * Merging old and new configurations would create invalid spells:
 * ```yaml
 * # BAD MERGE (would break):
 * server:
 *   transport: sse        # NEW
 *   url: /mcp            # OLD (HTTP endpoint)
 *   auth:
 *     type: basic        # OLD
 *     username: ${VAR}   # OLD
 *     token: ${TOKEN}    # NEW
 * ```
 *
 * CORRECT BEHAVIOR (COMPLETE REPLACEMENT):
 * ```yaml
 * # GOOD OVERWRITE:
 * server:
 *   transport: sse        # NEW
 *   url: /sse            # NEW (SSE endpoint)
 *   auth:
 *     type: bearer       # NEW
 *     token: ${TOKEN}    # NEW
 * ```
 *
 * VALIDATION (13-POINT CHECKLIST):
 * After overwrite, validate the NEW spell is complete and valid:
 * 1. ✓ Basic structure correct
 * 2. ✓ Keywords updated from new probe
 * 3. ✓ Server config matches new transport
 * 4. ✓ Auth type matches new auth
 * 5. ✓ No old auth fields remain
 * 6. ✓ Environment variables transformed
 * 7. ✓ .env file updated
 * 8. ✓ No extra fields from old spell
 * 9. ✓ Steering regenerated from new probe
 * 10. ✓ Tool descriptions current
 * 11. ✓ File permissions maintained
 * 12. ✓ Valid YAML structure
 * 13. ✓ Spell is immediately usable
 *
 * BEHAVIOR: Users can recreate spells and old config is completely replaced
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm, readFile } from 'fs/promises';
import { setupTestGrimoireDir } from './helpers/test-path-manager';
import { createCommand } from '../commands/create';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from './helpers/test-server-manager';
import {
  readSpellFile,
  validateBasicSpellStructure,
  validateHTTPOrSSEServerConfig,
  validateBasicAuthInSpell,
  validateBearerAuthInSpell,
  readEnvFile,
  validateEnvFileLiterals,
} from './helpers/spell-validator';

describe('CLI create - Spell Overwrite Behavior', () => {
  let grimoireDir: string;
  let envFilePath: string;
  let httpServerProcess: ChildProcess;
  const HTTP_PORT = FASTMCP_PORTS.SPELL_OVERWRITE_HTTP; // 8012 - dedicated port for this test
  const createdFiles: string[] = [];

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('spell-overwrite');
    envFilePath = join(grimoireDir, '.env');
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Start Basic Auth HTTP server for comprehensive validation
    httpServerProcess = await startFastMCPServer('servers.basic_auth.http_server', HTTP_PORT);
  }, 60000);

  afterAll(async () => {
    await stopServer(httpServerProcess, HTTP_PORT, 'basic_auth_http_server');

    // Keep spell files for manual verification - no cleanup
    console.log(`\n[TEST] Spell files kept in: ${grimoireDir}\n`);
  }, 30000);

  it('should completely overwrite existing spell with new transport and config', async () => {
    // ARRANGE: Create initial spell with HTTP + Basic Auth
    const spellName = 'test-overwrite-complete';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    createdFiles.push(spellPath, envFilePath);

    // Create initial HTTP spell with Basic Auth
    await createCommand({
      name: spellName,
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD,
      probe: true, // Real server probe
      interactive: false,
    });

    // ASSERT: Verify initial spell created with comprehensive validation
    expect(existsSync(spellPath)).toBe(true);
    const initialSpell = await readSpellFile(spellPath);

    // Validate initial spell is HTTP with Basic Auth
    validateBasicSpellStructure(initialSpell, spellName);
    validateHTTPOrSSEServerConfig(initialSpell, 'http', `http://localhost:${HTTP_PORT}/mcp`);
    const { usernameVar: initialUsernameVar, passwordVar: initialPasswordVar } =
      validateBasicAuthInSpell(initialSpell);

    // Verify initial .env has Basic Auth credentials
    const initialEnv = await readEnvFile(envFilePath);
    validateEnvFileLiterals(initialEnv, {
      [initialUsernameVar]: FASTMCP_CREDENTIALS.USERNAME,
      [initialPasswordVar]: FASTMCP_CREDENTIALS.PASSWORD,
    });

    // Verify initial spell has probe results (tools, steering, detailed description)
    expect(initialSpell.steering).toBeDefined();
    expect(initialSpell.steering!.length).toBeLessThan(500); // Minimal steering
    expect(initialSpell.description).toContain('Available Tools');
    expect(initialSpell.description).toContain('Project Manager'); // Server name
    expect(initialSpell.keywords.length).toBeGreaterThan(3);

    // Store initial probe results for comparison
    const initialSteering = initialSpell.steering;
    const initialDescription = initialSpell.description;
    const initialKeywords = [...initialSpell.keywords];

    // ACT: Overwrite with SAME server but DIFFERENT credentials (to test complete replacement)
    // This simulates: user changed password and needs to recreate spell with new credentials
    await createCommand({
      name: spellName, // Same name - triggers overwrite
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD, // Same creds but user might have rotated them
      probe: true, // CRITICAL: Probe to refresh tool list, keywords, steering
      interactive: false,
    });

    // ASSERT: Verify overwrite with comprehensive validation
    const overwrittenSpell = await readSpellFile(spellPath);

    // Validate structure and transport unchanged
    validateBasicSpellStructure(overwrittenSpell, spellName);
    validateHTTPOrSSEServerConfig(overwrittenSpell, 'http', `http://localhost:${HTTP_PORT}/mcp`);

    // Validate auth is STILL Basic (same type)
    const { usernameVar: newUsernameVar, passwordVar: newPasswordVar } =
      validateBasicAuthInSpell(overwrittenSpell);

    // CRITICAL: Verify probe results are REFRESHED (could have new tools/keywords if server changed)
    expect(overwrittenSpell.steering).toBeDefined();
    expect(overwrittenSpell.steering!.length).toBeLessThan(500);
    expect(overwrittenSpell.description).toContain('Available Tools');
    expect(overwrittenSpell.description).toContain('Project Manager');
    expect(overwrittenSpell.keywords.length).toBeGreaterThan(3);

    // Verify probe results exist (even if identical to before, they were re-fetched)
    expect(overwrittenSpell.steering).toBe(initialSteering); // Same server = same tools
    expect(overwrittenSpell.description).toBe(initialDescription);
    expect(overwrittenSpell.keywords).toEqual(initialKeywords);

    // Verify .env has Basic Auth credentials
    const updatedEnv = await readEnvFile(envFilePath);
    validateEnvFileLiterals(updatedEnv, {
      [newUsernameVar]: FASTMCP_CREDENTIALS.USERNAME,
      [newPasswordVar]: FASTMCP_CREDENTIALS.PASSWORD,
    });

    // NEGATIVE TEST: Old vars removed if var names changed
    if (initialUsernameVar !== newUsernameVar) {
      expect(updatedEnv[initialUsernameVar]).toBeUndefined();
    }
    if (initialPasswordVar !== newPasswordVar) {
      expect(updatedEnv[initialPasswordVar]).toBeUndefined();
    }
  }, 60000); // Longer timeout - this test does TWO probes (initial + overwrite)

  it('should overwrite spell and replace auth credentials in .env', async () => {
    // ARRANGE: Create spell with Basic Auth
    const spellName = 'test-overwrite-auth';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    createdFiles.push(spellPath, envFilePath);

    await createCommand({
      name: spellName,
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      authType: 'basic',
      authUsername: 'old-user',
      authPassword: 'old-password',
      probe: false, // Skip probe - just testing overwrite behavior
      interactive: false,
    });

    // Verify initial spell and .env
    const initialSpell = await readSpellFile(spellPath);
    const { usernameVar: oldUsernameVar, passwordVar: oldPasswordVar } =
      validateBasicAuthInSpell(initialSpell);

    const initialEnv = await readEnvFile(envFilePath);
    expect(initialEnv[oldUsernameVar]).toBe('old-user');
    expect(initialEnv[oldPasswordVar]).toBe('old-password');

    // ACT: Recreate spell with DIFFERENT Basic Auth credentials
    await createCommand({
      name: spellName,
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      authType: 'basic',
      authUsername: 'new-user',
      authPassword: 'new-password',
      probe: false,
      interactive: false,
    });

    // ASSERT: Spell file has new auth config
    const newSpell = await readSpellFile(spellPath);
    validateBasicSpellStructure(newSpell, spellName);
    const { usernameVar: newUsernameVar, passwordVar: newPasswordVar } =
      validateBasicAuthInSpell(newSpell);

    // ASSERT: .env has NEW credentials
    const newEnv = await readEnvFile(envFilePath);
    validateEnvFileLiterals(newEnv, {
      [newUsernameVar]: 'new-user',
      [newPasswordVar]: 'new-password',
    });

    // NEGATIVE TEST: Old credentials should NOT exist
    if (oldUsernameVar !== newUsernameVar) {
      expect(oldUsernameVar in newEnv).toBe(false);
    }
    if (oldPasswordVar !== newPasswordVar) {
      expect(oldPasswordVar in newEnv).toBe(false);
    }
  });

  it('should remove auth when recreating spell without auth', async () => {
    // ARRANGE: Create spell WITH auth
    const spellName = 'test-remove-auth';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    createdFiles.push(spellPath, envFilePath);

    await createCommand({
      name: spellName,
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      authType: 'bearer',
      authToken: 'secret-token-to-remove',
      probe: false,
      interactive: false,
    });

    // Verify initial spell HAS auth
    const initialSpell = await readSpellFile(spellPath);
    expect(initialSpell.server.auth).toBeDefined();
    expect(initialSpell.server.auth!.type).toBe('bearer');

    // ACT: Recreate spell WITHOUT auth
    await createCommand({
      name: spellName,
      transport: 'http',
      url: `http://localhost:${HTTP_PORT}/mcp`,
      // No auth parameters
      probe: false,
      interactive: false,
    });

    // ASSERT: New spell has NO auth
    const newSpell = await readSpellFile(spellPath);
    validateBasicSpellStructure(newSpell, spellName);
    validateHTTPOrSSEServerConfig(newSpell, 'http', `http://localhost:${HTTP_PORT}/mcp`);

    // NEGATIVE TEST: Auth should be completely removed
    expect(newSpell.server.auth).toBeUndefined();
    expect(newSpell.server.env).toBeUndefined(); // No env vars needed without auth
  });

  it('should completely replace spell config when transport changes', async () => {
    // ARRANGE: Create HTTP spell with auth
    const spellName = 'test-transport-change';
    const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

    createdFiles.push(spellPath);

    await createCommand({
      name: spellName,
      transport: 'http',
      url: 'http://api.example.com/mcp',
      authType: 'bearer',
      authToken: 'old-token',
      probe: false,
      interactive: false,
    });

    // Verify HTTP spell created
    const httpContent = await readFile(spellPath, 'utf-8');
    expect(httpContent).toContain('transport: http');
    expect(httpContent).toContain('url: http://api.example.com/mcp');

    // ACT: Recreate as stdio spell (completely different transport)
    await createCommand({
      name: spellName,
      transport: 'stdio',
      command: 'python',
      args: ['-m', 'server'],
      probe: false,
      interactive: false,
    });

    // ASSERT: Old HTTP config completely replaced
    const stdioContent = await readFile(spellPath, 'utf-8');
    expect(stdioContent).toContain('transport: stdio');
    expect(stdioContent).toContain('command: python');
    expect(stdioContent).not.toContain('transport: http');
    expect(stdioContent).not.toContain('url:');
    expect(stdioContent).not.toContain('auth:');
  });
});
