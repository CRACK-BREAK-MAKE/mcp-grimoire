# Gateway Integration Test Plan - Complete User Flow Testing

**Document Type**: Test Plan
**Author**: AI Analysis Based on Existing Patterns
**Date**: January 22, 2026
**Status**: Proposed
**Related Docs**:

- [integration-test-strategy.md](integration-test-strategy.md)
- [intent-resolution-solution.md](intent-resolution-solution.md)
- [turn-based-lifecycle-explained.md](turn-based-lifecycle-explained.md)
- [ADR-0006: 5-Turn Inactivity Threshold](adr/0006-five-turn-inactivity-threshold.md)
- [ADR-0009: Multi-Tier Confidence-Based Intent Resolution](adr/0009-multi-tier-confidence-based-intent-resolution.md)

---

## Executive Summary

**Current State**: ✅ 19/19 CLI integration tests passing (spell creation phase validated)

**Next Phase**: Test the complete user flow from intent resolution → server spawning → tool execution → cleanup

**Goal**: Validate that the gateway correctly:

1. Resolves user intent and spawns appropriate MCP servers
2. Returns `tools/list_changed` notifications with correct tools
3. Routes tool calls to spawned servers
4. Cleans up inactive servers after 5 turns
5. Handles all 11 server types (9 HTTP/SSE + 2 stdio) with their specific auth patterns

**Testing Philosophy**: NO MOCKS - Real servers, real auth, real spawning, real cleanup

---

## Understanding the Complete User Flow

### Phase 1: Spell Creation (✅ COMPLETE - 19 tests passing)

```
User runs CLI → CLI creates spell files with auth → Stored in ~/.grimoire/
```

**Status**: Fully tested via `src/cli/__tests__/*.integration.test.ts`

### Phase 2: Gateway Operation (🚧 THIS PLAN - To be implemented)

```
AI Agent sends query → resolve_intent → Gateway analysis →
Server spawning → tools/list_changed → AI uses tools →
5 turns inactive → cleanup → Next query cycle
```

**Status**: Partially tested (unit/mocked tests exist, need real integration tests)

---

## Test Architecture Overview

### File Location

```
src/presentation/__tests__/
  gateway-intent-resolution.e2e.test.ts       ← NEW: Intent → spawning flow
  gateway-auth-flows.e2e.test.ts              ← NEW: All 11 auth patterns
  gateway-turn-based-cleanup.e2e.test.ts      ← NEW: 5-turn cleanup validation
  gateway-parallel-servers.e2e.test.ts        ← NEW: Multiple concurrent servers

  gateway-real-workflow.integration.test.ts   ← EXISTS: Basic workflow (mocked)
  gateway-lifecycle.e2e.test.ts               ← EXISTS: Turn cleanup (limited)
  gateway-lifecycle.integration.test.ts       ← EXISTS: Lifecycle basics
```

### Naming Convention

- **`*.e2e.test.ts`** = End-to-end with REAL servers (NO MOCKS)
- **`*.integration.test.ts`** = Integration with some mocking allowed
- **`*.test.ts`** = Unit tests with full mocking

---

## Server Matrix - 11 MCP Servers to Test

### HTTP/SSE Servers (9 total)

| #   | Server Type        | Port | Auth Pattern                                   | Credentials          | Test Focus                           |
| --- | ------------------ | ---- | ---------------------------------------------- | -------------------- | ------------------------------------ |
| 1   | Basic Auth HTTP    | 8000 | Basic (username/password)                      | testuser/testpass123 | Basic auth headers, Base64 encoding  |
| 2   | Basic Auth SSE     | 8001 | Basic (username/password)                      | testuser/testpass123 | Basic auth with SSE transport        |
| 3   | API Key HTTP       | 8002 | Bearer token                                   | test-api-key-12345   | Bearer token in Authorization header |
| 4   | API Key SSE        | 8003 | Bearer token                                   | test-api-key-12345   | Bearer token with SSE transport      |
| 5   | Security Keys HTTP | 8004 | Custom headers (X-GitHub-Token OR X-Brave-Key) | ghp_test.../BSA...   | Custom header auth patterns          |
| 6   | Security Keys SSE  | 8005 | Custom headers (X-GitHub-Token OR X-Brave-Key) | ghp_test.../BSA...   | Custom headers with SSE              |
| 7   | No Auth HTTP       | 8007 | None                                           | N/A                  | Public server pattern                |
| 8   | No Auth SSE        | 8008 | None                                           | N/A                  | Public server with SSE               |
| 9   | OAuth2 HTTP        | 8006 | OAuth2 Client Credentials                      | client-id/secret     | OAuth2 token exchange flow           |

### Stdio Servers (2 total)

| #   | Server Name      | Command | Args                         | Env Vars            | Test Focus             |
| --- | ---------------- | ------- | ---------------------------- | ------------------- | ---------------------- |
| 10  | CAP.js (cds-mcp) | npx     | ['-y', '@cap-js/mcp-server'] | None                | Stdio without env vars |
| 11  | UI5 MCP          | npx     | ['-y', '@ui5/mcp-server']    | UI5_LOG_LVL=verbose | Stdio with env vars    |

---

## Test Strategy - Following Existing Patterns

### Core Test Pattern: Arrange → Probe → Create → Test

**Each test follows this workflow** (matches CLI test pattern):

```typescript
describe('Gateway Test', () => {
  it('should test scenario', async () => {
    // 1. ARRANGE: Start real MCP server with FIXED port from registry
    const port = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP_TIER1; // 8017 (fixed)
    const spellName = GATEWAY_SPELL_NAMES.BASIC_AUTH_HTTP_TIER1; // 'gateway-basic-auth-http-tier1' (fixed)
    const serverProcess = await startFastMCPServer('basic_auth_http', port);

    // 2. PROBE: Discover server capabilities
    const capabilities = await probeServer(`http://localhost:${port}/mcp`);

    // 3. CREATE: Generate spell file with FIXED name from registry
    await createSpellFile(spellName, {
      url: `http://localhost:${port}/mcp`,
      auth: { type: 'basic', username: 'testuser', password: 'testpass123' },
      capabilities, // From probe step
    });

    // 4. TEST: Use resolve_intent with gateway
    const gateway = new GrimoireServer();
    await gateway.start();

    const result = await gateway.handleResolveIntent({
      query: 'authenticate user with basic auth',
    });

    // 5. ASSERT: Validate gateway behavior
    expect(result.status).toBe('activated');
    expect(result.power.name).toBe(spellName);

    // 6. CLEANUP
    await gateway.shutdown();
    await stopServer(serverProcess);
    await deleteSpellFile(spellName);
  });
});
```

### Pattern Analysis from CLI Tests

#### 1. **Server Management** (from `test-server-manager.ts`)

```typescript
// ✅ Pattern: Unique ports per test to avoid conflicts
const uniquePort = basePort + testOffset;

// ✅ Pattern: Start/stop real Python servers
export async function startFastMCPServer(moduleName: string, port: number): Promise<ChildProcess>;

// ✅ Pattern: Check port availability before starting
await isPortInUse(port);
```

**Application to Gateway Tests**: Start servers in each test with unique ports, then test gateway discovering them

#### 2. **Spell Validation** (from `spell-validator.ts`)

```typescript
// ✅ Pattern: Read and validate spell YAML
export function readSpellFile(path: string): SpellConfig;

