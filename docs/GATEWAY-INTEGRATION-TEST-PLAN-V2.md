# Gateway Integration Test Plan v2.0 - Real-World Flow Testing

**Document Type**: Test Plan & Implementation Strategy
**Author**: Based on CLI Integration Test Patterns + Intent Resolution Design
**Date**: January 22, 2026 (Created) | January 23, 2026 (Reviewed & Updated)
**Status**: Final Plan - Ready for Implementation
**Related Docs**:

- [intent-resolution-solution.md](intent-resolution-solution.md)
- [turn-based-lifecycle-explained.md](turn-based-lifecycle-explained.md)
- [TEST-SERVER-TOOL-MAPPING.md](TEST-SERVER-TOOL-MAPPING.md)
- [ADR-0006: 5-Turn Inactivity Threshold](adr/0006-five-turn-inactivity-threshold.md)
- [ADR-0009: Multi-Tier Confidence Intent Resolution](adr/0009-multi-tier-confidence-based-intent-resolution.md)

---

## Change Log

### January 23, 2026 (Evening) - Server-Specific Tests Complete + Scenario Test Design

- ✅ **COMPLETED**: All 10 server-specific gateway E2E tests implemented and passing (100% success rate)
- ✅ **FIXED**: Critical SSE transport bug - now using SSEClientTransport (GET /sse) instead of StreamableHTTPClientTransport (POST /mcp)
- ✅ **CORRECTED**: All test queries and assertions to match actual server tools from @mcp.tool annotations
- ✅ **DOCUMENTED**: Complete TEST-SERVER-TOOL-MAPPING.md rewrite with accurate tool listings
- ✅ **ANALYZED**: Turn-based cleanup implementation in process-lifecycle.ts and gateway.ts
- 📋 **PENDING**: 5 scenario tests - multiple_matches, weak_matches, not_found, turn-based cleanup, parallel servers
- 🎯 **APPROACH**: Scenario tests require real servers + real spells + carefully crafted queries for authentic confidence scores

### January 23, 2026 (Morning) - Code Review & Validation

- ✅ **Verified**: All 19 CLI integration tests passing (69 test cases)
- ✅ **Verified**: Test isolation pattern works correctly with GRIMOIRE_HOME override
- ✅ **Verified**: 10 unique MCP servers with 11 transport configurations available for testing
- ✅ **Clarified**: Server count terminology - "10 unique server types" vs "11 transport configurations"
- ✅ **Confirmed**: Port allocation strategy (8017-8050 for gateway tests)
- ✅ **Confirmed**: GrimoireServer API methods: `start()`, `handleResolveIntentCall()`, `getAvailableTools()`, `shutdown()`
- ✅ **Confirmed**: Path management strategy from CLI tests is reusable for gateway tests
- ⚠️ **Note**: OAuth2 client credentials server excluded from initial implementation (mentioned in requirements)

---

## Implementation Status Summary

### ✅ COMPLETED (10/15 tests - 67%)

**Category 1: Server-Specific Auto-Spawn Tests**

- ✅ gateway-basic-auth-http.e2e.test.ts
- ✅ gateway-basic-auth-sse.e2e.test.ts
- ✅ gateway-api-key-http.e2e.test.ts
- ✅ gateway-api-key-sse.e2e.test.ts
- ✅ gateway-security-keys-http.e2e.test.ts
- ✅ gateway-security-keys-sse.e2e.test.ts
- ✅ gateway-no-auth-http.e2e.test.ts
- ✅ gateway-no-auth-sse.e2e.test.ts
- ✅ gateway-stdio-capjs.e2e.test.ts
- ✅ gateway-stdio-ui5.e2e.test.ts

### 📋 PENDING (5/15 tests - 33%)

**Category 2: Intent Resolution Confidence Levels**

- 📋 gateway-multiple-matches.e2e.test.ts - Multiple spells with medium confidence (0.5-0.84)
- 📋 gateway-weak-matches.e2e.test.ts - Semantic-only matches (0.3-0.49)
- 📋 gateway-not-found.e2e.test.ts - No matching spells (<0.3)

**Category 3: Turn-Based Cleanup**

- 📋 gateway-turn-based-cleanup.e2e.test.ts - Verify 5-turn inactivity cleanup (ADR-0006)

**Category 4: Parallel Servers**

- 📋 gateway-parallel-servers.e2e.test.ts - Multiple servers active simultaneously

---

## Executive Summary

### Current State

✅ **19/19 CLI integration tests passing** (69 test cases) - Spell creation flow validated
✅ **10/10 Gateway server-specific tests passing** (100% success rate) - Auto-spawn validated for all server types
✅ **Test isolation working perfectly** - GRIMOIRE_HOME override pattern proven in CLI tests
✅ **10 unique MCP server types available** - 11 transport configurations (8 HTTP/SSE + 2 stdio)
✅ **SSE transport bug fixed** - Correctly using SSEClientTransport (GET /sse) vs StreamableHTTPClientTransport (POST /mcp)
📋 **5 Scenario tests pending** - Multiple matches, weak matches, not found, turn-based cleanup, parallel servers

### Server Count Clarification

**10 Unique Server Types**:

1. Basic Auth (Project Management) - available in both HTTP & SSE
2. API Key (Weather/News) - 2 different servers, HTTP & SSE
3. Security Keys (Data Analytics) - available in both HTTP & SSE
4. No Auth (System Monitor) - available in both HTTP & SSE
5. OAuth2 (Email Service) - HTTP only
6. CAP.js MCP - stdio only
7. UI5 MCP - stdio only

**11 Transport Configurations** to test:

- 9 HTTP/SSE variants (Basic Auth HTTP, Basic Auth SSE, API Key HTTP, API Key SSE, Security Keys HTTP, Security Keys SSE, No Auth HTTP, No Auth SSE, OAuth2 HTTP)
- 2 stdio variants (CAP.js, UI5)

**Note**: OAuth2 client credentials excluded per requirements. Focus on the 10 working servers.

### Goal

Test the complete **user flow** from AI agent query → grimoire gateway → MCP server spawning → tool execution → 5-turn cleanup

### Testing Philosophy

**NO MOCKS** - Real FastMCP servers, real auth, real spawning, real cleanup

---

## Understanding the Complete User Flow

### Real-World Scenario

```
1. User installs grimoire: `npx @crack-break-make/mcp-grimoire create`
2. User creates spells: CLI probes servers, saves spell files to ~/.grimoire/
3. User config0 server types (11 transport configurations: laude/Copilot): mcp.json or claude_desktop_config.json
4. Gateway starts: Loads and indexes spell files from ~/.grimoire/
5. User asks AI Agent: "create project and add task using project management"
6. AI Agent sees resolve_intent tool, calls it with query
7. Gateway resolves intent: Matches spell via keywords/semantics
8. Gateway spawns MCP server: Child process with auth
9. Gateway sends tools/list_changed: AI Agent sees new tools
10. AI Agent calls actual tool: e.g., create_project
11. Gateway routes to spawned server: Forwards request, returns response
12. Cleanup after 5 turns idle: Gateway kills inactive servers
```

