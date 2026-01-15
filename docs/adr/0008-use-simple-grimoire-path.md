# 8. Use ~/.grimoire Path (Claude Code Convention)

Date: 2026-01-11
Updated: 2026-01-13

## Status

Accepted

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

**Implementation**:

```typescript
import { join } from 'path';
import { homedir } from 'os';

// Following Claude Code convention (~/.claude)
const GRIMOIRE_DIR = join(homedir(), '.grimoire');

export function getSpellDirectory(): string {
  return GRIMOIRE_DIR;
}
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

❌ **No XDG Support**: Linux users can't override via `$XDG_CONFIG_HOME`

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

**Approach**: Environment variable like `$GRIMOIRE_HOME`

**Why rejected**: YAGNI - no user has requested this. Can add later if needed.

## Implementation

**Changes**:

1. `src/utils/paths.ts`: Use `join(homedir(), '.grimoire')` for all platforms
2. `src/application/spell-discovery.ts`: Call `getSpellDirectory()` from paths.ts
3. User spell files: Already in `~/.grimoire/*.spell.yaml` - no migration needed

**Testing**:

- Unit tests: Mock `homedir()` for each platform
- Integration tests: Verify file discovery on macOS, Linux, Windows (via CI)

**Documentation**:

- README: Update path examples to show `~/.grimoire`
- Quick start: `mkdir -p ~/.grimoire && cd ~/.grimoire`

## References

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
