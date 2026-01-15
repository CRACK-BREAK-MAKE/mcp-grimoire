# 📚 MCP Grimoire

**Your intelligent spellbook for MCP servers** - Lazy loading orchestration with 97% token savings

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](.)
[![License](https://img.shields.io/badge/license-ISC-blue)](.)
[![npm version](https://img.shields.io/npm/v/@crack-break-make/mcp-grimoire)](https://www.npmjs.com/package/@crack-break-make/mcp-grimoire)

---

## 🎯 What is MCP Grimoire?

**MCP Grimoire** is an intelligent orchestrator for [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers. It acts as a smart gateway between AI agents (like Claude Desktop, GitHub Copilot) and your MCP tools, solving critical performance and usability problems in AI-powered development workflows.

### The Problem

Traditional MCP implementations suffer from three critical issues:

**1. Context Overload (Token Waste) 💸**
- Loading 50+ tools at startup consumes 40,000+ tokens
- Degrades AI performance and increases API costs
- Results in slower responses and confused tool selection

**2. Missing Domain Expertise 🤷**
- MCP tools lack contextual guidance and best practices
- Users must manually prompt for security patterns
- Leads to vulnerabilities and inconsistent usage

**3. Plugin Development Complexity 🔧**
- No standardized patterns for creating MCP plugins
- Difficult to maintain and extend
- Fragmented ecosystem

### The Solution

MCP Grimoire achieves **97% token reduction** through:

✅ **Lazy Loading** - Spawns MCP servers only when needed, not all at startup<br>
✅ **Intent-Driven Discovery** - Matches queries to tools via hybrid keyword + semantic search<br>
✅ **Aggressive Cleanup** - Kills inactive servers after 5 turns of inactivity<br>
✅ **Steering Injection** - Embeds best practices directly into tool descriptions<br>
✅ **Transparent Operation** - Claude doesn't know about the complexity

**Result**: From 40,000 tokens → 1,166 tokens average (~$0.20 → ~$0.006 per query)

---

## 🚀 Quick Start

### Installation

```bash
npm install -g @crack-break-make/mcp-grimoire
```

### Configure with Claude Desktop

Add to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "grimoire": {
      "command": "npx",
      "args": ["-y", "@crack-break-make/mcp-grimoire"]
    }
  }
}
```

Restart Claude Desktop - Grimoire is now active!

### Configure with GitHub Copilot (VS Code)

Add to your VS Code settings (`settings.json`):

```json
{
  "servers": {
    "grimoire": {
      "command": "npx",
      "args": ["-y", "@crack-break-make/mcp-grimoire"]
    }
  }
}
```

---

## 📦 How It Works

### High-Level Flow

```
User Query → Claude analyzes intent → resolve_intent(query) →
Grimoire matches keywords/semantics → Spawns relevant MCP server →
Injects steering → tools/list_changed → Claude sees tools + guidance →
Executes with best practices → After 5 turns idle → Kill server
```

### Architecture Diagram

```
┌──────────────────────────────────────┐
│      Claude Desktop / Copilot        │
│  Maintains conversation state        │
└──────────────┬───────────────────────┘
               │ stdio (MCP Protocol)
               │
┌──────────────▼───────────────────────┐
│      GRIMOIRE GATEWAY SERVER         │
│  - Intent Resolution (hybrid)        │
│  - Process Lifecycle Management      │
│  - Tool Routing                      │
│  - Steering Injection                │
└──────┬──────────────┬────────────────┘
       │ stdio        │ stdio
       │              │
┌──────▼─────┐  ┌────▼──────┐
│  Postgres  │  │  Stripe   │  ... (spawned on-demand)
│ MCP Server │  │ MCP Server│
└────────────┘  └───────────┘
```

### Multi-Tier Intent Resolution

Grimoire uses a **confidence-based approach** to decide when to auto-spawn vs ask for clarification:

| Tier | Confidence | Behavior | Example |
|------|-----------|----------|---------|
| **High** | ≥ 0.85 | **Auto-spawn** immediately | "query postgres" → Instant activation |
| **Medium** | 0.50-0.84 | **Return alternatives** | "check database" → [postgres, mysql, mongodb] |
| **Low** | 0.30-0.49 | **Weak matches** | "analyze data" → 5 weak matches |
| **None** | < 0.30 | **Not found** | "launch rocket" → Error + available spells |

**70% of queries** hit high confidence (zero-friction UX)
**20% of queries** hit medium confidence (AI agent picks from context)
**10% of queries** need clarification

---

## 🧙 Creating Your First Spell

A "spell" is a YAML configuration file that tells Grimoire how to spawn and use an MCP server.

### Interactive Creation (Recommended)

```bash
grimoire create
```

The wizard will guide you through:
1. **Spell name** (e.g., `postgres`)
2. **Transport type** (stdio, SSE, or HTTP)
3. **Server configuration** (command, args, or URL)
4. **Environment variables** (for authenticated servers like GitHub, Stripe, etc.)
5. **Server validation** (optional but recommended)

**With server probing** (auto-generates steering and keywords):
```bash
grimoire create --probe
```

### Manual Creation

Create `~/.grimoire/postgres.spell.yaml`:

```yaml
name: postgres
version: 1.0.0
description: PostgreSQL database operations

# MCP Server Configuration
server:
  transport: stdio
  command: npx
  args:
    - '-y'
    - '@modelcontextprotocol/server-postgres'
  env:
    DATABASE_URL: postgresql://user:pass@localhost/db

# Intent Matching Keywords (minimum 3)
keywords:
  - database
  - sql
  - query
  - postgres
  - tables
  - users

# Expert Guidance (Optional but Recommended)
steering: |
  # Database Schema
  Tables:
    - users (id uuid, email string, created_at timestamp)

  # Security Rules
  ALWAYS use parameterized queries:
    ✓ query_database('SELECT * FROM users WHERE id = $1', [id])
    ✗ 'SELECT * FROM users WHERE id = ' + id  (SQL INJECTION!)

  # Performance Tips
  - Use LIMIT to avoid scanning millions of rows
  - created_at is indexed, use for date filtering
```

**Environment Variables**:

For servers requiring authentication (GitHub, Stripe, databases, etc.), use the `${VAR_NAME}` syntax to reference shell environment variables:

```yaml
server:
  env:
    GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN}
    DATABASE_URL: ${DATABASE_URL}
    API_KEY: ${MY_API_KEY}
```

The interactive wizard will prompt you for environment variables and suggest the `${VAR}` syntax by default. You can also provide literal values directly.

**Spell File Location** (all platforms):
- `~/.grimoire/` (follows Claude Code convention)
  - **macOS**: `/Users/username/.grimoire/`
  - **Windows**: `C:\Users\username\.grimoire\`
  - **Linux**: `/home/username/.grimoire/`

---

## 🔮 Supported MCP Transports

### ✅ Stdio (Fully Supported)

For local MCP servers spawned as child processes (most common):

```yaml
server:
  transport: stdio
  command: npx
  args:
    - '-y'
    - '@modelcontextprotocol/server-postgres'
```

Examples:
- `@modelcontextprotocol/server-postgres`
- `@modelcontextprotocol/server-github`
- `@cap-js/mcp-server`

### 🚧 SSE (Planned)

For real-time MCP servers using Server-Sent Events:

```yaml
server:
  transport: sse
  url: http://localhost:3000/sse
```

### 🚧 HTTP (Planned)

For REST-like MCP servers:

```yaml
server:
  transport: http
  url: http://localhost:7777/mcp
```

**Note**: Only **local MCP servers** (spawned by Grimoire) are supported in Phase 1. Remote servers (via `mcp-remote`) require different architecture and are planned for Phase 2.

---

## ⚡ When Servers Are Spawned and Killed

### Spawn Triggers

**1. High Confidence Match (≥0.85)**
```
User: "query my postgres database"
→ resolve_intent matches "postgres" with 0.94 confidence
→ Immediate spawn + return tools
→ Time: 200-300ms
```

**2. Manual Activation**
```
User: "check my database"
→ resolve_intent returns alternatives: [postgres, mysql, mongodb]
→ Claude (or user) calls: activate_spell({ name: "postgres" })
→ Spawn specified spell
→ Time: 200-300ms
```

**3. Already Active**
```
→ Just update usage tracking
→ Time: ~5ms (no spawn overhead)
```

### Kill Triggers (5-Turn Inactivity)

After **every tool call**, Grimoire checks:
```
If (currentTurn - lastUsedTurn) >= 5:
  → Kill process
  → Unregister tools
  → Send tools/list_changed notification
```

**Real-World Example** (E-commerce workflow):

| Turn | Action | Active Spells | Event |
|------|--------|---------------|-------|
| 1-3 | Database queries | `[postgres]` | ✅ Postgres spawned |
| 4-7 | Process payments | `[postgres, stripe]` | ✅ Stripe spawned |
| 8 | Deploy CAP app | `[postgres, stripe, cap-js]` | ✅ Cap-js spawned |
| 9 | CAP deployment | `[stripe, cap-js]` | ❌ Postgres killed (6 turns idle) |
| 14 | CAP testing | `[cap-js]` | ❌ Stripe killed (7 turns idle) |

**Result**: 3 spells → 1 spell (67% token reduction from peak)

---

## 🛠️ CLI Commands

### `grimoire create`

Create new spell configurations with interactive wizard:

```bash
# Interactive mode (guided)
grimoire create

# With server validation (auto-generates steering)
grimoire create --probe

# Non-interactive mode
grimoire create -n postgres -t stdio --command npx --args "-y @org/server"

# With environment variables (for authenticated servers)
grimoire create -n github -t stdio \
  --command npx \
  --args "-y @modelcontextprotocol/server-github" \
  --env.GITHUB_PERSONAL_ACCESS_TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
```

**Features**:
- Validates MCP server works before creating config
- Auto-generates keywords from tool names
- Creates intelligent steering instructions
- Supports environment variables for authenticated servers
- Supports all transport types (stdio, SSE, HTTP)

### `grimoire list`

List all installed spells:

```bash
# Simple list
grimoire list

# Verbose output with details
grimoire list -v
```

**Output**:
```
📚 Spells in ~/.grimoire

  🔮 postgres                    [stdio ] (8 keywords)
  🔮 stripe                      [stdio ] (12 keywords)
  🔮 github-api                  [stdio ] (15 keywords)

✓ Total: 3 spells
```

### `grimoire validate`

Validate spell configuration:

```bash
grimoire validate ~/.grimoire/postgres.spell.yaml
```

**Checks**:
- Required fields (name, keywords, server.command/url)
- Field types and formats
- Minimum 3 keywords
- Transport-specific requirements

### `grimoire example`

Generate example templates:

```bash
# Output to stdout
grimoire example stdio

# Output to file
grimoire example stdio -o ~/.grimoire/myspell.spell.yaml
```

---

## 🎨 Using with AI Agents

### Claude Desktop

**How It Works**:
1. User asks: "Show users from database"
2. Claude sees `resolve_intent` tool (always available)
3. Claude calls: `resolve_intent({ query: "show users from database" })`
4. Grimoire spawns postgres, injects steering, returns tools
5. Claude receives `tools/list_changed` notification
6. Claude calls: `query_database({ query: "SELECT * FROM users" })`
7. After 5 turns idle → Grimoire kills postgres automatically

**Key Insight**: Claude doesn't know about Grimoire's complexity - it just sees tools appearing/disappearing via MCP protocol notifications.

### GitHub Copilot (VS Code)

Same workflow as Claude Desktop. Add to `settings.json`:

```json
{
  "servers": {
    "grimoire": {
      "command": "npx",
      "args": ["-y", "@crack-break-make/mcp-grimoire"]
    }
  }
}
```

**Note**: Copilot support depends on VS Code's MCP implementation maturity.

---

## 📊 Token Savings Breakdown

### Traditional MCP (Baseline)

```
All 50 servers spawned at startup:
- postgres tools (8 tools × 200 tokens) = 1,600 tokens
- stripe tools (12 tools × 200 tokens) = 2,400 tokens
- github tools (15 tools × 200 tokens) = 3,000 tokens
- ... 47 more servers
= ~40,000 tokens per conversation
```

**Cost**: ~$0.20 per query (GPT-4 pricing)

### Grimoire (Multi-Tier Strategy)

**Weighted Average Calculation**:
```
High confidence (70%):   1,000 tokens (selected tools only)
Medium confidence (20%): 1,500 tokens (3 alternatives + tools)
Low confidence (8%):     2,000 tokens (5 weak matches + tools)
No match (2%):             300 tokens (error + available spells)

Average = 0.70×1000 + 0.20×1500 + 0.08×2000 + 0.02×300
        = 700 + 300 + 160 + 6
        = 1,166 tokens
```

**Savings**: `(40,000 - 1,166) / 40,000 = 97.1%` 🎉

**Cost**: ~$0.006 per query (33× cheaper!)

---

## 🤝 Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### Getting Started

**1. Fork & Clone**

```bash
# Fork on GitHub, then clone
git clone https://github.com/YOUR_USERNAME/mcp-grimoire.git
cd mcp-grimoire

# Install dependencies
pnpm install
```

**2. Create a Branch**

```bash
git checkout -b feature/my-awesome-feature
```

**3. Make Changes**

Follow our coding principles:
- **YAGNI**: Implement only what's needed now
- **DRY**: Don't repeat yourself
- **SRP**: Single Responsibility Principle
- **SOLID**: Follow SOLID principles

See [CONTRIBUTING.md](./CONTRIBUTING.md) for comprehensive development guidelines.

**4. Run Tests**

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test:unit
pnpm test:integration

# Run with coverage
pnpm test:coverage
```

**5. Commit Changes**

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format
type(scope): short description

# Examples
feat(intent): add semantic search with embeddings
fix(lifecycle): prevent orphaned child processes
docs(readme): add contributing section
test(gateway): add multi-tier resolution tests
```

**6. Submit Pull Request**

```bash
git push origin feature/my-awesome-feature
```

Then open a PR on GitHub with:
- Clear description of changes
- Link to related issues
- Screenshots/examples if applicable

### Development Commands

```bash
# Development server (hot reload)
pnpm dev

# Build TypeScript
pnpm build

# Linting
pnpm lint          # Check for issues
pnpm lint:fix      # Auto-fix issues

# Formatting
pnpm format        # Format all files with Prettier

# Type checking
pnpm type-check    # Check TypeScript types
```

### Project Structure

```
mcp-grimoire/
├── src/
│   ├── core/                    # Domain models (types, configs)
│   ├── application/             # Business logic (intent, lifecycle)
│   ├── infrastructure/          # External systems (file, embeddings)
│   ├── presentation/            # Gateway server, tool routing
│   ├── cli/                     # CLI commands, templates
│   └── utils/                   # Shared utilities
├── tests/
│   └── fixtures/                # Test spell configurations
├── docs/
│   ├── adr/                     # Architecture Decision Records
│   ├── architecture.md          # System architecture
│   └── CLAUDE.md                # Development guide
└── examples/                    # Example spell configs
```

### Creating Architecture Decision Records (ADRs)

For significant architectural decisions, create an ADR:

```bash
# Use the adr-generator skill
/adr-generator --title "Use Hybrid Intent Resolution" --status proposed
```

See [docs/adr/README.md](./docs/adr/README.md) for guidelines.

### Running Integration Tests

```bash
# Requires test servers to be available
pnpm test:integration

# Run specific integration test
pnpm test src/presentation/__tests__/gateway-real-workflow.integration.test.ts
```

### Code Quality Standards

We maintain high code quality through:
- ✅ 80%+ test coverage (unit + integration)
- ✅ Strict TypeScript (`strict: true`)
- ✅ ESLint + Prettier formatting
- ✅ No `any` types (enforced by linter)
- ✅ Comprehensive error handling

### Need Help?

- 💬 [Join Discussions](https://github.com/crack-break-make/mcp-grimoire/discussions)
- 🐛 [Report Issues](https://github.com/crack-break-make/mcp-grimoire/issues)
- 📧 Email: [Mohan Sharma](mailto:mohan.sharma@sap.com)

---

## 📖 Documentation

- [Architecture Overview](./docs/architecture.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Architecture Decision Records](./docs/adr/README.md)
- [Intent Resolution Strategy](./docs/intent-resolution-solution.md)
- [Turn-Based Lifecycle](./docs/turn-based-lifecycle-explained.md)
- [Testing & Validation Plan](./docs/testing-validation-plan.md)

---

## 📝 License

ISC © [Mohan Sharma](https://github.com/mohan-sharma-au7)

---

## 🔗 Links

- **GitHub**: [crack-break-make/mcp-grimoire](https://github.com/crack-break-make/mcp-grimoire)
- **npm**: [@crack-break-make/mcp-grimoire](https://www.npmjs.com/package/@crack-break-make/mcp-grimoire)
- **Issues**: [Report bugs or request features](https://github.com/crack-break-make/mcp-grimoire/issues)
- **Discussions**: [Join the community](https://github.com/crack-break-make/mcp-grimoire/discussions)

---

**Made with ❤️ by [Mohan Sharma](https://github.com/mohan-sharma-au7)**

*Special thanks to the MCP community and all contributors!*
