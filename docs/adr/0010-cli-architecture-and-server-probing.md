# 10. CLI Architecture with Interactive Wizard and Server Probing

Date: 2026-01-15

## Status

Accepted

## Context

MCP Grimoire needs a user-friendly way for users to create spell configuration files (`.spell.yaml`). Writing YAML manually is error-prone and requires understanding of:
- MCP protocol details (stdio, SSE, HTTP transports)
- Spell schema (keywords, steering, server configuration)
- Best practices for intent resolution and AI guidance

Additionally, users need tools to:
- List existing spells
- Validate spell configurations
- Generate example templates

**Key Challenge**: How to make spell creation accessible to non-technical users while maintaining flexibility for advanced users?

## Decision

Implement a comprehensive CLI with four core commands:

### 1. `grimoire create` - Interactive Wizard with Server Probing

**Design**: Interactive step-by-step wizard that:
1. Prompts for spell name (validates format: `^[a-z0-9][a-z0-9-]*$`)
2. Asks for transport type (stdio, SSE, HTTP) with descriptions
3. Collects transport-specific configuration (command/args or URL)
4. **Optionally probes the MCP server** to validate and auto-generate content
5. Writes validated `.spell.yaml` to `~/.grimoire/`

**Server Probing Feature**:
- Connects to the MCP server using actual MCP protocol
- Retrieves tools list via `tools/list` request
- Auto-generates keywords from tool names (max 15)
- Creates intelligent steering instructions based on tools:
  - **When to Use**: Inferred from spell name and tools
  - **Available Tools**: One-line descriptions with required parameters
  - **Recommended Workflow**: 3-step process (Discovery → Action → Verify)
  - **Best Practices**: Domain-specific guidance (database, API, filesystem, etc.)

**Non-Interactive Mode**: Support `--no-interactive` flag for automation/scripting

### 2. `grimoire list` - Spell Discovery

**Design**: Scan `~/.grimoire/` for `*.spell.yaml` files and display:
- Simple mode (default): Name, transport, keyword count
- Verbose mode (`-v`): Full details including description, keywords

**Benefits**: Users can see what spells are available without opening files

### 3. `grimoire validate` - Configuration Validation

**Design**: Validate spell YAML against schema:
- Required fields check (name, keywords, server.command/url)
- Field type validation
- Transport-specific validation (stdio requires command, SSE/HTTP require URL)
- Minimum keyword count (3)
- Exit codes: 0 (success), 1 (errors found)

**Benefits**: Catch configuration errors before runtime

### 4. `grimoire example` - Template Generation

**Design**: Generate example `.spell.yaml` templates for each transport type:
- stdio template (local child process)
- SSE template (real-time streaming)
- HTTP template (REST-like)

**Benefits**: Quick-start for users, self-documenting

### Implementation Principles

**1. Zero External Prompt Dependencies**
- Use Node.js built-in `readline` (not `inquirer` or `prompts`)
- Keep CLI startup fast (<100ms)
- Reduce package size

**2. Graceful Degradation**
- stdio probe failures are **non-fatal** (command might not be installed yet)
- SSE/HTTP probe failures are **fatal** (no point creating spell for unreachable server)
- Works in non-TTY environments (CI/CD)

**3. Single Responsibility Principle (SRP)**
- Each command has one job (create, list, validate, example)
- Helper functions are focused (e.g., `inferDomain`, `extractActionVerbs`)
- MCP probing logic separated into `mcp-probe.ts`

**4. User-Centric Design**
- Interactive mode by default (guides users)
- Clear error messages with actionable suggestions
- Colorful output with visual hierarchy (ANSI colors)
- Validates input in real-time with retry

## Consequences

### Positive Consequences

✅ **Lower Barrier to Entry**: Non-technical users can create spells via wizard
- No need to understand YAML syntax
- No need to know MCP protocol details
- Real-time validation prevents errors

✅ **Auto-Generated Steering**: Server probing dramatically reduces manual work
- Connects to actual MCP server to retrieve tools
- Generates high-quality steering instructions automatically
- Ensures keywords match actual tool names (better intent resolution)

✅ **Validation Before Runtime**: `grimoire validate` catches errors early
- Prevents broken spells from being loaded
- Clear error messages guide users to fixes
- Exit codes support CI/CD integration

