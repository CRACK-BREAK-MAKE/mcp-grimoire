# Gateway Integration Test Plan v2.0 - Real-World Flow Testing

**Document Type**: Test Plan & Implementation Strategy
**Author**: Based on CLI Integration Test Patterns + Intent Resolution Design
**Date**: January 22, 2026
**Status**: Final Plan - Ready for Implementation
**Related Docs**:

- [intent-resolution-solution.md](intent-resolution-solution.md)
- [turn-based-lifecycle-explained.md](turn-based-lifecycle-explained.md)
- [TEST-SERVER-TOOL-MAPPING.md](TEST-SERVER-TOOL-MAPPING.md)
- [ADR-0006: 5-Turn Inactivity Threshold](adr/0006-five-turn-inactivity-threshold.md)
- [ADR-0009: Multi-Tier Confidence Intent Resolution](adr/0009-multi-tier-confidence-based-intent-resolution.md)

---

## Executive Summary

### Current State

✅ **19/19 CLI integration tests passing** - Spell creation flow validated
❌ **Gateway flow untested** - Intent resolution → Server spawning → Tool routing → Cleanup

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
3. User configures AI Agent (Claude/Copilot): mcp.json or claude_desktop_config.json
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
├── gateway-test-helper.ts (NEW)
└── spell-creator.ts (NEW)
```

### Naming Convention

- `gateway-{server-type}.e2e.test.ts` - Server-specific auto-spawn tests (e.g., gateway-basic-auth-http.e2e.test.ts)
- `gateway-multiple-matches.e2e.test.ts` - Medium confidence, AI agent chooses from alternatives
- `gateway-low-confidence.e2e.test.ts` - Weak matches requiring clarification
- `gateway-not-found.e2e.test.ts` - No matching spells found
- `gateway-turn-based-cleanup.e2e.test.ts` - 5-turn inactivity cleanup
- `gateway-parallel-servers.e2e.test.ts` - Multiple concurrent servers

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
| 9   | gateway-oauth2-http.e2e.test.ts        | servers.oauth2.http_server        | 8025 | HTTP      | OAuth2 | Email          | "send email get inbox"             |

### Stdio Servers (2 servers)

| #   | Test File                       | Server             | Command                   | Env Vars            | Domain  | Query Pattern                      |
| --- | ------------------------------- | ------------------ | ------------------------- | ------------------- | ------- | ---------------------------------- |
| 10  | gateway-stdio-capjs.e2e.test.ts | @cap-js/mcp-server | npx -y @cap-js/mcp-server | None                | CAP CDS | "search model docs for cds"        |
| 11  | gateway-stdio-ui5.e2e.test.ts   | @ui5/mcp-server    | npx -y @ui5/mcp-server    | UI5_LOG_LVL=verbose | UI5     | "get ui5 guidelines api reference" |

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
 * 1. Start FastMCP server (Basic Auth HTTP)
 * 2. Create spell file using CLI
 * 3. Start Gateway (indexes spell)
 * 4. Call resolve_intent with matching query
 * 5. Validate auto-spawn behavior (high confidence)
 * 6. Verify tools available
 *
 * MCP SERVER:
 * - Server: servers.basic_auth.http_server
 * - Port: 8017
 * - Transport: HTTP
 * - Auth: Basic (testuser/testpass123)
 * - Tools: create_project, add_task, get_project_status
 *
 * NO MOCKS - Real server, real spell, real gateway
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess } from 'child_process';
import { join } from 'path';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { getSpellDirectory } from '../../utils/paths';
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
    // ARRANGE: Setup environment
    grimoireDir = getSpellDirectory();
    spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

    const { ensureDirectories } = await import('../../utils/paths');
    await ensureDirectories();

    // Clean up previous test spell
    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
    }

    // Start FastMCP server
    console.log(`[TEST] Starting Basic Auth HTTP server on port ${serverPort}...`);
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', serverPort);
    console.log(`[TEST] ✓ Server started on port ${serverPort}`);

    // Create spell file using CLI
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
    expect(existsSync(spellFilePath), 'Spell file should be created').toBe(true);
    console.log(`[TEST] ✓ Spell file created: ${spellFilePath}`);

    // Start Gateway and wait for spell indexing
    console.log(`[TEST] Starting Gateway...`);
    gateway = new GrimoireServer();
    await gateway.start();

    // Wait for spell watcher to index the file
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log(`[TEST] ✓ Gateway started and spell indexed`);
  }, 60000);

  afterAll(async () => {
    // CLEANUP: Stop gateway and server
    console.log(`[TEST] Cleaning up...`);

    if (gateway) {
      await gateway.shutdown();
      console.log(`[TEST] ✓ Gateway stopped`);
    }

    await stopServer(serverProcess, serverPort, 'basic_auth_http_server');
    console.log(`[TEST] ✓ Server stopped`);

    if (existsSync(spellFilePath)) {
      await rm(spellFilePath);
      console.log(`[TEST] ✓ Spell file deleted`);
    }
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

### 1. **Strict Naming Convention**

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

### 4. **Proper Cleanup**

```typescript
// ❌ OLD: Incomplete cleanup
afterAll(async () => {
  await stopServer(serverProcess);
});

