# Grimoire Path Configuration - Complete Analysis

**Date**: January 22, 2026
**Purpose**: Analyze all path dependencies to enable test-time path override
**Goal**: Run tests in workspace directory instead of `~/.grimoire`

---

## Executive Summary

**Current Behavior**: All paths hardcoded to `~/.grimoire/` via `homedir()`
**Goal**: Make paths configurable for testing (e.g., `./test-grimoire/`)
**Impact**: 5 major components need updates

---

## Current Path Architecture

### 1. Path Resolution Entry Point

**File**: `src/utils/paths.ts`

```typescript
// Current implementation - HARDCODED to home directory
function getPaths(): EnvPaths {
  if (syncPaths != null) return syncPaths;

  // Fallback: use ~/.grimoire following Claude Code convention
  const home = homedir(); // ← PROBLEM: Always uses home directory
  const grimoireDir = join(home, '.grimoire');

  return {
    config: grimoireDir, // ~/.grimoire/
    cache: grimoireDir, // ~/.grimoire/
    log: grimoireDir, // ~/.grimoire/
    data: grimoireDir, // ~/.grimoire/
    temp: join(tmpdir(), 'grimoire'),
  };
}

export function getSpellDirectory(): string {
  return PATHS.config; // Returns ~/.grimoire/
}

export function getEmbeddingCachePath(): string {
  return join(PATHS.cache, 'embeddings.msgpack'); // ~/.grimoire/embeddings.msgpack
}
```

**Current Usage**:

- ✅ All paths go through `PATHS` constant
- ✅ Single source of truth for path resolution
- ❌ No way to override the base directory
- ❌ Tests pollute user's home directory

---

## 5 Components Affected by Path Configuration

### Component 1: Spell Files (`.spell.yaml`)

**Location**: `~/.grimoire/*.spell.yaml`
**Used By**:

- `SpellDiscovery.scan()` - Reads spell files
- `ConfigLoader.loadAll()` - Parses YAML
- `SpellWatcher.start()` - Watches for file changes
- CLI `create` command - Writes spell files

**Dependencies**:

```typescript
// SpellDiscovery constructor
constructor(
  private readonly configLoader: ConfigLoader,
  private readonly spellDirectory: string = getSpellDirectory()  // ← Uses PATHS
) {}

// ConfigLoader.loadAll()
async loadAll(directory: string): Promise<Map<string, SpellConfig>> {
  // Scans directory for *.spell.yaml files
}
```

**Files Created**:

- `postgres.spell.yaml`
- `weather-api.spell.yaml`
- `stripe-payments.spell.yaml`
- etc.

---

### Component 2: Embedding Cache (`embeddings.msgpack`)

**Location**: `~/.grimoire/embeddings.msgpack`
**Used By**:

- `EmbeddingStorage.load()` - Reads cached embeddings
- `EmbeddingStorage.save()` - Persists embeddings
- `HybridResolver` - Uses for semantic search

**Dependencies**:

```typescript
// EmbeddingStorage constructor
constructor(filePath?: string) {
  this.filePath = filePath ?? getEmbeddingCachePath();  // ← Uses PATHS
  this.store = this.createEmptyStore();
}
```

**File Format**:

- Binary MessagePack format
- Contains: embeddings + lifecycle metadata (turn counter, PIDs)
- Size: ~50KB for 20 spells

---

### Component 3: Environment Variables (`.env`)

**Location**: `~/.grimoire/.env`
**Used By**:

- `EnvManager.load()` - Reads credentials
- `EnvManager.resolve()` - Replaces `${VAR}` placeholders
- CLI `create` command - Writes credentials

**Dependencies**:

```typescript
// EnvManager constructor
constructor(envPath?: string) {
  this.envPath = envPath ?? join(getSpellDirectory(), '.env');  // ← Uses PATHS
}
```

**File Content Example**:

```bash
# Environment variables for spells
POSTGRES__USERNAME=dbuser
POSTGRES__PASSWORD=secret123
STRIPE__API_KEY=sk_test_...
GITHUB__PAT=ghp_...
```

**Security**: File permissions set to `0600` (owner read/write only)

---

### Component 4: Spell Watcher (File System Monitoring)

**Location**: Watches `~/.grimoire/*.spell.yaml`
**Used By**:

- `SpellWatcher.start()` - Monitors for file changes
- `Gateway.start()` - Starts watcher

**Dependencies**:

```typescript
// SpellWatcher constructor
constructor(
  private readonly spellDirectory: string,  // Passed from SpellDiscovery
  private readonly discovery: SpellDiscovery,
  private readonly resolver: HybridResolver,
  private readonly lifecycle: ProcessLifecycleManager,
  private readonly router: ToolRouter,
  private readonly onToolsChanged: () => void
) {}

// Gateway initialization
this.watcher = new SpellWatcher(
  this.discovery.getSpellDirectory(),  // ← Uses SpellDiscovery's path
  this.discovery,
  this.resolver,
  this.lifecycle,
  this.router,
  () => this.notifyToolsChanged()
);
```

**Behavior**:

- Watches for `add`, `change`, `unlink` events
- Debounces rapid changes (500ms)
- Re-indexes spells on file change
- Kills active servers if their config changes

---

### Component 5: Directory Creation (`ensureDirectories`)

**Location**: Creates `~/.grimoire/` + `.env` template
**Used By**:

- CLI `create` command - Ensures directory exists before writing
- `Gateway.start()` - Creates directory on startup
- All integration tests - Setup in `beforeAll`

**Dependencies**:

```typescript
export async function ensureDirectories(): Promise<void> {
  const grimoireDir = PATHS.config; // ← Uses PATHS

  try {
    // Create grimoire directory
    await mkdir(grimoireDir, { recursive: true });

    // Set restrictive permissions on Unix systems
    if (process.platform !== 'win32') {
      await chmod(grimoireDir, 0o700); // Owner read/write/execute only
    }

    // Create .env template if it doesn't exist (ADR-0015)
    const { createEnvTemplate } = await import('../infrastructure/env-manager');
    const envPath = join(grimoireDir, '.env');
    await createEnvTemplate(envPath);
  } catch (error) {
    throw new Error(`Cannot create grimoire directory at ${grimoireDir}: ...`);
  }
}
```

---

## Current Test Behavior (PROBLEM)

### CLI Integration Tests (19 tests)

**Current Behavior**: Tests write to **REAL** `~/.grimoire/` directory

```typescript
// cli-create-basic-auth-http.integration.test.ts
beforeAll(async () => {
  grimoireDir = getSpellDirectory(); // Returns ~/.grimoire/
  spellFilePath = join(grimoireDir, `${testSpellName}.spell.yaml`);

  // Ensures ~/.grimoire/ exists
  await ensureDirectories();

  // Writes to REAL home directory
  await createCommand(options);
});
```

**Problems**:

1. ❌ Tests pollute user's home directory
2. ❌ Can't run tests in isolation
3. ❌ Cleanup failures leave test files in prod location
4. ❌ Parallel tests share same directory (collision risk)
5. ❌ CI/CD environments may not have home directory access

---

## Proposed Solution: Environment Variable Override

### Strategy: Use `GRIMOIRE_HOME` Environment Variable

**Goal**: Allow tests to override the base directory without changing production code

**Implementation**:

```typescript
// src/utils/paths.ts (UPDATED)
function getPaths(): EnvPaths {
  if (syncPaths != null) return syncPaths;

  // Check for test override FIRST
  const testOverride = process.env.GRIMOIRE_HOME;

  const grimoireDir = testOverride
    ? resolve(testOverride) // Use override (e.g., ./test-grimoire)
    : join(homedir(), '.grimoire'); // Use default (production)

  return {
    config: grimoireDir,
    cache: grimoireDir,
    log: grimoireDir,
    data: grimoireDir,
    temp: testOverride
      ? join(grimoireDir, 'tmp') // Use test temp dir
      : join(tmpdir(), 'grimoire'), // Use system temp
  };
}
```

**Usage in Tests**:

```typescript
// beforeAll - Set test directory
process.env.GRIMOIRE_HOME = join(__dirname, '../../.test-grimoire');

// afterAll - Clean up test directory
await rm(process.env.GRIMOIRE_HOME, { recursive: true, force: true });
delete process.env.GRIMOIRE_HOME;
```

---

## Benefits of Environment Variable Approach

### ✅ Pros

1. **No Code Changes to Components** - All 5 components already use `PATHS`
2. **Single Point of Configuration** - Only modify `src/utils/paths.ts`
3. **Production Safety** - Default behavior unchanged
4. **Test Isolation** - Each test can use unique directory
5. **CI/CD Compatible** - Works in containers without home directory
6. **Developer Friendly** - Tests don't pollute home directory
7. **Parallel Execution** - Tests can use different directories simultaneously

