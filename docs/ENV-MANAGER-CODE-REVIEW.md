# Environment Manager Code Review - Bug Analysis

**Date**: January 21, 2026  
**Reviewer**: AI Assistant  
**Status**: ⚠️ **3 POTENTIAL BUGS FOUND**

## Executive Summary

Reviewed the environment variable handling code (EnvManager + CLI integration) for hidden bugs that tests might not catch. Found **3 potential issues** that could cause problems in production scenarios not covered by current tests.

---

## ✅ What's Working Well

### 1. File-Based Locking ✅

- **Implementation**: Atomic `mkdir` operations
- **Cross-process safety**: Works across vitest worker processes
- **Retry logic**: Exponential backoff (50ms \* 1.5^attempt, max 500ms)
- **Timeout handling**: 5000ms with stale lock breaking
- **Cleanup**: `finally` block ensures lock always released

**Verdict**: Solid implementation, no issues.

### 2. Write Queue ✅

- **Static Map**: Keyed by file path
- **Promise chaining**: Serializes all writes per file
- **Error handling**: Errors logged but don't break queue
- **Multiple instances**: Works correctly with multiple EnvManager instances

**Verdict**: Correct implementation, handles concurrency well.

### 3. Cache Management ✅

- **Immediate updates**: Cache updated before file write
- **File watching**: chokidar detects external changes
- **Priority**: .env > process.env > empty string

**Verdict**: Good design, no issues.

---

## 🐛 Potential Bugs Found

### BUG #1: Environment Variable Name Collision (MEDIUM SEVERITY)

**Location**: `src/cli/commands/create.ts` lines 750-850

**Problem**:

```typescript
// For stdio with env vars
for (const [key, value] of Object.entries(envRecord)) {
  if (!value.includes('${')) {
    envForYAML[key] = `\${${key}}`; // ❌ NOT NAMESPACED!
    envVarsToWrite[key] = value;
  }
}
```

**Issue**: Stdio environment variables are NOT namespaced, but auth/headers ARE:

- Stdio env: `UI5_LOG_LVL` (no prefix)
- Auth token: `SPELLNAME__API_TOKEN` (with prefix)
- Headers: `SPELLNAME__X_BRAVE_KEY` (with prefix)

**Collision Scenario**:

```bash
# Spell 1: ui5-mcp with UI5_LOG_LVL=verbose
# Spell 2: cds-mcp with UI5_LOG_LVL=error

# In ~/.grimoire/.env:
UI5_LOG_LVL=verbose  # From spell 1
UI5_LOG_LVL=error    # From spell 2 - OVERWRITES spell 1!
```

**Impact**:

- Multiple spells with same env var names will conflict
- Last spell created wins
- Silent corruption of environment variables
- Hard to debug (no error, just wrong values)

**Test Gap**:

- No test creates multiple stdio spells with same env var names
- `cli-create-stdio-ui5-with-env.integration.test.ts` only creates one spell
- `cli-create-concurrency.integration.test.ts` uses HTTP/SSE (which ARE namespaced)

**Fix**: Namespace stdio env vars like auth/headers:

```typescript
// FIXED VERSION:
const spellPrefix = options.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
for (const [key, value] of Object.entries(envRecord)) {
  if (!value.includes('${')) {
    const varName = `${spellPrefix}__${key}`;
    envForYAML[key] = `\${${varName}}`;
    envVarsToWrite[varName] = value;
  }
}
```

---

### BUG #2: Line Comparison Logic Issue (LOW SEVERITY)

**Location**: `src/infrastructure/env-manager.ts` line 336

**Problem**:

```typescript
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith(`${key}=`) || line === key) {
    // ❌ Second condition problematic
    lines[i] = `${key}=${value}`;
    found = true;
    break;
  }
}
```

**Issue**: The condition `line === key` will match a line containing ONLY the key name with no `=` sign:

