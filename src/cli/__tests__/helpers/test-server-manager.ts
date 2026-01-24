/**
 * Test Server Manager - Start/Stop Real FastMCP Servers for Integration Tests
 * NO MOCKS - manages actual Python server processes
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

export const FASTMCP_PORTS = {
  BASIC_AUTH_HTTP: 8000,
  BASIC_AUTH_SSE: 8001,
  API_KEY_HTTP: 8002,
  API_KEY_SSE: 8003,
  SECURITY_KEYS_HTTP: 8004,
  SECURITY_KEYS_SSE: 8005,
  OAUTH2_HTTP: 8006,
  NO_AUTH_HTTP: 8007,
  NO_AUTH_SSE: 8008,
  OAUTH2_PROVIDER: 9000,
  // New ports for new test files (to avoid conflicts when running in parallel)
  CONCURRENCY_HTTP: 8009,
  CONCURRENCY_SSE: 8010,
  FILE_CONFLICTS_HTTP: 8011,
  SPELL_OVERWRITE_HTTP: 8012,
  PROBE_FAILURE_HTTP: 8013,
  CREDENTIAL_LEAK_HTTP: 8014,
  FILE_CONFLICTS_SSE: 8015,
  SECURITY_LOGGING_HTTP: 8016,
  API_KEY_HTTP_HEADER: 8050, // Dedicated port for api-key-http-header test (custom header pattern)

  // Gateway Integration Test Ports (8017-8050)
  // Test File 1: gateway-intent-resolution.e2e.test.ts
  GATEWAY_BASIC_AUTH_HTTP_TIER1: 8017,
  GATEWAY_BASIC_AUTH_SSE_TIER1: 8018,
  GATEWAY_API_KEY_HTTP_TIER1: 8019,
  GATEWAY_API_KEY_SSE_TIER1: 8020,
  GATEWAY_SEC_KEYS_HTTP_TIER1: 8021,
  GATEWAY_SEC_KEYS_SSE_TIER1: 8022,
  GATEWAY_NO_AUTH_HTTP_TIER1: 8023,
  GATEWAY_NO_AUTH_SSE_TIER1: 8024,
  GATEWAY_OAUTH2_HTTP_TIER1: 8025,
  GATEWAY_STEERING_TEST: 8026,
  GATEWAY_TOKEN_SAVINGS_TEST: 8027,
  GATEWAY_TIER2_POSTGRES: 8028,
  GATEWAY_TIER2_MYSQL: 8029,
  GATEWAY_TIER3_WEAK_MATCH: 8030,
  GATEWAY_TIER3_NOT_FOUND: 8031,

  // Test File 2: gateway-auth-flows.e2e.test.ts
  GATEWAY_AUTH_BASIC_HTTP: 8032,
  GATEWAY_AUTH_BASIC_SSE: 8033,
  GATEWAY_AUTH_API_KEY_HTTP: 8034,
  GATEWAY_AUTH_API_KEY_SSE: 8035,
  GATEWAY_AUTH_SEC_KEYS_GITHUB: 8036,
  GATEWAY_AUTH_SEC_KEYS_BRAVE: 8037,
  GATEWAY_AUTH_SEC_KEYS_SSE: 8038,
  GATEWAY_AUTH_NO_AUTH_HTTP: 8039,
  GATEWAY_AUTH_NO_AUTH_SSE: 8040,

  // Test File 3: gateway-turn-based-cleanup.e2e.test.ts
  GATEWAY_CLEANUP_KEEP_ALIVE: 8041,
  GATEWAY_CLEANUP_SERVER_A: 8042,
  GATEWAY_CLEANUP_SERVER_B: 8043,
  GATEWAY_CLEANUP_TOOLS_CHANGED: 8044,

  // Test File 4: gateway-parallel-servers.e2e.test.ts
  GATEWAY_PARALLEL_CALCULATOR: 8045,
  GATEWAY_PARALLEL_WEATHER: 8046,
  GATEWAY_PARALLEL_GITHUB: 8047,
  GATEWAY_PARALLEL_ROUTING_A: 8048,
  GATEWAY_PARALLEL_ROUTING_B: 8049,
} as const;

// secretlint-disable
export const FASTMCP_CREDENTIALS = {
  USERNAME: 'testuser',
  PASSWORD: 'testpass123',
  API_KEY: 'test-api-key-12345',
  GITHUB_PAT: 'ghp_test1234567890abcdefghijklmnopqrstuvwxyz', // Test fixture token, not real
  BRAVE_API_KEY: 'BSA1234567890abcdefghijklmnopqrstuvwxyz',
  OAUTH2_CLIENT_ID: 'test-client-id',
  OAUTH2_CLIENT_SECRET: 'test-client-secret',
} as const;
// secretlint-enable

/**
 * Check if TCP port is in use
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
    const net = require('net');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const server = net.createServer();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    server.once('error', () => resolve(true));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    server.once('listening', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      server.close();
      resolve(false);
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Wait for port to become available (server started)
 */