### ⚠️ Considerations

1. **Path Caching** - Need to clear `syncPaths` cache between tests
2. **Directory Cleanup** - Tests must clean up their directories
3. **Documentation** - Update test documentation with new pattern

---

## Alternative Solutions (Rejected)

### Alternative 1: Constructor Injection

**Approach**: Pass directory path to all constructors

```typescript
new SpellDiscovery(configLoader, '/test/path');
new EmbeddingStorage('/test/path/embeddings.msgpack');
new EnvManager('/test/path/.env');
new SpellWatcher('/test/path', ...);
```

**Rejected Because**:

- ❌ Requires changing 5+ component constructors
- ❌ Breaks existing production code
- ❌ Complicates Gateway initialization
- ❌ Not backwards compatible

### Alternative 2: Mock `homedir()`

**Approach**: Mock Node.js `os.homedir()` in tests

```typescript
vi.spyOn(os, 'homedir').mockReturnValue('/test/home');
```

**Rejected Because**:

- ❌ Fragile (depends on internal implementation)
- ❌ May affect other libraries
- ❌ Hard to debug when mocks fail
- ❌ Not recommended for integration tests

### Alternative 3: Configuration File

**Approach**: Add `grimoire.config.json` to specify paths

**Rejected Because**:

- ❌ Adds complexity (need to read config before paths)
- ❌ Circular dependency (where to store config?)
- ❌ Over-engineering for simple need

---

## Implementation Plan

### Phase 1: Update Path Resolution

**File**: `src/utils/paths.ts`

```typescript
import { resolve } from 'path';

function getPaths(): EnvPaths {
  if (syncPaths != null) return syncPaths;

  // GRIMOIRE_HOME environment variable for testing
  const overrideDir = process.env.GRIMOIRE_HOME;

  const grimoireDir = overrideDir
    ? resolve(overrideDir) // Use override (absolute path)
    : join(homedir(), '.grimoire'); // Default production path

  return {
    config: grimoireDir,
    cache: grimoireDir,
    log: grimoireDir,
    data: grimoireDir,
    temp: overrideDir ? join(grimoireDir, 'tmp') : join(tmpdir(), 'grimoire'),
  };
}

// Add helper to reset cache (for tests)
export function resetPathsCache(): void {
  syncPaths = null;
  pathsCache = null;
}
```

### Phase 2: Update Test Helper

**File**: `src/cli/__tests__/helpers/test-path-manager.ts` (NEW)

```typescript
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';
import { resetPathsCache } from '../../../utils/paths';

/**
 * Setup isolated test directory for grimoire tests
 * Returns the test directory path
 */
export async function setupTestGrimoireDir(testName: string): Promise<string> {
  const testDir = join(process.cwd(), '.test-grimoire', testName);

  // Set environment variable
  process.env.GRIMOIRE_HOME = testDir;

  // Reset path cache to pick up new env var
  resetPathsCache();

  // Ensure directory exists
  await mkdir(testDir, { recursive: true });

  return testDir;
}

/**
 * Cleanup test directory after test
 */
export async function cleanupTestGrimoireDir(testDir: string): Promise<void> {
  // Clean up directory
  await rm(testDir, { recursive: true, force: true });

  // Reset environment variable
  delete process.env.GRIMOIRE_HOME;

  // Reset path cache
  resetPathsCache();
}
```

### Phase 3: Update Tests

**Example**: `cli-create-basic-auth-http.integration.test.ts`

```typescript
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';

describe('CLI create - Basic Auth HTTP', () => {
  let serverProcess: ChildProcess;
  let testGrimoireDir: string;
  let spellFilePath: string;

  beforeAll(async () => {
    // Setup isolated test directory
    testGrimoireDir = await setupTestGrimoireDir('basic-auth-http');
    spellFilePath = join(testGrimoireDir, `${testSpellName}.spell.yaml`);

    // Start server (unchanged)
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', serverPort);
  }, 60000);

  afterAll(async () => {
    // Stop server
    await stopServer(serverProcess, serverPort, 'basic_auth_http_server');

    // Cleanup test directory
    await cleanupTestGrimoireDir(testGrimoireDir);
  }, 30000);

  // Test remains unchanged
  it('should create spell with Basic Auth', async () => {
    await createCommand(options); // Uses GRIMOIRE_HOME automatically
    expect(existsSync(spellFilePath)).toBe(true);
  });
});
```