### What We Need to Test

#### Phase 1: Intent Resolution & Server Spawning (Tier 1 - High Confidence)

- ✅ Query matches spell keywords → Auto-spawn
- ✅ Gateway returns `status: "activated"`
- ✅ Spawned server tools available via getAvailableTools()
- ✅ Test all 11 server types (9 HTTP/SSE + 2 stdio)

#### Phase 2: Multi-Tier Confidence Behavior

- ✅ Tier 1 (≥0.85): Auto-spawn and return tools
- ✅ Tier 2 (0.5-0.84): Return alternatives for AI agent
- ✅ Tier 3a (0.3-0.49): Return weak matches for clarification
- ✅ Tier 3b (<0.3): Return not found with available spells

#### Phase 3: Turn-Based Cleanup (ADR-0006)

- ✅ Server stays alive if used within 5 turns
- ✅ Server killed after 5 turns idle
- ✅ Tools removed from available tools
- ✅ tools/list_changed notification sent

#### Phase 4: Multi-Server Scenarios

- ✅ Multiple servers spawned simultaneously
- ✅ Tool routing to correct server
- ✅ Selective cleanup (kill idle, keep active)

---

## Test Architecture

### Directory Structure

```
src/presentation/__tests__/
├── gateway-basic-auth-http.e2e.test.ts
├── gateway-basic-auth-sse.e2e.test.ts
├── gateway-api-key-http.e2e.test.ts
├── gateway-api-key-sse.e2e.test.ts
├── gateway-security-keys-http.e2e.test.ts
├── gateway-security-keys-sse.e2e.test.ts
├── gateway-no-auth-http.e2e.test.ts
├── gateway-no-auth-sse.e2e.test.ts
├── gateway-stdio-capjs.e2e.test.ts
├── gateway-stdio-ui5.e2e.test.ts
├── gateway-multiple-matches.e2e.test.ts
├── gateway-low-confidence.e2e.test.ts
├── gateway-not-found.e2e.test.ts
├── gateway-turn-based-cleanup.e2e.test.ts
└── gateway-parallel-servers.e2e.test.ts

helpers/
├── gateway-test-helper.ts (NEW - Gateway test utilities)
└── gateway-test-path-manager.ts (NEW - Path isolation for gateway tests)

cli/__tests__/helpers/ (EXISTING - Reusable for CLI and Gateway tests)
├── test-path-manager.ts (Path isolation utilities)
├── test-server-manager.ts (FastMCP server management)
└── spell-validator.ts (Spell file validation)
```

### Naming Convention

- `gateway-{server-type}.e2e.test.ts` - Server-specific auto-spawn tests (e.g., gateway-basic-auth-http.e2e.test.ts)
- `gateway-multiple-matches.e2e.test.ts` - Medium confidence, AI agent chooses from alternatives
- `gateway-low-confidence.e2e.test.ts` - Weak matches requiring clarification
- `gateway-not-found.e2e.test.ts` - No matching spells found
- `gateway-turn-based-cleanup.e2e.test.ts` - 5-turn inactivity cleanup
- `gateway-parallel-servers.e2e.test.ts` - Multiple concurrent servers

---

## Test Isolation Strategy - Path Management

### Problem

Gateway tests need isolated spell directories to:

1. Prevent pollution of user's `~/.grimoire` directory
2. Avoid test collisions when running in parallel
3. Ensure clean state for each test
4. Make cleanup automatic and reliable

### Solution - Test Path Manager Pattern (from CLI tests)

Following the successful pattern from CLI integration tests, we use `GRIMOIRE_HOME` environment variable override:

```typescript
// From src/cli/__tests__/helpers/test-path-manager.ts
export function setupTestGrimoireDir(testName: string): string {
  // Create isolated test directory
  const testDir = join(process.cwd(), '.test-grimoire', testName);

  // Override GRIMOIRE_HOME to point to test directory
  process.env.GRIMOIRE_HOME = testDir;

  // Reset path cache to pick up new environment
  resetPathsCache();

  return testDir;
}

export async function cleanupTestGrimoireDir(testDir: string): Promise<void> {
  // Remove test directory
  await rm(testDir, { recursive: true, force: true });

  // Restore default behavior
  delete process.env.GRIMOIRE_HOME;
  resetPathsCache();
}
```

### Benefits

✅ **Isolation**: Each test gets `.test-grimoire/<test-name>/` directory
✅ **No Collisions**: Unique test names = unique directories
✅ **Automatic Cleanup**: `afterAll` removes test artifacts
✅ **Real Code Paths**: Tests use production path resolution logic
✅ **Parallel Safe**: Tests can run simultaneously without interference

### Integration with Gateway Tests

Gateway tests will use the same pattern:

```typescript
import {
  setupTestGrimoireDir,
  cleanupTestGrimoireDir,
} from '../cli/__tests__/helpers/test-path-manager';

describe('Gateway E2E - Basic Auth HTTP', () => {
  let grimoireDir: string;

  beforeAll(async () => {
    // Setup isolated directory
    grimoireDir = setupTestGrimoireDir('gateway-basic-auth-http');

    // Spell files will be created in:
    // .test-grimoire/gateway-basic-auth-http/spell.yaml
  });

  afterAll(async () => {
    // Complete cleanup
    await cleanupTestGrimoireDir(grimoireDir);
  });
});
```

### Directory Structure During Tests

```
workspace/
├── .test-grimoire/               ← Test isolation root (gitignored)
│   ├── gateway-basic-auth-http/  ← Gateway test 1
│   │   └── project-mgmt.spell.yaml
│   ├── gateway-api-key-http/     ← Gateway test 2
│   │   └── weather-api.spell.yaml
│   ├── gateway-stdio-capjs/      ← Gateway test 3
│   │   └── cds-mcp.spell.yaml
│   ├── no-auth-http/             ← CLI test 1 (existing)
│   └── api-key-http/             ← CLI test 2 (existing)
└── src/
```

### Gateway-Specific Path Considerations

Gateway tests have additional path requirements:

1. **Spell Indexing**: Gateway watches spell directory for changes
2. **Multiple Spells**: Some tests need multiple spell files in same directory
3. **Spell Discovery**: Gateway needs to discover and index all spells

Enhanced helper for gateway tests:

```typescript
// helpers/gateway-test-path-manager.ts (NEW)
import {
  setupTestGrimoireDir,
  cleanupTestGrimoireDir,
} from '../../cli/__tests__/helpers/test-path-manager';

/**
 * Setup gateway test directory with multiple spell support
 */
export async function setupGatewayTestDir(testName: string): Promise<string> {
  const testDir = setupTestGrimoireDir(`gateway-${testName}`);

  // Ensure directory exists (gateway watcher needs it)
  const { ensureDirectories } = await import('../../../utils/paths');
  await ensureDirectories();

  return testDir;
}

/**
 * Cleanup with gateway-specific considerations
 */
export async function cleanupGatewayTestDir(
  gateway: GrimoireServer | null,
  testDir: string
): Promise<void> {
  // Shutdown gateway first (stops watchers)
  if (gateway) {
    await gateway.shutdown();
  }

  // Then cleanup directory
  await cleanupTestGrimoireDir(testDir);
}
```

---

## Server Test Matrix

### HTTP/SSE Servers with Auth (9 servers)

| #   | Test File                              | Server                            | Port | Transport | Auth   | Domain         | Query Pattern                      |
| --- | -------------------------------------- | --------------------------------- | ---- | --------- | ------ | -------------- | ---------------------------------- |
| 1   | gateway-basic-auth-http.e2e.test.ts    | servers.basic_auth.http_server    | 8017 | HTTP      | Basic  | Project Mgmt   | "create project and add task"      |
| 2   | gateway-basic-auth-sse.e2e.test.ts     | servers.basic_auth.sse_server     | 8018 | SSE       | Basic  | Project Mgmt   | "create project get status"        |
| 3   | gateway-api-key-http.e2e.test.ts       | servers.api_key.http_server       | 8019 | HTTP      | Bearer | Weather        | "get current weather forecast"     |
| 4   | gateway-api-key-sse.e2e.test.ts        | servers.api_key.sse_server        | 8020 | SSE       | Bearer | News           | "get latest news trending topics"  |
| 5   | gateway-security-keys-http.e2e.test.ts | servers.security_keys.http_server | 8021 | HTTP      | Custom | Data Analytics | "analyze dataset get table schema" |
| 6   | gateway-security-keys-sse.e2e.test.ts  | servers.security_keys.sse_server  | 8022 | SSE       | Custom | Data Analytics | "analyze dataset export results"   |
| 7   | gateway-no-auth-http.e2e.test.ts       | servers.no_auth.http_server       | 8023 | HTTP      | None   | System Monitor | "get cpu usage memory stats"       |
| 8   | gateway-no-auth-sse.e2e.test.ts        | servers.no_auth.sse_server        | 8024 | SSE       | None   | System Monitor | "monitor cpu disk usage"           |
| 9   | ~~gateway-oauth2-http.e2e.test.ts~~    | ~~servers.oauth2.http_server~~    | 8025 | HTTP      | OAuth2 | Email          | ~~"send email get inbox"~~         |

**Note**: OAuth2 server (#9) excluded per user requirements. Total: **8 HTTP/SSE tests** to implement.

### Stdio Servers (2 servers)

| #   | Test File | Server | Command | Env Vars | Domain | Query Pattern |
| --- | --------- | ------ | ------- | -------- | ------ | ------------- |

**Total Gateway Tests**: 8 HTTP/SSE + 2 stdio = **10 server-specific tests** + additional scenario tests
| 10 | gateway-stdio-capjs.e2e.test.ts | @cap-js/mcp-server | npx -y @cap-js/mcp-server | None | CAP CDS | "search model docs for cds" |
| 11 | gateway-stdio-ui5.e2e.test.ts | @ui5/mcp-server | npx -y @ui5/mcp-server | UI5_LOG_LVL=verbose | UI5 | "get ui5 guidelines api reference" |

---

## Test Pattern - Arrange-Act-Assert

### Standard Test Template (Following CLI Pattern)

```typescript
/**
 * Gateway E2E Test: Basic Auth HTTP Server
 *
 * PURPOSE:
 * Validates complete flow from resolve_intent → server spawning → tool availability
 * Tests high-confidence intent resolution (≥0.85) with Basic Auth HTTP server
 *
 * FLOW:
 * 1. Setup isolated test directory (.test-grimoire/gateway-basic-auth-http/)
 * 2. Start FastMCP server (Basic Auth HTTP)
 * 3. Create spell file using CLI (in isolated directory)
 * 4. Start Gateway (indexes spell from test directory)
 * 5. Call resolve_intent with matching query
 * 6. Validate auto-spawn behavior (high confidence)
 * 7. Verify tools available
 * 8. Cleanup: Stop gateway, stop server, remove test directory
 *
 * MCP SERVER:
 * - Server: servers.basic_auth.http_server
 * - Port: 8017
 * - Transport: HTTP
 * - Auth: Basic (testuser/testpass123)
 * - Tools: create_project, add_task, get_project_status
 *
 * TEST ISOLATION:
 * - Uses GRIMOIRE_HOME override to point to .test-grimoire/gateway-basic-auth-http/
 * - Prevents pollution of ~/.grimoire
 * - Automatic cleanup in afterAll
 * - Parallel-safe (unique directory per test)
 *
 * NO MOCKS - Real server, real spell, real gateway
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
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

describe('Gateway E2E - Basic Auth HTTP', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;

  const serverPort = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP; // 8017
  const serverUrl = `http://localhost:${serverPort}/mcp`;
  const testSpellName = 'gateway-basic-auth-http';

  let grimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    // ARRANGE: Setup isolated test directory
    grimoireDir = setupTestGrimoireDir('gateway-basic-auth-http');
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    // Ensure test directory exists
    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Clean up previous test spell if exists
    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    // Start FastMCP server
    console.log(`[TEST] Starting Basic Auth HTTP server on port ${serverPort}...`);
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', serverPort);
    console.log(`[TEST] ✓ Server started on port ${serverPort}`);

    // Create spell file using CLI (will use GRIMOIRE_HOME from setupTestGrimoireDir)
    console.log(`[TEST] Creating spell file: ${testSpellName}...`);
    const options: CreateOptions = {
      name: testSpellName,
      transport: 'http',
      url: serverUrl,
      authType: 'basic',
      authUsername: FASTMCP_CREDENTIALS.USERNAME,
      authPassword: FASTMCP_CREDENTIALS.PASSWORD,
      interactive: false,
      probe: true,
    };

    await createCommand(options);
    expect(existsSync(spellFilePath), 'Spell file should be created in test directory').toBe(true);
    console.log(`[TEST] ✓ Spell file created: ${spellFilePath}`);

    // Start Gateway and wait for spell indexing
    console.log(`[TEST] Starting Gateway (will watch test directory)...`);
    gateway = new GrimoireServer();
    await gateway.start();

    // Wait for spell watcher to index the file from test directory
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log(`[TEST] ✓ Gateway started and spell indexed from test directory`);
  }, 60000);

  afterAll(async () => {
    // CLEANUP: Stop gateway, stop server, remove test directory
    console.log(`[TEST] Cleaning up...`);

    if (gateway) {
      await gateway.shutdown();
      console.log(`[TEST] ✓ Gateway stopped`);
    }

    await stopServer(serverProcess, serverPort, 'basic_auth_http_server');
    console.log(`[TEST] ✓ Server stopped`);

    // Cleanup test directory (removes spell file and directory)
    await cleanupTestGrimoireDir(grimoireDir);
    console.log(`[TEST] ✓ Test directory cleaned: ${grimoireDir}`);
  }, 30000);

  it('should auto-spawn server via resolve_intent with high confidence', async () => {
    // ACT: Get tools before spawning
    const toolsBeforeSpawn = gateway.getAvailableTools();

    console.log(`\n[TEST] Tools before spawn: ${toolsBeforeSpawn.length}`);
    expect(toolsBeforeSpawn.length).toBe(2); // resolve_intent, activate_spell
    expect(toolsBeforeSpawn.some((t) => t.name === 'resolve_intent')).toBe(true);
    expect(toolsBeforeSpawn.some((t) => t.name === 'activate_spell')).toBe(true);

    // ACT: Call resolve_intent with matching query
    const query = 'create project and add task using project management';
    console.log(`[TEST] Calling resolve_intent with: "${query}"`);

    const response = await gateway.handleResolveIntentCall({ query });

    // ASSERT: High confidence auto-spawn (≥0.85)
    console.log(`\n[TEST] Response:`, JSON.stringify(response, null, 2));

    expect(response.status).toBe('activated');
    expect(response.spell?.name).toBe(testSpellName);
    expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85); // High confidence threshold
    expect(response.tools).toBeDefined();
    expect(response.tools!.length).toBeGreaterThan(0);

    // ASSERT: Verify tools now available from spawned server
    const toolsAfterSpawn = gateway.getAvailableTools();
    console.log(`[TEST] Tools after spawn: ${toolsAfterSpawn.length}`);

    // Should have: resolve_intent, activate_spell + child server tools
    expect(toolsAfterSpawn.length).toBeGreaterThan(toolsBeforeSpawn.length);

    // Verify specific tools from Basic Auth server
    const toolNames = toolsAfterSpawn.map((t) => t.name);
    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('add_task');
    expect(toolNames).toContain('get_project_status');

    console.log(`[TEST] ✅ Test passed: High confidence auto-spawn successful`);
  });
});
```

---

## Key Differences from Demo Test

### 1. **Test Isolation with Path Management**

```typescript
// ❌ OLD: Uses real ~/.grimoire (pollutes user directory)
grimoireDir = getSpellDirectory(); // ~/.grimoire
spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

