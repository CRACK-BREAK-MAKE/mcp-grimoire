/**
 * Integration Test: CLI create with stdio filesystem server with environment variables
 *
 * PURPOSE:
 * Tests spell creation for stdio transport WITH environment variables.
 * Validates environment variable transformation and server.env configuration.
 *
 * MCP SERVER USED:
 * - Package: @modelcontextprotocol/server-filesystem
 * - Name: "Filesystem MCP" (official MCP filesystem server)
 * - Transport: stdio (local command execution)
 * - Auth: None (local process)
 * - Command: npx
 * - Args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
 * - Environment Variables: MCP_LOG_LEVEL=debug
 *
 * STDIO WITH ENVIRONMENT VARIABLES:
 * Some stdio MCP servers need environment variables for:
 * - Logging levels (DEBUG, INFO, WARN, ERROR)
 * - API keys for external services
 * - Configuration paths
 * - Feature flags
 *
 * ENVIRONMENT VARIABLE TRANSFORMATION:
 * User provides: --env "GRIMOIRE_DEBUG=true"
 * Result in spell file:
 * ```yaml
 * server:
 *   transport: stdio
 *   command: npx
 *   args: ["-y", "@crack-break-make/mcp-grimoire@rc"]
 *   env:
 *     GRIMOIRE_DEBUG: "${GRIMOIRE_MCP__GRIMOIRE_DEBUG}"
 * ```
 *
 * Result in .env file:
 * ```
 * GRIMOIRE_MCP__GRIMOIRE_DEBUG=true
 * ```
 *
 * NAMESPACING PATTERN:
 * - Original: GRIMOIRE_DEBUG
 * - Namespaced: GRIMOIRE_MCP__GRIMOIRE_DEBUG
 * - Spell name prefix prevents variable collisions
 * - Double underscore (__) separates namespace from variable
 *
 * TEST SCENARIOS:
 * 1. ✓ Create spell with environment variables
 * 2. ✓ Validate server.command and server.args
 * 3. ✓ Verify server.env contains transformed variables
 * 4. ✓ Check .env file has namespaced variables
 * 5. ✓ Validate steering generated from probe (if enabled)
 * 6. ✓ Verify keywords populated from tools
 *
 * FILESYSTEM MCP CAPABILITIES:
 * - read_file: Read file contents
 * - write_file: Write to files
 * - list_directory: List directory contents
 * - create_directory: Create new directories
 *
 * COMPARISON:
 * - CAP.js test: stdio WITHOUT env vars (simple)
 * - Filesystem test: stdio WITH env vars (complex)
 *
 * NO MOCKS - Tests against real filesystem MCP server with environment variables
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';
import {
  readSpellFile,
  readEnvFile,
  validateBasicSpellStructure,
  validateStdioServerConfig,
  validateEnvVarsInSpell,
  validateEnvFileLiterals,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';
import * as os from 'os';

const isWindows = os.platform() === 'win32';

describe.skipIf(isWindows)('CLI create - stdio filesystem with env', () => {
  const testSpellName = 'filesystem-mcp';
  let grimoireDir: string;
  let spellFilePath: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = await setupTestGrimoireDir('stdio-ui5-with-env');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    envFilePath = join(grimoireDir, '.env');

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }
  });

  afterAll(async () => {
    await cleanupTestGrimoireDir(grimoireDir);
  });

  it('should create spell for stdio with environment variables', async () => {
    // ARRANGE: Prepare CLI options with env vars
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: {
        MCP_LOG_LEVEL: 'debug',
      },
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

    // ASSERT: Validate description was enhanced with tool count (probe succeeded)
    expect(
      spell.description.toLowerCase(),
      'description should mention tools when probe succeeds'
    ).toMatch(/tool|provide/);
    expect(spell.description, 'description should include tool count from probe').toMatch(
      /\d+\s+tool/
    );

    // ASSERT: Validate keywords include tool-related terms
    // Keywords are derived from tools discovered during probe
    expect(spell.keywords.length, 'keywords should be populated from probed tools').toBeGreaterThan(
      3
    );

    // Validate stdio config - transport should be 'stdio' as requested
    // Note: args include '-y' flag for npx auto-accept
    validateStdioServerConfig(
      spell,
      'npx',
      ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      'stdio'
    );

    // ASSERT: Validate env vars transformation (literal → placeholder in spell, literal in .env)
    const envVars = validateEnvVarsInSpell(spell, {
      MCP_LOG_LEVEL: 'debug',
    });

    // ASSERT: Validate env var is stored as placeholder in spell
    expect(spell.server.env, 'server.env should be defined').toBeDefined();
    expect(
      spell.server.env!.MCP_LOG_LEVEL,
      'server.env.MCP_LOG_LEVEL should be a placeholder'
    ).toMatch(/^\${[A-Z_][A-Z0-9_]*}$/);

    // ASSERT: Validate no auth or headers for stdio
    expect(spell.server.auth, 'server.auth should be undefined for stdio').toBeUndefined();
    expect(spell.server.headers, 'server.headers should be undefined for stdio').toBeUndefined();

    // ASSERT: Validate no URL property for stdio
    expect('url' in spell.server, 'server should not have url property for stdio').toBe(false);

    // ASSERT: Validate .env file contains literal value
    expect(existsSync(envFilePath), '.env file should exist').toBe(true);
    const envFile = await readEnvFile(envFilePath);
    validateEnvFileLiterals(envFile, {
      [envVars.MCP_LOG_LEVEL]: 'debug',
    });

    // ASSERT: Validate the env var in .env is NOT a placeholder (should be literal)
    expect(envFile[envVars.MCP_LOG_LEVEL], '.env value should be literal, not placeholder').toBe(
      'debug'
    );
    expect(envFile[envVars.MCP_LOG_LEVEL], '.env value should not contain ${ }').not.toMatch(/\${/);

    // ASSERT: Validate steering was generated from probe
    expect(spell.steering, 'spell.steering should be defined after probe').toBeDefined();
    expect(typeof spell.steering, 'spell.steering should be a string').toBe('string');
    expect(spell.steering!.length, 'spell.steering should be non-empty').toBeGreaterThan(10);

    // ASSERT: Validate steering contains tool count indicator
    expect(spell.steering!, 'steering should mention tools').toMatch(/tool|Tool/);

    // ASSERT: Validate steering has workflow guidance
    expect(
      spell.steering!.toLowerCase(),
      'steering should contain workflow or usage guidance'
    ).toMatch(/when to use|use when|operations/);

    // ASSERT: Validate env vars were correctly transformed
    // Note: Steering is about the SERVER's capabilities (UI5 tools), not about CLI options
    // The env var transformation is already validated above in validateEnvVarsInSpell()
    expect(spell.server.env, 'server.env should contain environment variables').toBeDefined();
    expect(
      Object.keys(spell.server.env!).length,
      'server.env should have at least one variable'
    ).toBeGreaterThan(0);
  }, 60000); // 60s timeout for probe
});