### Phase 4: Update Gateway Tests

**Example**: `gateway-basic-auth-http.e2e.test.ts`

```typescript
import { setupTestGrimoireDir, cleanupTestGrimoireDir } from './helpers/test-path-manager';

describe('Gateway E2E - Basic Auth HTTP', () => {
  let serverProcess: ChildProcess;
  let gateway: GrimoireServer;
  let testGrimoireDir: string;

  beforeAll(async () => {
    // Setup isolated test directory
    testGrimoireDir = await setupTestGrimoireDir('gateway-basic-auth-http');

    // Start server (unchanged)
    serverProcess = await startFastMCPServer('servers.basic_auth.http_server', 8017);

    // Create spell (uses GRIMOIRE_HOME automatically)
    await createCommand(options);

    // Start gateway (uses GRIMOIRE_HOME automatically)
    gateway = new GrimoireServer();
    await gateway.start();
    await sleep(2000);
  }, 60000);

  afterAll(async () => {
    await gateway.shutdown();
    await stopServer(serverProcess, 8017, 'server');
    await cleanupTestGrimoireDir(testGrimoireDir);
  }, 30000);
});
```

---

## Testing the Solution

### Verify Path Override Works

```typescript
// test-paths.integration.test.ts
describe('GRIMOIRE_HOME override', () => {
  it('should use custom directory when GRIMOIRE_HOME is set', async () => {
    const testDir = '/tmp/test-grimoire-override';
    process.env.GRIMOIRE_HOME = testDir;
    resetPathsCache();

    const spellDir = getSpellDirectory();
    const embeddingPath = getEmbeddingCachePath();

    expect(spellDir).toBe(testDir);
    expect(embeddingPath).toBe(join(testDir, 'embeddings.msgpack'));

    delete process.env.GRIMOIRE_HOME;
    resetPathsCache();
  });

  it('should use default directory when GRIMOIRE_HOME is not set', () => {
    delete process.env.GRIMOIRE_HOME;
    resetPathsCache();

    const spellDir = getSpellDirectory();

    expect(spellDir).toContain('.grimoire');
    expect(spellDir).toContain(homedir());
  });
});
```

---

## Impact Summary

### Files to Modify

1. ✅ `src/utils/paths.ts` - Add `GRIMOIRE_HOME` support + `resetPathsCache()`
2. ✅ `src/cli/__tests__/helpers/test-path-manager.ts` - New helper (DRY)
3. ✅ All 19 CLI integration tests - Use new helper
4. ✅ All 15 gateway E2E tests - Use new helper

### Components Automatically Fixed

Once `paths.ts` is updated, these work automatically:

- ✅ `SpellDiscovery` - Reads from test directory
- ✅ `EmbeddingStorage` - Saves to test directory
- ✅ `EnvManager` - Reads `.env` from test directory
- ✅ `SpellWatcher` - Watches test directory
- ✅ `ensureDirectories()` - Creates test directory

### No Changes Needed

- ❌ `GrimoireServer` - Already uses `SpellDiscovery`
- ❌ `ProcessLifecycleManager` - Uses `EmbeddingStorage`
- ❌ `HybridResolver` - Uses `EmbeddingStorage`
- ❌ CLI commands - Use `getSpellDirectory()`

---

## Rollout Strategy

### Step 1: Implement Core Changes (Day 1)

- Update `src/utils/paths.ts`
- Add `resetPathsCache()` function
- Write unit tests for path override

### Step 2: Create Test Helper (Day 1)

- Create `test-path-manager.ts`
- Test helper functions

### Step 3: Update CLI Tests (Day 2)

- Update all 19 CLI integration tests
- Validate tests still pass
- Verify no home directory pollution

### Step 4: Update Gateway Tests (Day 3)

- Update all 15 gateway E2E tests
- Validate parallel execution
- Verify isolation

### Step 5: Documentation (Day 3)

- Update test plan documents
- Add path configuration guide
- Document `GRIMOIRE_HOME` usage

---

## Conclusion

**Problem**: Tests pollute `~/.grimoire/` in user's home directory
**Solution**: Use `GRIMOIRE_HOME` environment variable to override path
**Impact**: 1 file to modify (`paths.ts`), 34 tests to update
**Result**: Isolated, repeatable, parallel-safe tests

**Next Steps**: Implement Phase 1 and create test helper!