// ✅ Pattern: Type guards for server config unions
if ('url' in server) {
  /* HTTP/SSE */
}
if ('command' in server) {
  /* stdio */
}

// ✅ Pattern: Validate auth patterns
validateBasicAuthInSpell(spell);
validateBearerAuthInSpell(spell);
```

**Application to Gateway Tests**: Pre-create spell files, validate gateway correctly reads/uses them

#### 3. **Parallel Execution** (from `vitest.config.ts`)

```typescript
// ✅ Pattern: Tests run in parallel by default
test: {
  fileParallelism: true,
  // Each test suite isolated
}
```

**Application to Gateway Tests**: Unique spell names per test to avoid collisions

---

## Port and Spell Name Registry

**Reference**: `src/cli/__tests__/helpers/test-server-manager.ts` - `FASTMCP_PORTS` constant

### Port Allocation Strategy

**Fixed Ports (from FASTMCP_PORTS)**:

- `8000-8008`: Core server types (used by CLI tests)
- `8009-8016`: CLI additional test scenarios
- `8017-8050`: **Gateway integration tests** (NEW)
- `9000`: OAuth2 provider

**Gateway Test Ports**: Each test uses a dedicated fixed port to ensure isolation and avoid conflicts.

### Spell Name Registry - Per Test File

#### Test File 1: `gateway-intent-resolution.e2e.test.ts`

| Test Case                 | Server Module        | Port Constant                   | Port # | Spell Name                        |
| ------------------------- | -------------------- | ------------------------------- | ------ | --------------------------------- |
| Basic Auth HTTP Tier 1    | `basic_auth_http`    | `GATEWAY_BASIC_AUTH_HTTP_TIER1` | 8017   | `gateway-basic-auth-http-tier1`   |
| Basic Auth SSE Tier 1     | `basic_auth_sse`     | `GATEWAY_BASIC_AUTH_SSE_TIER1`  | 8018   | `gateway-basic-auth-sse-tier1`    |
| API Key HTTP Tier 1       | `api_key_http`       | `GATEWAY_API_KEY_HTTP_TIER1`    | 8019   | `gateway-api-key-http-tier1`      |
| API Key SSE Tier 1        | `api_key_sse`        | `GATEWAY_API_KEY_SSE_TIER1`     | 8020   | `gateway-api-key-sse-tier1`       |
| Security Keys HTTP Tier 1 | `security_keys_http` | `GATEWAY_SEC_KEYS_HTTP_TIER1`   | 8021   | `gateway-sec-keys-http-tier1`     |
| Security Keys SSE Tier 1  | `security_keys_sse`  | `GATEWAY_SEC_KEYS_SSE_TIER1`    | 8022   | `gateway-sec-keys-sse-tier1`      |
| No Auth HTTP Tier 1       | `no_auth_http`       | `GATEWAY_NO_AUTH_HTTP_TIER1`    | 8023   | `gateway-no-auth-http-tier1`      |
| No Auth SSE Tier 1        | `no_auth_sse`        | `GATEWAY_NO_AUTH_SSE_TIER1`     | 8024   | `gateway-no-auth-sse-tier1`       |
| OAuth2 HTTP Tier 1        | `oauth2_http`        | `GATEWAY_OAUTH2_HTTP_TIER1`     | 8025   | `gateway-oauth2-http-tier1`       |
| CAP.js Stdio Tier 1       | N/A (stdio)          | N/A                             | N/A    | `gateway-cds-mcp-tier1`           |
| UI5 Stdio Tier 1          | N/A (stdio)          | N/A                             | N/A    | `gateway-ui5-mcp-tier1`           |
| Steering Injection        | `basic_auth_http`    | `GATEWAY_STEERING_TEST`         | 8026   | `gateway-steering-injection-test` |
| Token Savings             | `api_key_http`       | `GATEWAY_TOKEN_SAVINGS_TEST`    | 8027   | `gateway-token-savings-test`      |
| Tier 2 Postgres           | `no_auth_http`       | `GATEWAY_TIER2_POSTGRES`        | 8028   | `gateway-tier2-postgres-db`       |
| Tier 2 MySQL              | `api_key_http`       | `GATEWAY_TIER2_MYSQL`           | 8029   | `gateway-tier2-mysql-db`          |
| Tier 3 Weak Match         | `no_auth_http`       | `GATEWAY_TIER3_WEAK_MATCH`      | 8030   | `gateway-tier3-weak-match`        |
| Tier 3 Not Found          | `basic_auth_http`    | `GATEWAY_TIER3_NOT_FOUND`       | 8031   | `gateway-tier3-not-found`         |

#### Test File 2: `gateway-auth-flows.e2e.test.ts`

| Test Case                   | Server Module        | Port Constant                  | Port # | Spell Name                  |
| --------------------------- | -------------------- | ------------------------------ | ------ | --------------------------- |
| Basic Auth HTTP             | `basic_auth_http`    | `GATEWAY_AUTH_BASIC_HTTP`      | 8032   | `gateway-auth-basic-http`   |
| Basic Auth SSE              | `basic_auth_sse`     | `GATEWAY_AUTH_BASIC_SSE`       | 8033   | `gateway-auth-basic-sse`    |
| API Key HTTP                | `api_key_http`       | `GATEWAY_AUTH_API_KEY_HTTP`    | 8034   | `gateway-auth-api-key-http` |
| API Key SSE                 | `api_key_sse`        | `GATEWAY_AUTH_API_KEY_SSE`     | 8035   | `gateway-auth-api-key-sse`  |
| Security Keys HTTP (GitHub) | `security_keys_http` | `GATEWAY_AUTH_SEC_KEYS_GITHUB` | 8036   | `gateway-auth-github-keys`  |
| Security Keys HTTP (Brave)  | `security_keys_http` | `GATEWAY_AUTH_SEC_KEYS_BRAVE`  | 8037   | `gateway-auth-brave-keys`   |
| Security Keys SSE           | `security_keys_sse`  | `GATEWAY_AUTH_SEC_KEYS_SSE`    | 8038   | `gateway-auth-sec-keys-sse` |
| No Auth HTTP                | `no_auth_http`       | `GATEWAY_AUTH_NO_AUTH_HTTP`    | 8039   | `gateway-auth-no-auth-http` |
| No Auth SSE                 | `no_auth_sse`        | `GATEWAY_AUTH_NO_AUTH_SSE`     | 8040   | `gateway-auth-no-auth-sse`  |
| Stdio with Env (UI5)        | N/A (stdio)          | N/A                            | N/A    | `gateway-auth-ui5-with-env` |
| Stdio without Env (CAP)     | N/A (stdio)          | N/A                            | N/A    | `gateway-auth-cds-no-env`   |

#### Test File 3: `gateway-turn-based-cleanup.e2e.test.ts`

| Test Case                   | Server Module     | Port Constant                   | Port # | Spell Name                      |
| --------------------------- | ----------------- | ------------------------------- | ------ | ------------------------------- |
| Keep Alive Active Server    | `no_auth_http`    | `GATEWAY_CLEANUP_KEEP_ALIVE`    | 8041   | `gateway-cleanup-keep-alive`    |
| Cleanup Server A (inactive) | `no_auth_http`    | `GATEWAY_CLEANUP_SERVER_A`      | 8042   | `gateway-cleanup-server-a`      |
| Cleanup Server B (active)   | `api_key_http`    | `GATEWAY_CLEANUP_SERVER_B`      | 8043   | `gateway-cleanup-server-b`      |
| Tools List Changed          | `basic_auth_http` | `GATEWAY_CLEANUP_TOOLS_CHANGED` | 8044   | `gateway-cleanup-tools-changed` |

#### Test File 4: `gateway-parallel-servers.e2e.test.ts`

| Test Case         | Server Module        | Port Constant                 | Port # | Spell Name                    |
| ----------------- | -------------------- | ----------------------------- | ------ | ----------------------------- |
| Calculator Server | `no_auth_http`       | `GATEWAY_PARALLEL_CALCULATOR` | 8045   | `gateway-parallel-calculator` |
| Weather Server    | `api_key_http`       | `GATEWAY_PARALLEL_WEATHER`    | 8046   | `gateway-parallel-weather`    |
| GitHub Server     | `security_keys_http` | `GATEWAY_PARALLEL_GITHUB`     | 8047   | `gateway-parallel-github`     |
| Routing Server A  | `no_auth_http`       | `GATEWAY_PARALLEL_ROUTING_A`  | 8048   | `gateway-parallel-routing-a`  |
| Routing Server B  | `api_key_http`       | `GATEWAY_PARALLEL_ROUTING_B`  | 8049   | `gateway-parallel-routing-b`  |

### Implementation Helpers

```typescript
// src/presentation/__tests__/helpers/gateway-test-helpers.ts