// ✅ NEW: Uses isolated test directory
grimoireDir = setupTestGrimoireDir('gateway-basic-auth-http');
spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);
// Creates: .test-grimoire/gateway-basic-auth-http/
// Sets GRIMOIRE_HOME env var
// All paths now resolve to test directory
```

**Benefits:**

- ✅ No pollution of `~/.grimoire`
- ✅ Tests can run in parallel (unique directories)
- ✅ Automatic cleanup removes all test artifacts
- ✅ Tests use real production path resolution code

### 2. **Complete Cleanup with Path Reset**

```typescript
// ❌ OLD: Manual cleanup, directory remains
afterAll(async () => {
  await gateway.shutdown();
  await stopServer(serverProcess, serverPort);
  if (existsSync(spellFilePath)) await rm(spellFilePath);
  // Directory still exists, GRIMOIRE_HOME still set
});

// ✅ NEW: Complete cleanup with path reset
afterAll(async () => {
  await gateway.shutdown();
  await stopServer(serverProcess, serverPort, 'basic_auth_http_server');
  await cleanupTestGrimoireDir(grimoireDir);
  // Removes directory, unsets GRIMOIRE_HOME, resets path cache
}, 30000);
```

### 3. **Strict Naming Convention**

```typescript
// ❌ OLD: Generic names cause collisions
const testSpellName = 'gateway-simple-test-basic-http';

// ✅ NEW: Descriptive name following CLI pattern
const testSpellName = 'gateway-basic-auth-http';
```

### 2. **Port Registry Usage**

```typescript
// ❌ OLD: Random ports or reused ports
const serverPort = 8017;

// ✅ NEW: Dedicated port from registry (prevents collisions)
const serverPort = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP; // 8017
```

### 3. **Gateway Methods**

```typescript
// ❌ OLD: Using internal methods not exposed
await gateway.handleResolveIntent({ query });

// ✅ NEW: Use public API methods
const response = await gateway.handleResolveIntentCall({ query });
const tools = gateway.getAvailableTools();
```

### 4. **Tool Validation**

```typescript
// ❌ OLD: Generic validation
expect(toolsAfterSpawn.length).toBeGreaterThan(toolsBeforeSpawn.length);

