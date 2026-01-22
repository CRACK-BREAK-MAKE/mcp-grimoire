# 8. Use ~/.grimoire Path (Claude Code Convention)

Date: 2026-01-11
Updated: 2026-01-13, 2026-01-22

## Status

Accepted (with enhancement: GRIMOIRE_HOME override support added 2026-01-22)

## Context

MCP Grimoire needs to store spell configuration files (`.spell.yaml`) somewhere users can easily find, edit, and manage.

**Observed Convention**: Claude Code stores its data in `~/.claude/` on all platforms (macOS, Windows, Linux). This approach:

- Works identically across platforms via Node.js `os.homedir()`
- Is familiar to CLI tool users (npm, docker, kubectl all use `~/.tool-name`)
- Makes configs easy to find and version control
- Avoids platform-specific complexity

**Alternative Considered**: Platform-specific paths (macOS: `~/Library/Preferences/`, Windows: `%APPDATA%`, Linux: `~/.config/`)

- Follows OS conventions for GUI apps
- Adds complexity: requires `env-paths` dependency, platform detection, migration logic
- Hides configs in system directories unfamiliar to CLI users

## Decision

Use **`~/.grimoire/`** as the spell directory on all platforms, following Claude Code's convention.

**Implementation** (Updated 2026-01-22):

```typescript
import { join } from 'path';
import { homedir } from 'os';

// Following Claude Code convention (~/.claude)
// Now supports GRIMOIRE_HOME environment variable override
export function getSpellDirectory(): string {
  const envPath = process.env.GRIMOIRE_HOME;
  if (envPath != null && envPath !== '') {
    return envPath;
  }
  return join(homedir(), '.grimoire');
}
```

**Environment Variable Support**:

Users can now override the default path via `GRIMOIRE_HOME` environment variable:

```bash
# Use custom directory
export GRIMOIRE_HOME=/path/to/custom/grimoire
grimoire create ...

# Use project-local directory
export GRIMOIRE_HOME=$PWD/.grimoire
grimoire create ...
```

**Cross-Platform Behavior**:

- **macOS**: `/Users/username/.grimoire/`
- **Windows**: `C:\Users\username\.grimoire\`
- **Linux**: `/home/username/.grimoire/`

Node.js `homedir()` handles platform differences automatically.

**Directory Layout**:

```
~/.grimoire/
├── *.spell.yaml          # Spell configurations
└── embeddings.msgpack    # Semantic search cache
```

## Consequences

### Positive Consequences

✅ **Environment Override Available** (Added 2026-01-22): Users can customize path via `GRIMOIRE_HOME` for advanced use cases (testing, multi-environment setups)

✅ **Cross-Platform Simplicity**: Single code path works everywhere via `os.homedir()`

✅ **Follows Established Convention**: Same pattern as Claude Code (`~/.claude`)

✅ **Zero Dependencies**: No `env-paths` package needed

✅ **Easy to Find**: Users know exactly where configs are (`cd ~/.grimoire`)

✅ **Easy to Backup**: Single directory to copy/version control

✅ **Easy to Share**: Users can publish spell collections via Git

✅ **CLI Tool Standard**: Matches npm (`~/.npm`), docker (`~/.docker`), kubectl (`~/.kube`)

✅ **No Migration**: Users' existing files already in `~/.grimoire` work immediately

### Negative Consequences

❌ **Not Following GUI App Conventions**: Desktop apps typically use `~/Library` (macOS), `%APPDATA%` (Windows)

- **Mitigation**: This is a CLI tool, not a GUI app. CLI tools universally use `~/.tool-name`

❌ \*\*No XDG Suppo (Updated 2026-01-22): Users can now use `GRIMOIRE_HOME` environment variable for custom paths. XDG support not needed.

- **Mitigation**: Users can symlink if needed. XDG is nice-to-have for CLI tools, not required

❌ **Visible Dot Directory**: `.grimoire` folder visible in home directory

- **Mitigation**: Standard practice for CLI tools. Users expect this.

## Alternatives Considered

### Alternative 1: Platform-Specific Paths

**Approach**: Use different paths per OS following GUI app conventions

- macOS: `~/Library/Preferences/grimoire/`
- Windows: `%APPDATA%\grimoire\`
- Linux: `~/.config/grimoire/`

**Implementation**: Would require `env-paths` package or manual platform detection

**Why rejected**:

1. **Over-engineering**: Adds complexity for minimal user benefit
2. **Deviates from CLI conventions**: npm, docker, kubectl don't do this
3. **Migration burden**: Users' files already in `~/.grimoire`
4. **Hidden configs**: Files buried in system directories are harder to find
5. **Claude Code uses `~/.claude`**: We should follow the same pattern

### Alternative 2: XDG-Only on Linux

**Approach**: Use `~/.grimoire` on macOS/Windows, but `~/.config/grimoire` on Linux

**Why rejected**: Inconsistent behavior across platforms confuses users

### Alternative 3: Let Users Configure Path

**Status Update (2026-01-22)**: ✅ **Now Implemented**

This alternative was initially rejected as YAGNI, but was later implemented for two reasons:

1. **Test Isolation**: Integration tests needed isolated directories to prevent pollution of `~/.grimoire`
2. **Advanced Use Cases**: Users with multi-environment setups or CI/CD pipelines benefit from path customization
   with `GRIMOIRE_HOME` override support
3. `src/application/spell-discovery.ts`: Call `getSpellDirectory()` from paths.ts
4. User spell files: Already in `~/.grimoire/*.spell.yaml` - no migration needed

**Testing** (Updated 2026-01-22):

- Unit tests: Mock `homedir()` for each platform
- Integration tests: Verify file discovery on macOS, Linux, Windows (via CI)
- **Test isolation**: CLI integration tests use `GRIMOIRE_HOME` override to create isolated `.test-grimoire/<test-name>/` directories
- \*\*Path cache re (Updated 2026-01-22):

- README: Update path examples to show `~/.grimoire`
- Quick start: `mkdir -p ~/.grimoire && cd ~/.grimoire`
- **Environment variable**: Document `GRIMOIRE_HOME` override for advanced users
- **Test patterns**: Document test isolation strategy using `GRIMOIRE_HOME` in integration tests
  **Changes**:

1. `src/utils/paths.ts`: Use `join(homedir(), '.grimoire')` for all platforms
2. `src/application/spell-discovery.ts`: Call `getSpellDirectory()` from paths.ts
3. User spell files: Already in `~/.grimoire/*.spell.yaml` - no migration needed

- [ADR-0015: Environment Variable Resolution](0015-environment-variable-resolution-with-env-file.md) - Related environment variable handling
- Test isolation pattern: CLI integration tests (19 tests) use `GRIMOIRE_HOME` override for test directory isolation
  **Testing**:

- Unit tests: Mock `homedir()` for each platform
- Integration tests: Verify file discovery on macOS, Linux, Windows (via CI)

**Documentation**:

## Update History

### 2026-01-22: GRIMOIRE_HOME Override Support Added

**Motivation**: Test isolation and advanced use cases

**Changes**:

- Added `GRIMOIRE_HOME` environment variable override to `getSpellDirectory()`
- Implemented path cache reset mechanism (`resetPathsCache()`)
- Created test isolation utilities (`setupTestGrimoireDir`, `cleanupTestGrimoireDir`)
- All 19 CLI integration tests now use isolated `.test-grimoire/<test-name>/` directories

**Impact**:

- ✅ No breaking changes (default behavior unchanged)
- ✅ Tests no longer pollute `~/.grimoire`
- ✅ Tests can run in parallel without collisions
- ✅ Power users can customize grimoire directory per environment
- ✅ CI/CD pipelines can use temporary directories

**Related PRs/Commits**:

- Commit `2e74243`: Add cleanup to all CLI integration tests
- Commit `d3717c0`: Fix ESLint errors and nullable string warnings
- Test helper: `src/cli/__tests__/helpers/test-path-manager.ts`

---

**Decision Made By**: AI Assistant (Claude) + User preference
**Implementation Status**: ✅ Implemented + Enhanced (GRIMOIRE_HOME support)
**Next Review**: Monitoring for additional path customization request

- [Claude Code conventions](https://github.com/anthropics/claude-code) - Uses `~/.claude/`
- [Node.js os.homedir()](https://nodejs.org/api/os.html#os_os_homedir) - Cross-platform home directory
- CLI tool conventions: npm (`~/.npm`), cargo (`~/.cargo`), docker (`~/.docker`)

## Supersedes

Original ADR-0008 proposal (platform-specific paths with `env-paths`)

## Superseded By

None (current decision)

---

**Decision Made By**: AI Assistant (Claude) + User preference
**Implementation Status**: ✅ Implemented
**Next Review**: Only if users request configurable paths