import { FASTMCP_PORTS } from '../../../cli/__tests__/helpers/test-server-manager';

/**
 * Gateway test spell names - fixed, meaningful names for each test
 * NO random timestamps - predictable and debuggable
 */
export const GATEWAY_SPELL_NAMES = {
  // Test File 1: gateway-intent-resolution.e2e.test.ts
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

  // Test File 4: gateway-parallel-servers.e2e.test.ts
  PARALLEL_CALCULATOR: 'gateway-parallel-calculator',
  PARALLEL_WEATHER: 'gateway-parallel-weather',
  PARALLEL_GITHUB: 'gateway-parallel-github',
  PARALLEL_ROUTING_A: 'gateway-parallel-routing-a',
  PARALLEL_ROUTING_B: 'gateway-parallel-routing-b',
} as const;

// Example usage in tests:
const port = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP_TIER1; // 8017 (fixed)
const spellName = GATEWAY_SPELL_NAMES.BASIC_AUTH_HTTP_TIER1; // 'gateway-basic-auth-http-tier1' (fixed)
```

---

## Detailed Test Scenarios

### Test File 1: `gateway-intent-resolution.e2e.test.ts`

**Purpose**: Test resolve_intent with all 11 servers

**Test Matrix**: 11 servers × 3 confidence tiers = 33 tests

#### Tier 1: High Confidence (≥0.85) - Auto-Spawn Tests (11 tests)

```typescript
describe('Intent Resolution - Tier 1 High Confidence', () => {
  describe.each([
    {
      serverModule: 'basic_auth_http',
      port: FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP_TIER1, // 8017 (fixed)
      spellName: GATEWAY_SPELL_NAMES.BASIC_AUTH_HTTP_TIER1, // 'gateway-basic-auth-http-tier1'
      query: 'authenticate user with basic http',
      expectedTools: 3,
      keywords: ['authenticate', 'user', 'http', 'login'],
      auth: {
        type: 'basic',
        username: FASTMCP_CREDENTIALS.USERNAME,
        password: FASTMCP_CREDENTIALS.PASSWORD,
      },
    },
    {
      serverModule: 'basic_auth_sse',
      port: FASTMCP_PORTS.GATEWAY_BASIC_AUTH_SSE_TIER1, // 8018
      spellName: GATEWAY_SPELL_NAMES.BASIC_AUTH_SSE_TIER1,
      query: 'authenticate user with sse transport',
      expectedTools: 3,
      keywords: ['authenticate', 'user', 'sse'],
      auth: {
        type: 'basic',
        username: FASTMCP_CREDENTIALS.USERNAME,
        password: FASTMCP_CREDENTIALS.PASSWORD,
      },
    },
    {
      serverModule: 'api_key_http',
      port: FASTMCP_PORTS.GATEWAY_API_KEY_HTTP_TIER1, // 8019
      spellName: GATEWAY_SPELL_NAMES.API_KEY_HTTP_TIER1,
      query: 'get weather forecast with api',
      expectedTools: 3,
      keywords: ['weather', 'forecast', 'api'],
      auth: { type: 'bearer', token: FASTMCP_CREDENTIALS.API_KEY },
    },
    {
      serverModule: 'api_key_sse',
      port: FASTMCP_PORTS.GATEWAY_API_KEY_SSE_TIER1, // 8020
      spellName: GATEWAY_SPELL_NAMES.API_KEY_SSE_TIER1,
      query: 'get weather with sse',
      expectedTools: 3,
      keywords: ['weather', 'sse'],
      auth: { type: 'bearer', token: FASTMCP_CREDENTIALS.API_KEY },
    },
    {
      serverModule: 'security_keys_http',
      port: FASTMCP_PORTS.GATEWAY_SEC_KEYS_HTTP_TIER1, // 8021
      spellName: GATEWAY_SPELL_NAMES.SEC_KEYS_HTTP_TIER1,
      query: 'search github repositories',
      expectedTools: 3,
      keywords: ['github', 'search', 'repos'],
      headers: { 'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT },
    },
    {
      serverModule: 'security_keys_sse',
      port: FASTMCP_PORTS.GATEWAY_SEC_KEYS_SSE_TIER1, // 8022
      spellName: GATEWAY_SPELL_NAMES.SEC_KEYS_SSE_TIER1,
      query: 'search github with sse',
      expectedTools: 3,
      keywords: ['github', 'sse'],
      headers: { 'X-GitHub-Token': FASTMCP_CREDENTIALS.GITHUB_PAT },
    },
    {
      serverModule: 'no_auth_http',
      port: FASTMCP_PORTS.GATEWAY_NO_AUTH_HTTP_TIER1, // 8023
      spellName: GATEWAY_SPELL_NAMES.NO_AUTH_HTTP_TIER1,
      query: 'calculate numbers',
      expectedTools: 3,
      keywords: ['calculate', 'math', 'numbers'],
    },
    {
      serverModule: 'no_auth_sse',
      port: FASTMCP_PORTS.GATEWAY_NO_AUTH_SSE_TIER1, // 8024
      spellName: GATEWAY_SPELL_NAMES.NO_AUTH_SSE_TIER1,
      query: 'calculate with sse',
      expectedTools: 3,
      keywords: ['calculate', 'sse'],
    },
    {
      serverModule: 'oauth2_http',
      port: FASTMCP_PORTS.GATEWAY_OAUTH2_HTTP_TIER1, // 8025
      spellName: GATEWAY_SPELL_NAMES.OAUTH2_HTTP_TIER1,
      query: 'oauth2 authentication',
      expectedTools: 3,
      keywords: ['oauth2', 'auth'],
      // OAuth2 config handled separately
    },
    // Stdio servers - no port needed
    // ... CAP.js and UI5
  ])(
    '$serverModule server',
    ({ serverModule, port, spellName, query, expectedTools, keywords, auth, headers }) => {
      it('should auto-spawn server on high confidence query', async () => {
        // 1. ARRANGE: Start real MCP server with FIXED port (from registry)
        const serverProcess = await startFastMCPServer(serverModule, port); // port is FASTMCP_PORTS.GATEWAY_*

        // 2. PROBE: Get server capabilities
        const serverUrl = `http://localhost:${port}/mcp`;
        const capabilities = await probeServerCapabilities(serverUrl, { auth, headers });

        // 3. CREATE: Generate spell file with FIXED name (from registry)
        await createDynamicSpellFile(spellName, {
          // spellName is GATEWAY_SPELL_NAMES.*
          url: serverUrl,
          auth,
          headers,
          keywords,
          tools: capabilities.tools,
        });

        // 4. TEST: Initialize gateway (discovers spell files)
        const gateway = new GrimoireServer();
        await gateway.start();

        // 5. ACT: Call resolve_intent with high-confidence query
        const response = await gateway.handleResolveIntent({ query });
        const result = JSON.parse(response.content[0].text);

        // 6. ASSERT: Tier 1 response
        expect(result.status).toBe('activated');
        expect(result.power.name).toBe(spellName); // Fixed spell name from registry
        expect(result.power.confidence).toBeGreaterThanOrEqual(0.85);

        // ASSERT: Tools returned match probed capabilities
        expect(result.tools).toHaveLength(expectedTools);
        expect(result.tools.map((t) => t.name)).toEqual(
          expect.arrayContaining(capabilities.tools.map((t) => t.name))
        );

        // ASSERT: Gateway connected to the REAL running server
        expect(gateway.lifecycle.isActive(spellName)).toBe(true);

        // ASSERT: tools/list contains tools from our server
        const toolsList = gateway.getAllTools();
        const childTools = toolsList.filter((t) => !t.name.startsWith('resolve_intent'));
        expect(childTools.length).toBeGreaterThanOrEqual(expectedTools);

        // 7. CLEANUP: Shutdown gateway, stop server, delete spell file
        await gateway.shutdown();
        await stopServer(serverProcess);
        await deleteSpellFile(spellName); // Delete using fixed name
      });

      it('should inject steering into tool descriptions', async () => {
        // Use dedicated steering test port and spell name
        const steeringPort = FASTMCP_PORTS.GATEWAY_STEERING_TEST; // 8026
        const steeringSpellName = GATEWAY_SPELL_NAMES.STEERING_INJECTION; // 'gateway-steering-injection-test'

        // 1-3. ARRANGE + PROBE + CREATE
        const serverProcess = await startFastMCPServer(serverModule, steeringPort);
        const serverUrl = `http://localhost:${steeringPort}/mcp`;
        const capabilities = await probeServerCapabilities(serverUrl, { auth, headers });

        // Add steering guidance to spell
        await createDynamicSpellFile(steeringSpellName, {
          url: serverUrl,
          auth,
          headers,
          keywords,
          tools: capabilities.tools,
          steering: [
            {
              when: 'User needs authentication',
              guide: 'Use this tool to authenticate users securely',
            },
          ],
        });

        // 4. TEST
        const gateway = new GrimoireServer();
        await gateway.start();

        const response = await gateway.handleResolveIntent({ query });
        const result = JSON.parse(response.content[0].text);

        // ASSERT: Steering injected
        const firstTool = result.tools[0];
        expect(firstTool.description).toContain('--- EXPERT GUIDANCE ---');
        expect(firstTool.description).toContain('When to Use');

        // CLEANUP
        await gateway.shutdown();
        await stopServer(serverProcess);
        await deleteSpellFile(steeringSpellName);
      });

      it('should calculate token savings correctly', async () => {
        // 1-4. ARRANGE + PROBE + CREATE + TEST (same pattern)
        const uniquePort = getUniquePort(basePort); // Registry pattern
        const serverProcess = await startFastMCPServer(serverModule, uniquePort);
        const serverUrl = `http://localhost:${uniquePort}/mcp`;
        const capabilities = await probeServerCapabilities(serverUrl, { auth, headers });
        const uniqueSpellName = generateSpellName(`${spellPrefix.replace('-tier1', '')}-savings`); // e.g., basic-auth-http-savings-...
        await createDynamicSpellFile(uniqueSpellName, {
          url: serverUrl,
          auth,
          headers,
          keywords,
          tools: capabilities.tools,
        });

        const gateway = new GrimoireServer();
        await gateway.start();

        const response = await gateway.handleResolveIntent({ query });
        const result = JSON.parse(response.content[0].text);

        // ASSERT: Token savings reported
        expect(result.tokenSavings).toBeDefined();
        expect(result.tokenSavings.estimatedTokensWithoutGateway).toBeGreaterThan(0);
        expect(result.tokenSavings.tokensSaved).toBeGreaterThan(0);
        expect(result.tokenSavings.percentageSaved).toMatch(/\d+\.\d%/);

        // CLEANUP
        await gateway.shutdown();
        await stopServer(serverProcess);
        await deleteSpellFile(uniqueSpellName);
      });
    }
  );
});
```

#### Tier 2: Medium Confidence (0.5-0.84) - Return Alternatives (11 tests)

```typescript
describe('Intent Resolution - Tier 2 Medium Confidence', () => {
  it('should return alternatives when query matches multiple spells', async () => {
    // 1. ARRANGE: Start 2 servers with ambiguous keywords (using fixed ports/names)
    const servers = [];

    // Server 1: postgres (using registry ports + spell names)
    const port1 = FASTMCP_PORTS.GATEWAY_TIER2_POSTGRES; // 8028
    const spell1Name = GATEWAY_SPELL_NAMES.TIER2_POSTGRES; // 'gateway-tier2-postgres-db'
    const server1 = await startFastMCPServer('no_auth_http', port1);
    servers.push({ process: server1, port: port1 });
    await createDynamicSpellFile(spell1Name, {
      url: `http://localhost:${port1}/mcp`,
      keywords: ['database', 'postgres', 'sql', 'check'],
    });

    // Server 2: mysql
    const port2 = FASTMCP_PORTS.GATEWAY_TIER2_MYSQL; // 8029
    const spell2Name = GATEWAY_SPELL_NAMES.TIER2_MYSQL; // 'gateway-tier2-mysql-db'
    const server2 = await startFastMCPServer('api_key_http', port2);
    servers.push({ process: server2, port: port2 });
    await createDynamicSpellFile(spell2Name, {
      url: `http://localhost:${port2}/mcp`,
      auth: { type: 'bearer', token: 'test-key' },
      keywords: ['database', 'mysql', 'sql', 'check'],
    });

    // 2. TEST: Gateway discovers both
    const gateway = new GrimoireServer();
    await gateway.start();

    const query = 'check database'; // Ambiguous - matches both

    // ACT
    const response = await gateway.handleResolveIntent({ query });
    const result = JSON.parse(response.content[0].text);

    // ASSERT: Tier 2 response
    expect(result.status).toBe('multiple_matches');
    expect(result.matches).toHaveLength(2); // or 3
    expect(result.matches[0].confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.matches[0].confidence).toBeLessThan(0.85);

    // ASSERT: No server spawned yet
    expect(gateway.lifecycle.getActiveSpellNames()).toHaveLength(0);

    await gateway.shutdown();
  });
});
```

#### Tier 3: Low Confidence (<0.5) - Return Weak Matches or Not Found (11 tests)

```typescript
describe('Intent Resolution - Tier 3 Low Confidence', () => {
  it('should return weak matches for vague queries', async () => {
    const gateway = new GrimoireServer();
    await gateway.start();

    const query = 'help me'; // Vague query

    const response = await gateway.handleResolveIntent({ query });
    const result = JSON.parse(response.content[0].text);

    // Could be weak_matches or not_found depending on results
    expect(['weak_matches', 'not_found']).toContain(result.status);

    if (result.status === 'weak_matches') {
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].confidence).toBeLessThan(0.5);
    }

    await gateway.shutdown();
  });

  it('should return not_found with available spells list', async () => {
    const gateway = new GrimoireServer();
    await gateway.start();

    const query = 'xyzabc123notfound'; // Nonsense query

    const response = await gateway.handleResolveIntent({ query });
    const result = JSON.parse(response.content[0].text);

    expect(result.status).toBe('not_found');
    expect(result.availableSpells).toBeDefined();
    expect(result.availableSpells.length).toBeGreaterThan(0);

    await gateway.shutdown();
  });
});
```

---

### Test File 2: `gateway-auth-flows.e2e.test.ts`

**Purpose**: Test that gateway correctly spawns servers with various auth patterns

**Test Coverage**: Validate auth headers/env vars are correctly passed during spawn

```typescript
describe('Gateway Auth Flows - E2E', () => {
  describe('Basic Auth Servers', () => {
    it('should spawn Basic Auth HTTP server with correct headers', async () => {
      // ARRANGE: Create spell with Basic Auth
      await createTestSpell('basic-auth-http-test', {
        transport: 'http',
        url: 'http://localhost:8000/mcp',
        auth: {
          type: 'basic',
          username: '${BASIC_AUTH_HTTP_TEST__USERNAME}',
          password: '${BASIC_AUTH_HTTP_TEST__PASSWORD}',
        },
      });

      // Create .env with actual values
      await writeEnvFile({
        BASIC_AUTH_HTTP_TEST__USERNAME: 'testuser',
        BASIC_AUTH_HTTP_TEST__PASSWORD: 'testpass123',
      });

      const gateway = new GrimoireServer();
      await gateway.start();

      // ACT: Resolve intent to trigger spawn
      const response = await gateway.handleResolveIntent({
        query: 'authenticate user with basic auth',
      });
      const result = JSON.parse(response.content[0].text);

      // ASSERT: Server spawned successfully
      expect(result.status).toBe('activated');
      expect(result.tools.length).toBeGreaterThan(0);

      // ASSERT: Can call tools (validates auth worked)
      const toolResult = await gateway.handleToolCall('user_login', {
        username: 'test',
      });
      expect(toolResult).toBeDefined();

      await gateway.shutdown();
    });
  });

  describe('API Key Servers', () => {
    it('should spawn API Key HTTP with Bearer token', async () => {
      await createTestSpell('api-key-http-test', {
        transport: 'http',
        url: 'http://localhost:8002/mcp',
        auth: {
          type: 'bearer',
          token: '${API_KEY_HTTP_TEST__API_TOKEN}',
        },
      });

      await writeEnvFile({
        API_KEY_HTTP_TEST__API_TOKEN: 'test-api-key-12345',
      });

      const gateway = new GrimoireServer();
      await gateway.start();

      const response = await gateway.handleResolveIntent({
        query: 'get weather forecast',
      });
      const result = JSON.parse(response.content[0].text);

      expect(result.status).toBe('activated');
      expect(result.tools.length).toBeGreaterThan(0);

      await gateway.shutdown();
    });
  });

  describe('Security Keys (Custom Headers)', () => {
    it('should spawn with X-GitHub-Token custom header', async () => {
      await createTestSpell('security-keys-http-test', {
        transport: 'http',
        url: 'http://localhost:8004/mcp',
        headers: {
          'X-GitHub-Token': '${SECURITY_KEYS_HTTP_TEST__X_GITHUB_TOKEN}',
        },
      });

      await writeEnvFile({
        SECURITY_KEYS_HTTP_TEST__X_GITHUB_TOKEN: 'ghp_test1234567890abcdefghijklmnopqrstuvwxyz',
      });

      const gateway = new GrimoireServer();
      await gateway.start();

      const response = await gateway.handleResolveIntent({
        query: 'search github repos',
      });
      const result = JSON.parse(response.content[0].text);

      expect(result.status).toBe('activated');
      expect(result.tools.length).toBeGreaterThan(0);

      await gateway.shutdown();
    });
  });

  describe('Stdio with Environment Variables', () => {
    it('should spawn stdio server with env vars passed', async () => {
      await createTestSpell('ui5-mcp-test', {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@ui5/mcp-server'],
        env: {
          UI5_LOG_LVL: '${UI5_MCP_TEST__UI5_LOG_LVL}',
        },
      });

      await writeEnvFile({
        UI5_MCP_TEST__UI5_LOG_LVL: 'verbose',
      });

      const gateway = new GrimoireServer();
      await gateway.start();

      const response = await gateway.handleResolveIntent({
        query: 'search ui5 documentation',
      });
      const result = JSON.parse(response.content[0].text);

      expect(result.status).toBe('activated');
      expect(result.tools.length).toBeGreaterThan(0);

      // Verify env var was passed (check logs or behavior)

      await gateway.shutdown();
    });
  });
});
```

---

### Test File 3: `gateway-turn-based-cleanup.e2e.test.ts`

**Purpose**: Test 5-turn inactivity cleanup with real servers

**Test Coverage**: Validate ADR-0006 implementation

```typescript
describe('Gateway Turn-Based Cleanup - E2E', () => {
  it('should keep server alive when used every turn', async () => {
    // ARRANGE: Create spell and start gateway
    await createTestSpell('no-auth-http-test', {
      transport: 'http',
      url: 'http://localhost:8007/mcp',
    });

    const gateway = new GrimoireServer();
    await gateway.start();

    // ACT: Spawn server
    await gateway.handleResolveIntent({ query: 'calculate numbers' });
    expect(gateway.lifecycle.isActive('no-auth-http-test')).toBe(true);

    // ACT: Use it every turn for 10 turns
    for (let i = 0; i < 10; i++) {
      await gateway.handleToolCall('calculate', { operation: 'add', a: 1, b: 2 });
      expect(gateway.lifecycle.isActive('no-auth-http-test')).toBe(true);
    }

    // ASSERT: Still active after 10 turns
    expect(gateway.lifecycle.isActive('no-auth-http-test')).toBe(true);

    await gateway.shutdown();
  });

  it('should kill server after 5 turns of inactivity', async () => {
    // ARRANGE: Create 2 spells
    await createTestSpell('server-a', {
      transport: 'http',
      url: 'http://localhost:8007/mcp',
    });
    await createTestSpell('server-b', {
      transport: 'http',
      url: 'http://localhost:8002/mcp',
      auth: { type: 'bearer', token: '${API_KEY}' },
    });

    const gateway = new GrimoireServer();
    await gateway.start();

    // ACT: Spawn both servers
    await gateway.handleResolveIntent({ query: 'calculate with server a' });
    await gateway.handleResolveIntent({ query: 'get weather server b' });

    expect(gateway.lifecycle.isActive('server-a')).toBe(true);
    expect(gateway.lifecycle.isActive('server-b')).toBe(true);

    // ACT: Use server-a for turn 1
    await gateway.handleToolCall('calculate', {});

    // ACT: Advance 6 turns using ONLY server-b
    for (let i = 0; i < 6; i++) {
      await gateway.handleToolCall('get_weather', {});
    }

    // ASSERT: server-a killed after 6 turns inactive
    expect(gateway.lifecycle.isActive('server-a')).toBe(false);
    expect(gateway.lifecycle.isActive('server-b')).toBe(true);

    // ASSERT: tools/list no longer contains server-a tools
    const tools = gateway.getAllTools();
    const serverATools = tools.filter((t) => t.name === 'calculate');
    expect(serverATools).toHaveLength(0);

    await gateway.shutdown();
  });

  it('should send tools/list_changed notification after cleanup', async () => {
    // This requires mocking the MCP server notification system
    // or capturing the notification callback

    const gateway = new GrimoireServer();
    const notificationsSent: any[] = [];

    // Mock notification sender
    vi.spyOn(gateway as any, 'notifyToolsChanged').mockImplementation(() => {
      notificationsSent.push({ type: 'tools/list_changed' });
    });

    await gateway.start();

    // Spawn and let cleanup happen
    await gateway.handleResolveIntent({ query: 'test' });

    // Advance turns to trigger cleanup
    for (let i = 0; i < 7; i++) {
      gateway.lifecycle.incrementTurn();
    }

    // Trigger cleanup
    await gateway.lifecycle.cleanupInactive(5);

    // ASSERT: Notification sent
    expect(notificationsSent.length).toBeGreaterThan(0);

    await gateway.shutdown();
  });
});
```

---

### Test File 4: `gateway-parallel-servers.e2e.test.ts`

**Purpose**: Test multiple concurrent active servers

**Test Coverage**: Validate tool routing and isolation

```typescript
describe('Gateway Parallel Servers - E2E', () => {
  it('should handle 3 servers active simultaneously', async () => {
    // ARRANGE: Create 3 different spell files
    await createTestSpell('calculator', {
      transport: 'http',
      url: 'http://localhost:8007/mcp',
    });
    await createTestSpell('weather', {
      transport: 'http',
      url: 'http://localhost:8002/mcp',
      auth: { type: 'bearer', token: '${WEATHER__API_KEY}' },
    });
    await createTestSpell('github', {
      transport: 'http',
      url: 'http://localhost:8004/mcp',
      headers: { 'X-GitHub-Token': '${GITHUB__TOKEN}' },
    });

    const gateway = new GrimoireServer();
    await gateway.start();

    // ACT: Spawn all 3 servers
    await gateway.handleResolveIntent({ query: 'calculate numbers' });
    await gateway.handleResolveIntent({ query: 'get weather forecast' });
    await gateway.handleResolveIntent({ query: 'search github repos' });

    // ASSERT: All 3 active
    expect(gateway.lifecycle.isActive('calculator')).toBe(true);
    expect(gateway.lifecycle.isActive('weather')).toBe(true);
    expect(gateway.lifecycle.isActive('github')).toBe(true);

    // ASSERT: tools/list contains tools from all 3
    const tools = gateway.getAllTools();
    const childTools = tools.filter(
      (t) => !t.name.startsWith('resolve_intent') && !t.name.startsWith('activate_spell')
    );
    expect(childTools.length).toBeGreaterThanOrEqual(9); // 3 tools per server

    // ASSERT: Can call tools from each server independently
    const calcResult = await gateway.handleToolCall('calculate', { a: 1, b: 2 });
    expect(calcResult).toBeDefined();

    const weatherResult = await gateway.handleToolCall('get_weather', { city: 'NYC' });
    expect(weatherResult).toBeDefined();

    const githubResult = await gateway.handleToolCall('search_repos', { query: 'test' });
    expect(githubResult).toBeDefined();

    await gateway.shutdown();
  });

  it('should route tool calls to correct server', async () => {
    // Test that tool names don't collide and routing works correctly

    await createTestSpell('server-a', {
      transport: 'http',
      url: 'http://localhost:8007/mcp',
    });
    await createTestSpell('server-b', {
      transport: 'http',
      url: 'http://localhost:8002/mcp',
      auth: { type: 'bearer', token: '${API_KEY}' },
    });

    const gateway = new GrimoireServer();
    await gateway.start();

    await gateway.handleResolveIntent({ query: 'use server a' });
    await gateway.handleResolveIntent({ query: 'use server b' });

    // Get tools from each server
    const serverATools = gateway.lifecycle.getTools('server-a');
    const serverBTools = gateway.lifecycle.getTools('server-b');

    expect(serverATools.length).toBeGreaterThan(0);
    expect(serverBTools.length).toBeGreaterThan(0);

    // Call a tool from server-a
    const toolName = serverATools[0].name;
    const result = await gateway.handleToolCall(toolName, {});

    // Verify it was routed to server-a client
    expect(result).toBeDefined();

    await gateway.shutdown();
  });
});
```

---

## Test Helpers & Utilities

### Helper 1: Server Probing and Capability Discovery

````typescript
// src/presentation/__tests__/helpers/gateway-test-helpers.ts

export interface ServerCapabilities {
  tools: Array<{ name: string; description: string; inputSchema: any }>;
  serverInfo: { name: string; version: string };
}

/**
 * Probe a running MCP server to discover its capabilities
 */
export async function probeServerCapabilities(
  url: string,
  options?: { auth?: any; headers?: Record<string, string> }
): Promise<ServerCapabilities> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Add auth headers
  if (options?.auth?.type === 'basic') {
    const token = Buffer.from(`${options.auth.username}:${options.auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  } else if (options?.auth?.type === 'bearer') {
    headers['Authorization'] = `Bearer ${options.auth.token}`;
  }

  // Add custom headers
  if (options?.headers) {
    Object.assign(headers, options.headers);
  }

  // Call initialize + tools/list
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
  });

  const initResult = await response.json();

  const toolsResponse = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
  });

  const toolsResult = await toolsResponse.json();

  return {
    tools: toolsResult.result.tools,
    serverInfo: initResult.result.serverInfo,
  };
}

