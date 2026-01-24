<div align="center">
  <img src="logo.png" alt="MCP Grimoire Logo" width="100%"/>
</div>

**Your intelligent spellbook for MCP servers** - Lazy loading orchestration with 97% token savings

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](.)
[![License](https://img.shields.io/badge/license-ISC-blue)](.)
[![npm version](https://img.shields.io/npm/v/@crack-break-make/mcp-grimoire)](https://www.npmjs.com/package/@crack-break-make/mcp-grimoire)

---

## 📺 Video Tutorial

**New to MCP Grimoire?** Watch this comprehensive walkthrough:

[![MCP Grimoire Tutorial](https://img.youtube.com/vi/1N0RN4f5EuA/maxresdefault.jpg)](https://youtu.be/1N0RN4f5EuA)

🎥 [**Watch on YouTube: MCP Grimoire - Complete Setup & Usage Guide**](https://youtu.be/1N0RN4f5EuA)

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

### Prerequisites

- **Node.js** 22+ (for running MCP servers)
- **Claude Desktop** or **GitHub Copilot** (Any AI agent with MCP support)
- Basic understanding of command-line tools

### Setup Workflow

```
1. Create Spells (Terminal)      →  2. Configure Grimoire (mcp.json)  →  3. Use in AI Agent
   npx mcp-grimoire create           Add to Claude/Copilot config          Ask questions naturally
   - Interactive wizard              - Grimoire runs as MCP gateway        - Servers spawn on-demand
   - Auto-probes server              - Debug with GRIMOIRE_DEBUG           - Auto-cleanup after 5 turns idle
```

### 1. Create Spells First (in Terminal)

**⚠️ IMPORTANT**: Always create your spells BEFORE configuring the MCP server!

Run the interactive wizard (recommended for all users):

```bash
npx @crack-break-make/mcp-grimoire@latest create
```

The wizard will:

- ✅ Guide you through each configuration step
- ✅ Automatically probe the server (validates connection)
- ✅ Auto-generate keywords from discovered tools
- ✅ Create intelligent steering instructions
- ✅ **Prevent spell creation if server can't be reached**
- ✅ Save spell to `(user.home)/.grimoire/yourspell.spell.yaml`

**Why probe matters**: If probing fails, the spell is NOT created (prevents broken configs).

**List your spells**: `npx @crack-break-make/mcp-grimoire@latest list`

### 2. Configure MCP Server (in Claude Desktop / GitHub Copilot)

**Only after creating spells**, add Grimoire to your MCP configuration.

📚 **Learn more about MCP configuration**:

- [VS Code Copilot MCP Setup](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [MCP Local Server Connection Guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

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

**Configuration Options**:

- Environment variable`GRIMOIRE_DEBUG`: Set to `"true"` to enable detailed logging (useful for troubleshooting)

**Restart Claude Desktop** - Grimoire MCP server is now running!

**For GitHub Copilot (VS Code)**, add to `.vscode/mcp.json`:

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

### 3. Manage Spells (CLI Commands)

**For advanced users**, CLI mode is available with command arguments:

```bash
# List installed spells
npx @crack-break-make/mcp-grimoire@latest list

# Validate a spell configuration
npx @crack-break-make/mcp-grimoire@latest validate ~/.grimoire/postgres.spell.yaml

# Show help
npx @crack-break-make/mcp-grimoire@latest --help
```

### 4. Use in Claude or Copilot

After restarting your AI agent, ask it to interact with your tools:

```
Show me all users from the database
```

Grimoire will automatically:

- Match your query to the right spell ("postgres"), if you configured it
- Spawn the MCP server with authentication
- Provide tools to Claude/Copilot
- Inject steering guidance for best practices

---

## 🎭 Dual-Mode Operation

MCP Grimoire intelligently detects how it's being called using a **3-step detection strategy**:

| Mode                | How It's Called                     | Purpose                           | Who Uses It                                      |
| ------------------- | ----------------------------------- | --------------------------------- | ------------------------------------------------ |
| **MCP Server**      | From `mcp.json` with stdio pipes    | Runs as MCP gateway for AI agents | Claude Desktop / Copilot spawns it automatically |
| **Interactive CLI** | From terminal with `create` command | Easy spell creation with wizard   | ⭐ **All users - recommended!**                  |
| **Advanced CLI**    | From terminal with other arguments  | Manage spell configurations       | ⚠️ Power users only                              |

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
│  - Authentication Handling           │
└──────┬──────────────┬────────────────┘
       │ stdio/http   │ sse/http
       │ + auth       │ + auth
┌──────▼─────┐  ┌────▼──────┐
│  Postgres  │  │  Stripe   │  ... (spawned on-demand)
│ MCP Server │  │ MCP Server│       with auth headers
└────────────┘  └───────────┘
```

### Key Components

**1. Intent Resolution (Hybrid Approach)**

- **Keyword Matching**: Exact and fuzzy matching on spell keywords
- **Semantic Search**: Embedding-based similarity (MessagePack storage)
- **Confidence Scoring**: 0.0-1.0 scale determines auto-spawn vs alternatives
- **Auto-generation**: Probe feature extracts keywords from tool names

**2. Process Lifecycle Management**

- **On-Demand Spawning**: Servers start only when confidence ≥ 0.85
- **Usage Tracking**: Every tool call updates `lastUsedTurn`
- **5-Turn Inactivity**: Automatic cleanup after 5 idle conversational turns
- **Graceful Shutdown**: SIGTERM → wait → SIGKILL if needed

**3. Authentication Pipeline**

- **Environment Expansion**: `${VAR}` syntax resolves from shell environment
- **Header Building**: Constructs Bearer, Basic, or custom auth headers
- **Secure Storage**: Credentials never logged literally (masked as `***`)
- **OAuth Support**: \ud83d\udea7 Planned for future release (not yet implemented)
  - For now, use Bearer tokens obtained manually for OAuth scenarios

**4. Tool Routing**

- **Transparent Proxying**: Routes tool calls to appropriate spawned servers
- **MCP Protocol**: Stdio, SSE, or HTTP transport based on spell config
- **Error Handling**: Graceful fallbacks with detailed error messages

**5. Steering Injection**

- **Best Practices**: Injects expert guidance into tool descriptions
- **Schema Context**: Embeds database schemas, API limits, security rules
- **Auto-generation**: Probe discovers tools and creates contextual steering

### Multi-Tier Intent Resolution

Grimoire uses a **confidence-based approach** to decide when to auto-spawn vs ask for clarification:

| Tier       | Confidence | Behavior                   | Example                                       |
| ---------- | ---------- | -------------------------- | --------------------------------------------- |
| **High**   | ≥ 0.85     | **Auto-spawn** immediately | "query postgres" → Instant activation         |
| **Medium** | 0.50-0.84  | **Return alternatives**    | "check database" → [postgres, mysql, mongodb] |
| **Low**    | 0.30-0.49  | **Weak matches**           | "analyze data" → 5 weak matches               |
| **None**   | < 0.30     | **Not found**              | "launch rocket" → Error + available spells    |

**70% of queries** hit high confidence (zero-friction UX)<br>
**20% of queries** hit medium confidence (AI agent picks from context)<br>
**10% of queries** need clarification

---

## 🧙 Creating Your First Spell

A "spell" is a YAML configuration file that tells Grimoire how to spawn and use an MCP server.

### Interactive Creation (Recommended for All Users)

**This is the primary way to create spells** - the wizard makes it easy:

```bash
# Run without installation (recommended)
npx @crack-break-make/mcp-grimoire create

# OR install globally first, then use short command
npm install -g @crack-break-make/mcp-grimoire
grimoire create
```

The interactive wizard guides you through:

1. **Spell name** (e.g., `postgres`, `github-api`, `weather-service`)
2. **Transport type** (stdio, SSE, or HTTP)
3. **Server configuration** (command/args for stdio, URL for HTTP/SSE)
4. **Authentication** (No auth, Bearer token, Basic auth)
5. **Environment variables** (for secrets and credentials)
6. **Server validation** (automatic - probes server and auto-generates config)

**Probing is automatic** - the wizard will:

- ✅ Connect to the server with your authentication
- ✅ Validate the server actually works
- ✅ Auto-generate keywords from discovered tool names
- ✅ Create intelligent steering instructions
- ✅ Discover tool schemas and parameters
- ✅ **Prevent spell creation if server can't be reached** (keeps your folder clean!)

### Manual Creation Examples (Advanced Users Only)

**⚠️ Most users should use interactive mode above.** Manual creation is for power users who want full control.

#### Example 1: Stdio Server (No Authentication)

Create `(user.home)/.grimoire/postgres.spell.yaml`:

```yaml
name: postgres
version: 1.0.0
description: PostgreSQL database operations

server:
  transport: stdio
  command: npx
  args:
    - '-y'
    - '@modelcontextprotocol/server-postgres'
  env:
    DATABASE_URL: postgresql://user:pass@localhost/db

keywords:
  - database
  - sql
  - query
  - postgres
  - tables
  - users

steering: |
  # Database Schema
  Tables:
    - users (id uuid, email string, created_at timestamp)
    - orders (id uuid, user_id uuid, total decimal)

  # Security Rules
  ALWAYS use parameterized queries:
    ✓ query_database('SELECT * FROM users WHERE id = $1', [id])
    ✗ 'SELECT * FROM users WHERE id = ' + id  (SQL INJECTION!)

  # Performance Tips
  - Use LIMIT to avoid scanning millions of rows
  - created_at is indexed, use for date filtering
```

#### Example 2: HTTP Server (Bearer Token Authentication)

Create `(user.home)/.grimoire/weather-api.spell.yaml`:

```yaml
name: weather-api
version: 1.0.0
description: Weather forecast and current conditions

server:
  transport: http
  url: http://localhost:8000/mcp
  auth:
    type: bearer
    token: ${WEATHER_API_KEY} # From environment variable

keywords:
  - weather
  - forecast
  - temperature
  - conditions
  - climate

steering: |
  # API Usage
  - Rate limit: 1000 calls/day
  - Forecast available: 7 days ahead
  - Historical data: Not available

  # Best Practices
  - Cache forecast results (updated hourly)
  - Use city name or coordinates
  - Check units: imperial (°F) or metric (°C)
```

#### Example 3: SSE Server (Custom Headers Authentication)

Create `(user.home)/.grimoire/github-api.spell.yaml`:

```yaml
name: github-api
version: 1.0.0
description: GitHub repository and issue management

server:
  transport: sse
  url: http://localhost:8001/sse
  headers:
    X-GitHub-Token: ${GITHUB_PERSONAL_ACCESS_TOKEN}
    Accept: application/vnd.github.v3+json

keywords:
  - github
  - repository
  - repo
  - issues
  - pull
  - requests
  - commits

steering: |
  # GitHub API Guidelines
  - Use full repository names: owner/repo
  - Rate limit: 5000 requests/hour (authenticated)
  - Always check permissions before write operations

  # Security Best Practices
  - Never hardcode tokens (use environment variables)
  - Use fine-grained tokens when possible
  - Minimum required scopes: repo, read:user
```

**Note**: For most real-world scenarios, use the interactive wizard (`create` without args) instead of manually writing YAML files. The examples above are for reference only.

### Environment Variables

For servers requiring authentication, **always use environment variable expansion** in your spell files:

```yaml
server:
  env:
    # Database connections
    DATABASE_URL: ${DATABASE_URL}
    POSTGRES_PASSWORD: ${DB_PASSWORD}

    # API keys
    GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PAT}
    WEATHER_API_KEY: ${WEATHER_KEY}
    STRIPE_SECRET_KEY: ${STRIPE_SECRET}

    # OAuth credentials
    OAUTH_CLIENT_ID: ${ENTERPRISE_CLIENT_ID}
    OAUTH_CLIENT_SECRET: ${ENTERPRISE_SECRET}
```

**Setting Environment Variables**:

Create a `.env` file at `(user.home)/.grimoire/.env` with your secrets:

```bash
# (user.home)/.grimoire/.env
GITHUB_PAT=ghp_your_token_here
WEATHER_KEY=your_weather_api_key
DATABASE_URL=postgresql://user:pass@localhost/db
DB_PASSWORD=your_secure_password
STRIPE_SECRET=sk_test_your_stripe_key
ENTERPRISE_CLIENT_ID=your_oauth_client_id
ENTERPRISE_SECRET=your_oauth_client_secret
```

**⚠️ Important**: The `.env` file is automatically loaded by MCP Grimoire at startup. Never commit this file to version control.

**Spell File Location** (all platforms):

- `(user.home)/.grimoire/` (follows AI Agents convention)
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

### ✅ SSE (Fully Supported)

For real-time MCP servers using Server-Sent Events:

```yaml
server:
  transport: sse
  url: https://your-sse-url/sse
```

### ✅ HTTP (Fully Supported)

For REST-like MCP servers:

```yaml
server:
  transport: http
  url: https://your-http-url/mcp
```

---

## 🔐 Authentication Support

Grimoire supports comprehensive authentication for secure MCP server connections:

### ✅ No Authentication

For public or local servers with no auth requirements:

```yaml
server:
  transport: stdio
  command: npx
  args: ['-y', '@modelcontextprotocol/server-filesystem']
  # No auth configuration needed
```

### ✅ API Key / Bearer Token

For servers requiring API key authentication (sent as `Authorization: Bearer` header):

```yaml
server:
  transport: http
  url: http://localhost:8000/mcp
  auth:
    type: bearer
    token: ${MY_API_KEY} # Environment variable expansion
```

**Common for**: Weather APIs, News services, Analytics platforms

### ✅ Basic Authentication

For servers using username/password authentication:

```yaml
server:
  transport: http
  url: http://localhost:8001/mcp
  auth:
    type: basic
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
```

**Note**: Basic auth is sent as a Bearer token (Base64-encoded `username:password`) for FastMCP server compatibility.

### ✅ Security Keys (Custom Headers)

For servers requiring custom authentication headers (e.g., GitHub, Brave):

```yaml
server:
  transport: sse
  url: http://localhost:8002/sse
  headers:
    X-GitHub-Token: ${GITHUB_TOKEN}
    X-Brave-Key: ${BRAVE_API_KEY}
    X-Custom-Auth: ${CUSTOM_SECRET}
```

**Common for**: GitHub API, Brave Search, custom enterprise APIs

### 🚧 OAuth 2.0 Flows (Planned for Future Release)

OAuth 2.0 authentication flows are **NOT YET IMPLEMENTED**. They are planned for a future release.

**Planned OAuth Flows** (not available yet):

#### OAuth 2.0 Client Credentials (Planned)

```yaml
server:
  transport: http
  url: http://localhost:8003/mcp
  auth:
    type: client_credentials
    clientId: ${OAUTH_CLIENT_ID}
    clientSecret: ${OAUTH_CLIENT_SECRET}
    tokenUrl: https://oauth.example.com/token
    scope: read:data write:data # Optional
```

**Status**: 🚧 **Planned** - Not yet implemented

#### OAuth 2.0 Private Key JWT (Planned)

```yaml
server:
  transport: http
  url: http://localhost:8004/mcp
  auth:
    type: private_key_jwt
    clientId: ${OAUTH_CLIENT_ID}
    privateKey: ${PRIVATE_KEY_PEM} # PEM format
    tokenUrl: https://oauth.example.com/token
    algorithm: RS256 # Optional: RS256 (default), RS384, RS512, ES256, ES384, ES512
```

**Status**: 🚧 **Planned** - Not yet implemented

#### OAuth 2.0 Static Private Key JWT (Planned)

For pre-generated JWT tokens with static assertions:

```yaml
server:
  transport: http
  url: http://localhost:8005/mcp
  auth:
    type: static_private_key_jwt
    clientId: ${OAUTH_CLIENT_ID}
    privateKey: ${PRIVATE_KEY_PEM}
    tokenUrl: https://oauth.example.com/token
    staticClaims:
      sub: service-account@example.com
      aud: https://api.example.com
```

**Status**: 🚧 **Planned** - Not yet implemented

#### OAuth 2.0 Authorization Code (Planned)

Interactive OAuth flow with browser-based authentication:

```yaml
server:
  transport: http
  url: http://localhost:8006/mcp
  auth:
    type: authorization_code
    clientId: ${OAUTH_CLIENT_ID}
    clientSecret: ${OAUTH_CLIENT_SECRET}
    authorizationUrl: https://oauth.example.com/authorize
    tokenUrl: https://oauth.example.com/token
    redirectUri: http://localhost:3000/callback
```

**Status**: 🚧 **Planned** - Requires browser interaction flow (future release)

### Summary of Auth Support

| Authentication Type      | Status     | Use Case                       |
| ------------------------ | ---------- | ------------------------------ |
| No Auth                  | ✅ Working | Public/local servers           |
| Bearer Token             | ✅ Working | API keys, access tokens        |
| Basic Auth               | ✅ Working | Username/password servers      |
| Security Keys            | ✅ Working | Custom headers (GitHub, Brave) |
| OAuth Client Credentials | 🚧 Planned | Server-to-server OAuth         |
| OAuth Private Key JWT    | 🚧 Planned | Enhanced security OAuth        |
| OAuth Authorization Code | 🚧 Planned | Interactive browser flow       |

**For now, use Bearer Token or Security Keys for most OAuth scenarios** by obtaining tokens manually.

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

| Turn | Action           | Active Spells                | Event                             |
| ---- | ---------------- | ---------------------------- | --------------------------------- |
| 1-3  | Database queries | `[postgres]`                 | ✅ Postgres spawned               |
| 4-7  | Process payments | `[postgres, stripe]`         | ✅ Stripe spawned                 |
| 8    | Deploy CAP app   | `[postgres, stripe, cap-js]` | ✅ Cap-js spawned                 |
| 9    | CAP deployment   | `[stripe, cap-js]`           | ❌ Postgres killed (6 turns idle) |
| 14   | CAP testing      | `[cap-js]`                   | ❌ Stripe killed (7 turns idle)   |

**Result**: 3 spells → 1 spell (67% token reduction from peak)

---

## 🛠️ CLI Commands (Run in Terminal)

**Important**: CLI commands run in your **terminal**, not in Claude Desktop. The MCP server runs inside Claude automatically.

### `npx @crack-break-make/mcp-grimoire@latest create`

Create new spell configurations with interactive wizard:

```bash
# Interactive mode (guided) - RECOMMENDED
npx @crack-break-make/mcp-grimoire@latest create

# With server validation (auto-generates steering)
npx @crack-break-make/mcp-grimoire@latest create --probe

# Non-interactive mode
npx @crack-break-make/mcp-grimoire@latest create \
  -n postgres \
  -t stdio \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-postgres"

# With environment variables (for authenticated servers)
npx @crack-break-make/mcp-grimoire@latest create \
  -n github \
  -t stdio \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-github" \
  --env "GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_PERSONAL_ACCESS_TOKEN}"
```

**Optional**: Install globally for shorter command:

```bash
npm install -g @crack-break-make/mcp-grimoire@latest

# Now use short form:
grimoire create
grimoire list
```

**Features**:

- Validates MCP server works before creating config
- Auto-generates keywords from tool names
- Creates intelligent steering instructions
- Supports environment variables for authenticated servers
- Supports all transport types (stdio, SSE, HTTP)

### `npx @crack-break-make/mcp-grimoire@latest list`

List all installed spells:

```bash
# Simple list
npx @crack-break-make/mcp-grimoire@latest list

# Verbose output with details
npx @crack-break-make/mcp-grimoire@latest list -v
```

**Output**:

```
📚 Spells in ~/.grimoire

  🔮 postgres                    [stdio ] (8 keywords)
  🔮 stripe                      [stdio ] (12 keywords)
  🔮 github-api                  [stdio ] (15 keywords)

✓ Total: 3 spells
```

### `npx @crack-break-make/mcp-grimoire@latest validate`

Validate spell configuration:

```bash
npx @crack-break-make/mcp-grimoire@latest validate ~/.grimoire/postgres.spell.yaml
```

**Checks**:

- Required fields (name, keywords, server.command/url)
- Field types and formats
- Minimum 3 keywords
- Transport-specific requirements

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
│   └── architecture.md          # System architecture
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
- 📧 Email: [Mohan Sharma](mailto:crack.break.make@gmail.com)

---

## ❓ FAQ & Troubleshooting

### AI Agent Not Showing `resolve_intent` Tool

**Problem**: GitHub Copilot (VS Code) or other AI agents cache tools aggressively. After Grimoire spawns and registers new tools, the AI agent may not see them immediately, including the critical `resolve_intent` tool.

**Solution**: Explicitly prompt the AI agent to refresh its tool list:

```
Please call the tools/list API to refresh available tools, then use the resolve_intent tool to search for [your query].
```

**Why this happens**:

- MCP clients cache tool lists for performance
- The `tools/list_changed` notification may not trigger immediate refresh in all clients
- This is a known limitation of some MCP client implementations (not a Grimoire bug)

**Alternative approach**: Restart the AI agent (e.g., reload VS Code window) to force tool cache refresh.

---

## 📖 Documentation

- [Architecture Overview](./docs/architecture.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Architecture Decision Records](./docs/adr/README.md)
- [Intent Resolution Strategy](./docs/intent-resolution-solution.md)
- [Turn-Based Lifecycle](./docs/turn-based-lifecycle-explained.md)

---

## 📝 License

ISC © [Mohan Sharma](https://github.com/crack-break-make)

---

## 🔗 Links

- **GitHub**: [crack-break-make/mcp-grimoire](https://github.com/crack-break-make/mcp-grimoire)
- **npm**: [@crack-break-make/mcp-grimoire](https://www.npmjs.com/package/@crack-break-make/mcp-grimoire)
- **Issues**: [Report bugs or request features](https://github.com/crack-break-make/mcp-grimoire/issues)
- **Discussions**: [Join the community](https://github.com/crack-break-make/mcp-grimoire/discussions)

---

**Made with ❤️ by [Mohan Sharma](https://github.com/crack-break-make)**

_Special thanks to the MCP community and all contributors!_
