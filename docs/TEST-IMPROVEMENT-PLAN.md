# Integration Test Improvement Plan

**Date**: January 21, 2026  
**Status**: Planning Phase  
**Author**: AI Assistant (Code Reviewer)

---

## Executive Summary

Current integration tests cover **happy paths** well but lack robustness for production use. This plan addresses 10 critical gaps to ensure Grimoire CLI create command is bulletproof for real-world usage on local machines.

**Application Context**:

- Grimoire runs **locally as an MCP server** on user's machine
- Spawned by Claude Desktop via `claude_desktop_config.json`
- Users create spells dynamically via CLI while Grimoire is running
- Spell files stored in `~/.grimoire/`
- Credentials stored in `~/.grimoire/.env`

---

## Assessment Summary

| Category           | Current Coverage | Target   | Priority    |
| ------------------ | ---------------- | -------- | ----------- |
| Happy Path         | 30/30 tests ✅   | 30/30    | ✅ Complete |
| Input Validation   | 0 tests ❌       | 15 tests | 🔴 Critical |
| Unique Spell Names | 0 tests ❌       | 10 tests | 🔴 Critical |
| Concurrency        | 0 tests ❌       | 3 tests  | 🟡 Medium   |
| File Conflicts     | 0 tests ❌       | 2 tests  | 🟡 Medium   |
| Interactive Mode   | 0 tests ❌       | 3 tests  | 🟢 Low      |
| Security/Logging   | 0 tests ❌       | 2 tests  | 🔴 Critical |
| File Permissions   | N/A (local)      | 0 tests  | ⚪ Skip     |
| Special Chars      | 0 tests ❌       | 5 tests  | 🟡 Medium   |
| Network Failures   | 0 tests ❌       | 3 tests  | 🔴 Critical |

**Total New Tests**: 43 tests across 10 new test files

---

## Detailed Requirements Analysis

### 1. Make Spell Names Unique Per Test ✅

**Problem**:

```typescript
// Current: Both tests use same name
const testSpellName = 'test-security-keys-http-spell';
it('should create spell with GitHub token...') // Creates this
it('should create spell with Brave API key...') {
  await rm(spellFilePath); // DELETES previous test's artifact!
}
```

**Solution**: Spell names should reflect the **actual MCP server being tested**

```typescript
// New naming: MCP server name derived from test case
const testSpellName = 'test-github-mcp-http'; // For GitHub MCP simulation
const testSpellName = 'test-brave-mcp-http'; // For Brave MCP simulation
```

**Implementation**:

- Update all 10 existing test files
- Extract server name from test description
- Pattern: `test-{serverName}-{transport}`
- **No new test files needed** - just refactor existing

**Affected Files**:

- `cli-create-security-keys-http.integration.test.ts` (7 tests → 7 unique spell names)
- `cli-create-security-keys-sse.integration.test.ts` (7 tests → 7 unique spell names)
- All other test files remain unchanged (already unique)

---

### 2. Add Input Validation Tests 🔴 CRITICAL

**Problem**: No tests for malformed/invalid inputs

**New Test File**: `cli-create-input-validation.integration.test.ts`

**Test Cases** (15 tests):

```typescript
describe('CLI create - Input Validation', () => {
  describe('Spell Name Validation', () => {
    it('should reject empty spell name');
    it('should reject spell name with uppercase letters');
    it('should reject spell name with spaces');
    it('should reject spell name with special characters (!@#$%)');
    it('should reject spell name starting with hyphen');
    it('should accept valid spell name (lowercase-with-hyphens)');
  });

  describe('Transport Validation', () => {
    it('should reject invalid transport type');
    it('should reject missing transport in non-interactive mode');
  });

  describe('URL Validation', () => {
    it('should reject URL without http/https scheme');
    it('should reject malformed URL');
    it('should accept valid HTTP URL');
    it('should accept valid HTTPS URL');
  });

  describe('Conflicting Options Validation', () => {
    it('should reject --auth-type bearer without --auth-token');
    it('should reject --auth-type basic without --auth-username');
    it('should warn when both --auth and --headers have Authorization');
  });
});
```

**Key Validations to Test**:

- Spell name: `/^[a-z0-9][a-z0-9-]*$/` (existing regex in create.ts)
- Transport: `['stdio', 'sse', 'http']` only
- URLs: Must start with `http://` or `https://`
- Required params: Command for stdio, URL for sse/http
- Auth completeness: Bearer needs token, Basic needs both username+password