```ini
# .env file:
API_TOKEN          # ❌ This line matches "API_TOKEN" exactly
OTHER_KEY=value

# After set("API_TOKEN", "new-value"):
API_TOKEN=new-value  # Line replaced
OTHER_KEY=value
```

**Scenario Where This Causes Issues**:

1. User manually edits .env file
2. Accidentally creates line with just variable name (no `=value`)
3. Next `set()` call overwrites that line
4. Looks correct, but violates .env format expectations

**Why It's Low Severity**:

- Manually edited .env files are uncommon (users use CLI)
- The fix is technically correct (adds `=value`)
- No data loss occurs

**Test Gap**:

- Tests don't have malformed .env files with key-only lines
- Tests always have well-formed `KEY=value` pairs

**Fix Options**:

**Option A** (Strict - Recommended):

```typescript
// Only match lines that start with "KEY=" (with equals sign)
if (line.startsWith(`${key}=`)) {
  lines[i] = `${key}=${value}`;
  found = true;
  break;
}
// Remove the `|| line === key` condition entirely
```

**Option B** (Lenient - Current behavior is acceptable):

```typescript
// Keep current behavior but document it
// The `line === key` condition handles edge case where line has no `=` sign
if (line.startsWith(`${key}=`) || line === key) {
  lines[i] = `${key}=${value}`;
  found = true;
  break;
}
```

**Recommendation**: Use Option A (strict) to enforce proper .env format.

---

### BUG #3: Lock Directory Not Cleaned on Process Crash (LOW SEVERITY)

**Location**: `src/infrastructure/env-manager.ts` lines 266-305

**Problem**:

```typescript
private async acquireLock(maxWaitMs = 5000): Promise<() => Promise<void>> {
  const lockPath = `${this.envPath}.lock`;

  // Create lock directory
  await mkdir(lockPath, { recursive: false });

  // Return cleanup function
  return async () => {
    await rm(lockPath, { recursive: true, force: true });
  };
}
```

**Issue**: If the process crashes (SIGKILL, power loss, etc.) AFTER acquiring the lock but BEFORE releasing it, the lock directory remains:

```bash
# Normal operation:
~/.grimoire/.env.lock/  # Created
# ... write happens ...
~/.grimoire/.env.lock/  # Deleted

# Process crash:
~/.grimoire/.env.lock/  # Created
# ... CRASH! ...
~/.grimoire/.env.lock/  # ❌ NEVER DELETED (stale lock)
```

**Current Mitigation**:

```typescript
// Timeout - try to break stale lock
if (Date.now() - startTime >= maxWaitMs) {
  await rm(lockPath, { recursive: true, force: true });
  await mkdir(lockPath, { recursive: false });
}
```

**Why This Works Most of the Time**:

- 5-second timeout detects stale locks
- Force removes and recreates lock
- Next write succeeds

**Why It Could Still Fail**:

1. All processes terminate (user closes terminal)
2. No process retries for 5+ seconds
3. Lock directory sits indefinitely
4. User comes back hours later
5. Next write waits 5 seconds (annoying delay)

**Impact**:

- 5-second delay on first write after crash
- No data loss
- Annoying UX (but rare)

**Test Gap**:

- No tests simulate process crashes
- Tests always clean up properly
- Timeout logic tested, but not stale lock persistence

**Fix Options**:

**Option A** (Add PID to lock):

```typescript
// Store process PID in lock directory
await mkdir(lockPath, { recursive: false });
await writeFile(join(lockPath, 'pid'), String(process.pid));

// Check if lock owner is still alive
const pidFile = join(lockPath, 'pid');
const pid = parseInt(await readFile(pidFile, 'utf-8'));
if (!isProcessRunning(pid)) {
  // Stale lock - owner dead
  await rm(lockPath, { recursive: true, force: true });
}
```

**Option B** (Add timestamp to lock):

