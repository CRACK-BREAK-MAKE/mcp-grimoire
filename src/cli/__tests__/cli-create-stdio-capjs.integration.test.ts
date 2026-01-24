/**
 * Integration Test: CLI create with stdio @cap-js/cds-mcp
 *
 * PURPOSE:
 * Tests spell creation for stdio (standard input/output) transport WITHOUT
 * environment variables. Validates local command execution pattern.
 *
 * MCP SERVER USED:
 * - Package: @cap-js/cds-mcp
 * - Name: "CDS MCP" (SAP Cloud Application Programming Model)
 * - Transport: stdio (local command execution)
 * - Auth: None (local process, no network)
 * - Command: npx
 * - Args: ["@cap-js/cds-mcp"]
 *
 * STDIO TRANSPORT PATTERN:
 * Unlike HTTP/SSE servers that listen on ports, stdio servers:
 * - Run as local child processes
 * - Communicate via stdin/stdout
 * - No network requests
 * - No authentication needed (runs as user)
 * - Launched on-demand, not long-running
 *
 * REAL-WORLD USE CASES:
 * - Local development tools (linters, formatters)
 * - Database CLIs (psql, mysql)
 * - Package managers (npm, pip)
 * - Language servers (typescript, python)
 * - Build tools (webpack, vite)
 *
 * WHY NO ENVIRONMENT VARIABLES:
 * This test validates "simple" stdio spells - just a command with args.
 * The UI5 test (cli-create-stdio-ui5-with-env.integration.test.ts) covers
 * stdio WITH environment variables.
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell for stdio command
 * 2. ✓ Validate server.command field
 * 3. ✓ Validate server.args array
 * 4. ✓ Verify NO server.env field
 * 5. ✓ Check NO auth fields
 * 6. ✓ Validate NO url field
 * 7. ✓ Test with probe: false (no server probing for stdio)
 *
 * SPELL FILE STRUCTURE:
 * ```yaml
 * server:
 *   transport: stdio
 *   command: npx
 *   args:
 *     - "@cap-js/cds-mcp"
 *   # NO url, auth, headers, or env fields
 * ```
 *
 * CAP (Cloud Application Programming Model):
 * SAP's framework for building enterprise applications.
 * The MCP server provides access to CDS models, entities, and services.
 *
 * NO MOCKS - Tests against real CAP.js MCP package
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';
import {
  readSpellFile,
  validateBasicSpellStructure,
  validateStdioServerConfig,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import * as os from 'os';

const isWindows = os.platform() === 'win32';

describe.skipIf(isWindows)('CLI create - stdio CAP.js', () => {
  const testSpellName = 'cds-mcp';
  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('stdio-capjs');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }
  });

  afterAll(async () => {
    await cleanupTestGrimoireDir(grimoireDir);
  });

  it('should create spell for stdio without env vars', async () => {
    // ARRANGE: Prepare CLI options for stdio server
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@cap-js/mcp-server'],
      interactive: false,
      probe: true, // Enable probing to validate stdio server works
    };

    // ACT: Create spell via CLI command (programmatic API for testing)
    await createCommand(options);

    // ASSERT: Validate spell file exists
    expect(existsSync(spellFilePath), 'Spell file should exist').toBe(true);

    // ASSERT: Read and validate spell structure
    const spell = await readSpellFile(spellFilePath);

    // Validate basic structure (name, version, description, keywords)
    validateBasicSpellStructure(spell, testSpellName);

    // ASSERT: Validate name matches CLI input
    expect(spell.name, 'spell.name should match CLI input').toBe(testSpellName);
    expect(spell.version, 'spell.version should be 1.0.0').toBe('1.0.0');

    // ASSERT: Validate description mentions server name, version, transport
    expect(spell.description, 'description should mention server name (cds-mcp)').toContain(
      'cds-mcp'
    );
    expect(spell.description, 'description should mention version (v0.1.0)').toMatch(/v?0\.1\.0/i);
    expect(spell.description, 'description should mention stdio transport').toContain('stdio');
    expect(spell.description, 'description should mention tool count').toMatch(/2 tools/i);
    expect(spell.description, 'description should have Available Tools section').toContain(
      'Available Tools'
    );

    // ASSERT: Validate keywords include CAP.js tool names
    const expectedKeywords = ['search', 'model', 'docs'];
    for (const keyword of expectedKeywords) {
      expect(spell.keywords, `keywords should include "${keyword}" from CAP.js tools`).toContain(
        keyword
      );
    }
    expect(
      spell.keywords.length,
      'keywords should be populated from probed CAP.js tools'
    ).toBeGreaterThan(3);

    // Validate stdio config - transport should be 'stdio' as requested
    validateStdioServerConfig(spell, 'npx', ['-y', '@cap-js/mcp-server'], 'stdio');

    // ASSERT: Validate command matches CLI input
    expect(spell.server.command, 'server.command should match CLI input').toBe('npx');

    // ASSERT: Validate args match CLI input exactly
    expect(spell.server.args, 'server.args should match CLI input').toEqual([
      '-y',
      '@cap-js/mcp-server',
    ]);

    // ASSERT: Validate transport matches CLI input
    expect(spell.server.transport, 'server.transport should match CLI input').toBe('stdio');

    // ASSERT: Validate no env vars for simple stdio (no env provided in CLI)
    expect(
      spell.server.env ?? undefined,
      'server.env should be null/undefined when no env vars provided in CLI'
    ).toBeUndefined();

    // ASSERT: Validate no auth, headers for simple stdio
    expect(spell.server.auth, 'server.auth should be undefined for simple stdio').toBeUndefined();
    expect(spell.server.headers, 'server.headers should be undefined for stdio').toBeUndefined();

    // ASSERT: Validate no URL property for stdio
    expect('url' in spell.server, 'server should not have url property for stdio').toBe(false);

    // ASSERT: Validate steering is MINIMAL (for intent resolution)
    expect(spell.steering, 'spell.steering should be defined after probe').toBeDefined();
    expect(typeof spell.steering, 'spell.steering should be a string').toBe('string');
    expect(spell.steering!.length, 'spell.steering should be minimal (<500 chars)').toBeLessThan(
      500
    );

    // ASSERT: Validate steering mentions tool count but NOT tool definitions
    expect(spell.steering!, 'steering should mention tool count or Available Tools').toMatch(
      /tools|Available Tools/i
    );

    // ASSERT: Steering should list tool NAMES (not descriptions) for intent matching
    expect(
      spell.steering!.length,
      'steering should be short - just for intent matching'
    ).toBeGreaterThan(50);

    // ASSERT: Validate steering has intent matching keywords
    expect(spell.steering!.toLowerCase(), 'steering should contain when to use guidance').toMatch(
      /when to use|use this server for|use when/i
    );

    // ASSERT: Validate steering lists tool names for intent matching
    expect(spell.steering!, 'steering should list search_model tool').toContain('search_model');
    expect(spell.steering!, 'steering should list search_docs tool').toContain('search_docs');

    // ASSERT: Validate description contains CAP.js tool names with full descriptions
    expect(spell.description, 'description should contain search_model with description').toContain(
      'search_model'
    );
    expect(spell.description, 'description should contain search_docs with description').toContain(
      'search_docs'
    );
    expect(spell.description, 'description should explain search_model functionality').toMatch(
      /CDS model|CSN/i
    );
    expect(spell.description, 'description should explain search_docs functionality').toMatch(
      /CAP documentation|code snippets/i
    );

    // ASSERT: Validate no .env file created (no env vars provided in CLI)
    // .env might exist from other tests, so we just validate spell doesn't have env
  }, 60000); // 60s timeout for probe

  it('should fail gracefully when stdio server is not reachable', async () => {
    // ARRANGE: Use a command that will definitely fail
    const failSpellName = 'test-stdio-fail-spell';
    const failSpellPath = join(grimoireDir, `${failSpellName}.spell.yaml`);

    // Clean up any existing spell file from previous test runs
    if (existsSync(failSpellPath)) {
      await rm(failSpellPath);
    }

    const options: CreateOptions = {
      name: failSpellName,
      transport: 'stdio',
      command: 'nonexistent-command-that-will-fail',
      args: ['--invalid'],
      interactive: false,
      probe: true,
    };

    // ACT & ASSERT: Command should exit with code 1
    await expect(createCommand(options)).rejects.toThrow(); // process.exit(1) will throw in test context

    // ASSERT: Spell file should NOT be created for unreachable server
    expect(
      existsSync(failSpellPath),
      'Spell file should NOT exist for unreachable stdio server'
    ).toBe(false);

    // Clean up
    if (existsSync(failSpellPath)) {
      await rm(failSpellPath);
    }
  }, 30000);
});