// ✅ NEW: Specific tool name validation (from TEST-SERVER-TOOL-MAPPING.md)
const toolNames = toolsAfterSpawn.map((t) => t.name);
expect(toolNames).toContain('create_project');
expect(toolNames).toContain('add_task');
expect(toolNames).toContain('get_project_status');
```

---

## Test Scenarios by Category

### Category 1: Server-Specific Auto-Spawn Tests (10 tests) ✅ COMPLETED

**Status**: ✅ **10/10 tests passing** - Implemented and validated January 23, 2026

**Goal**: Validate high-confidence auto-spawn (≥0.85) for all 10 server types (11 transport configurations)

**Pattern**:

1. Start server (HTTP/SSE) or skip (stdio - spawns on-demand)
2. Create spell via CLI with probe
3. Start gateway, wait 2s for spell indexing
4. Call resolve_intent with tool-name-based query
5. Assert `status: "activated"` with confidence ≥ 0.85
6. Assert correct tools available via getAvailableTools()
7. Cleanup: shutdown gateway, stop server, remove spell

**Files**: `gateway-{server-type}.e2e.test.ts` (10 files total: 8 HTTP/SSE + 2 stdio)

**Completed Tests**:

- ✅ `gateway-basic-auth-http.e2e.test.ts` - Project Management tools
- ✅ `gateway-basic-auth-sse.e2e.test.ts` - File Storage tools
- ✅ `gateway-api-key-http.e2e.test.ts` - Weather tools
- ✅ `gateway-api-key-sse.e2e.test.ts` - News tools
- ✅ `gateway-security-keys-http.e2e.test.ts` - Database tools
- ✅ `gateway-security-keys-sse.e2e.test.ts` - Analytics tools
- ✅ `gateway-no-auth-http.e2e.test.ts` - Math/Utility tools
- ✅ `gateway-no-auth-sse.e2e.test.ts` - System Monitor tools
- ✅ `gateway-stdio-capjs.e2e.test.ts` - CAP.js tools
- ✅ `gateway-stdio-ui5.e2e.test.ts` - UI5 tools

**Critical Fix Applied**: SSE transport now correctly uses `SSEClientTransport` (GET /sse) instead of `StreamableHTTPClientTransport` (POST /mcp)

**Note**: OAuth2 HTTP server excluded, so 10 tests instead of 11.

---

### Category 2: Intent Resolution Confidence Levels (3 tests) 📋 PENDING

**Status**: 📋 **Design complete** - Ready for implementation

**Key Insight**: Confidence scores come from REAL HybridResolver keyword/semantic matching logic. Cannot mock or hardcode. Must use:

- Real MCP servers with real tools
- Real spell YAML files with carefully chosen keywords
- Carefully crafted queries designed to produce specific confidence ranges

**Confidence Calculation** (from hybrid-resolver.ts):

- **Keyword match**: Base 0.9 + matchRatio\*0.1 + exactBoost(0.05) - weakPenalty(0.1) = **0.75-1.0**
- **Hybrid match** (1 keyword + semantic): **0.7-0.9**
- **Semantic-only match**: **0.3-0.6**
- **No match**: <0.3 (filtered out)

#### Test 2.1: Multiple Matches (Medium Confidence: 0.5-0.84) 📋

**File**: `gateway-multiple-matches.e2e.test.ts`

**Strategy**: Create 3 spells with **1 keyword overlap each** to trigger weak match penalty (~0.82)

**Setup**:

- **Spell 1**: weather-data (keywords: weather, data, information) → weather-http server
- **Spell 2**: news-data (keywords: news, data, information) → news-sse server
- **Spell 3**: analytics-data (keywords: analytics, data, reports) → analytics-sse server
- **Query**: "show me some data information about reports" (4 meaningful words)

**Expected Matching**:

- Each spell matches **1 keyword** → weak match penalty (-0.1)
- Keyword score: 0.9 + (1/4 \* 0.1) - 0.1 = **0.825**
- All 3 spells: confidence ~0.82

**Expected Response**:

```typescript
{
  status: "multiple_matches",
  matches: [
    { spellName: "weather-data", confidence: ~0.82 },
    { spellName: "news-data", confidence: ~0.82 },
    { spellName: "analytics-data", confidence: ~0.82 }
  ],
  message: expect.stringContaining("multiple matching")
}
```

**Validation**: No server spawned, response includes alternatives, tools list unchanged

#### Test 2.2: Weak Matches (0.3-0.49) 📋

**File**: `gateway-weak-matches.e2e.test.ts`

**Strategy**: Query with **no keyword overlap**, rely on semantic similarity only

**Setup**:

- **Spell 1**: system-monitor (keywords: monitor, resources, system) → no-auth-sse server
- **Query**: "check performance metrics and usage statistics" (no keyword match)

**Expected Matching**:

- **No keyword overlap**: "performance metrics" ≠ "monitor resources"
- **Semantic similarity**: Related concepts → **0.35-0.45 confidence**
- Match type: 'semantic'

**Expected Response**:

```typescript
{
  status: "weak_matches",
  matches: [
    { spellName: "system-monitor", confidence: ~0.35-0.45 }
  ],
  availableSpells: ["system-monitor"],
  message: expect.stringContaining("weak confidence")
}
```

**Validation**: No server spawned, weak confidence tier triggered

#### Test 2.3: Not Found (<0.3) 📋

**File**: `gateway-not-found.e2e.test.ts`

**Strategy**: Query completely unrelated to all spell keywords

**Setup**:

- **Existing spells**: weather-data, news-data, system-monitor (from previous tests)
- **Query**: "launch spaceship to mars and activate warp drive" (space exploration)

**Expected Matching**:

- **No keyword overlap**: launch, spaceship, mars, warp, drive ≠ weather, news, monitor, etc.
- **No semantic similarity**: Space vs weather/news/monitoring
- All confidence <0.3 → **filtered out**

**Expected Response**:

```typescript
{
  status: "not_found",
  matches: [],
  availableSpells: ["weather-data", "news-data", "system-monitor"],
  message: expect.stringContaining("no matching")
}
```

**Validation**: No server spawned, all available spells listed for user

---

### Category 3: Turn-Based Cleanup (1 test) 📋 PENDING

**Status**: 📋 **Approach clarified** - Ready for implementation

**File**: `gateway-turn-based-cleanup.e2e.test.ts`

**Key Insight from Code Analysis**:

- `incrementTurn()` is called AUTOMATICALLY on every resolve_intent/activate_spell call (gateway.ts lines 174, 204, 274, 302, 326, 366, 446, 486)
- `markUsed(spellName)` is called AUTOMATICALLY when a spell is spawned or used (gateway.ts lines 207, 369, 489)
- `cleanupInactive(5)` is called AUTOMATICALLY after spawn/use (gateway.ts lines 210, 372, 492)
- `getAvailableTools()` returns **2 grimoire tools (resolve_intent, activate_spell) + all active spell tools**

**Test Strategy** (based on user's explanation):

```typescript
it('should cleanup inactive server after 5 turns of inactivity', async () => {
  // ARRANGE: Start 2 servers, create 2 spells
  // spell1: math-tools (no-auth-http) - 3 tools: calculate, convert_units, generate_random
  // spell2: weather-tools (api-key-http) - 3 tools: get_current_weather, get_forecast, get_weather_alerts

  // Initial state: 2 grimoire tools (resolve_intent, activate_spell)
  let tools = gateway.getAvailableTools();
  expect(tools).toHaveLength(2); // Only grimoire tools

  // ACT 1: Query spell1 → spawns server1 (turn 1, server1 marked as used)
  await gateway.handleResolveIntentCall({
    method: 'resolve_intent',
    params: { query: 'calculate math expression' },
  });

  // ASSERT 1: 2 grimoire + 3 spell1 tools = 5 total
  tools = gateway.getAvailableTools();
  expect(tools).toHaveLength(5);
  expect(tools.map((t) => t.name)).toContain('calculate');
  expect(tools.map((t) => t.name)).toContain('convert_units');

  // ACT 2: Query spell2 → spawns server2 (turn 2, server2 marked as used)
  await gateway.handleResolveIntentCall({
    method: 'resolve_intent',
    params: { query: 'get weather forecast' },
  });

  // ASSERT 2: 2 grimoire + 3 spell1 + 3 spell2 = 8 total
  tools = gateway.getAvailableTools();
  expect(tools).toHaveLength(8);
  expect(tools.map((t) => t.name)).toContain('calculate');
  expect(tools.map((t) => t.name)).toContain('get_current_weather');

  // ACT 3-7: Query spell2 FIVE MORE TIMES (turns 3-7)
  // Server1 idle since turn 1, server2 active every turn
  // After turn 7: server1 has been idle for 6 turns (7 - 1 = 6 ≥ 5 threshold)
  for (let i = 0; i < 5; i++) {
    await gateway.handleResolveIntentCall({
      method: 'resolve_intent',
      params: { query: 'get weather forecast' },
    });
    // Each call: incrementTurn(), markUsed('weather-tools'), cleanupInactive(5)
  }

  // ASSERT 3: Server1 killed (idle ≥5 turns), server2 still alive
  // Expected: 2 grimoire + 3 spell2 = 5 total (spell1 tools removed)
  tools = gateway.getAvailableTools();
  expect(tools).toHaveLength(5);
  expect(tools.map((t) => t.name)).not.toContain('calculate'); // Server1 killed
  expect(tools.map((t) => t.name)).toContain('get_current_weather'); // Server2 alive
});
```

**Turn Timeline**:

- Turn 1: Spawn server1 (math-tools) - lastUsedTurn=1
- Turn 2: Spawn server2 (weather-tools) - lastUsedTurn=2, server1 idle
- Turn 3: Use server2 - lastUsedTurn=3, server1 idle (3-1=2 turns)
- Turn 4: Use server2 - lastUsedTurn=4, server1 idle (4-1=3 turns)
- Turn 5: Use server2 - lastUsedTurn=5, server1 idle (5-1=4 turns)
- Turn 6: Use server2 - lastUsedTurn=6, server1 idle (6-1=5 turns) ← **Threshold reached**
- Turn 7: Use server2 - lastUsedTurn=7, **server1 KILLED** (7-1=6 ≥ 5), tools removed

**Validation**:

- ✅ Server1 killed after 5 turns of inactivity
- ✅ Server2 stays alive (used every turn)
- ✅ Tool count reduces from 8 → 5 (server1 tools removed)
- ✅ `cleanupInactive(5)` triggers automatically on every resolve_intent call

---

### Category 4: Parallel Servers (1 test) 📋 PENDING

**Status**: 📋 **Straightforward** - Ready for implementation

**File**: `gateway-parallel-servers.e2e.test.ts`

**Goal**: Validate multiple servers spawned simultaneously with correct tool registration

**Test Strategy**:

```typescript
it('should spawn and manage multiple servers simultaneously', async () => {
  // ARRANGE: Create 3 spells with different servers
  // spell1: math-tools (no-auth-http) - 3 tools
  // spell2: project-tools (basic-auth-http) - 3 tools
  // spell3: database-tools (security-keys-http) - 3 tools

  // ACT: Spawn all 3 servers with high-confidence queries
  const response1 = await gateway.handleResolveIntentCall({
    method: 'resolve_intent',
    params: { query: 'calculate math expression and convert units' },
  });
  expect(response1.status).toBe('activated');
  expect(response1.spell?.name).toBe('math-tools');

  const response2 = await gateway.handleResolveIntentCall({
    method: 'resolve_intent',
    params: { query: 'create project and add task' },
  });
  expect(response2.status).toBe('activated');
  expect(response2.spell?.name).toBe('project-tools');

  const response3 = await gateway.handleResolveIntentCall({
    method: 'resolve_intent',
    params: { query: 'run sql query and get table schema' },
  });
  expect(response3.status).toBe('activated');
  expect(response3.spell?.name).toBe('database-tools');

  // ASSERT: All tools from all 3 servers present
  const tools = gateway.getAvailableTools();

  // 2 grimoire + 3 math + 3 project + 3 database = 11 tools
  expect(tools).toHaveLength(11);

  // Verify math tools
  expect(tools.map((t) => t.name)).toContain('calculate');
  expect(tools.map((t) => t.name)).toContain('convert_units');
  expect(tools.map((t) => t.name)).toContain('generate_random');

  // Verify project tools
  expect(tools.map((t) => t.name)).toContain('create_project');
  expect(tools.map((t) => t.name)).toContain('add_task');
  expect(tools.map((t) => t.name)).toContain('get_project_status');

  // Verify database tools
  expect(tools.map((t) => t.name)).toContain('run_sql_query');
  expect(tools.map((t) => t.name)).toContain('get_table_schema');
  expect(tools.map((t) => t.name)).toContain('export_query_results');
});
```

**Validation**:

- ✅ All 3 servers spawn successfully
- ✅ Tools from all servers are available simultaneously
- ✅ Gateway maintains separate server state for each
- ✅ Tool count = 2 grimoire + (3 × 3 spell tools) = 11 total

---

## Helper Utilities (New)

### 1. Gateway Test Helper

**File**: `src/presentation/__tests__/helpers/gateway-test-helper.ts`

```typescript
import { GrimoireServer } from '../../gateway';