export async function waitForPort(port: number, timeoutMs: number = 15000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await isPortInUse(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/**
 * Wait for port to be released (server stopped)
 */
export async function waitForPortRelease(port: number, timeoutMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!(await isPortInUse(port))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

// Map server modules to bash script names
const SERVER_SCRIPT_MAP: Record<string, string> = {
  'servers.basic_auth.http_server': 'start-basic-auth-http.sh',
  'servers.basic_auth.sse_server': 'start-basic-auth-sse.sh',
  'servers.api_key.http_server': 'start-api-key-http.sh',
  'servers.api_key.sse_server': 'start-api-key-sse.sh',
  'servers.security_keys.http_server': 'start-security-keys-http.sh',
  'servers.security_keys.sse_server': 'start-security-keys-sse.sh',
  'servers.oauth2.http_server': 'start-oauth2-http.sh',
  'servers.oauth2.provider': 'start-oauth2-provider.sh',
  'servers.no_auth.http_server': 'start-no-auth-http.sh',
  'servers.no_auth.sse_server': 'start-no-auth-sse.sh',
};

/**
 * Start a FastMCP Python server process using bash script
 */
export async function startFastMCPServer(
  serverModule: string,
  port: number
): Promise<ChildProcess> {
  const scriptName = SERVER_SCRIPT_MAP[serverModule];
  if (!scriptName) {
    throw new Error(`Unknown server module: ${serverModule}`);
  }

  const scriptsDir = join(__dirname, '../../../../tests/fastmcp/scripts');
  const scriptPath = join(scriptsDir, scriptName);

  // eslint-disable-next-line no-console
  console.log(`[SERVER] Starting ${serverModule} on port ${port}...`);

  const serverProcess = spawn('bash', [scriptPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: port.toString(),
    },
  });

  // Capture output for debugging
  serverProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString().trim();
    if (output.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[${serverModule}:${port}] ${output}`);
    }
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    const output = data.toString().trim();
    if (output.length > 0) {
      console.error(`[${serverModule}:${port}] ${output}`);
    }
  });

  serverProcess.on('error', (err) => {
    console.error(`[${serverModule}:${port}] Process error:`, err);
  });

  // Wait for server to be ready
  const ready = await waitForPort(port, 15000);
  if (!ready) {
    serverProcess.kill('SIGKILL');
    throw new Error(`FastMCP server ${serverModule} failed to start on port ${port} within 15s`);
  }

  // eslint-disable-next-line no-console
  console.log(`[SERVER] ✓ ${serverModule} ready on port ${port}`);
  return serverProcess;
}

/**
 * Stop a server process and wait for cleanup using stop-server.sh script
 */
export async function stopServer(
  serverProcess: ChildProcess | undefined,
  port: number,
  serverName: string
): Promise<void> {
  if (!serverProcess || typeof serverProcess.pid !== 'number') return;

  // eslint-disable-next-line no-console
  console.log(`[SERVER] Stopping ${serverName} on port ${port}...`);

  // Try graceful termination of the bash process first
  serverProcess.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // If bash process still alive, force kill it
  if (serverProcess.exitCode === null) {
    console.warn(`[SERVER] Force killing bash process for ${serverName}`);
    serverProcess.kill('SIGKILL');
  }

  // Use stop-server.sh script to ensure Python process is also killed
  const scriptsDir = join(__dirname, '../../../../tests/fastmcp/scripts');
  const stopScriptPath = join(scriptsDir, 'stop-server.sh');

  const stopProcess = spawn('bash', [stopScriptPath, port.toString()], {
    stdio: 'inherit',
  });

  await new Promise<void>((resolve) => {
    stopProcess.on('close', () => resolve());
  });

  // Wait for port release
  const released = await waitForPortRelease(port, 3000);
  if (!released) {
    console.warn(`[SERVER] Port ${port} still in use after stopping ${serverName}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[SERVER] ✓ ${serverName} stopped, port ${port} released`);
  }
}
