/**
 * Spell File Validator - Comprehensive validation of spell YAML files
 * Validates every field per SpellConfig schema and ADR-0015
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { expect } from 'vitest';
import type { SpellConfig } from '../../../core/types';
import { parse as parseYAML } from 'yaml';

/**
 * Assert that a value is a placeholder (${VAR_NAME})
 */
export function assertIsPlaceholder(value: string, fieldName: string): void {
  expect(value, `${fieldName} should be a placeholder like \${VAR_NAME}`).toMatch(
    /^\${[A-Z_][A-Z0-9_]*}$/
  );
}

/**
 * Assert that a value is NOT a placeholder (literal value)
 */
export function assertIsLiteral(value: string, fieldName: string): void {
  expect(value, `${fieldName} should be a literal value, not a placeholder`).not.toMatch(
    /^\${.*}$/
  );
}

/**
 * Read and parse spell YAML file
 */
export async function readSpellFile(filePath: string): Promise<SpellConfig> {
  expect(existsSync(filePath), `Spell file should exist at ${filePath}`).toBe(true);
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseYAML(content) as SpellConfig;
  return parsed;
}

/**
 * Read .env file and parse into key-value map
 */
export async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = await readFile(filePath, 'utf-8');
  const env: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  }

  return env;
}

/**
 * Validate basic spell structure (name, version, description, keywords)
 */
export function validateBasicSpellStructure(spell: SpellConfig, expectedName: string): void {
  // Name
  expect(spell.name, 'spell.name should match expected').toBe(expectedName);
  expect(spell.name, 'spell.name should be lowercase alphanumeric with hyphens').toMatch(
    /^[a-z0-9][a-z0-9-]*$/
  );

  // Version
  expect(spell.version, 'spell.version should be defined').toBeDefined();
  expect(spell.version, 'spell.version should be semantic version (X.Y.Z)').toMatch(
    /^\d+\.\d+\.\d+$/
  );

  // Description
  expect(spell.description, 'spell.description should be defined').toBeDefined();
  expect(spell.description, 'spell.description should be non-empty').not.toBe('');
  expect(spell.description.length, 'spell.description should be reasonable length').toBeGreaterThan(
    10
  );

  // Keywords
  expect(spell.keywords, 'spell.keywords should be defined').toBeDefined();
  expect(Array.isArray(spell.keywords), 'spell.keywords should be an array').toBe(true);
  expect(
    spell.keywords.length,
    'spell.keywords should have at least 3 keywords'
  ).toBeGreaterThanOrEqual(3);
  expect(
    spell.keywords.length,
    'spell.keywords should have at most 20 keywords'
  ).toBeLessThanOrEqual(20);

  // All keywords should be lowercase strings
  for (const keyword of spell.keywords) {
    expect(typeof keyword, 'Each keyword should be a string').toBe('string');
    expect(keyword, 'Keywords should be non-empty').not.toBe('');
    expect(keyword, 'Keywords should be lowercase').toBe(keyword.toLowerCase());
  }

  // Steering (optional but should be reasonable if present)
  if (typeof spell.steering === 'string' && spell.steering.trim().length > 0) {
    expect(spell.steering.length, 'spell.steering should be non-empty if present').toBeGreaterThan(
      10
    );
    expect(
      spell.steering.length,
      'spell.steering should not exceed 5000 chars'
    ).toBeLessThanOrEqual(5000);
  }
}

/**
 * Validate HTTP/SSE server config
 */