✅ **Self-Documenting**: `grimoire example` provides templates
- Users can learn by example
- Templates include comments explaining fields
- Quick-start for each transport type

✅ **Fast Startup**: No external dependencies for prompts
- Uses Node.js built-in `readline`
- CLI starts in <100ms
- Smaller package size

✅ **Automation-Friendly**: Non-interactive mode supports scripting
- CI/CD can create spells programmatically
- Bulk spell creation via scripts
- Headless environments supported

✅ **Professional UX**: Colorful terminal output, spinner animations
- Looks and feels like modern CLI tools (npm, docker, kubectl)
- Clear visual hierarchy (errors, warnings, success)
- Progress indicators for long operations (30s probe timeout)

### Negative Consequences

❌ **Increased Codebase Complexity**: CLI adds ~1,200 lines of code
- **Mitigation**: Well-structured with clear separation (commands, templates, utils)
- **Mitigation**: Comprehensive tests (unit + integration)
- **Benefit outweighs cost**: User experience dramatically improved

❌ **Maintenance Burden**: More code to maintain and test
- **Mitigation**: Co-located tests ensure reliability
- **Mitigation**: TypeScript strict mode catches errors early
- **Mitigation**: CLI is relatively stable (few changes expected)

❌ **MCP Probe Can Fail**: Network timeouts, wrong commands, etc.
- **Mitigation**: Clear error messages with suggestions
- **Mitigation**: Graceful degradation (stdio continues, SSE/HTTP fails)
- **Mitigation**: Users can skip probing and write steering manually

❌ **Platform-Specific Behavior**: Colors, TTY detection vary
- **Mitigation**: ANSI color detection (checks `process.stdout.isTTY`)
- **Mitigation**: Works in non-TTY (CI/CD) without colors
- **Mitigation**: Tested on macOS, Linux, Windows (via CI)

## Alternatives Considered

### Alternative 1: GUI Application (Electron/Web)

**Approach**: Build a graphical interface for spell creation

**Why rejected**:
1. **Over-engineering**: Adds massive complexity for minimal benefit
2. **Not CLI-First**: Grimoire is a CLI tool, GUI doesn't fit
3. **Deployment Burden**: Requires packaging, distribution, updates
4. **User Expectations**: CLI users expect terminal-based workflows

### Alternative 2: Use Existing Prompt Library (inquirer, prompts)

**Approach**: Use `inquirer` or `prompts` for interactive prompts

**Why rejected**:
1. **Dependency Bloat**: inquirer is 800KB (vs 0KB for readline)
2. **Slow Startup**: Loading prompt library adds 50-100ms
3. **ESM Issues**: Some libraries have ESM/CommonJS conflicts
4. **Over-Featured**: We only need text, select, confirm - readline is sufficient

### Alternative 3: Manual YAML Editing Only

**Approach**: No CLI, users write `.spell.yaml` manually

**Why rejected**:
1. **Poor UX**: Requires understanding YAML syntax and spell schema
2. **Error-Prone**: Typos, missing fields, wrong formats
3. **No Validation**: Errors discovered at runtime
4. **High Barrier**: Non-technical users struggle

### Alternative 4: Configuration via JSON/TOML

**Approach**: Use JSON or TOML instead of YAML

**Why rejected**:
1. **JSON**: No comments (steering instructions need comments)
2. **TOML**: Less familiar than YAML in JavaScript ecosystem
3. **YAML**: Standard for configuration in MCP ecosystem
4. **Consistency**: Match existing MCP server conventions

### Alternative 5: No Server Probing

**Approach**: Users manually write keywords and steering

**Why rejected**:
1. **Manual Work**: Users must introspect MCP servers themselves
2. **Inconsistent Quality**: Steering instructions vary wildly
3. **Keyword Mismatch**: Intent resolution less effective
4. **Missed Opportunity**: We can automate this with MCP protocol!

## Implementation Details

### Directory Structure