export interface GatewayTestContext {
  gateway: GrimoireServer;
  spellName: string;
  spellPath: string;
  serverPort: number;
  serverProcess: ChildProcess;
}

/**
 * Create and start gateway with spell
 * DRY principle - reusable setup
 */
export async function setupGatewayWithSpell(
  spellName: string,
  serverPort: number,
  serverModule: string,
  createOptions: CreateOptions
): Promise<GatewayTestContext> {
  const grimoireDir = getSpellDirectory();
  const spellPath = join(grimoireDir, `${spellName}.spell.yaml`);

  // Ensure clean state
  await ensureDirectories();
  if (existsSync(spellPath)) await rm(spellPath);

  // Start server
  const serverProcess = await startFastMCPServer(serverModule, serverPort);

  // Create spell
  await createCommand(createOptions);

  // Start gateway and wait for indexing
  const gateway = new GrimoireServer();
  await gateway.start();
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return { gateway, spellName, spellPath, serverPort, serverProcess };
}

/**
 * Cleanup gateway test context
 * DRY principle - reusable teardown
 */
export async function cleanupGatewayContext(ctx: GatewayTestContext): Promise<void> {
  await ctx.gateway.shutdown();
  await stopServer(ctx.serverProcess, ctx.serverPort, 'test_server');
  if (existsSync(ctx.spellPath)) await rm(ctx.spellPath);
}

/**
 * Get active spell names from gateway
 * SRP - single responsibility
 */
export function getActiveSpells(gateway: GrimoireServer): string[] {
  // Access via router or lifecycle manager
  // TODO: May need to expose public API
  return [];
}

/**
 * Validate resolve_intent response structure
 * SRP - validation logic
 */
