/**
 * Integration Test: CLI create with stdio @ui5/mcp-server with environment variables
 *
 * PURPOSE:
 * Tests spell creation for stdio transport WITH environment variables.
 * Validates environment variable transformation and server.env configuration.
 *
 * MCP SERVER USED:
 * - Package: @ui5/mcp-server
 * - Name: "UI5 MCP" (SAPUI5/OpenUI5 development tools)
 * - Transport: stdio (local command execution)
 * - Auth: None (local process)
 * - Command: npx
 * - Args: ["@ui5/mcp-server"]
 * - Environment Variables: UI5_LOG_LVL=verbose
 *
 * STDIO WITH ENVIRONMENT VARIABLES:
 * Some stdio MCP servers need environment variables for:
 * - Logging levels (DEBUG, INFO, WARN, ERROR)
 * - API keys for external services
 * - Configuration paths
 * - Feature flags
 *
 * ENVIRONMENT VARIABLE TRANSFORMATION:
 * User provides: --env "UI5_LOG_LVL=verbose"
 * Result in spell file:
 * ```yaml
 * server:
 *   transport: stdio
 *   command: npx
 *   args: ["@ui5/mcp-server"]
 *   env:
 *     UI5_LOG_LVL: "${UI5_MCP__UI5_LOG_LVL}"
 * ```
 *
 * Result in .env file:
 * ```
 * UI5_MCP__UI5_LOG_LVL=verbose
 * ```
 *
 * NAMESPACING PATTERN:
 * - Original: UI5_LOG_LVL
 * - Namespaced: UI5_MCP__UI5_LOG_LVL
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
 * UI5 MCP SERVER CAPABILITIES:
 * - Create SAPUI5/OpenUI5 applications
 * - Run UI5 linter (detect deprecated APIs)
 * - Validate manifest.json files
 * - Get UI5 API reference documentation
 * - Create Integration Cards
 *
 * COMPARISON:
 * - CAP.js test: stdio WITHOUT env vars (simple)
 * - UI5 test: stdio WITH env vars (complex)
 *
 * NO MOCKS - Tests against real UI5 MCP server with environment variables
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { getSpellDirectory } from '../../utils/paths';
import {
  readSpellFile,
  readEnvFile,
  validateBasicSpellStructure,
  validateStdioServerConfig,
  validateEnvVarsInSpell,
  validateEnvFileLiterals,
} from './helpers/spell-validator';
import { createCommand, type CreateOptions } from '../commands/create';

describe('CLI create - stdio UI5 with env', () => {
  const testSpellName = 'ui5-mcp';
  let grimoireDir: string;
  let spellFilePath: string;
  let envFilePath: string;

  beforeAll(async () => {
    grimoireDir = getSpellDirectory();
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
    envFilePath = join(grimoireDir, '.env');

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }
  });

  afterAll(async () => {
    // SKIP CLEANUP: Keep spell files for manual verification
    // TODO: Re-enable cleanup once all tests are verified
    // if (existsSync(spellFilePath)) {
    //   await rm(spellFilePath);
    // }
    console.log(`\n[TEST] Spell file kept for verification: ${spellFilePath}\n`);
  });

  it('should create spell for stdio with environment variables', async () => {
    // ARRANGE: Prepare CLI options with env vars
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@ui5/mcp-server'],
      env: {
        UI5_LOG_LVL: 'verbose',
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
    validateStdioServerConfig(spell, 'npx', ['-y', '@ui5/mcp-server'], 'stdio');

    // ASSERT: Validate env vars transformation (literal → placeholder in spell, literal in .env)
    const envVars = validateEnvVarsInSpell(spell, {
      UI5_LOG_LVL: 'verbose',
    });

    // ASSERT: Validate env var is stored as placeholder in spell
    expect(spell.server.env, 'server.env should be defined').toBeDefined();
    expect(spell.server.env!.UI5_LOG_LVL, 'server.env.UI5_LOG_LVL should be a placeholder').toMatch(
      /^\${[A-Z_][A-Z0-9_]*}$/
    );

    // ASSERT: Validate no auth or headers for stdio
    expect(spell.server.auth, 'server.auth should be undefined for stdio').toBeUndefined();
    expect(spell.server.headers, 'server.headers should be undefined for stdio').toBeUndefined();

    // ASSERT: Validate no URL property for stdio
    expect('url' in spell.server, 'server should not have url property for stdio').toBe(false);

    // ASSERT: Validate .env file contains literal value
    expect(existsSync(envFilePath), '.env file should exist').toBe(true);
    const envFile = await readEnvFile(envFilePath);
    validateEnvFileLiterals(envFile, {
      [envVars.UI5_LOG_LVL]: 'verbose',
    });

    // ASSERT: Validate the env var in .env is NOT a placeholder (should be literal)
    expect(envFile[envVars.UI5_LOG_LVL], '.env value should be literal, not placeholder').toBe(
      'verbose'
    );
    expect(envFile[envVars.UI5_LOG_LVL], '.env value should not contain ${ }').not.toMatch(/\${/);

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