// ✅ NEW: Complete cleanup (gateway + server + spell)
afterAll(async () => {
  await gateway.shutdown();
  await stopServer(serverProcess, serverPort, 'basic_auth_http_server');
  if (existsSync(spellFilePath)) await rm(spellFilePath);
}, 30000);
```

### 5. **Tool Validation**

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

### Category 1: Server-Specific Auto-Spawn Tests (11 tests)

**Goal**: Validate high-confidence auto-spawn (≥0.85) for all 11 server types

**Pattern**:

1. Start server
2. Create spell
3. Start gateway
4. Call resolve_intent with high-confidence query
5. Assert `status: "activated"`
6. Assert confidence ≥ 0.85
7. Assert correct tools available

**Files**: `gateway-{server-type}.e2e.test.ts` (11 files)

**Examples**:

- `gateway-basic-auth-http.e2e.test.ts`
- `gateway-api-key-sse.e2e.test.ts`
- `gateway-stdio-capjs.e2e.test.ts`

---

### Category 2: Intent Resolution Confidence Levels (3 tests)

#### Test 2.1: Multiple Matches (Medium Confidence: 0.5-0.84)

**File**: `gateway-multiple-matches.e2e.test.ts`

**Setup**:

- Create 3 similar spells (postgres, mysql, mongodb)
- Query: "check my database" (ambiguous)

**Expected**:

```typescript
{
  status: "multiple_matches",
  matches: [
    { name: "postgres", confidence: 0.67 },
    { name: "mysql", confidence: 0.64 },
    { name: "mongodb", confidence: 0.59 }
  ]
}
```

**Validation**:

- No server spawned
- Response includes alternatives
- AI agent can choose via activate_spell

#### Test 2.2: Low Confidence Matches (0.3-0.49)

**File**: `gateway-low-confidence.e2e.test.ts`

**Setup**:

- Create 5 diverse spells
- Query: "help me with stuff" (very weak)

**Expected**:

```typescript
{
  status: "low_confidence",
  matches: [
    { name: "spell1", confidence: 0.35 },
    { name: "spell2", confidence: 0.32 },
    ...
  ]
}
```

#### Test 2.3: No Match Found (<0.3)

**File**: `gateway-not-found.e2e.test.ts`

**Setup**:

- Create 3 spells (weather, news, database)
- Query: "launch spaceship to mars" (no match)

**Expected**:

```typescript
{
  status: "not_found",
  availableSpells: [
    { name: "weather", description: "..." },
    { name: "news", description: "..." },
    { name: "database", description: "..." }
  ]
}
```

---

### Category 3: Turn-Based Cleanup (1 test)

**File**: `gateway-turn-based-cleanup.e2e.test.ts`

**Scenario**: Simulate real conversation with turn tracking

```typescript
it('should cleanup inactive servers after 5 turns', async () => {
  // 1. Spawn postgres (turn 1)
  await gateway.handleResolveIntentCall({ query: 'query database' });
  expect(getActiveSpells()).toContain('postgres');

  // 2. Use postgres (turn 2)
  gateway.incrementTurn(); // Simulate tool call
  gateway.markUsed('postgres');

  // 3. Spawn stripe (turn 3) - postgres now idle
  await gateway.handleResolveIntentCall({ query: 'process payment' });
  expect(getActiveSpells()).toContain('postgres');
  expect(getActiveSpells()).toContain('stripe');

  // 4-7. Use stripe 4 times (turns 4-7) - postgres idle for 5 turns
  for (let i = 0; i < 4; i++) {
    gateway.incrementTurn();
    gateway.markUsed('stripe');
  }

  // 8. Spawn another server (turn 8) - triggers cleanup
  await gateway.handleResolveIntentCall({ query: 'get weather' });

  // ASSERT: Postgres killed, stripe + weather alive
  const activeSpells = getActiveSpells();
  expect(activeSpells).not.toContain('postgres'); // KILLED
  expect(activeSpells).toContain('stripe'); // ACTIVE
  expect(activeSpells).toContain('weather'); // NEW

  // ASSERT: Tools updated
  const tools = gateway.getAvailableTools();
  expect(tools.map((t) => t.name)).not.toContain('postgres_query');
  expect(tools.map((t) => t.name)).toContain('stripe_charge');
  expect(tools.map((t) => t.name)).toContain('get_weather');
});
```

---

### Category 4: Parallel Servers (1 test)

**File**: `gateway-parallel-servers.e2e.test.ts`

**Scenario**: Multiple servers active simultaneously

```typescript
it('should route tool calls to correct server', async () => {
  // Spawn 3 servers
  await gateway.handleResolveIntentCall({ query: 'query database' });
  await gateway.handleResolveIntentCall({ query: 'get weather' });
  await gateway.handleResolveIntentCall({ query: 'send email' });

  const tools = gateway.getAvailableTools();

  // Verify all tools present
  expect(tools.map((t) => t.name)).toContain('postgres_query');
  expect(tools.map((t) => t.name)).toContain('get_weather');
  expect(tools.map((t) => t.name)).toContain('send_email');

  // Verify tool routing (each tool goes to correct server)
  // This validates ToolRouter.route() logic
});
```

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

- [ ] Implement 11 server-specific auto-spawn tests (1 per server type)
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

- [ ] 15+ gateway integration tests passing
- [ ] All 11 server types tested
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

### ❌ Don't: Skip cleanup

```typescript
afterAll(async () => {
  await gateway.shutdown();
  // Missing: stopServer, rm spellFile
});
```

### ✅ Do: Complete cleanup

```typescript
afterAll(async () => {
  await gateway.shutdown();
  await stopServer(serverProcess, serverPort, 'server');
  if (existsSync(spellFilePath)) await rm(spellFilePath);
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

## Conclusion

This plan provides a **complete strategy** for testing the gateway flow, following the same high-quality patterns established in CLI integration tests. By testing all 11 servers, all 3 confidence tiers, and turn-based cleanup, we ensure the grimoire gateway works correctly in real-world scenarios.

**Next Step**: Implement Phase 1 (helpers) and begin Tier 1 tests.