### Helper 2: Dynamic Spell File Creation

```typescript
export interface TestSpellConfig {
  transport?: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  auth?: {
    type: 'basic' | 'bearer';
    username?: string;
    password?: string;
    token?: string;
  };
  headers?: Record<string, string>;
  env?: Record<string, string>;
  keywords?: string[];
  tools?: Array<{ name: string; description: string; inputSchema: any }>;
  steering?: Array<{ when: string; guide: string }>;
}

/**
 * Create a spell file dynamically based on probed server capabilities
 * This ensures spell files accurately reflect the running server
 */
export async function createDynamicSpellFile(
  name: string,
  config: TestSpellConfig
): Promise<string> {
  const grimoireDir = getSpellDirectory();
  const spellPath = join(grimoireDir, `${name}.spell.yaml`);

  const spell: SpellConfig = {
    name,
    version: '1.0.0',
    description: config.tools ?
      `MCP server with tools: ${config.tools.map(t => t.name).join(', ')}` :
      `Test spell for ${name}`,
    keywords: config.keywords || name.split('-'),
    server: {
      transport: config.transport || 'http',
      ...config,
    } as any,
  };

  // Add steering if provided
  if (config.steering) {
    spell.steering = config.steering;
  }

  await writeFile(spellPath, JSON.stringify(spell, null, 2));
  return spellPath;
}

/**
 * Delete a spell file after test completion
 */
export async function deleteSpellFile(name: string): Promise<void> {
  const grimoireDir = getSpellDirectory();
  const spellPath = join(grimoireDir, `${name}.spell.yaml`);
  await rm(spellPath, { force: true });
}

export async function writeEnvFile(
  vars: Record<string, string>
): Promise<void> {
  const envPath = join(getSpellDirectory(), '.env');
  const content = Object.entries(vars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  await writeFile(envPath, content);
}

export async function cleanupTestSpells(
  spellNames: string[]
): Promise<void> {
  const grimoireDir = getSpellDirectory();
  for (const name of spellNames) {
    const path = join(grimoireDir, `${name}.spell.yaml`);
    await rm(path, { force: true });
  }
}
````

### Helper 4: CLI Test Spell Names Registry

**Current State**: CLI tests have hardcoded spell names scattered across 19 test files.

**Proposed Refactoring**: Extract all spell names into a centralized registry (similar to `GATEWAY_SPELL_NAMES`).

```typescript
// src/cli/__tests__/helpers/test-spell-names.ts