```typescript
// Store timestamp in lock
await mkdir(lockPath, { recursive: false });
await writeFile(join(lockPath, 'timestamp'), Date.now().toString());

// Check lock age
const timestamp = parseInt(await readFile(join(lockPath, 'timestamp'), 'utf-8'));
if (Date.now() - timestamp > 30000) {
  // 30 seconds old
  // Stale lock - too old
  await rm(lockPath, { recursive: true, force: true });
}
```

**Option C** (Accept current behavior):

- 5-second timeout is acceptable delay
- Crashes are rare
- Complexity not worth it

**Recommendation**: **Option C** (current implementation is sufficient). The 5-second timeout handles this well enough, and the added complexity of PID/timestamp tracking isn't justified for such a rare edge case.

---

## 🔍 Edge Cases Tests Miss

### 1. ✅ Concurrent writes from different processes

**Coverage**: GOOD - File-based locking works

### 2. ❌ Multiple stdio spells with same env var names

**Coverage**: MISSING - This is BUG #1

### 3. ✅ Race conditions in .env file writes

**Coverage**: GOOD - Write queue + file locking prevents this

### 4. ❌ Malformed .env files (key with no =value)

**Coverage**: MISSING - This is BUG #2

### 5. ❌ Stale lock directories after crash

**Coverage**: MISSING - This is BUG #3 (but acceptable)

### 6. ✅ Environment variable name collisions (auth/headers)

**Coverage**: GOOD - Namespaced correctly

### 7. ❌ Very long environment variable values (>1MB)

**Coverage**: MISSING - No test with huge values

### 8. ❌ Special characters in env var values (newlines, quotes)

**Coverage**: PARTIAL - Parser handles quotes, but not newlines

### 9. ✅ Empty .env file

**Coverage**: GOOD - Parser handles this

### 10. ✅ Missing .env file

**Coverage**: GOOD - Falls back to process.env

---

## 📋 Recommendations

### CRITICAL (Fix Immediately)

**1. Fix BUG #1: Namespace stdio environment variables**

- **Priority**: HIGH
- **Impact**: Data corruption in multi-spell scenarios
- **Effort**: 10 minutes
- **Test**: Add test creating 2 stdio spells with same env var names

### MEDIUM (Fix Soon)

**2. Fix BUG #2: Remove `|| line === key` condition**

- **Priority**: MEDIUM
- **Impact**: Edge case with malformed .env files
- **Effort**: 2 minutes
- **Test**: Add test with malformed .env file

### LOW (Consider Later)

**3. BUG #3: Accept current timeout behavior**

- **Priority**: LOW
- **Impact**: 5-second delay after crash (rare)
- **Effort**: Leave as-is
- **Test**: Not worth testing

### NICE TO HAVE

**4. Add validation for env var name format**

```typescript
// Reject invalid variable names
if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
  throw new Error(`Invalid environment variable name: ${key}`);
}
```

**5. Add size limits for env var values**

```typescript
// Reject values > 10KB
if (value.length > 10240) {
  throw new Error(`Environment variable value too large: ${key}`);
}
```

**6. Add .env file size warning**

```typescript
// Warn if .env file > 100KB
const stats = await stat(this.envPath);
if (stats.size > 102400) {
  logger.warn('ENV', '.env file is very large', { size: stats.size });
}
```

---

## 🧪 Suggested New Tests

### Test 1: Multiple stdio spells with same env var

```typescript
it('should namespace stdio environment variables per spell', async () => {
  // Create spell 1 with UI5_LOG_LVL=verbose
  await createCommand({
    name: 'ui5-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['@ui5/mcp-server'],
    env: { UI5_LOG_LVL: 'verbose' },
  });

  // Create spell 2 with UI5_LOG_LVL=error
  await createCommand({
    name: 'cds-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['@cap-js/cds-mcp'],
    env: { UI5_LOG_LVL: 'error' },
  });

  // Read .env file
  const envContent = await readFile(envPath, 'utf-8');

  // SHOULD HAVE BOTH (namespaced):
  expect(envContent).toContain('UI5_MCP__UI5_LOG_LVL=verbose');
  expect(envContent).toContain('CDS_MCP__UI5_LOG_LVL=error');

  // SHOULD NOT HAVE (non-namespaced):
  expect(envContent).not.toMatch(/^UI5_LOG_LVL=/m);
});
```