**Approach**:

- **Unit-style tests** - no servers needed
- Call `createCommand()` with invalid options
- Assert `process.exit(1)` or thrown errors
- Use spies to capture console.error messages

---

### 3. Add Concurrency Tests 🟡 MEDIUM

**Problem**: What if two CLI processes create spells simultaneously?

**New Test File**: `cli-create-concurrency.integration.test.ts`

**Test Cases** (3 tests):

```typescript
describe('CLI create - Concurrency', () => {
  it('should handle concurrent spell creation with different names', async () => {
    // Spawn 5 parallel createCommand() calls with different spell names
    // All should succeed without file conflicts
  });

  it('should handle concurrent spell creation with same name', async () => {
    // Spawn 2 parallel createCommand() calls with SAME spell name
    // One succeeds, one fails OR last-write-wins (document behavior)
  });

  it('should handle concurrent .env file writes', async () => {
    // Create 5 spells in parallel, all writing different env vars
    // Final .env should contain all 5 variables (no corruption)
  });
});
```

**Key Risks**:

- `.env` file corruption (concurrent writes)
- Spell file conflicts (same name)
- Race conditions in directory creation

**Approach**:

- Use `Promise.all()` to spawn concurrent operations
- Verify file integrity after completion
- Check for partial writes or corruption

---

### 4. Spell Already Exists Handling 🟡 MEDIUM

**Problem**: Current code doesn't check if spell file exists before creating

**Current Behavior** (from code review):

```typescript
// create.ts doesn't check existsSync(spellFilePath) before writeFileSync()
// Result: Silently overwrites existing spell
```

**Expected Behavior**:

1. **Non-interactive mode**: Fail with error message
2. **Interactive mode**: Prompt user to confirm overwrite

**New Test File**: `cli-create-file-conflicts.integration.test.ts`

**Test Cases** (2 tests):

```typescript
describe('CLI create - File Conflicts', () => {
  it('should fail when spell already exists in non-interactive mode', async () => {
    // Create spell once
    await createCommand({ name: 'test-spell', ...options, interactive: false });

    // Try creating again with same name
    await expect(
      createCommand({ name: 'test-spell', ...options, interactive: false })
    ).rejects.toThrow('Spell "test-spell" already exists');
  });

  it('should prompt for overwrite in interactive mode', async () => {
    // Create spell once
    // Mock user input to decline overwrite
    // Assert spell not modified
    // Create spell again
    // Mock user input to accept overwrite
    // Assert spell updated
  });
});
```

**Implementation Required**:

1. Add `existsSync()` check in `create.ts` before writing spell
2. In non-interactive: `throw new Error()` or `process.exit(1)`
3. In interactive: Add confirmation prompt

---

### 5. Test Interactive Mode 🟢 LOW PRIORITY

**Problem**: All tests use `interactive: false` - prompts untested

**New Test File**: `cli-create-interactive.integration.test.ts`

**Test Cases** (3 tests):

```typescript
describe('CLI create - Interactive Mode', () => {
  it('should guide user through stdio spell creation', async () => {
    // Mock all prompts (name, transport, command, args, env vars, probe)
    // Verify spell created matches user inputs
  });

  it('should guide user through HTTP spell creation with auth', async () => {
    // Mock all prompts (name, transport, URL, auth type, credentials)
    // Verify auth credentials properly stored in .env
  });

  it('should allow cancellation mid-wizard', async () => {
    // Mock Ctrl+C or empty inputs
    // Verify no files created on cancellation
  });
});
```

**Approach**:

- Mock prompt library (@clack/prompts)
- Simulate user inputs
- Verify final spell file matches inputs

**Note**: Low priority because production usage is typically non-interactive (scripts, automation)

---

### 6. Verify Credentials Never Logged 🔴 CRITICAL

**Problem**: Security risk if credentials leak to console/logs

**New Test File**: `cli-create-security-logging.integration.test.ts`

**Test Cases** (2 tests):