/**
 * Centralized registry of spell names used in CLI integration tests
 * This prevents naming conflicts and makes test intentions clear
 */
export const CLI_SPELL_NAMES = {
  // Core authentication patterns (8 tests)
  BASIC_AUTH_HTTP: 'project-manager',
  BASIC_AUTH_SSE: 'file-storage-service',
  API_KEY_HTTP: 'weather-api',
  API_KEY_SSE_BEARER: 'news-aggregator-bearer',
  API_KEY_SSE_HEADER: 'test-api-key-sse-header',
  API_KEY_HTTP_HEADER: 'test-api-key-http-header-spell',
  SECURITY_KEYS_HTTP_GITHUB: 'github-mcp-http',
  SECURITY_KEYS_HTTP_BRAVE: 'brave-mcp-http',
  SECURITY_KEYS_SSE_GITHUB: 'github-mcp-sse',
  SECURITY_KEYS_SSE_BRAVE: 'brave-mcp-sse',
  NO_AUTH_HTTP: 'calculator-utilities',
  NO_AUTH_SSE: 'system-monitor',

  // Stdio servers (2 tests)
  STDIO_CAPJS: 'cds-mcp',
  STDIO_UI5: 'ui5-mcp',

  // Error handling tests (3 tests)
  NETWORK_DNS_FAILURE: 'test-dns-failure',
  NETWORK_CONNECTION_REFUSED: 'test-connection-refused',
  NETWORK_TIMEOUT: 'test-server-timeout',

  // Probe failure tests (6 tests)
  PROBE_UNREACHABLE: 'test-unreachable-server',
  PROBE_MISSING_AUTH: 'test-missing-auth',
  PROBE_INVALID_CREDENTIALS: 'test-invalid-credentials',
  PROBE_INVALID_RESPONSE: 'test-invalid-mcp-response',
  PROBE_VALID: 'test-valid-probe',
  PROBE_GRACEFUL_FAILURE: 'test-graceful-failure',

  // File operations tests (1 test)
  FILE_CONFLICT_OVERWRITE: 'conflict-overwrite',

  // Spell overwrite tests (4 tests)
  SPELL_OVERWRITE_COMPLETE: 'test-overwrite-complete',
  SPELL_OVERWRITE_AUTH: 'test-overwrite-auth',
  SPELL_REMOVE_AUTH: 'test-remove-auth',
  SPELL_TRANSPORT_CHANGE: 'test-transport-change',

  // Credential leak tests (4 tests)
  CREDENTIAL_NO_LEAK_SUCCESS: 'test-no-leak-success',
  CREDENTIAL_NO_LEAK_ERROR: 'test-no-leak-error',
  CREDENTIAL_NO_LEAK_APIKEY: 'test-no-leak-apikey',
  CREDENTIAL_ENV_PLACEHOLDER: 'test-env-placeholder',

  // Input validation tests (10 tests)
  INPUT_INVALID_TRANSPORT: 'test-invalid-transport',
  INPUT_NO_TRANSPORT: 'test-no-transport',
  INPUT_NO_SCHEME: 'test-no-scheme',
  INPUT_MALFORMED_URL: 'test-malformed-url',
  INPUT_VALID_HTTP: 'test-valid-http',
  INPUT_VALID_HTTPS: 'test-valid-https',
  INPUT_BEARER_NO_TOKEN: 'test-bearer-no-token',
  INPUT_BASIC_NO_USERNAME: 'test-basic-no-username',
  INPUT_BASIC_NO_PASSWORD: 'test-basic-no-password',

  // Concurrency tests (1 test)
  CONCURRENCY_SAME_NAME: 'conc-same-name',

  // Security logging tests (2 tests)
  SECURITY_LOG_SPELL: 'sec-log-spell',
  SECURITY_LOG_ENV: 'sec-log-env',
} as const;

