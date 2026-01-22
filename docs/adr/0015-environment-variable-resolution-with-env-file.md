# 15. Environment Variable Resolution with .env File and GRIMOIRE_HOME Override

Date: 2026-01-19
Updated: 2026-01-22 (Added GRIMOIRE_HOME override capability)

## Status

Accepted

## Context

Grimoire supports dynamic spell creation where users can create new spells at any time using the CLI (`npx @crack-break-make/mcp-grimoire create`). Many MCP servers require authentication credentials (API keys, OAuth tokens, database URLs, etc.) that should not be hardcoded in spell YAML files.

### The Problem

**Dynamic Spell Creation vs Static Configuration**:

- Grimoire MCP server runs continuously in Claude Desktop
- Users create new spells dynamically via CLI (while Grimoire is running)
- New spells may require new environment variables
- Static env vars in `claude_desktop_config.json` don't work for dynamically created spells

**Example Failure Scenario**:

```json
// claude_desktop_config.json (static, loaded at startup)
{
  "mcpServers": {
    "grimoire": {
      "command": "npx",
      "args": ["-y", "@crack-break-make/mcp-grimoire"],
      "env": {
        "POSTGRES_KEY": "abc123" // Only works for spells known at startup
      }
    }
  }
}

// User creates new spell while Grimoire is running:
// npx @crack-break-make/mcp-grimoire create
// Enters: STRIPE_KEY = xyz789
//
// Problem: Grimoire process doesn't have STRIPE_KEY in process.env!
// New env var requires Claude Desktop restart → Terrible UX
```

**Security Requirements**:

- Credentials should not be in spell YAML files (would leak in git/backups)
- Must support both literal values and placeholders
- File permissions must be restrictive
- No double-entry (user shouldn't configure same variable twice)

**Performance Requirements**:

- Minimal overhead per spawn (<1ms)
- Support live reloading without restart
- Fast startup time

### User Expectations

When a user runs the create command:

```bash
npx @crack-break-make/mcp-grimoire create
# Transport: http
# Header name: X-API-Key
# Header value: 123BC
```

They expect:

1. ✅ Credentials stored securely
2. ✅ Works immediately (no restart)
3. ✅ Can edit credentials easily
4. ✅ One place to manage all secrets

## Decision

Implement environment variable resolution using a dedicated **`~/.grimoire/.env` file** with file system monitoring.

### Architecture

**1. Storage Strategy:**

- Spell YAML files contain **placeholders**: `headers: { X-API-Key: ${X-API-Key} }`
- `~/.grimoire/.env` file contains **actual values**: `X-API-Key=abc123`
- Clear separation: spell configs vs secrets

**2. Resolution Priority:**

```
${VAR} → 1. ~/.grimoire/.env (highest priority)
      → 2. process.env (inherited from parent)
      → 3. Empty string + warning (validation error)
```

**3. Monitoring Pattern:**

```typescript
EnvManager (similar to SpellWatcher):
  - Load .env at startup → cache in Map<string, string>
  - Watch .env file with chokidar (consistent with spell watching)
  - On change: reload cache (chokidar's awaitWriteFinish handles debouncing)
  - No restart needed for new variables
```

**Note**: Updated from `fs.watch` to `chokidar` for consistency with spell file watching and better cross-platform reliability.

**4. Validation Strategy:**

- **Per-spell validation**: Only validate env vars needed by the specific spell being spawned
- **Lazy validation**: Validate at spawn time, not at startup
- **CLI validation**: Optional `grimoire validate` command for pre-flight checks

**5. User Experience:**

```bash
# User creates spell
npx @crack-break-make/mcp-grimoire create
# Enter: X-API-Key = abc123

# CLI automatically:
# 1. Writes to spell YAML: headers: { X-API-Key: ${X-API-Key} }
# 2. Appends to .env: X-API-Key=abc123
# 3. No restart needed - works immediately

# User can also manually edit:
vim ~/.grimoire/.env
# Changes detected within 100ms
```

### Implementation Details

**File Structure:**

```
~/.grimoire/
  ├── .env                      # New: secrets storage
  ├── .gitignore                # Auto-created (ignores .env)
  ├── .embeddings.msgpack       # Existing: spell embeddings
  └── *.spell.yaml              # Existing: spell configs
```

**EnvManager Class:**

```typescript
class EnvManager {
  private cache: Map<string, string>;
  private watcher: FSWatcher;

  async load(): Promise<void>; // Load at startup
  get(key: string): string; // Resolve with priority chain
  expand(value: string): string; // Expand ${VAR} placeholders
  validatePlaceholders(value: string): string[]; // Find missing vars
  async set(key: string, value: string): Promise<void>; // Update .env
  close(): void; // Cleanup watcher
}
```

**Validation Error Message:**

```
❌ Cannot spawn 'test-api-key': Missing environment variables

Required: X-API-Key, OAUTH_TOKEN

To fix:
  1. Add to ~/.grimoire/.env:
     X-API-Key=your-value-here
     OAUTH_TOKEN=your-token-here

  2. OR set in shell before starting Claude:
     export X-API-Key=your-value-here

  3. Changes detected automatically (no restart needed)

Validate anytime: grimoire validate ~/.grimoire/test-api-key.spell.yaml
```

**Security:**

- File permissions: `0600` (read/write owner only) on Unix
- Location: User's home directory (private)
- Ignored by git (auto-created `.gitignore`)
- No encryption (same model as `~/.ssh/id_rsa`, `~/.aws/credentials`)

## Consequences

### Positive Consequences

**Performance:**

- ✅ **~0.001ms per spawn**: Memory cache lookup (Map.get)
- ✅ **~1ms load time**: Read/parse .env file once at startup
- ✅ **No startup delay**: Async file watch setup
- ✅ **Efficient monitoring**: chokidar with awaitWriteFinish (100ms stabilization)

**User Experience:**

- ✅ **No restart needed**: Live reloading on .env changes
- ✅ **No double entry**: CLI manages .env automatically
- ✅ **Easy editing**: `vim ~/.grimoire/.env` for manual changes
- ✅ **Clear error messages**: Helpful validation errors with fix instructions
- ✅ **Works offline**: No external dependencies

**Security:**

- ✅ **Secrets separate from configs**: No credentials in YAML files
- ✅ **File permissions**: 0600 on Unix (owner only)
- ✅ **Industry standard**: Same pattern as Docker, Node.js, AWS CLI
- ✅ **No crypto complexity**: No keys to manage

**Developer Experience:**

- ✅ **Simple implementation**: ~200 LOC for EnvManager
- ✅ **Testable**: Easy to mock for tests
- ✅ **Maintainable**: Clear separation of concerns
- ✅ **Extensible**: Can add system keychain support later

### Negative Consequences

**Limitations:**

- ❌ **File-based only**: No system keychain integration (Phase 1)
- ❌ **Plain text secrets**: Relies on file permissions for security
- ❌ **Manual sync**: If user has multiple machines, must sync .env manually
- ❌ **No secret rotation**: User must manually update .env file

**Mitigations:**

- Future: Add system keychain support (macOS Keychain, Windows Credential Manager)
- Future: Add secret rotation hooks
- Document: Users should use file system encryption (FileVault, BitLocker)

### Risks

**Risk 1: File Watch Failures**

- **Impact**: Changes to .env not detected
- **Likelihood**: Very Low (chokidar is highly reliable across platforms)
- **Mitigation**: Users can restart Claude Desktop if needed
- **Fallback**: Manual reload command in future
- **Note**: Using chokidar (same as spell watching) provides better reliability than native fs.watch

**Risk 2: Concurrent Writes**

- **Impact**: Race condition if multiple processes write .env
- **Likelihood**: Very low (only CLI writes, one user)
- **Mitigation**: Atomic writes (temp file + rename pattern)

**Risk 3: Accidentally Committed Secrets**

- **Impact**: Secrets leaked if .env committed to git
- **Likelihood**: Low (auto-created .gitignore)
- **Mitigation**: Clear documentation, .gitignore auto-creation

**Risk 4: Performance Degradation with Large .env**

- **Impact**: Slower load/parse with 1000+ variables
- **Likelihood**: Very low (typical usage <50 variables)
- **Mitigation**: Acceptable even at 1000 vars (~5ms parse time)

## Alternatives Considered

### Alternative 1: Static Configuration in claude_desktop_config.json

**Approach:**

```json
{
  "mcpServers": {
    "grimoire": {
      "env": {
        "API_KEY_1": "value1",
        "API_KEY_2": "value2"
        // Must list all env vars upfront
      }
    }
  }
}
```

**Pros:**

- Standard MCP pattern
- No extra code needed
- Works with existing MCP clients

**Cons:**

- ❌ Doesn't support dynamic spell creation
- ❌ Requires restart for new variables
- ❌ Must know all variables at Grimoire startup
- ❌ Duplicates work (user enters in CLI, then in config)

**Why rejected**: Fundamentally incompatible with dynamic spell creation. Main problem we're solving.

### Alternative 2: Embed Credentials in Spell YAML

**Approach:**

```yaml
# my-spell.spell.yaml
server:
  headers:
    X-API-Key: abc123 # Literal credential in YAML
```

**Pros:**

- Simple implementation
- No expansion logic needed
- Works immediately

**Cons:**

- ❌ Security risk: credentials in version control
- ❌ Credentials in backups/sync
- ❌ Can't use placeholders for shared secrets
- ❌ Must edit YAML files to rotate credentials

**Why rejected**: Security violation. Credentials should never be in config files that might be shared/backed up.

### Alternative 3: Encrypted .env File

**Approach:**

```
~/.grimoire/.env.encrypted
Encrypted with user's password or system keychain
```

**Pros:**

- Better security (encrypted at rest)
- Protection even if file system compromised

**Cons:**

- ❌ Complexity: Need password management
- ❌ Performance: ~10ms to decrypt on each access
- ❌ User friction: Must enter password or set up keychain
- ❌ Not human-editable without decrypt tool
- ❌ Over-engineering for Phase 1

**Why rejected**: Too complex for the security benefit. File permissions (0600) are sufficient for local development. Can add encryption in Phase 2 if needed.

### Alternative 4: System Keychain Integration

**Approach:**

```typescript
// macOS Keychain, Windows Credential Manager, Linux Secret Service
const key = await keychain.getPassword('grimoire', 'X-API-Key');
```

**Pros:**

- OS-level security
- Encrypted storage
- Standard system integration
- Per-user secrets

**Cons:**

- ❌ Platform-specific code (macOS, Windows, Linux)
- ❌ Additional dependencies (native modules)
- ❌ Complex testing (requires OS keychain)
- ❌ Not always available (headless environments)
- ❌ Over-engineering for Phase 1

**Why rejected**: Better solution but too complex for initial release. Good candidate for Phase 2. Plain file with permissions is simpler and matches industry standard (AWS CLI, Docker, etc.).

### Alternative 5: External Secret Management (Vault, AWS Secrets Manager)

**Approach:**

```typescript
const secret = await vault.read('secret/grimoire/api-keys');
```

**Pros:**

- Enterprise-grade security
- Audit logs
- Secret rotation
- Team sharing

**Cons:**

- ❌ Requires external service
- ❌ Network dependency
- ❌ Complex setup
- ❌ Not suitable for individual developers
- ❌ Massive overkill for local development

**Why rejected**: Way too complex for the target use case (individual developers using Claude Desktop locally). May make sense for enterprise deployments in far future.

### Alternative 6: Prompt User on First Use

**Approach:**

```typescript
// When ${VAR} not found, prompt user:
const value = await prompt(`Enter value for ${varName}:`);
// Cache in memory for session
```

**Pros:**

- No file management
- Interactive security
- Simple implementation

**Cons:**

- ❌ Bad UX: Interrupts workflow
- ❌ Lost on restart: No persistence
- ❌ Can't edit stored values
- ❌ Doesn't work in non-interactive contexts
- ❌ No pre-validation possible

**Why rejected**: Poor user experience. Users expect to set credentials once and have them work.

### Alternative 7: Environment Variables Only (No .env File)

**Approach:**

```bash
# User must set in shell before starting Claude Desktop
export X-API-KEY=abc123
export OAUTH_TOKEN=xyz789
# Then start Claude Desktop from terminal
```

**Pros:**

- No file needed
- Standard Unix pattern
- Process isolation

**Cons:**

- ❌ Claude Desktop usually starts from GUI (no shell env)
- ❌ Must restart Claude Desktop for changes
- ❌ Platform-specific (launchd on macOS, etc.)
- ❌ Hard to discover what vars are needed
- ❌ No persistence across reboots

**Why rejected**: Doesn't work with GUI applications. Users would need complex launchd/systemd configs to inject env vars.

## Implementation Plan

### Phase 1: Core Implementation (Week 1)

**Day 1-2: EnvManager**

- [ ] Implement EnvManager class
- [ ] .env file parsing (KEY=value format)
- [ ] Memory cache (Map<string, string>)
- [ ] Priority resolution (.env > process.env)
- [ ] Unit tests

**Day 3-4: File Watching**

- [x] chokidar integration (updated from fs.watch for consistency)
- [x] Debounced reload via awaitWriteFinish (100ms stabilization)
- [x] Error handling (file not found, permissions)
- [ ] Integration tests

**Day 5: CLI Integration**

- [ ] Auto-append to .env in create command
- [ ] Create .env template on first run
- [ ] Create .gitignore if needed
- [ ] End-to-end tests

### Phase 2: Validation & Error Handling (Week 2)

**Day 1-2: Validation**

- [ ] Extract placeholders from spell config
- [ ] Per-spell validation at spawn time
- [ ] Helpful error messages
- [ ] `grimoire validate` CLI command

**Day 3-4: Process Lifecycle Integration**

- [ ] Expand env vars in process-lifecycle.ts
- [ ] Expand headers in auth-provider.ts
- [ ] Expand auth tokens
- [ ] Integration tests with real MCP servers

**Day 5: Documentation & Polish**

- [ ] Update README with .env usage
- [ ] CLI help text
- [ ] Error message improvements
- [ ] Example .env file

### Phase 3: Testing & Launch (Week 3)

**Day 1-2: Comprehensive Testing**

- [ ] Test with auth test servers (http_api_key, oauth2, etc.)
- [ ] Test file watch on all platforms
- [ ] Test validation errors
- [ ] Performance benchmarks

**Day 3-4: Security Review**

- [ ] Verify file permissions (0600)
- [ ] Test .gitignore creation
- [ ] Documentation on security model
- [ ] Threat model review

**Day 5: Launch**

- [ ] Final testing
- [ ] Release notes
- [ ] Update examples
- [ ] Announcement

## Performance Benchmarks

Target metrics (must meet all):

| Operation                | Target      | Acceptable | Notes                     |
| ------------------------ | ----------- | ---------- | ------------------------- |
| Load .env file           | <1ms        | <5ms       | One-time at startup       |
| Parse 100 vars           | <0.5ms      | <2ms       | One-time at startup       |
| Cache lookup             | <0.001ms    | <0.01ms    | Per spawn (critical path) |
| File watch setup         | <1ms        | <10ms      | One-time at startup       |
| Reload on change         | <2ms        | <10ms      | Debounced, async          |
| **Total spawn overhead** | **<0.01ms** | **<0.1ms** | **Critical metric**       |

Memory usage:

- Cache: ~1KB per 100 variables (negligible)
- Watcher: ~5KB (negligible)

## Security Model

**Threat Model:**

- ✅ Protected against: Accidental git commits (.gitignore)
- ✅ Protected against: Other users on system (file permissions 0600)
- ✅ Protected against: Process isolation (each user has own .env)
- ❌ NOT protected against: Root user (by design)
- ❌ NOT protected against: Physical disk access (use FileVault/BitLocker)
- ❌ NOT protected against: Memory dumps (credentials in memory)

**Same Security as:**

- `~/.ssh/id_rsa` (SSH private keys)
- `~/.aws/credentials` (AWS credentials)
- `~/.docker/config.json` (Docker Hub tokens)
- `.env` files (standard across all ecosystems)

**Recommendations for Users:**

- Enable full-disk encryption (FileVault, BitLocker)
- Use strong file system permissions
- Don't share .env file
- Rotate credentials periodically
- Consider system keychain for higher security (Phase 2)

## References

- [Docker Compose .env Files](https://docs.docker.com/compose/environment-variables/)
- [Node.js dotenv Package](https://github.com/motdotla/dotenv)
- [12-Factor App: Config](https://12factor.net/config)
- [AWS CLI Configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- [SSH Private Key Security](https://www.ssh.com/academy/ssh/key)
- Discussion: Spells with Authentication Requirements
- Related: ADR-0012 (Bearer Token Authentication)
- Related: ADR-0013 (Environment Variable Expansion)

## Amendment: Switch from fs.watch to chokidar

**Date**: 2026-01-19

**Decision**: Changed from native `fs.watch` to `chokidar` for .env file watching.

**Rationale**:

1. **Consistency**: Spell files already use chokidar. Having two different file watching mechanisms in the codebase increases complexity and maintenance burden.

2. **Cross-Platform Reliability**:
   - Native `fs.watch` has known issues on macOS (especially HFS+)
   - chokidar abstracts platform differences and provides consistent behavior
   - Spell watching has proven chokidar works reliably in production

3. **Better Event Handling**:
   - chokidar's `awaitWriteFinish` ensures file is fully written before triggering
   - Native fs.watch can fire multiple events for single save
   - More predictable behavior across editors (vim, VS Code, etc.)

4. **No Additional Dependencies**: chokidar already in package.json for spell watching

5. **Simplified Code**:
   - chokidar's built-in stabilization removes need for manual debounce logic
   - Better error handling out of the box
   - Event API is cleaner (.on('change') vs callback parameter)

**Trade-offs**:

- Slightly more overhead (~5KB) but negligible for single file watching
- Async close() instead of sync, but matches spell-watcher pattern

**Implementation Changes**:

```typescript
// Before (fs.watch)
const { watch: fsWatch } = require('fs');
this.watcher = fsWatch(this.envPath, (eventType) => {
  /* manual debounce */
});

// After (chokidar)
import { watch } from 'chokidar';
this.watcher = watch(this.envPath, {
  awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
}).on('change', () => this.reloadCache());
```

**Result**: More maintainable, reliable, and consistent with existing codebase patterns.

## Future Enhancements (Out of Scope for Phase 1)

1. **System Keychain Integration** (Phase 2)
   - macOS: Keychain Access
   - Windows: Credential Manager
   - Linux: Secret Service API
   - Fallback to .env if keychain unavailable

2. **Secret Rotation Hooks** (Phase 3)
   - Webhook on secret change
   - Automatic re-spawn with new credentials
   - Audit log of secret access

3. **Remote Secret Stores** (Enterprise)
   - HashiCorp Vault integration
   - AWS Secrets Manager
   - Azure Key Vault
   - For team/enterprise use cases

4. **Encrypted .env** (If Requested)
   - Optional encryption with user password
   - Decrypt on startup
   - For users who want extra security

5. **Multi-Environment Support** (If Needed)
   - `.env.development`, `.env.production`
   - Environment switching
   - Per-environment spell configs

---

## Update (2026-01-22): GRIMOIRE_HOME Override Capability

### Additional Context

During test development, we identified that all integration tests were writing to the user's real `~/.grimoire/` directory, causing:

- ❌ Pollution of production directory with test data
- ❌ Test isolation issues (tests share same directory)
- ❌ Cleanup failures leave test artifacts in production location
- ❌ Parallel test execution risks (port conflicts, file collisions)
- ❌ CI/CD environments may not have home directory access

### Decision Extension

Add support for **`GRIMOIRE_HOME` environment variable** to override the base grimoire directory location.

**Default Behavior (Production)**:

```bash
# No GRIMOIRE_HOME set → uses ~/.grimoire/
~/.grimoire/
  ├── .env
  ├── embeddings.msgpack
  └── *.spell.yaml
```

**Override Behavior (Testing/Custom)**:

```bash
# GRIMOIRE_HOME=/workspace/.test-grimoire → uses custom location
export GRIMOIRE_HOME=/workspace/.test-grimoire
/workspace/.test-grimoire/
  ├── .env
  ├── embeddings.msgpack
  └── *.spell.yaml
```

### Implementation

**Path Resolution (`src/utils/paths.ts`)**:

```typescript
function getPaths(): EnvPaths {
  if (syncPaths != null) return syncPaths;

  // Check for GRIMOIRE_HOME environment variable override
  const overrideDir = process.env.GRIMOIRE_HOME;

  const grimoireDir = overrideDir
    ? resolve(overrideDir) // Use absolute path from override
    : join(homedir(), '.grimoire'); // Default: ~/.grimoire

  return {
    config: grimoireDir,
    cache: grimoireDir,
    log: grimoireDir,
    data: grimoireDir,
    temp: overrideDir
      ? join(grimoireDir, 'tmp') // Isolated temp for tests
      : join(tmpdir(), 'grimoire'), // System temp for production
  };
}

// New function for tests to reset cache after setting GRIMOIRE_HOME
export function resetPathsCache(): void {
  syncPaths = null;
  pathsCache = null;
}
```

**Test Helper (`src/cli/__tests__/helpers/test-path-manager.ts`)**:

```typescript
export async function setupTestGrimoireDir(testName: string): Promise<string> {
  const testDir = join(process.cwd(), '.test-grimoire', testName);
  process.env.GRIMOIRE_HOME = testDir;
  resetPathsCache(); // Pick up new environment variable
  await mkdir(testDir, { recursive: true });
  return testDir;
}

export async function cleanupTestGrimoireDir(testDir: string): Promise<void> {
  await rm(testDir, { recursive: true, force: true });
  delete process.env.GRIMOIRE_HOME;
  resetPathsCache(); // Restore default behavior
}
```

**Test Usage**:

```typescript
describe('CLI Test', () => {
  let testGrimoireDir: string;

  beforeAll(async () => {
    testGrimoireDir = await setupTestGrimoireDir('my-test');
    // All grimoire operations now use /workspace/.test-grimoire/my-test
  });

  afterAll(async () => {
    await cleanupTestGrimoireDir(testGrimoireDir);
    // Directory cleaned up, GRIMOIRE_HOME unset
  });
});
```

### Affected Components (No Changes Needed)

All components automatically respect `GRIMOIRE_HOME` because they use `PATHS`:

1. ✅ **Spell Files** - `SpellDiscovery` uses `getSpellDirectory()`
2. ✅ **Embedding Cache** - `EmbeddingStorage` uses `getEmbeddingCachePath()`
3. ✅ **Environment Variables** - `EnvManager` uses `getSpellDirectory()/.env`
4. ✅ **Spell Watcher** - Uses `SpellDiscovery.getSpellDirectory()`
5. ✅ **Directory Creation** - `ensureDirectories()` uses `PATHS.config`

### Consequences of GRIMOIRE_HOME

**Positive**:

- ✅ Test isolation - Each test uses unique directory
- ✅ Production safety - Default behavior unchanged
- ✅ CI/CD compatible - Works without home directory
- ✅ Parallel execution - Tests don't collide
- ✅ Zero component changes - All use `PATHS` already

**Negative**:

- ⚠️ Cache invalidation - Must call `resetPathsCache()` after setting
- ⚠️ Documentation - Need to explain to advanced users
- ⚠️ Test discipline - Tests must cleanup properly

**Neutral**:

- Environment variable is **optional** - Production users don't need to know about it
- Only used for testing and custom installations
- Follows same pattern as `HOME`, `TMPDIR`, etc.

### Use Cases

**1. Integration Testing**:

```bash
export GRIMOIRE_HOME=./.test-grimoire/test-123
npm test  # Uses isolated directory
```

**2. Custom Installation**:

```bash
export GRIMOIRE_HOME=/opt/grimoire
npx @crack-break-make/mcp-grimoire  # Uses /opt/grimoire
```

**3. Multi-User Systems**:

```bash
export GRIMOIRE_HOME=/shared/grimoire/user-$USER
# Each user has isolated grimoire directory
```

**4. Development/Staging**:

```bash
export GRIMOIRE_HOME=/workspace/grimoire-dev
# Separate dev environment from production ~/.grimoire
```

---

## Summary

This ADR documents two complementary decisions:

1. **Original (2026-01-19)**: Use `~/.grimoire/.env` for dynamic environment variable resolution
   - Solves: Dynamic spell creation without restart
   - Benefit: Live credential management

2. **Update (2026-01-22)**: Add `GRIMOIRE_HOME` override capability
   - Solves: Test isolation and custom installations
   - Benefit: Clean tests, flexible deployment

Both decisions work together to provide:

- ✅ Production: `~/.grimoire/.env` with live reloading
- ✅ Testing: Isolated directories via `GRIMOIRE_HOME`
- ✅ Custom: Flexible deployment locations
- ✅ Security: File permissions and separation of concerns
