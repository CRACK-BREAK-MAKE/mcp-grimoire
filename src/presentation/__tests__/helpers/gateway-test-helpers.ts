/**
 * Gateway Integration Test Helpers
 *
 * Provides utilities for E2E gateway testing:
 * - Fixed spell names for each test (no timestamps - predictable and debuggable)
 * - Server startup/cleanup helpers
 * - Spell file creation/deletion utilities
 * - MCP client helper functions
 *
 * NO MOCKS - Real servers, real spell files, real MCP protocol
 */

import { join } from 'path';
import { rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { ChildProcess } from 'child_process';
import {
  startFastMCPServer,
  stopServer,
  FASTMCP_PORTS,
  FASTMCP_CREDENTIALS,
} from '../../../cli/__tests__/helpers/test-server-manager';
import { getSpellDirectory } from '../../../utils/paths';
import { createCommand, type CreateOptions } from '../../../cli/commands/create';

/**
 * Gateway test spell names - fixed, meaningful names for each test
 * NO random timestamps - predictable and debuggable
 *
 * Registry ensures unique spell names across all gateway tests
 */
export const GATEWAY_SPELL_NAMES = {
  // Test File 1: gateway-intent-resolution.e2e.test.ts (Tier 1 tests)
  BASIC_AUTH_HTTP_TIER1: 'gateway-basic-auth-http-tier1',
  BASIC_AUTH_SSE_TIER1: 'gateway-basic-auth-sse-tier1',
  API_KEY_HTTP_TIER1: 'gateway-api-key-http-tier1',
  API_KEY_SSE_TIER1: 'gateway-api-key-sse-tier1',
  SEC_KEYS_HTTP_TIER1: 'gateway-sec-keys-http-tier1',
  SEC_KEYS_SSE_TIER1: 'gateway-sec-keys-sse-tier1',
  NO_AUTH_HTTP_TIER1: 'gateway-no-auth-http-tier1',
  NO_AUTH_SSE_TIER1: 'gateway-no-auth-sse-tier1',
  OAUTH2_HTTP_TIER1: 'gateway-oauth2-http-tier1',
  CDS_MCP_TIER1: 'gateway-cds-mcp-tier1',
  UI5_MCP_TIER1: 'gateway-ui5-mcp-tier1',

  // Test File 1: Additional scenarios
  STEERING_INJECTION: 'gateway-steering-injection-test',
  TOKEN_SAVINGS: 'gateway-token-savings-test',
  TIER2_POSTGRES: 'gateway-tier2-postgres-db',
  TIER2_MYSQL: 'gateway-tier2-mysql-db',
  TIER3_WEAK_MATCH: 'gateway-tier3-weak-match',
  TIER3_NOT_FOUND: 'gateway-tier3-not-found',

  // Test File 2: gateway-auth-flows.e2e.test.ts
  AUTH_BASIC_HTTP: 'gateway-auth-basic-http',
  AUTH_BASIC_SSE: 'gateway-auth-basic-sse',
  AUTH_API_KEY_HTTP: 'gateway-auth-api-key-http',
  AUTH_API_KEY_SSE: 'gateway-auth-api-key-sse',
  AUTH_GITHUB_KEYS: 'gateway-auth-github-keys',
  AUTH_BRAVE_KEYS: 'gateway-auth-brave-keys',
  AUTH_SEC_KEYS_SSE: 'gateway-auth-sec-keys-sse',
  AUTH_NO_AUTH_HTTP: 'gateway-auth-no-auth-http',
  AUTH_NO_AUTH_SSE: 'gateway-auth-no-auth-sse',
  AUTH_UI5_WITH_ENV: 'gateway-auth-ui5-with-env',
  AUTH_CDS_NO_ENV: 'gateway-auth-cds-no-env',

  // Test File 3: gateway-turn-based-cleanup.e2e.test.ts
  CLEANUP_KEEP_ALIVE: 'gateway-cleanup-keep-alive',
  CLEANUP_SERVER_A: 'gateway-cleanup-server-a',
  CLEANUP_SERVER_B: 'gateway-cleanup-server-b',
  CLEANUP_TOOLS_CHANGED: 'gateway-cleanup-tools-changed',
  CLEANUP_MULTI_SERVER_A: 'gateway-cleanup-multi-a',
  CLEANUP_MULTI_SERVER_B: 'gateway-cleanup-multi-b',
  CLEANUP_MULTI_SERVER_C: 'gateway-cleanup-multi-c',
} as const;

/**
 * Re-export FASTMCP_PORTS and FASTMCP_CREDENTIALS for convenience
 */
export { FASTMCP_PORTS, FASTMCP_CREDENTIALS };

/**
 * Server configuration for tests
 */
export interface ServerConfig {
  module: string;
  port: number;
  spellName: string;
  transport: 'http' | 'sse' | 'stdio';
  authType?: 'basic' | 'bearer' | 'oauth2';
  authUsername?: string;
  authPassword?: string;
  authToken?: string;
  authOAuth2ClientId?: string;
  authOAuth2ClientSecret?: string;
  authOAuth2TokenUrl?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  keywords?: string[];
  description?: string;
}

/**
 * Spell creation result
 */
export interface SpellCreationResult {
  spellName: string;
  spellFilePath: string;
  envFilePath: string;
}

/**
 * Server startup result
 */
export interface ServerStartupResult {
  process: ChildProcess | null; // null for stdio servers
  port: number | null; // null for stdio servers
  spellName: string;
  config: ServerConfig;
}

/**
 * Create a spell file using the CLI command (matches CLI integration test pattern)
 *
 * @param config Server configuration
 * @returns Spell creation result with file paths
 */
export async function createGatewaySpell(config: ServerConfig): Promise<SpellCreationResult> {
  const grimoireDir = getSpellDirectory();
  const spellFilePath = join(grimoireDir, `${config.spellName}.spell.yaml`);
  const envFilePath = join(grimoireDir, '.env');

  // Ensure grimoire directory exists
  const { ensureDirectories } = await import('../../../utils/paths');
  await ensureDirectories();

  // Build CLI options based on server configuration
  const options: CreateOptions = {
    name: config.spellName,
    transport: config.transport,
    interactive: false, // CRITICAL: disable interactive mode
    probe: true, // Enable probing to validate server
  };

  // Add URL for HTTP/SSE servers
  if (config.transport !== 'stdio' && config.port) {
    const endpoint = config.transport === 'sse' ? '/sse' : '/mcp';
    options.url = `http://localhost:${config.port}${endpoint}`;
  }

  // Add auth configuration
  if (config.authType === 'basic') {
    options.authType = 'basic';
    options.authUsername = config.authUsername;
    options.authPassword = config.authPassword;
  } else if (config.authType === 'bearer') {
    options.authType = 'bearer';
    options.authToken = config.authToken;
  } else if (config.authType === 'oauth2') {
    options.authType = 'oauth2';
    options.authClientId = config.authOAuth2ClientId;
    options.authClientSecret = config.authOAuth2ClientSecret;
    options.authTokenUrl = config.authOAuth2TokenUrl;
  }

  // Add headers for security keys pattern
  if (config.headers) {
    options.headers = config.headers;
  }

  // Add env for stdio servers
  if (config.env) {
    options.env = config.env;
  }

  // For stdio servers, we need command and args
  if (config.transport === 'stdio') {
    if (config.spellName.includes('cds-mcp') || config.spellName.includes('capjs')) {
      options.command = 'npx';
      options.args = ['-y', '@cap-js/mcp-server'];
    } else if (config.spellName.includes('ui5')) {
      options.command = 'npx';
      options.args = ['-y', '@ui5/mcp-server'];
      options.env = config.env || { UI5_LOG_LVL: 'verbose' };
    }
  }

  // Create spell via CLI command (programmatic API for testing)
  await createCommand(options);

  return {
    spellName: config.spellName,
    spellFilePath,
    envFilePath,
  };
}

/**
 * Start a server and create its spell file
 *
 * @param config Server configuration
 * @returns Server startup result with process and spell info
 */
export async function startServerAndCreateSpell(
  config: ServerConfig
): Promise<ServerStartupResult> {
  let serverProcess: ChildProcess | null = null;

  // Start server for HTTP/SSE transports
  if (config.transport !== 'stdio' && config.port !== null && config.port !== 0) {
    // eslint-disable-next-line no-console
    console.log(`[GATEWAY-TEST] Starting ${config.module} on port ${config.port}...`);
    serverProcess = await startFastMCPServer(config.module, config.port);
  }

  // Create spell file (CLI will probe the server if HTTP/SSE)
  // eslint-disable-next-line no-console
  console.log(`[GATEWAY-TEST] Creating spell file: ${config.spellName}...`);
  await createGatewaySpell(config);

  return {
    process: serverProcess,
    port: config.port || null,
    spellName: config.spellName,
    config,
  };
}

/**
 * Cleanup server and spell file
 *
 * @param result Server startup result to cleanup
 */
export async function cleanupServerAndSpell(result: ServerStartupResult): Promise<void> {
  const grimoireDir = getSpellDirectory();
  const spellFilePath = join(grimoireDir, `${result.spellName}.spell.yaml`);

  // Stop server if running
  if (result.process && result.port !== null && result.port !== 0) {
    // eslint-disable-next-line no-console
    console.log(`[GATEWAY-TEST] Stopping server on port ${result.port}...`);
    await stopServer(result.process, result.port, result.config.module);
  }

  // Delete spell file
  if (existsSync(spellFilePath)) {
    // eslint-disable-next-line no-console
    console.log(`[GATEWAY-TEST] Deleting spell file: ${result.spellName}...`);
    await rm(spellFilePath);
  }

  // Note: We don't delete .env file as it may be shared across tests
  // Tests should use unique env var prefixes (SPELLNAME__VARIABLE)
}

/**
 * Cleanup multiple servers and spells
 */
export async function cleanupMultipleServers(results: ServerStartupResult[]): Promise<void> {
  await Promise.all(results.map((result) => cleanupServerAndSpell(result)));
}

/**
 * Delete a spell file by name
 *
 * @param spellName Spell name (without .spell.yaml extension)
 */
export async function deleteSpellFile(spellName: string): Promise<void> {
  const grimoireDir = getSpellDirectory();
  const spellFilePath = join(grimoireDir, `${spellName}.spell.yaml`);

  if (existsSync(spellFilePath)) {
    await rm(spellFilePath);
  }
}

/**
 * Create a minimal spell file for testing (bypasses CLI probe)
 * Useful for Tier 2/3 tests where we need specific keyword patterns
 *
 * @param spellName Spell name
 * @param keywords Keywords for intent resolution
 * @param description Optional description
 */
export async function createMinimalSpell(
  spellName: string,
  keywords: string[],
  description?: string
): Promise<string> {
  const grimoireDir = getSpellDirectory();
  const spellFilePath = join(grimoireDir, `${spellName}.spell.yaml`);

  const spellContent = `name: ${spellName}
version: 1.0.0
description: ${description ?? 'Test spell for gateway integration tests'}
keywords: ${JSON.stringify(keywords)}
server:
  transport: http
  url: http://localhost:8888/mcp
steering: Test spell for gateway integration tests
`;

  await writeFile(spellFilePath, spellContent, 'utf-8');
  return spellFilePath;
}

/**
 * Wait for spell to be indexed by gateway (chokidar file watcher)
 * The gateway uses chokidar to watch for spell file changes
 *
 * @param timeoutMs Timeout in milliseconds (default: 2000ms)
 */
export async function waitForSpellIndexing(timeoutMs: number = 2000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

/**
 * Common test server configurations
 */
export const TEST_SERVER_CONFIGS = {
  BASIC_AUTH_HTTP: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.basic_auth.http_server',
    port,
    spellName,
    transport: 'http',
    authType: 'basic',
    authUsername: FASTMCP_CREDENTIALS.USERNAME,
    authPassword: FASTMCP_CREDENTIALS.PASSWORD,
    // keywords auto-extracted by CLI from tool names: create_project, add_task, get_project_status
  }),

  BASIC_AUTH_SSE: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.basic_auth.sse_server',
    port,
    spellName,
    transport: 'sse',
    authType: 'basic',
    authUsername: FASTMCP_CREDENTIALS.USERNAME,
    authPassword: FASTMCP_CREDENTIALS.PASSWORD,
    // keywords auto-extracted by CLI from tool names: create_project, add_task, get_project_status
  }),

  API_KEY_HTTP: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.api_key.http_server',
    port,
    spellName,
    transport: 'http',
    authType: 'bearer',
    authToken: FASTMCP_CREDENTIALS.API_KEY,
    // keywords auto-extracted by CLI from tool names: get_current_weather, get_forecast, get_weather_alerts
  }),

  API_KEY_SSE: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.api_key.sse_server',
    port,
    spellName,
    transport: 'sse',
    authType: 'bearer',
    authToken: FASTMCP_CREDENTIALS.API_KEY,
    // keywords auto-extracted by CLI from tool names: get_latest_news, search_news, get_trending_topics
  }),

  SECURITY_KEYS_HTTP: (
    spellName: string,
    port: number,
    useGitHub: boolean = true
  ): ServerConfig => ({
    module: 'servers.security_keys.http_server',
    port,
    spellName,
    transport: 'http',
    headers: useGitHub
      ? { 'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT }
      : { 'X-Brave-Key': FASTMCP_CREDENTIALS.BRAVE_API_KEY },
    // keywords auto-extracted by CLI from tool names: analyze_dataset, get_table_schema, export_query_results
  }),

  SECURITY_KEYS_SSE: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.security_keys.sse_server',
    port,
    spellName,
    transport: 'sse',
    headers: { 'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT },
    // keywords auto-extracted by CLI from tool names: analyze_dataset, get_table_schema, export_query_results
  }),

  NO_AUTH_HTTP: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.no_auth.http_server',
    port,
    spellName,
    transport: 'http',
    // keywords auto-extracted by CLI from tool names: get_cpu_usage, get_memory_stats, get_disk_usage
  }),

  NO_AUTH_SSE: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.no_auth.sse_server',
    port,
    spellName,
    transport: 'sse',
    // keywords auto-extracted by CLI from tool names: get_cpu_usage, get_memory_stats, get_disk_usage
  }),

  OAUTH2_HTTP: (spellName: string, port: number): ServerConfig => ({
    module: 'servers.oauth2.http_server',
    port,
    spellName,
    transport: 'http',
    authType: 'oauth2',
    authOAuth2ClientId: FASTMCP_CREDENTIALS.OAUTH2_CLIENT_ID,
    authOAuth2ClientSecret: FASTMCP_CREDENTIALS.OAUTH2_CLIENT_SECRET,
    authOAuth2TokenUrl: 'http://localhost:9000/token',
    keywords: ['oauth2', 'authentication', 'token'],
  }),

  CDS_MCP_STDIO: (spellName: string): ServerConfig => ({
    module: '', // Not used for stdio
    port: 0, // Not used for stdio
    spellName,
    transport: 'stdio',
    keywords: ['cap', 'cds', 'sap', 'entity', 'service'],
  }),

  UI5_MCP_STDIO: (spellName: string): ServerConfig => ({
    module: '', // Not used for stdio
    port: 0, // Not used for stdio
    spellName,
    transport: 'stdio',
    env: { UI5_LOG_LVL: 'verbose' },
    keywords: ['ui5', 'sapui5', 'fiori', 'component'],
  }),
} as const;