// Type for CLI spell names
export type CliSpellName = (typeof CLI_SPELL_NAMES)[keyof typeof CLI_SPELL_NAMES];
```

**Migration Plan**:

1. **Create Registry File** (`test-spell-names.ts`):
   - Extract all 44 hardcoded spell names from 19 test files
   - Group by test category for clarity
   - Use descriptive constant names matching test purpose

2. **Update Test Files** (19 files to modify):

   ```typescript
   // Before:
   const testSpellName = 'weather-api';

   // After:
   import { CLI_SPELL_NAMES } from './helpers/test-spell-names';
   const testSpellName = CLI_SPELL_NAMES.API_KEY_HTTP;
   ```

3. **Benefits**:
   - **Centralized**: All spell names in one place
   - **No Conflicts**: Easy to see if names collide
   - **Meaningful**: Constant names explain test purpose
   - **Consistency**: Matches `GATEWAY_SPELL_NAMES` pattern
   - **Refactorable**: Change spell name in one place

4. **CLI Spell Names Summary**:

| Category           | Count  | Examples                                            |
| ------------------ | ------ | --------------------------------------------------- |
| Core Auth Patterns | 12     | `project-manager`, `weather-api`, `github-mcp-http` |
| Stdio Servers      | 2      | `cds-mcp`, `ui5-mcp`                                |
| Error Handling     | 3      | `test-dns-failure`, `test-connection-refused`       |
| Probe Failures     | 6      | `test-unreachable-server`, `test-missing-auth`      |
| File Operations    | 1      | `conflict-overwrite`                                |
| Spell Overwrites   | 4      | `test-overwrite-complete`, `test-overwrite-auth`    |
| Credential Leaks   | 4      | `test-no-leak-success`, `test-env-placeholder`      |
| Input Validation   | 10     | `test-invalid-transport`, `test-bearer-no-token`    |
| Concurrency        | 1      | `conc-same-name`                                    |
| Security Logging   | 2      | `sec-log-spell`, `sec-log-env`                      |
| **Total**          | **45** |                                                     |

**Implementation Priority**: Medium (improves maintainability, not urgent)

**Estimated Effort**: 2-3 hours

- 30 minutes: Create registry file
- 90 minutes: Update 19 test files
- 30 minutes: Validate all tests pass

````

### Helper 3: Gateway Test Wrapper

```typescript
export class GatewayTestHarness {
  private gateway: GrimoireServer;
  private spellsCreated: string[] = [];

