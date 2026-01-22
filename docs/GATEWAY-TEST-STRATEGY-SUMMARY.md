# Gateway Integration Test Strategy - Quick Summary

**Date**: January 22, 2026
**Status**: Ready for Implementation
**Full Plan**: [GATEWAY-INTEGRATION-TEST-PLAN-V2.md](GATEWAY-INTEGRATION-TEST-PLAN-V2.md)

---

## Quick Overview

### What We're Testing

The complete **user journey** from AI agent query → grimoire gateway → MCP server spawning → tool routing → cleanup

### Why This Matters

We have **19/19 CLI tests passing** (spell creation), but **0 gateway flow tests**. We need to validate the actual runtime behavior that users will experience.

---

## Test Structure

### 16 Test Files (Following CLI Pattern)

```
Server-Specific Auto-Spawn Tests (11 tests)
├── gateway-basic-auth-http.e2e.test.ts
├── gateway-basic-auth-sse.e2e.test.ts
├── gateway-api-key-http.e2e.test.ts
├── gateway-api-key-sse.e2e.test.ts
├── gateway-security-keys-http.e2e.test.ts
├── gateway-security-keys-sse.e2e.test.ts
├── gateway-no-auth-http.e2e.test.ts
├── gateway-no-auth-sse.e2e.test.ts
├── gateway-oauth2-http.e2e.test.ts (LATER)
├── gateway-stdio-capjs.e2e.test.ts
└── gateway-stdio-ui5.e2e.test.ts

Intent Resolution Confidence Tests (3 tests)
├── gateway-multiple-matches.e2e.test.ts
├── gateway-low-confidence.e2e.test.ts
└── gateway-not-found.e2e.test.ts

Lifecycle & Routing Tests (2 tests)
├── gateway-turn-based-cleanup.e2e.test.ts
└── gateway-parallel-servers.e2e.test.ts
```

---

## Key Principles

### 1. NO MOCKS - Real Everything

```typescript
// ✅ Real FastMCP server
serverProcess = await startFastMCPServer('servers.basic_auth.http_server', 8017);

// ✅ Real CLI spell creation
await createCommand({ name: 'test-spell', url, authType: 'basic', ... });

// ✅ Real gateway
gateway = new GrimoireServer();
await gateway.start();

// ✅ Real resolve_intent
const response = await gateway.handleResolveIntentCall({ query });
```

### 2. Unique Ports & Spell Names (Prevent Collisions)

```typescript
// Port registry in test-server-manager.ts
export const FASTMCP_PORTS = {
  GATEWAY_BASIC_AUTH_HTTP: 8017,
  GATEWAY_BASIC_AUTH_SSE: 8018,
  GATEWAY_API_KEY_HTTP: 8019,
  // ... 40+ unique ports
};

// Unique spell names following CLI pattern
const spellName = 'gateway-basic-auth-http'; // Clear, descriptive
```

### 3. Arrange-Act-Assert Pattern

```typescript
describe('Gateway E2E - Basic Auth HTTP', () => {
  beforeAll(async () => {
    // ARRANGE: Start server, create spell, start gateway
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', 8017);
    await createCommand({ name: 'gateway-basic-auth-http', ... });
    gateway = new GrimoireServer();
    await gateway.start();
    await sleep(2000); // Wait for spell indexing
  });

  it('should auto-spawn server with high confidence', async () => {
    // ACT: Call resolve_intent
    const response = await gateway.handleResolveIntentCall({
      query: 'create project and add task'
    });

    // ASSERT: Validate high confidence auto-spawn
    expect(response.status).toBe('activated');
    expect(response.spell.confidence).toBeGreaterThanOrEqual(0.85);
    expect(response.tools).toContain('create_project');
  });

  afterAll(async () => {
    // CLEANUP: Stop everything
    await gateway.shutdown();
    await stopServer(serverProcess, 8017, 'server');
    await rm(spellFilePath);
  });
});
```

### 4. Follow CLI Test Quality Standards

- **DRY**: Reusable helpers (setupGatewayWithSpell, cleanupGatewayContext)
- **SRP**: Each test validates one scenario
- **YAGNI**: Only test what we need, no over-engineering

---

## What Each Test Category Validates

### Server-Specific Auto-Spawn (11 tests)

**Validates**: High confidence (≥0.85) → Auto-spawn server → Tools available

```typescript
// Query matches spell keywords strongly
query: 'create project and add task';

// Gateway auto-spawns
response.status === 'activated';
response.spell.confidence >= 0.85;

// Tools available
tools.includes('create_project', 'add_task', 'get_project_status');
```

### Multiple Matches - Medium Confidence (1 test)

**Validates**: Medium confidence (0.5-0.84) → Return alternatives → No auto-spawn