```
src/cli/
├── commands/                    # Command implementations
│   ├── create.ts               # Interactive wizard (412 lines)
│   ├── list.ts                 # List spells (86 lines)
│   ├── validate.ts             # Validate spell (134 lines)
│   ├── example.ts              # Generate template (55 lines)
│   └── index.ts                # Export all commands
│
├── templates/                   # Spell templates
│   ├── stdio-template.ts       # Stdio transport
│   ├── sse-template.ts         # SSE transport
│   ├── http-template.ts        # HTTP transport
│   └── index.ts                # Export all templates
│
└── utils/                       # CLI utilities
    ├── mcp-probe.ts            # Server validation (463 lines)
    ├── prompts.ts              # Interactive prompts (346 lines)
    └── index.ts                # Export utilities
```

### MCP Probing Algorithm

```typescript
async function probeMCPServer(config: SpellConfig): Promise<ProbeResult> {
  // 1. Create MCP client based on transport
  const client = createClient(config);

  // 2. Connect with timeout
  await client.connect({ timeout: 30000 });

  // 3. Request tools list
  const tools = await client.request('tools/list');

  // 4. Analyze tools and generate steering
  const steering = generateSteeringFromTools(config.name, tools);

  // 5. Extract keywords from tool names
  const keywords = extractKeywordsFromTools(tools);

  // 6. Return results
  return { success: true, tools, steering, keywords };
}
```

### Steering Generation Strategy

**Structure** (follows best practices from existing spells):
1. **When to Use** (30-50 words): Use cases inferred from spell name and tools
2. **Available Tools** (200 words max): One-line descriptions with required parameters
3. **Recommended Workflow** (3 steps): Discovery → Action → Verify
4. **Best Practices** (70-100 words): Domain-specific guidance

**Domain Detection**:
- **Database**: postgres, mysql, sql, query, table → SQL injection warnings, parameterized queries
- **API**: api, rest, http, request, endpoint → Rate limiting, error handling, authentication
- **Filesystem**: file, fs, read, write, path → Path traversal, permissions, validation
- **Search**: search, find, list → Pagination, filtering, sorting
- **General**: Fallback for unrecognized patterns

**Conciseness**: Keep steering under 400 words to minimize token usage

### Error Handling

**Connection Errors**:
```
✗ Cannot connect to MCP server
  Error: Command not found: npx

  Suggestions:
  - Install Node.js and npm: https://nodejs.org
  - Verify PATH includes npm bin directory
  - Try absolute path: /usr/local/bin/npx
```

**Timeout Errors**:
```
✗ Connection timeout (30s)
  The server took too long to respond.

  Suggestions:
  - Check if server requires npm install (first run is slow)
  - Verify network connectivity for SSE/HTTP servers
  - Increase timeout if server is legitimately slow
```

**Invalid Response Errors**:
```
✗ Invalid MCP response
  Server did not respond with valid MCP protocol.

  Suggestions:
  - Verify the command spawns an MCP server
  - Check server logs for errors
  - Test server manually: npx -y @org/server
```

### Testing Strategy

**Unit Tests**:
- `create.test.ts`: Test wizard logic (mocked prompts)
- `list.test.ts`: Test spell discovery
- `validate.test.ts`: Test validation rules
- `mcp-probe.test.ts`: Test probing logic (mocked MCP client)
- `prompts.test.ts`: Test prompt utilities

**Integration Tests**:
- `cli.comprehensive.integration.test.ts`: End-to-end CLI workflows
- Test all transport types (stdio, SSE, HTTP)
- Test with real test servers (fixtures/test-servers/)

**Coverage Target**: 80%+ for CLI code

## References

- [Node.js readline](https://nodejs.org/api/readline.html) - Built-in prompts
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/) - Tools/list endpoint
- CLI UX conventions: npm, docker, kubectl (interactive wizards, color output)

## Related ADRs

- ADR-0001: Record Architecture Decisions
- ADR-0008: Use ~/.grimoire Path (CLI creates files here)

## Implementation Status

✅ **Implemented** (v1.0.0)
- All four commands fully functional
- Server probing working for stdio, SSE, HTTP
- Comprehensive test coverage
- Documented in README and CONTRIBUTING

## Future Enhancements

Potential improvements (not committed to):
- **Interactive editor**: Launch $EDITOR to edit steering
- **Spell templates**: Pre-configured spells for popular MCP servers
- **Bulk import**: Create multiple spells from directory of MCP servers
- **Spell validation on save**: Watch mode for development

---

**Decision Made By**: AI Assistant (Claude) + User Feedback
**Implementation Status**: ✅ Complete
**Next Review**: After user feedback on CLI UX