  async setup(): Promise<void> {
    this.gateway = new GrimoireServer();
    await this.gateway.start();
  }

  async createSpell(
    name: string,
    config: TestSpellConfig
  ): Promise<void> {
    await createTestSpell(name, config);
    this.spellsCreated.push(name);
  }

  async resolveIntent(query: string): Promise<ResolveIntentResponse> {
    const response = await this.gateway.handleResolveIntent({ query });
    return JSON.parse(response.content[0].text);
  }

  async callTool(name: string, args: any): Promise<any> {
    return await this.gateway.handleToolCall(name, args);
  }

  getActiveServers(): string[] {
    return this.gateway.lifecycle.getActiveSpellNames();
  }

  async cleanup(): Promise<void> {
    await this.gateway.shutdown();
    await cleanupTestSpells(this.spellsCreated);
  }
}
````

---

## Parallel Execution Strategy

### Critical: Unique Ports Per Test

**Each test MUST use a unique port** to avoid conflicts:

```typescript
// ❌ BAD: Reusing CLI test ports causes conflicts
const port = FASTMCP_PORTS.BASIC_AUTH_HTTP; // 8000 - used by CLI tests!

// ✅ GOOD: Dedicated fixed ports from registry
const port = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP_TIER1; // 8017 - gateway test only
const serverProcess = await startFastMCPServer('basic_auth_http', port);
```