export function assertTier1Response(
  response: ResolveIntentResponse,
  expectedSpellName: string,
  expectedTools: string[]
): void {
  expect(response.status).toBe('activated');
  expect(response.spell?.name).toBe(expectedSpellName);
  expect(response.spell?.confidence).toBeGreaterThanOrEqual(0.85);
  expect(response.tools).toBeDefined();

  const toolNames = response.tools || [];
  expectedTools.forEach((tool) => {
    expect(toolNames).toContain(tool);
  });
}
```

---

## Implementation Plan

### Phase 1: Foundation (Day 1)

- [ ] Create helper utilities (gateway-test-helper.ts)
- [ ] Update FASTMCP_PORTS with gateway test ports
- [ ] Verify gateway public API (handleResolveIntentCall, getAvailableTools)

### Phase 2: Server-Specific Tests (Day 2-3)

- [ ] Implement 10 server-specific auto-spawn tests (8 HTTP/SSE + 2 stdio)
- [ ] Validate all pass in parallel
- [ ] Ensure unique ports/spell names prevent collisions

### Phase 3: Confidence Level Tests (Day 4)

- [ ] Implement multiple matches test (medium confidence)
- [ ] Implement low confidence test (weak matches)
- [ ] Implement not found test (no match)

### Phase 4: Lifecycle Tests (Day 5)

- [ ] Implement turn-based cleanup test
- [ ] Implement parallel servers test
- [ ] Validate cleanup triggers correctly

### Phase 5: Validation (Day 6)

- [ ] Run all tests in parallel (validate no collisions)
- [ ] Review test coverage
- [ ] Document any gaps or limitations

---

## Success Criteria

### Quantitative

- [ ] 15+ gateway integration tests passing (10 server-specific + 5 scenario tests)
- [ ] All 10 server types tested (11 transport configurations)
- [ ] All 3 confidence levels tested (high/medium/low)
- [ ] Turn-based cleanup validated
- [ ] Zero test collisions in parallel execution

### Qualitative

- [ ] Tests follow Arrange-Act-Assert pattern
- [ ] Tests follow DRY, SRP, YAGNI principles
- [ ] Tests match CLI integration test quality
- [ ] Tests are maintainable and readable
- [ ] Real servers, no mocks

---

## Common Pitfalls to Avoid

### ❌ Don't: Use real ~/.grimoire directory

```typescript
grimoireDir = getSpellDirectory(); // Pollutes user's directory!
```

### ✅ Do: Use isolated test directory

```typescript
grimoireDir = setupTestGrimoireDir('gateway-test-name'); // Isolated!
```

### ❌ Don't: Forget to reset environment after test

```typescript
afterAll(async () => {
  await gateway.shutdown();
  if (existsSync(spellFilePath)) await rm(spellFilePath);
  // GRIMOIRE_HOME still set! Path cache not reset!
});
```

### ✅ Do: Use cleanup helper

```typescript
afterAll(async () => {
  await gateway.shutdown();
  await cleanupTestGrimoireDir(grimoireDir); // Complete cleanup!
}, 30000);
```

### ❌ Don't: Reuse ports across tests

```typescript
const port = 8000; // COLLISION!
```

### ✅ Do: Use dedicated ports from registry

```typescript
const port = FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP_TIER1; // 8017
```

### ❌ Don't: Reuse spell names

```typescript
const spellName = 'test-spell'; // COLLISION!
```

### ✅ Do: Use unique spell names per test

```typescript
const spellName = 'gateway-tier1-basic-http'; // UNIQUE
```

### ❌ Don't: Forget to wait for indexing

```typescript
await gateway.start();
await gateway.handleResolveIntentCall({ query }); // FAILS - spell not indexed
```

### ✅ Do: Wait for spell watcher

```typescript
await gateway.start();
await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for indexing
await gateway.handleResolveIntentCall({ query }); // SUCCESS
```

### ❌ Don't: Skip cleanup or do partial cleanup

```typescript
afterAll(async () => {
  await gateway.shutdown();
  // Missing: stopServer, rm spellFile, cleanup test directory
});
```

### ✅ Do: Complete cleanup

```typescript
afterAll(async () => {
  await gateway.shutdown();
  await stopServer(serverProcess, serverPort, 'server');
  await cleanupTestGrimoireDir(grimoireDir); // Removes everything
}, 30000);
```

---

## Appendix: Query Patterns by Server

**Reference**: [TEST-SERVER-TOOL-MAPPING.md](TEST-SERVER-TOOL-MAPPING.md)

| Server                 | Tools                                                   | Query Pattern (Tier 1)             |
| ---------------------- | ------------------------------------------------------- | ---------------------------------- |
| Basic Auth HTTP/SSE    | create_project, add_task, get_project_status            | "create project and add task"      |
| API Key HTTP           | get_current_weather, get_forecast, get_weather_alerts   | "get current weather forecast"     |
| API Key SSE            | get_latest_news, search_news, get_trending_topics       | "get latest news trending topics"  |
| Security Keys HTTP/SSE | analyze_dataset, get_table_schema, export_query_results | "analyze dataset get table schema" |
| No Auth HTTP/SSE       | get_cpu_usage, get_memory_stats, get_disk_usage         | "get cpu usage memory stats"       |
| OAuth2 HTTP            | send_email, get_inbox, search_emails                    | "send email get inbox"             |
| CAP.js stdio           | search_model, search_docs                               | "search model docs for cds"        |
| UI5 stdio              | get_guidelines, get_api_reference, get_project_info     | "get ui5 guidelines api reference" |

---

## Lessons from CLI Integration Tests (Applied to Gateway Tests)

### Overview

The CLI integration tests (19 tests, 69 test cases, all passing) established best practices that directly apply to gateway testing:

### 1. **Test Isolation via GRIMOIRE_HOME Override**

**Pattern:**

```typescript
// Setup: Override GRIMOIRE_HOME
grimoireDir = setupTestGrimoireDir('test-name');
// Result: All paths resolve to .test-grimoire/test-name/