export function validateHTTPOrSSEServerConfig(
  spell: SpellConfig,
  expectedTransport: 'http' | 'sse',
  expectedUrl: string
): void {
  const server = spell.server;

  // Transport
  expect(server.transport, 'server.transport should match expected').toBe(expectedTransport);

  // URL
  expect('url' in server, 'server should have url property for HTTP/SSE').toBe(true);
  if ('url' in server) {
    expect(server.url, 'server.url should match expected').toBe(expectedUrl);
    expect(server.url, 'server.url should start with http:// or https://').toMatch(/^https?:\/\//);
  }
}

/**
 * Validate stdio server config
 */
export function validateStdioServerConfig(
  spell: SpellConfig,
  expectedCommand: string,
  expectedArgs?: string[],
  expectedTransport?: 'stdio'
): void {
  const server = spell.server;

  // Transport should match what was explicitly requested
  // If expectedTransport is 'stdio', the spell should have transport: 'stdio'
  if (expectedTransport) {
    expect(server.transport, 'server.transport should match requested transport').toBe(
      expectedTransport
    );
  }

  // Command
  expect('command' in server, 'server should have command property for stdio').toBe(true);
  if ('command' in server) {
    expect(server.command, 'server.command should match expected').toBe(expectedCommand);
  }

  // Args (if provided)
  if (expectedArgs && 'args' in server) {
    expect('args' in server, 'server should have args property').toBe(true);
    expect(Array.isArray(server.args), 'server.args should be an array').toBe(true);
    expect(server.args, 'server.args should match expected').toEqual(expectedArgs);
  }
}

/**
 * Validate Bearer token auth in spell
 */
export function validateBearerAuthInSpell(spell: SpellConfig): string {
  const server = spell.server;
  if (!('auth' in server)) {
    throw new Error('Expected server with auth property');
  }
  expect(server.auth, 'server.auth should be defined for Bearer auth').toBeDefined();

  const auth = server.auth!;
  expect(auth.type, 'auth.type should be bearer').toBe('bearer');
  expect(auth.token, 'auth.token should be defined').toBeDefined();
  assertIsPlaceholder(auth.token!, 'auth.token');

  // Extract placeholder variable name
  const match = auth.token!.match(/^\${([A-Z_][A-Z0-9_]*)}$/);
  expect(match, 'auth.token should match placeholder pattern').toBeTruthy();
  return match![1];
}

/**
 * Validate Basic Auth in spell
 */
export function validateBasicAuthInSpell(spell: SpellConfig): {
  usernameVar: string;
  passwordVar: string;
} {
  const server = spell.server;
  if (!('auth' in server)) {
    throw new Error('Expected server with auth property');
  }
  expect(server.auth, 'server.auth should be defined for Basic Auth').toBeDefined();

  const auth = server.auth!;
  expect(auth.type, 'auth.type should be basic').toBe('basic');
  expect(auth.username, 'auth.username should be defined').toBeDefined();
  expect(auth.password, 'auth.password should be defined').toBeDefined();

  assertIsPlaceholder(auth.username!, 'auth.username');
  assertIsPlaceholder(auth.password!, 'auth.password');

  // Extract variable names
  const usernameMatch = auth.username!.match(/^\${([A-Z_][A-Z0-9_]*)}$/);
  const passwordMatch = auth.password!.match(/^\${([A-Z_][A-Z0-9_]*)}$/);

  expect(usernameMatch, 'auth.username should match placeholder pattern').toBeTruthy();
  expect(passwordMatch, 'auth.password should match placeholder pattern').toBeTruthy();

  return {
    usernameVar: usernameMatch![1],
    passwordVar: passwordMatch![1],
  };
}

/**
 * Validate custom headers in spell
 */
export function validateCustomHeadersInSpell(
  spell: SpellConfig,
  expectedHeaders: Record<string, string>
): Record<string, string> {
  const server = spell.server;
  if (!('headers' in server)) {
    throw new Error('Expected server with headers property');
  }
  expect(server.headers, 'server.headers should be defined').toBeDefined();

  const headers = server.headers!;
  const headerVars: Record<string, string> = {};

  for (const [headerName] of Object.entries(expectedHeaders)) {
    expect(headers[headerName], `headers[${headerName}] should be defined`).toBeDefined();
    assertIsPlaceholder(headers[headerName], `headers[${headerName}]`);

    // Extract variable name
    const headerValue = headers[headerName];
    const match = headerValue.match(/^\${([A-Z_][A-Z0-9_]*)}$/);
    expect(match, `headers[${headerName}] should match placeholder pattern`).toBeTruthy();
    if (match) {
      headerVars[headerName] = match[1];
    }
  }

  return headerVars;
}

/**
 * Validate environment variables in stdio server config
 */
export function validateEnvVarsInSpell(
  spell: SpellConfig,
  expectedEnvVars: Record<string, string>
): Record<string, string> {
  const server = spell.server;
  if (!('env' in server)) {
    throw new Error('Expected stdio server with env property');
  }
  expect(server.env, 'server.env should be defined for stdio with env vars').toBeDefined();

  const env = server.env!;
  const envVars: Record<string, string> = {};

  for (const [envKey] of Object.entries(expectedEnvVars)) {
    expect(env[envKey], `env[${envKey}] should be defined`).toBeDefined();
    assertIsPlaceholder(env[envKey], `env[${envKey}]`);

    // Extract variable name
    const envValue = env[envKey];
    const match = envValue.match(/^\${([A-Z_][A-Z0-9_]*)}$/);
    expect(match, `env[${envKey}] should match placeholder pattern`).toBeTruthy();
    if (match) {
      envVars[envKey] = match[1];
    }
  }

  return envVars;
}

/**
 * Validate that .env file contains expected literal values
 */
export function validateEnvFileLiterals(
  envFile: Record<string, string>,
  expectedVars: Record<string, string>
): void {
  for (const [varName, expectedValue] of Object.entries(expectedVars)) {
    expect(envFile[varName], `.env should contain ${varName}`).toBeDefined();
    expect(envFile[varName], `.env[${varName}] should be literal value`).toBe(expectedValue);
    assertIsLiteral(envFile[varName], `.env[${varName}]`);
  }
}

/**
 * Validate that no auth or headers are present
 */
export function validateNoAuthOrHeaders(spell: SpellConfig): void {
  const server = spell.server;
  if ('auth' in server) {
    expect(server.auth, 'server.auth should be undefined for no-auth servers').toBeUndefined();
  }
  if ('headers' in server) {
    expect(
      server.headers,
      'server.headers should be undefined for servers without custom headers'
    ).toBeUndefined();
  }
}