### Fixed Spell Names Per Test

Each test uses a **fixed, meaningful spell name** from the `GATEWAY_SPELL_NAMES` registry:

```typescript
// ✅ GOOD: Fixed spell names from registry - predictable and debuggable
const spellName = GATEWAY_SPELL_NAMES.BASIC_AUTH_HTTP_TIER1; // 'gateway-basic-auth-http-tier1'
```

Examples from registry:

```
gateway-basic-auth-http-tier1
gateway-api-key-sse-tier1
gateway-steering-injection-test
gateway-cleanup-keep-alive
gateway-parallel-calculator
```

### Why This Matters

- **Vitest runs tests in parallel by default**
- Each test uses a dedicated port (8017-8050) → No port conflicts
- Each test uses a unique spell name → No file overwrites
- Fixed names → Easy to debug and understand test failures
- **Solution**: Each test is fully isolated with predictable resources

---

## Key Differences from CLI Tests

### CLI Tests Pattern

```typescript
// CLI tests: Start server → Probe → CLI creates spell → Validate spell file
const server = await startServer(port);
const capabilities = await probeServer(url);
await runCLI(['create', '--url', url]); // CLI probes again and creates spell
const spell = await readSpellFile(); // Validate CLI created it correctly
```

### Gateway Tests Pattern

```typescript
// Gateway tests: Start server → Probe → Create spell → Gateway uses spell
const server = await startServer(uniquePort);
const capabilities = await probeServer(url);
await createSpellFile(uniqueName, { url, capabilities }); // Test creates spell
const result = await gateway.resolveIntent(query); // Gateway discovers and uses spell
```

**Key Difference**:

- **CLI tests** validate that the CLI correctly creates spell files
- **Gateway tests** validate that the gateway correctly uses existing spell files
- Both start real servers and probe them first
- Both use unique ports/names for parallel execution

## Implementation Phases

### Phase 1: Basic Intent Resolution (Week 1)

- [ ] Create `gateway-intent-resolution.e2e.test.ts`
- [ ] Test Tier 1 (high confidence) for 11 servers
- [ ] Validate tool list changed notifications
- [ ] Test steering injection

### Phase 2: Auth Patterns (Week 1)

- [ ] Create `gateway-auth-flows.e2e.test.ts`
- [ ] Test all auth patterns (Basic, Bearer, Custom Headers, OAuth2)
- [ ] Test stdio with env vars
- [ ] Validate credentials resolved from .env

### Phase 3: Turn-Based Cleanup (Week 2)

- [ ] Create `gateway-turn-based-cleanup.e2e.test.ts`
- [ ] Test 5-turn inactivity threshold
- [ ] Test multiple servers with staggered cleanup
- [ ] Validate tools/list_changed after cleanup

### Phase 4: Parallel Servers (Week 2)

- [ ] Create `gateway-parallel-servers.e2e.test.ts`
- [ ] Test 3+ servers active simultaneously
- [ ] Validate tool routing isolation
- [ ] Test turn tracking with multiple servers

### Phase 5: Edge Cases (Week 2)

- [ ] Test rapid sequential activations
- [ ] Test server spawn failures
- [ ] Test auth failures during spawn
- [ ] Test cleanup during active tool calls

---

## Success Criteria

### Quantitative Metrics

- ✅ 100% of 11 servers tested
- ✅ All 3 confidence tiers covered
- ✅ Turn-based cleanup validated with real PIDs
- ✅ Zero test flakiness (3 consecutive runs pass)
- ✅ All tests run in <5 minutes total

### Qualitative Metrics

- ✅ Tests follow existing patterns from CLI tests
- ✅ NO MOCKS - real servers, real auth, real spawning
- ✅ Tests are maintainable and easy to understand
- ✅ Comprehensive error messages on failure
- ✅ Tests validate both happy path and edge cases

---

## Coding Principles Adherence

### SRP (Single Responsibility Principle)

- ✅ Each test file has ONE focus area
- ✅ Helper functions do ONE thing
- ✅ Gateway test harness encapsulates common operations

### DRY (Don't Repeat Yourself)

- ✅ Reuse `test-server-manager.ts` from CLI tests
- ✅ Reuse `spell-validator.ts` patterns
- ✅ Create shared `gateway-test-helpers.ts`

### YAGNI (You Aren't Gonna Need It)

- ✅ Only test what's implemented (no future features)
- ✅ Start with basics, add edge cases as needed
- ✅ Don't over-engineer test harness

### KISS (Keep It Simple)

- ✅ Straightforward Arrange-Act-Assert structure
- ✅ Clear test names describing exact behavior
- ✅ Minimal mocking (only where absolutely necessary)

---

## Open Questions

1. **OAuth2 Server**: Currently deferred in CLI tests - include in gateway tests or skip?
   - **Recommendation**: Skip for Phase 1, add later when OAuth2 is fixed

2. **Stdio Servers**: CAP.js and UI5 MCP - do we have these installed in test environment?
   - **Action**: Verify `npx -y @cap-js/mcp-server` and `npx -y @ui5/mcp-server` work

3. **Test Timeout**: Stdio servers can be slow to start (npx downloads)
   - **Recommendation**: Set timeout to 30s for stdio tests, 15s for HTTP/SSE

4. **Cleanup Strategy**: Keep spell files for debugging or clean them up?
   - **Recommendation**: Clean up by default, add env var `GRIMOIRE_TEST_KEEP_SPELLS=true` for debugging

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Verify server availability** - ensure all 11 servers can be started
3. **Create test helpers** - `gateway-test-helpers.ts`
4. **Implement Phase 1** - Intent resolution tests
5. **Run against real codebase** - validate assumptions
6. **Iterate based on findings** - adjust plan as needed

---

## References

- [CLI Integration Test Strategy](integration-test-strategy.md)
- [Intent Resolution Solution](intent-resolution-solution.md)
- [Turn-Based Lifecycle](turn-based-lifecycle-explained.md)
- [ADR-0006: 5-Turn Inactivity](adr/0006-five-turn-inactivity-threshold.md)
- [ADR-0009: Multi-Tier Confidence](adr/0009-multi-tier-confidence-based-intent-resolution.md)
- [Coding Principles](../claude.md)

---

**Document Status**: ✅ Ready for Review
**Estimated Implementation Time**: 2 weeks (40 hours)
**Test Count**: ~60-80 tests across 4 test files