```typescript
// Ambiguous query
query: "check my database"

// Gateway returns alternatives
response.status === "multiple_matches"
response.matches.length === 3 // postgres, mysql, mongodb
response.matches[0].confidence >= 0.5 && < 0.85

// No server spawned
getActiveSpells().length === 0
```

### Low Confidence / Not Found (2 tests)

**Validates**: Low confidence (<0.5) → Return suggestions OR not found

```typescript
// Very weak query
query: "help me with stuff"

// Gateway returns weak matches
response.status === "low_confidence"
response.matches[0].confidence >= 0.3 && < 0.5
```

### Turn-Based Cleanup (1 test)

**Validates**: Servers killed after 5 turns idle

```typescript
// Spawn postgres (turn 1)
await resolve('query database');

// Use stripe for 5 turns (turns 2-7)
// Postgres idle for 6 turns

// Spawn weather (turn 8) - triggers cleanup
await resolve('get weather');

// Assert: postgres killed, stripe + weather alive
expect(getActiveSpells()).not.toContain('postgres');
expect(getActiveSpells()).toContain('stripe');
expect(getActiveSpells()).toContain('weather');
```

### Parallel Servers (1 test)

**Validates**: Multiple servers active, correct tool routing

```typescript
// Spawn 3 servers
await resolve('query database');
await resolve('get weather');
await resolve('send email');

// All tools available
expect(tools).toContain('postgres_query');
expect(tools).toContain('get_weather');
expect(tools).toContain('send_email');
```

---

## Implementation Phases

### Phase 1: Foundation (1 day)

- Create helper utilities
- Add gateway test ports to FASTMCP_PORTS
- Verify gateway public API

### Phase 2: Server-Specific Tests (2 days)

- Implement 11 server-specific tests (1 per server type)
- Validate parallel execution

### Phase 3: Confidence Level Tests (1 day)

- Implement multiple matches, low confidence, not found tests

### Phase 4: Lifecycle Tests (1 day)

- Implement turn-based cleanup
- Implement parallel servers

### Phase 5: Validation (1 day)

- Run all tests in parallel
- Validate no collisions
- Document gaps

---

## Success Criteria

- [ ] 15+ gateway integration tests passing
- [ ] All 11 server types tested
- [ ] All 3 confidence levels tested (high/medium/low)
- [ ] Turn-based cleanup validated
- [ ] Zero test collisions
- [ ] Tests follow CLI quality standards

---

## Key Differences from Demo Test

| Aspect         | Demo Test (Old)               | New Plan                                     |
| -------------- | ----------------------------- | -------------------------------------------- |
| **Naming**     | Generic 'gateway-simple-test' | Descriptive 'gateway-basic-auth-http'        |
| **Ports**      | Hardcoded 8017                | FASTMCP_PORTS.GATEWAY_BASIC_AUTH_HTTP        |
| **Coverage**   | 1 server                      | 11 servers + 3 confidence levels + lifecycle |
| **Pattern**    | Exploratory                   | Strict Arrange-Act-Assert                    |
| **Validation** | Generic tool count            | Specific tool names                          |
| **Cleanup**    | Partial                       | Complete (gateway + server + spell)          |
| **Quality**    | Proof of concept              | Production-ready                             |

---

## Next Steps

1. **Read full plan**: [GATEWAY-INTEGRATION-TEST-PLAN-V2.md](GATEWAY-INTEGRATION-TEST-PLAN-V2.md)
2. **Implement Phase 1**: Create helpers
3. **Start Phase 2**: First server-specific test (Basic Auth HTTP)
4. **Iterate**: Use first test as template for remaining 10

---

## Questions & Answers

### Q: Why 16 tests instead of fewer?

**A**: We need **aggressive coverage** like CLI tests. Each server type has unique auth patterns that must be validated.

### Q: Why unique ports per test?

**A**: Tests run in **parallel**. Shared ports = port conflicts = flaky tests.

### Q: Why not mock the servers?

**A**: We want to test **real integration**. Mocks hide authentication bugs, connection issues, and protocol mismatches.

### Q: How long will this take?

**A**: ~5-6 days for 16 tests + helpers. Same timeline as CLI tests (19 tests in ~1 week).

### Q: What if we skip some servers?

**A**: We'd miss auth bugs. Example: Security Keys HTTP uses custom headers, Basic Auth uses Authorization header. Both must be tested.

---

## Conclusion

This strategy ensures **production-ready gateway testing** by:

1. Testing all 11 server types (comprehensive)
2. Testing all 3 confidence levels (intent resolution)
3. Testing turn-based cleanup (lifecycle)
4. Following CLI test quality standards (maintainable)
5. Using real servers (no mocks = real confidence)
6. **Clear, descriptive naming** following [claude.md](claude.md) principles

**Let's build this! 🚀**