```typescript
describe('CLI create - Security & Logging', () => {
  it('should never log literal credentials to console', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');

    await createCommand({
      name: 'test-spell',
      transport: 'http',
      url: 'http://localhost:8000',
      authType: 'bearer',
      authToken: 'super-secret-token-12345',
      interactive: false,
      probe: false,
    });

    // Assert credentials never appear in any console output
    const allLogs = consoleSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain('super-secret-token-12345');
    expect(allLogs).toMatch(/\$\{API_TOKEN\}/); // Placeholder OK
  });

  it('should never include credentials in error messages', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');

    // Trigger error with invalid credentials
    await expect(
      probeMCPServer({
        server: {
          transport: 'http',
          url: 'http://invalid-server',
          auth: { type: 'bearer', token: 'secret-token-xyz' },
        },
      })
    ).rejects.toThrow();

    const errorLogs = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorLogs).not.toContain('secret-token-xyz');
  });
});
```

**Key Checks**:

- Spy on `console.log`, `console.error`, `console.warn`
- Verify literal credentials never appear
- Placeholders (`${VAR}`) are OK
- Error messages must not leak secrets

---

### 7. Test .env File Permissions ⚪ SKIP

**Question**: Do we need to test file permissions for `~/.grimoire/.env`?

**Answer**: **NO - Skip this test**

**Reasoning**:

1. **Local machine context**: Users run Grimoire on their own machines
2. **User-owned files**: `~/.grimoire/` is in user's home directory
3. **No shared access**: Not a multi-user server environment
4. **OS handles permissions**: macOS/Linux default to user-only (600)
5. **Windows behavior**: Different permission model
6. **YAGNI principle**: Premature optimization

**Alternative**: Document in README.md that users should protect their `.env` file if concerned

**Recommendation**: Add a one-time warning message when creating first spell:

```typescript
console.log(formatInfo('💡 Tip: Credentials stored in ~/.grimoire/.env'));
console.log(dim('   Keep this file secure and never commit to version control'));
```

---

### 8. Test with Special Characters 🟡 MEDIUM

**Problem**: Unicode, emoji, control characters could break parsing

**New Test File**: `cli-create-special-characters.integration.test.ts`

**Test Cases** (5 tests):

```typescript
describe('CLI create - Special Characters', () => {
  it('should handle environment variable values with special chars', async () => {
    // Env var value: p@ssw0rd!#$%^&*()
    // Verify YAML escaping and .env storage
  });

  it('should handle URLs with query parameters', async () => {
    // URL: http://localhost:8000/api?key=value&foo=bar
    // Verify URL properly stored (no mangling)
  });

  it('should handle header values with quotes and newlines', async () => {
    // Header value: "quoted value" with\nnewline
    // Verify YAML proper escaping
  });

  it('should reject spell names with unicode characters', async () => {
    // Name: test-spell-🚀
    // Should fail validation (alphanumeric + hyphen only)
  });

  it('should handle auth credentials with special characters', async () => {
    // Password: p@ss"word'123!
    // Verify proper escaping in YAML and .env
  });
});
```

**Key Scenarios**:

- YAML special characters: `:`, `#`, `"`, `'`, `\n`
- URL encoding: `&`, `?`, `=`, `%`
- Shell special characters: `$`, `` ` ``, `!`, `;`
- Unicode: Emoji, non-ASCII characters

---

### 9. Test with Extremely Long Inputs 🟡 MEDIUM

**Problem**: Buffer overflows, truncation, performance issues

**New Test File**: `cli-create-long-inputs.integration.test.ts`

**Test Cases** (3 tests):

```typescript
describe('CLI create - Long Inputs', () => {
  it('should handle very long spell names (255 chars)', async () => {
    const longName = 'test-spell-' + 'a'.repeat(250);
    // Might hit filesystem limits (most allow 255)
    // Document max length or add validation
  });

  it('should handle very long URLs (2000+ chars)', async () => {
    const longUrl = 'http://localhost:8000/' + 'path/'.repeat(400);
    // Verify no truncation or buffer overflow
  });

  it('should handle many environment variables (100+)', async () => {
    const manyEnvVars: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      manyEnvVars[`VAR_${i}`] = `value_${i}`;
    }
    // Verify all vars properly stored in .env
  });
});
```

**Limits to Test**:

- Spell name: 255 chars (filesystem limit)
- URL: 2083 chars (IE limit, but good threshold)
- Env vars: 100+ variables
- Single env var value: 10KB+

---

### 10. Test Network Failures Mid-Probe 🔴 CRITICAL

**Problem**: Network can fail during probe - must handle gracefully

**New Test File**: `cli-create-network-failures.integration.test.ts`

**Test Cases** (3 tests):

```typescript
describe('CLI create - Network Failures', () => {
  it('should handle server timeout during probe', async () => {
    // Start server, make it hang on initialize request
    // Verify: Probe fails with timeout error, NO spell file created
  });

  it('should handle server disconnect mid-probe', async () => {
    // Start server, kill it after initialize but before tools/list
    // Verify: Probe fails gracefully, NO spell file created
  });

  it('should handle DNS resolution failure', async () => {
    await expect(
      createCommand({
        name: 'test-spell',
        transport: 'http',
        url: 'http://nonexistent-domain-xyz.invalid',
        probe: true,
        interactive: false,
      })
    ).rejects.toThrow(/DNS|resolve|ENOTFOUND/);

    // Verify NO spell file created
    expect(existsSync(spellFilePath)).toBe(false);
  });
});
```

**Critical Requirement**:

> "if network fails during probe gracefully exit by informing users, should not create the spell"

**Implementation Status**: ✅ **Already implemented!** (Line 595-637 in create.ts)

```typescript
if (!probeResult.success) {
  spinner.fail(`Server probe failed: ${probeResult.error}`);
  // ... error messages ...
  process.exit(1); // ← Exits WITHOUT creating spell
}
```

**Tests Needed**: Verify this behavior under different failure modes

---

## Implementation Plan

### Phase 1: Critical Fixes (Week 1) 🔴

**Priority**: Blocking for production release

1. **Unique Spell Names** (2 hours)
   - Refactor existing test files
   - Update spell name generation logic
   - Run full test suite to verify

2. **Input Validation Tests** (4 hours)
   - Create new test file
   - Add 15 validation test cases
   - Document validation rules

3. **Security Logging Tests** (2 hours)
   - Create new test file
   - Add console spy assertions
   - Verify no credential leaks

4. **Network Failure Tests** (3 hours)
   - Create new test file
   - Simulate timeout, disconnect, DNS failures
   - Verify no spell creation on failure

**Deliverable**: 4 new test files, 22 new tests, refactored spell names

---

### Phase 2: Robustness (Week 2) 🟡

**Priority**: Important for production stability

5. **Concurrency Tests** (4 hours)
   - Create new test file
   - Test parallel operations
   - Document concurrency behavior

6. **File Conflicts** (3 hours)
   - Create new test file
   - **Add overwrite logic to create.ts**
   - Add interactive confirmation prompt

7. **Special Characters** (3 hours)
   - Create new test file
   - Test YAML escaping edge cases
   - Document character limitations

8. **Long Inputs** (2 hours)
   - Create new test file
   - Test filesystem limits
   - Add length validation if needed

**Deliverable**: 4 new test files, 13 new tests, overwrite handling

---

### Phase 3: Nice-to-Have (Week 3) 🟢

**Priority**: Polish and completeness

9. **Interactive Mode Tests** (4 hours)
   - Create new test file
   - Mock prompt library
   - Test wizard flow

**Deliverable**: 1 new test file, 3 new tests

---

## Testing Principles (from claude.md)

### 1. Single Responsibility Principle (SRP)

- **One test file per concern**: Input validation separate from concurrency
- **One test case per scenario**: Don't test multiple things in one `it()`
- **Clear test names**: Describe WHAT is tested, not implementation

### 2. YAGNI (You Aren't Gonna Need It)

- **Skip .env permissions tests**: Not needed for local machine
- **Skip OAuth2 for now**: Deferred until implementation ready
- **Focus on real-world scenarios**: Not theoretical edge cases

### 3. DRY (Don't Repeat Yourself)

- **Reuse existing helpers**: `test-server-manager.ts`, `spell-validator.ts`
- **Extract common patterns**: Validation assertions, spy utilities
- **Share test fixtures**: Common options, credentials

### 4. No Mocks - Real Integration

- **Real FastMCP servers**: Already using Python test servers
- **Real file system**: Use `~/.grimoire/` (cleanup in afterAll)
- **Real processes**: Spawn actual CLI commands where possible

---

## File Naming Conventions

Following existing patterns:

```
src/cli/__tests__/
  # Existing (updated with unique spell names)
  cli-create-basic-auth-http.integration.test.ts
  cli-create-security-keys-http.integration.test.ts
  ...

  # New test files
  cli-create-input-validation.integration.test.ts       # Phase 1
  cli-create-security-logging.integration.test.ts       # Phase 1
  cli-create-network-failures.integration.test.ts       # Phase 1
  cli-create-concurrency.integration.test.ts            # Phase 2
  cli-create-file-conflicts.integration.test.ts         # Phase 2
  cli-create-special-characters.integration.test.ts     # Phase 2
  cli-create-long-inputs.integration.test.ts            # Phase 2
  cli-create-interactive.integration.test.ts            # Phase 3