// Cleanup: Remove directory and reset environment
await cleanupTestGrimoireDir(grimoireDir);
```

**Why It Works:**

- ✅ Uses real production code (`getSpellDirectory()`, `getEnvFilePath()`)
- ✅ No mocks needed for path resolution
- ✅ Parallel test execution without collisions
- ✅ Clean slate for each test

**Applied to Gateway:**

- Gateway's spell watcher monitors `GRIMOIRE_HOME` directory
- Gateway's spell indexer reads from test directory
- All spell files created in isolated test directory
- Gateway tests inherit same isolation benefits

### 2. **Comprehensive Cleanup Strategy**

**CLI Pattern (Successful):**

```typescript
afterAll(async () => {
  await stopServer(serverProcess, serverPort, 'server_name');
  await cleanupTestGrimoireDir(grimoireDir);
  // Automatically:
  // - Removes .test-grimoire/test-name/ directory
  // - Unsets GRIMOIRE_HOME
  // - Resets path cache via resetPathsCache()
}, 30000);
```

**Gateway Enhancement:**

```typescript
afterAll(async () => {
  // 1. Shutdown gateway (stops watchers, cleans up processes)
  if (gateway) await gateway.shutdown();

  // 2. Stop test servers
  await stopServer(serverProcess, serverPort, 'server_name');

  // 3. Complete directory cleanup
  await cleanupTestGrimoireDir(grimoireDir);
}, 30000);
```

**Critical Order:**

1. Gateway shutdown first (releases file watchers)
2. Server shutdown second (releases ports)
3. Directory cleanup last (removes all artifacts)

### 3. **Real Servers, No Mocks**

**Philosophy:**

```
CLI Tests: Real FastMCP servers → Real spell files → Real probe
Gateway Tests: Real FastMCP servers → Real spell files → Real gateway → Real spawning
```

**Benefits:**

- Tests catch real integration issues
- Tests validate actual auth flows
- Tests verify complete user experience
- High confidence in production behavior

### 4. **Unique Test Names Prevent Collisions**

**Pattern from CLI Tests:**

```typescript
// Each test gets unique identifier
setupTestGrimoireDir('no-auth-http')       → .test-grimoire/no-auth-http/
setupTestGrimoireDir('basic-auth-http')    → .test-grimoire/basic-auth-http/
setupTestGrimoireDir('api-key-sse')        → .test-grimoire/api-key-sse/
```

**Applied to Gateway Tests:**

```typescript
// Gateway tests follow same pattern
setupTestGrimoireDir('gateway-basic-auth-http')     → .test-grimoire/gateway-basic-auth-http/
setupTestGrimoireDir('gateway-api-key-sse')         → .test-grimoire/gateway-api-key-sse/
setupTestGrimoireDir('gateway-turn-based-cleanup')  → .test-grimoire/gateway-turn-based-cleanup/
```

**Result:** All tests can run in parallel without interference

### 5. **DRY with Reusable Helpers**

**Shared Test Infrastructure:**

```typescript
// CLI tests created, gateway tests reuse:
src/cli/__tests__/helpers/
├── test-path-manager.ts        ← Shared by CLI + Gateway
├── test-server-manager.ts      ← Shared by CLI + Gateway
└── spell-validator.ts          ← Shared by CLI + Gateway

// Gateway-specific additions:
src/presentation/__tests__/helpers/
├── gateway-test-helper.ts      ← Gateway-specific utilities
└── gateway-test-path-manager.ts ← Gateway path enhancements (optional)
```

**Benefits:**

- No code duplication
- Consistent test patterns
- Easy maintenance
- Single source of truth

### 6. **Production Code Path Testing**

**Key Insight from CLI Tests:**

The test isolation uses `GRIMOIRE_HOME` override, which is a **real feature** of the production code:

```typescript
// src/utils/paths.ts
export function getSpellDirectory(): string {
  const envPath = process.env.GRIMOIRE_HOME;
  if (envPath != null && envPath !== '') {
    return envPath; // Tests use this path
  }
  return join(homedir(), '.grimoire'); // Production uses this path
}
```

**Why This Matters:**

- Tests exercise real production path resolution logic
- Tests validate GRIMOIRE_HOME feature works correctly
- No test-only code paths needed
- Users can use GRIMOIRE_HOME env var if needed (bonus feature!)

**Applied to Gateway:**

- Gateway's spell watcher uses `getSpellDirectory()`
- Gateway's spell indexer uses same path resolution
- Tests validate gateway works with custom GRIMOIRE_HOME
- Gateway tests validate production code paths

### 7. **Atomic Test Operations**

**CLI Pattern:**

```typescript
beforeAll(async () => {
  // 1. Setup test directory
  grimoireDir = setupTestGrimoireDir('test-name');

  // 2. Start server
  serverProcess = await startFastMCPServer('server', port);

  // 3. Create spell (uses test directory automatically)
  await createCommand(options);

  // Order matters! Each depends on previous step
}, 60000);
```

**Gateway Pattern:**

```typescript
beforeAll(async () => {
  // 1. Setup test directory (GRIMOIRE_HOME set)
  grimoireDir = setupTestGrimoireDir('gateway-test-name');

  // 2. Start server
  serverProcess = await startFastMCPServer('server', port);

  // 3. Create spell (goes to test directory via GRIMOIRE_HOME)
  await createCommand(options);

  // 4. Start gateway (watches test directory via GRIMOIRE_HOME)
  gateway = new GrimoireServer();
  await gateway.start();

  // 5. Wait for spell indexing
  await new Promise((resolve) => setTimeout(resolve, 2000));
}, 60000);
```

**Key Difference:** Gateway needs indexing wait after start

### 8. **Statistics from CLI Tests**

**Metrics (as of commit 2e74243):**

- 19 test files
- 69 test cases
- 100% pass rate
- Covers 10 unique server types with 11 transport configurations (9 HTTP/SSE + 2 stdio)
- Tests all auth patterns (Basic, Bearer, Custom Headers, None, OAuth2)
- Average test time: ~2-5 seconds per test
- Total suite time: ~8 seconds (parallel execution)

**Implications for Gateway Tests:**

- Expect similar test counts (15+ tests: 10 server-specific + 5 scenarios)
- Similar execution times (gateway adds spawning overhead)
- Parallel execution should work (unique directories)
- Same reliability standards (0 flaky tests)

### 9. **Pre-commit Hook Integration**

**CLI Tests:**
All 19 CLI tests run in pre-commit hook, ensuring:

- No broken tests reach main branch
- Path isolation works correctly
- Cleanup is complete (no leftover files)

**Gateway Tests:**
Should integrate same way:

```json
// package.json
{
  "scripts": {
    "test:cli": "vitest run src/cli/__tests__/",
    "test:gateway": "vitest run src/presentation/__tests__/",
    "test:integration": "vitest run src/cli/__tests__/ src/presentation/__tests__/"
  }
}
```

### Summary

The CLI integration tests proved that:

1. ✅ Path isolation via `GRIMOIRE_HOME` works perfectly
2. ✅ No mocks needed when using real test directories
3. ✅ Tests can run in parallel without collisions
4. ✅ Cleanup is reliable and complete
5. ✅ Pattern is maintainable and readable

Gateway tests inherit all these benefits plus additional validation of:

- Intent resolution correctness
- Server spawning reliability
- Tool routing accuracy
- Turn-based cleanup functionality

---

## Conclusion

This plan provides a **complete strategy** for testing the gateway flow, following the same high-quality patterns established in CLI integration tests. By testing all 10 unique server types (11 transport configurations), all 3 confidence tiers, and turn-based cleanup, we ensure the grimoire gateway works correctly in real-world scenarios.

**Key Validations from Code Review (Jan 23, 2026)**:

- ✅ All 19 CLI tests passing with proven isolation pattern
- ✅ Test server infrastructure ready (10 servers available)
- ✅ Gateway API confirmed and ready for testing
- ✅ Path management pattern reusable from CLI tests
- ✅ Port allocation strategy prevents conflicts

**Next Step**: Implement Phase 1 (helpers) and begin server-specific tests (Phase 2).