### Test 2: Malformed .env file

```typescript
it('should handle malformed .env files gracefully', async () => {
  // Create malformed .env with key-only line
  await writeFile(envPath, 'API_TOKEN\nOTHER_KEY=value\n');

  const envManager = new EnvManager(envPath);
  await envManager.load();

  // Set API_TOKEN
  await envManager.set('API_TOKEN', 'new-value');

  // Verify file is correct
  const content = await readFile(envPath, 'utf-8');
  expect(content).toContain('API_TOKEN=new-value');
  expect(content).toContain('OTHER_KEY=value');
});
```

### Test 3: Stale lock directory

```typescript
it('should break stale locks after timeout', async () => {
  const lockPath = `${envPath}.lock`;

  // Create fake stale lock (simulating crashed process)
  await mkdir(lockPath, { recursive: false });

  const envManager = new EnvManager(envPath);
  await envManager.load();

  // This should succeed after breaking stale lock
  const startTime = Date.now();
  await envManager.set('TEST_KEY', 'value');
  const duration = Date.now() - startTime;

  // Should take ~5 seconds (timeout)
  expect(duration).toBeGreaterThan(4900);
  expect(duration).toBeLessThan(5500);

  // Verify write succeeded
  expect(await readFile(envPath, 'utf-8')).toContain('TEST_KEY=value');

  // Verify lock was cleaned up
  expect(existsSync(lockPath)).toBe(false);
});
```

---

## 🎯 Priority Fix: BUG #1 Code Changes

**File**: `src/cli/commands/create.ts` (lines 750-780)

**Current Code** (BROKEN):

```typescript
// Transform literals into placeholders
const envForYAML: Record<string, string> = {};
for (const [key, value] of Object.entries(envRecord)) {
  if (value.includes('${')) {
    // Already a placeholder, use as-is
    envForYAML[key] = value;
  } else {
    // Literal value - create placeholder for YAML, save to .env
    envForYAML[key] = `\${${key}}`; // ❌ NOT NAMESPACED!
    envVarsToWrite[key] = value; // ❌ NOT NAMESPACED!
  }
}
```

**Fixed Code** (CORRECT):

```typescript
// Transform literals into placeholders with spell name prefix
const spellPrefix = options.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
const envForYAML: Record<string, string> = {};

for (const [key, value] of Object.entries(envRecord)) {
  if (value.includes('${')) {
    // Already a placeholder, use as-is
    envForYAML[key] = value;
  } else {
    // Literal value - create NAMESPACED placeholder for YAML, save to .env
    const varName = `${spellPrefix}__${key}`;
    envForYAML[key] = `\${${varName}}`; // ✅ NAMESPACED!
    envVarsToWrite[varName] = value; // ✅ NAMESPACED!
  }
}
```

---

## 📊 Summary

| Issue                                     | Severity | Impact          | Fix Effort | Priority     |
| ----------------------------------------- | -------- | --------------- | ---------- | ------------ | ----- | ------ |
| **BUG #1**: Stdio env vars not namespaced | MEDIUM   | Data corruption | 10 min     | HIGH         |
| **BUG #2**: Line comparison `             |          | line === key`   | LOW        | Edge case    | 2 min | MEDIUM |
| **BUG #3**: Stale locks after crash       | LOW      | 5s delay        | N/A        | LOW (accept) |

**Overall Assessment**: The environment variable handling is **mostly solid**, with one critical bug (#1) that needs immediate fixing. The file-based locking and write queue implementations are correct and well-tested.

---

**Next Steps**:

1. ✅ Fix BUG #1 (stdio env var namespacing)
2. ✅ Add test for multi-spell stdio scenario
3. ⚠️ Consider fixing BUG #2 (line comparison)
4. ℹ️ Document BUG #3 as acceptable trade-off