```

**Pattern**: `cli-create-{concern}.integration.test.ts`

---

## Helper Functions to Add

**New file**: `src/cli/__tests__/helpers/test-utilities.ts`

```typescript
// Console spy utilities
export function captureConsoleOutput() {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.join(' '));
  });
  return {
    logs,
    errors,
    logSpy,
    errorSpy,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

// Credential detection
export function containsCredential(text: string, credential: string): boolean {
  return text.includes(credential) && !text.match(/\$\{[A-Z_]+\}/);
}

// Parallel execution helper
export async function runConcurrently<T>(
  count: number,
  fn: (index: number) => Promise<T>
): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, (_, i) => fn(i)));
}
```

---

## Success Metrics

### Coverage Goals

- **Input Validation**: 100% of validation rules covered
- **Security**: 0 credential leaks in any scenario
- **Concurrency**: No file corruption in parallel operations
- **Network Failures**: 100% graceful handling

### Test Suite Size

- **Before**: 30 tests (10 files)
- **After Phase 1**: 52 tests (14 files)
- **After Phase 2**: 65 tests (18 files)
- **After Phase 3**: 68 tests (19 files)

### Quality Gates

- ✅ All tests pass locally
- ✅ All tests pass in CI/CD
- ✅ No flaky tests (3 consecutive runs)
- ✅ Test execution time < 60 seconds

---

## Questions Answered

### Q1: Should we test .env file permissions?

**A**: No - SKIP. Local machine context, user-owned files, YAGNI. Add documentation instead.

### Q2: Are we properly testing for all MCP servers in the wild?

**A**: No - Currently only testing FastMCP. Real-world servers needed in Phase 4 (future).

### Q3: Are tests bulletproof now?

**A**: No - Still missing:

- Input validation (critical gap)
- Network failure edge cases
- Concurrency scenarios
- Security verification

After implementing this plan → **Yes, tests will be bulletproof** for local MCP server use case.

---

## Risk Assessment

| Risk                                | Mitigation                              | Priority  |
| ----------------------------------- | --------------------------------------- | --------- |
| Concurrent .env writes corrupt file | Add file locking or atomic writes       | 🔴 High   |
| Long inputs cause buffer overflow   | Add length validation                   | 🟡 Medium |
| Special chars break YAML parsing    | Use YAML library escaping               | 🟡 Medium |
| Credentials leak in error messages  | Audit all error handling                | 🔴 High   |
| Tests become flaky                  | Use proper cleanup, avoid timing issues | 🟡 Medium |

---

## Next Steps

1. **Review this plan** with team/maintainer
2. **Get approval** for implementation phases
3. **Start Phase 1** - Critical fixes
4. **Run full test suite** after each phase
5. **Update documentation** with new test patterns

---

## Appendix: Code Review Recommendations

### Immediate Actions Required in create.ts

1. **Add overwrite check** (before line 800):

```typescript
const spellFilePath = join(spellDir, `${options.name}.spell.yaml`);
if (existsSync(spellFilePath)) {
  if (options.interactive === false) {
    throw new Error(`Spell "${options.name}" already exists at ${spellFilePath}`);
  } else {
    const shouldOverwrite = await confirm({
      message: `Spell "${options.name}" already exists. Overwrite?`,
      default: false,
    });
    if (!shouldOverwrite) {
      console.log(formatInfo('Spell creation cancelled.'));
      process.exit(0);
    }
  }
}
```

2. **Add length validation** (after spell name validation):

```typescript
if (options.name.length > 200) {
  console.error(formatError('Spell name too long (max 200 characters)'));
  process.exit(1);
}
```

3. **Sanitize error messages** (in probe failure handling):

```typescript
// BAD: console.error(`Auth failed with token: ${options.auth.token}`);
// GOOD: console.error('Auth failed - check credentials in .env file');
```

These changes will make Phase 1 tests pass immediately.

---

**End of Plan**
