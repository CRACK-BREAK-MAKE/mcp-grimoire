# Grimoire Architecture Document

**Single Source of Truth for Development**

Version: 1.1
Last Updated: January 15, 2026

---

## Executive Summary

Grimoire is an **intelligent MCP (Model Context Protocol) orchestrator** that solves two critical problems in AI-powered development tools:

1. **Context Overload**: Traditional MCP implementations load all tools at startup, consuming 40,000+ tokens and degrading AI performance
2. **Missing Expertise**: MCP tools lack contextual guidance, forcing users to manually prompt the AI with best practices

**Core Innovation**: Grimoire dynamically activates/deactivates MCP servers based on user intent while injecting expert guidance ("steering") directly into tool descriptions, achieving 94% token reduction while enhancing AI capabilities.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [System Architecture](#system-architecture)
4. [Core Components](#core-components)
5. [Data Structures](#data-structures)
6. [Intent Resolution System](#intent-resolution-system)
7. [Process Lifecycle Management](#process-lifecycle-management)
8. [CLI Architecture](#cli-architecture)
9. [Deployment Strategy](#deployment-strategy)
10. [Technology Stack](#technology-stack)
11. [Implementation Phases](#implementation-phases)
12. [Success Metrics](#success-metrics)

---

## Problem Statement

### Problem 1: Token Wastage (Context Overload)

**Current State:**

- Traditional MCP: All 50 tools loaded at startup
- Context consumption: ~40,000 tokens
- Result: Slower responses, higher costs, confused AI

**Impact:**

- AI struggles to choose correct tools
- Increased latency and API costs
- Limited scalability (can't add more tools)

### Problem 2: Missing Expertise

**Current State:**

- MCP tools provide no contextual guidance
- Users must manually prompt: "Use parameterized queries" or "Remember to handle errors"
- Expertise scattered across documentation

**Impact:**

- Inconsistent usage patterns
- Security vulnerabilities (SQL injection, etc.)
- Lower quality outputs

---

## Solution Overview

### High-Level Concept

```
User Query
    ↓
Claude analyzes intent
    ↓
Calls resolve_intent(query)
    ↓
Grimoire matches keywords/semantics
    ↓
Spawns relevant MCP child server
    ↓
Injects steering into tool descriptions
    ↓
Sends tools/list_changed notification
    ↓
Claude sees new tools + expert guidance
    ↓
Executes tasks with best practices
    ↓
After 5+ turns of inactivity → Kill child server
```

### Key Principles

1. **Lazy Loading**: Spawn MCP servers only when needed
2. **Aggressive Cleanup**: Kill inactive servers after 5 turns
3. **Steering Injection**: Embed expertise in tool descriptions
4. **Intent-Driven**: Keyword + semantic matching for discovery
5. **Transparent**: Claude doesn't know about gateway complexity

---

## System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Desktop                       │
│                                                         │
│  - Reads claude_desktop_config.json                     │
│  - Maintains conversation state                         │
│  - Displays responses to user                           │
└────────────────┬────────────────────────────────────────┘
                 │ stdio (MCP Protocol)
                 │
┌────────────────▼────────────────────────────────────────┐
│              POWER GATEWAY PROCESS                      │
│              (Main MCP Server)                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Power Discovery Engine                          │   │
│  │ - Scans ~/.grimoire/*.spell.yaml                   │   │
│  │ - Parses configurations                         │   │
│  │ - Stores in memory                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Intent Resolution System                        │   │
│  │ - Keyword matching (simple mode)                │   │
│  │ - Semantic search (advanced mode)               │   │
│  │ - Embedding model: all-MiniLM-L6-v2             │   │
│  │ - Vector store: In-memory array                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Process Lifecycle Manager                       │   │
│  │ - Spawns child MCP servers                      │   │
│  │ - Tracks active processes                       │   │
│  │ - Usage tracking (turn-based)                   │   │
│  │ - Cleanup logic (5-turn threshold)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Tool Router                                     │   │
│  │ - Forwards tool calls to children               │   │
│  │ - Returns results to Claude                     │   │
│  │ - Updates usage tracking                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Steering Injection Engine                       │   │
│  │ - Loads steering from .spell.yaml               │   │
│  │ - Injects into tool descriptions                │   │
│  │ - Format: "TOOL_DESC\n\n--- GUIDANCE ---\n..."  │   │
│  └─────────────────────────────────────────────────┘   │
└────┬────────────────────────┬───────────────────────────┘
     │ stdio                  │ stdio
     │                        │
┌────▼────────┐      ┌────────▼────────┐
│  Postgres   │      │    Stripe       │   ... (N child servers)
│ MCP Server  │      │  MCP Server     │
│             │      │                 │
│ Tools:      │      │ Tools:          │
│ - query_db  │      │ - create_sub    │
│ - exec_sql  │      │ - cancel_sub    │
└─────────────┘      └─────────────────┘
```

### Data Flow

**1. Startup Flow**

```
User launches Claude Desktop
  → Reads config.json
  → Spawns: npx -y mcp-grimoire
  → Gateway scans ~/.grimoire/*.spell.yaml
  → Stores configs in memory (no child processes yet)
  → MCP handshake with Claude
  → Claude sees 1 tool: resolve_intent
```

**2. Query Flow (Database Example)**

```
User: "Show users from last month"
  → Claude: resolve_intent("Show users from last month")
  → Gateway: Match keywords → "postgres"
  → Gateway: Spawn postgres child (200ms)
  → Gateway: Query child for tools
  → Gateway: Inject steering into descriptions
  → Gateway: Send tools/list_changed notification
  → Claude: tools/list
  → Gateway: Returns [resolve_intent, query_db, exec_sql, ...]
  → Claude: query_db("SELECT * FROM users WHERE...")
  → Gateway: Forward to postgres child
  → Postgres child: Execute query
  → Gateway: Return results
  → Claude: Present to user
```

**3. Cleanup Flow**

```
Turn 1-7: Using postgres tools
Turn 8: User asks about payments
  → resolve_intent("Create subscription...")
  → Match: "stripe"
  → Spawn stripe child
  → Check postgres: lastUsed=2, currentTurn=8, diff=6
  → KILL postgres child
  → Send tools/list_changed
  → Claude sees only stripe tools now
```

---

## Core Components

### 1. Power Configuration (.spell.yaml)

**Purpose**: Defines an MCP server package with metadata, steering, and activation keywords

**Location**: `~/.grimoire/*.spell.yaml`

**Schema**:

```yaml
# postgres.spell.yaml
name: postgres
version: 1.0.0
description: PostgreSQL database operations

# MCP Server Configuration
server:
  command: npx
  args:
    - '-y'
    - '@modelcontextprotocol/server-postgres'
  env:
    DATABASE_URL: postgresql://user:pass@localhost/db

# Intent Matching Keywords
keywords:
  - database
  - sql
  - query
  - users
  - tables
  - postgres

# Expert Guidance (Steering)
steering: |
  # Database Schema
  Tables:
    - users (id uuid, email string, created_at timestamp)
    - orders (id uuid, user_id uuid, amount decimal, status string)

  # Security Rules
  ALWAYS use parameterized queries:
    ✓ query_database('SELECT * FROM users WHERE id = $1', [id])
    ✗ 'SELECT * FROM users WHERE id = ' + id  (SQL INJECTION!)

  # Performance Tips
  - created_at is indexed, use for date filtering
  - Use INTERVAL for relative dates:
    WHERE created_at >= NOW() - INTERVAL '1 month'
  - LIMIT queries to avoid scanning millions of rows

  # Best Practices
  - Always SELECT specific columns, not SELECT *
  - Use transactions for multi-query operations
  - Check for NULL values in WHERE clauses
```

**Validation Rules**:

- `name`: Required, unique, alphanumeric + hyphens
- `keywords`: Required, array of 3-20 keywords
- `server.command`: Required, valid executable
- `steering`: Optional, max 5000 characters

### 2. Intent Resolution Engine

**Purpose**: Match user queries to appropriate Power packages

**Two Modes**:

#### Mode A: Simple Keyword Matching (Default)

```javascript
function resolveIntent(userQuery) {
  const query = userQuery.toLowerCase();
  const scores = [];

  for (const [powerName, config] of powers.entries()) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (query.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > 0) {
      scores.push({ name: powerName, score });
    }
  }

  // Return highest scoring power
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.name || null;
}
```

**Pros**: Fast (< 1ms), no dependencies, predictable  
**Cons**: Misses synonyms, requires exact keyword matches

#### Mode B: Semantic Search (Advanced)

```javascript
import { pipeline } from '@xenova/transformers';

// Initialize once at startup
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

// Pre-compute power embeddings at startup
async function initializePowerEmbeddings() {
  for (const [name, config] of powers.entries()) {
    const text = `${config.description} ${config.keywords.join(' ')}`;
    const embedding = await embed(text);
    config.embedding = embedding;
  }
}

// Compute cosine similarity
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magA * magB);
}

// Resolve intent using embeddings
async function resolveIntentSemantic(userQuery) {
  const queryEmbedding = await embed(userQuery);
  const scores = [];

  for (const [name, config] of powers.entries()) {
    const similarity = cosineSimilarity(queryEmbedding, config.embedding);
    scores.push({ name, score: similarity });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0.5 ? scores[0].name : null;
}

// Helper: Generate embedding
async function embed(text) {
  const output = await embedder(text, {
    pooling: 'mean',
    normalize: true,
  });
  return Array.from(output.data);
}
```

**Pros**: Understands synonyms ("db" → "database"), context-aware  
**Cons**: Slower (~20-50ms first run, ~5ms cached), 90MB model download

**Configuration**:

```yaml
# ~/.grimoire/gateway-config.yaml
intent_resolution:
  mode: semantic # or "keyword"
  embedding_model: Xenova/all-MiniLM-L6-v2
  similarity_threshold: 0.5
```

### 3. Process Lifecycle Manager

**Responsibilities**:

1. Spawn child MCP servers on-demand
2. Maintain stdio connections
3. Track usage per power
4. Kill inactive processes

**State Tracking**:

```javascript
class ProcessLifecycleManager {
  constructor() {
    this.activeSpells = new Map(); // powerName -> ChildProcess
    this.toolUsageTracker = new Map(); // powerName -> lastUsedTurn
    this.currentTurn = 0;
    this.INACTIVITY_THRESHOLD = 5; // turns
  }

  spawn(powerName, config) {
    const child = spawn(config.server.command, config.server.args, {
      env: { ...process.env, ...config.server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.activeSpells.set(powerName, child);
    this.toolUsageTracker.set(powerName, this.currentTurn);

    return child;
  }

  markUsed(powerName) {
    this.toolUsageTracker.set(powerName, this.currentTurn);
  }

  cleanup() {
    for (const [name, lastUsed] of this.toolUsageTracker.entries()) {
      const inactiveTurns = this.currentTurn - lastUsed;
      if (inactiveTurns >= this.INACTIVITY_THRESHOLD) {
        this.kill(name);
      }
    }
  }

  kill(powerName) {
    const child = this.activeSpells.get(powerName);
    if (child) {
      child.kill('SIGTERM');
      this.activeSpells.delete(powerName);
      this.toolUsageTracker.delete(powerName);
    }
  }
}
```

**Cleanup Triggers**:

- After every `resolve_intent` call
- After every tool execution
- Turn counter increments with each user message

### 4. Steering Injection Engine

**Purpose**: Inject expert guidance into tool descriptions

**Implementation**:

```javascript
function injectSteering(tools, steering) {
  return tools.map(tool => ({
    ...tool,
    description: `${tool.description}\n\n--- EXPERT GUIDANCE ---\n${steering}`
  }));
}

// Example output:
{
  name: "query_database",
  description: `Execute a SELECT query against PostgreSQL.

--- EXPERT GUIDANCE ---
# Database Schema
Tables:
  - users (id uuid, email string, created_at timestamp)
...
`,
  inputSchema: { ... }
}
```

**Token Impact**:

- Typical steering: 500-1000 tokens per power
- Only active when power is loaded
- Removed when power is cleaned up

---

## Data Structures

### SpellConfig

```typescript
interface SpellConfig {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  server: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
  steering?: string;
  embedding?: number[]; // Computed at startup if semantic mode
}
```

### ActivePower

```typescript
interface ActivePower {
  process: ChildProcess;
  transport: StdioClientTransport;
  tools: Tool[];
  lastUsedTurn: number;
}
```

### Tool (MCP Standard)

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

---

## Intent Resolution System

### Decision Matrix

| Scenario              | Keyword Match | Semantic Match     | Action         |
| --------------------- | ------------- | ------------------ | -------------- |
| "query database"      | ✅ postgres   | ✅ postgres (0.89) | Spawn postgres |
| "check my db"         | ❌ None       | ✅ postgres (0.72) | Spawn postgres |
| "create subscription" | ✅ stripe     | ✅ stripe (0.91)   | Spawn stripe   |
| "deploy to cloud"     | ✅ aws        | ✅ aws (0.85)      | Spawn aws      |
| "hello"               | ❌ None       | ❌ None (0.12)     | Return error   |

### Embedding Model Choice

**Selected: `Xenova/all-MiniLM-L6-v2`**

**Specifications**:

- Model size: 90 MB (ONNX)
- Embedding dimension: 384
- Max sequence length: 256 tokens
- Performance: ~20ms first run, ~5ms subsequent
- Memory: ~200 MB loaded in Node.js

**Why this model?**

1. ✅ **Lightweight**: 90MB fits in npx package
2. ✅ **Fast**: Suitable for real-time intent resolution
3. ✅ **Proven**: 774k+ downloads/month on HuggingFace
4. ✅ **Node.js native**: Works with transformers.js (no Python)
5. ✅ **Good accuracy**: Trained on 1B+ sentence pairs

**Alternative Considered**:

- Google's EmbeddingGemma (308M params, <200MB RAM, but newer/less proven)
- Nomic Embed (137M params, but larger download)

### Fallback Strategy

```javascript
async function resolveIntent(query) {
  // Try semantic first (if enabled)
  if (config.mode === 'semantic') {
    const result = await resolveIntentSemantic(query);
    if (result) return result;
  }

  // Fallback to keyword matching
  return resolveIntentKeyword(query);
}
```

---

## Process Lifecycle Management

### Spawn Sequence

```
1. resolve_intent("query users") called
2. Match found: "postgres"
3. Check if already active: activeSpells.has("postgres")
4. If not active:
   a. Read postgres.spell.yaml
   b. spawn(config.server.command, config.server.args)
   c. Establish stdio transport
   d. MCP initialize handshake
   e. Call child's tools/list
   f. Store tools in memory
5. toolUsageTracker.set("postgres", currentTurn)
6. Send notification: tools/list_changed
7. Return: { status: "activated", tools: [...] }
```

**Timing**:

- Cold start: ~200-300ms (process spawn + MCP handshake)
- Warm (already active): ~5ms (just update tracking)

### Cleanup Sequence

```
1. User sends message (turn N)
2. currentTurn++
3. For each active power:
   a. Calculate: inactiveTurns = currentTurn - lastUsedTurn
   b. If inactiveTurns >= 5:
      i. child.kill('SIGTERM')
      ii. activeSpells.delete(powerName)
      iii. toolUsageTracker.delete(powerName)
      iv. Send notification: tools/list_changed
```

**Edge Cases**:

- **Multi-power workflows**: Both postgres + stripe active simultaneously
- **Rapid switching**: User alternates topics every 2 turns → frequent spawn/kill
- **Long-running operations**: Mark power as "used" while waiting for child response

---

## CLI Architecture

### Overview

The Grimoire CLI provides a comprehensive set of commands for managing spell configurations. It follows modern CLI best practices with interactive wizards, real-time validation, and colorful terminal output.

**Design Philosophy**:
- **User-friendly**: Interactive mode by default with guided workflows
- **Automation-friendly**: Non-interactive mode for CI/CD
- **Zero dependencies**: Uses Node.js built-in `readline` (no external prompt libraries)
- **Fast startup**: <100ms from invocation to first prompt
- **Self-documenting**: Clear help text and examples

### CLI Commands

#### 1. `grimoire create` - Interactive Spell Creation Wizard

**Purpose**: Guide users through creating spell configurations with optional MCP server validation

**Features**:
- Step-by-step wizard with real-time validation
- Support for all transport types (stdio, SSE, HTTP)
- **Server probing**: Connects to MCP server to validate and auto-generate content
- Auto-generates keywords from tool names (max 15)
- Creates intelligent steering instructions based on domain detection

**Usage**:
```bash
# Interactive mode (default)
grimoire create

# With server probing (recommended)
grimoire create --probe

# Non-interactive mode
grimoire create -n postgres -t stdio --command npx --args "-y @org/server"
```

**Interactive Flow**:
1. **Spell Name**: Validates format `^[a-z0-9][a-z0-9-]*$`
2. **Transport Type**: Choose from stdio, SSE, or HTTP with descriptions
3. **Server Configuration**:
   - stdio: Command and arguments (e.g., `npx -y @org/server`)
   - SSE/HTTP: Server URL (e.g., `http://localhost:3000/sse`)
4. **Server Probing** (optional):
   - Tests if server starts correctly
   - Retrieves tools list via MCP protocol
   - Auto-generates keywords from tool names
   - Creates steering instructions

**Server Probing Algorithm**:
```javascript
async function probeMCPServer(config) {
  // 1. Create MCP client based on transport
  const client = createClient(config);

  // 2. Connect with timeout (30s for stdio, 10s for remote)
  await client.connect({ timeout: 30000 });

  // 3. Request tools list via MCP protocol
  const tools = await client.request('tools/list');

  // 4. Generate steering from tools
  const steering = generateSteeringFromTools(config.name, tools);

  // 5. Extract keywords from tool names
  const keywords = extractKeywordsFromTools(tools);

  return { success: true, tools, steering, keywords };
}
```

**Auto-Generated Steering Structure**:
1. **When to Use** (30-50 words): Use cases inferred from spell name and tools
2. **Available Tools** (200 words max): One-line descriptions with required parameters
3. **Recommended Workflow** (3 steps): Discovery → Action → Verify
4. **Best Practices** (70-100 words): Domain-specific guidance

**Domain Detection** (for best practices):
- **Database**: postgres, mysql, sql → SQL injection warnings, parameterized queries
- **API**: api, rest, http → Rate limiting, error handling
- **Filesystem**: file, fs, read, write → Path traversal, permissions
- **Search**: search, find, list → Pagination, filtering
- **General**: Fallback for unrecognized patterns

**Graceful Degradation**:
- **stdio failures**: Non-fatal (command might not be installed yet)
- **SSE/HTTP failures**: Fatal (no point creating spell for unreachable server)
- **Network timeouts**: Clear error messages with suggestions

#### 2. `grimoire list` - Spell Discovery

**Purpose**: Display all installed spell configurations

**Usage**:
```bash
# Simple list (default)
grimoire list

# Verbose output with full details
grimoire list -v
```

**Output Format**:
```
📚 Spells in ~/.grimoire

  🔮 postgres                    [stdio ] (8 keywords)
  🔮 stripe                      [stdio ] (12 keywords)
  🔮 github-api                  [stdio ] (15 keywords)

✓ Total: 3 spells
```

**Verbose Mode**:
```
🔮 postgres
   File: postgres.spell.yaml
   Version: 1.0.0
   Transport: stdio
   Description: PostgreSQL database operations
   Keywords: database, sql, query, postgres, table...
```

#### 3. `grimoire validate` - Configuration Validation

**Purpose**: Validate spell YAML files for correctness

**Usage**:
```bash
grimoire validate ~/.grimoire/postgres.spell.yaml
```

**Validation Rules**:
- **Required fields**: name, version, keywords, server.command/url
- **Field types**: string, array, object
- **Minimum keyword count**: 3
- **Transport-specific**: stdio requires command, SSE/HTTP require URL
- **Name format**: `^[a-z0-9][a-z0-9-]*$`

**Exit Codes**:
- `0`: Success (no errors)
- `1`: Validation failed (has errors)

**Output**:
```bash
✓ Validation Passed: postgres.spell.yaml
  No errors or warnings found.

# Or

✗ Validation Failed: invalid.spell.yaml
  ✗ Missing required field: keywords (must be array)
  ✗ Field "keywords" must have at least 3 items
```

#### 4. `grimoire example` - Template Generation

**Purpose**: Generate example spell templates for each transport type

**Usage**:
```bash
# Output to stdout
grimoire example stdio

# Output to file
grimoire example stdio -o ~/.grimoire/myspell.spell.yaml
```

**Templates**:
- **stdio**: Local MCP servers (most common)
- **SSE**: Real-time streaming servers
- **HTTP**: REST-like HTTP servers

### CLI Architecture Components

#### Directory Structure

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
│   ├── stdio-template.ts       # Stdio transport template
│   ├── sse-template.ts         # SSE transport template
│   ├── http-template.ts        # HTTP transport template
│   └── index.ts                # Export all templates
│
└── utils/                       # CLI utilities
    ├── mcp-probe.ts            # Server validation (463 lines)
    ├── prompts.ts              # Interactive prompts (346 lines)
    └── index.ts                # Export utilities
```

#### MCP Probe Utility

**Purpose**: Validate MCP servers and auto-generate spell content

**Core Functions**:

1. **`probeMCPServer(config, timeoutMs)`**
   - Creates MCP client based on transport type
   - Connects with configurable timeout (30s for stdio, 10s for remote)
   - Retrieves tools list via MCP `tools/list` request
   - Returns success status, tools, and server info

2. **`generateSteeringFromTools(spellName, tools, serverInfo)`**
   - Auto-generates concise steering instructions (<400 words)
   - Follows SRP with helper functions
   - Generates 4 sections: When to Use, Tools, Workflow, Best Practices
   - Domain-specific guidance based on tool patterns

3. **`extractKeywordsFromTools(tools, spellName)`**
   - Extracts keywords from tool names (e.g., `query_database` → `['query', 'database']`)
   - Includes spell name components
   - Deduplicates and limits to 15 keywords
   - Ensures minimum 3 keywords

**Error Handling**:

```typescript
// Connection errors
✗ Cannot connect to MCP server
  Error: Command not found: npx

  Suggestions:
  - Install Node.js and npm
  - Verify PATH includes npm bin directory

// Timeout errors
✗ Connection timeout (30s)
  The server took too long to respond.

  Suggestions:
  - Check if server requires npm install (first run is slow)
  - Verify network connectivity for SSE/HTTP servers

// Invalid response
✗ Invalid MCP response
  Server did not respond with valid MCP protocol.

  Suggestions:
  - Verify the command spawns an MCP server
  - Check server logs for errors
```

#### Interactive Prompts Utility

**Purpose**: Lightweight interactive CLI prompts using Node.js built-in `readline`

**Functions**:

1. **`text(options)`** - Text input with validation
   ```typescript
   const name = await text({
     message: 'What is your name?',
     default: 'anonymous',
     validate: (value) => value.length > 0 || 'Name is required'
   });
   ```

2. **`select(options)`** - Multiple choice selection
   ```typescript
   const transport = await select({
     message: 'Choose transport',
     options: [
       { label: 'stdio', value: 'stdio', description: 'Standard I/O' },
       { label: 'sse', value: 'sse', description: 'Server-Sent Events' }
     ],
     default: 'stdio'
   });
   ```

3. **`confirm(options)`** - Yes/no confirmation
   ```typescript
   const shouldProbe = await confirm({
     message: 'Probe the server?',
     default: true
   });
   ```

4. **`Spinner`** - Loading animation
   ```typescript
   const spinner = new Spinner();
   spinner.start('Probing server...');
   // ... do work ...
   spinner.stop('Success!');
   ```

**Formatting Functions**:
- `formatError(msg)` - Red ✗ prefix
- `formatSuccess(msg)` - Green ✓ prefix
- `formatWarning(msg)` - Yellow ⚠️ prefix
- `formatInfo(msg)` - Cyan ℹ prefix
- `bold(text)`, `dim(text)` - Text styling

**Features**:
- ANSI color support detection (TTY check)
- Graceful degradation for non-TTY environments
- Input validation with retry
- No external dependencies

### CLI Testing Strategy

**Unit Tests**:
- `create.test.ts`: Test wizard logic with mocked prompts
- `list.test.ts`: Test spell discovery
- `validate.test.ts`: Test validation rules
- `mcp-probe.test.ts`: Test probing logic with mocked MCP client
- `prompts.test.ts`: Test prompt utilities

**Integration Tests**:
- `cli.comprehensive.integration.test.ts`: End-to-end CLI workflows
- Test all transport types (stdio, SSE, HTTP)
- Test with real test servers (`tests/fixtures/test-servers/`)

**Coverage Target**: 80%+ for CLI code

### CLI Design Decisions

**Decision: Use Node.js `readline` instead of external libraries**

**Why**:
- Zero dependencies reduces package size
- Fast startup (<100ms)
- No ESM/CommonJS conflicts
- Sufficient for our needs (text, select, confirm)

**Trade-off**: Less features than `inquirer`, but we don't need them

**Decision: Server probing is optional**

**Why stdio lenient, SSE/HTTP strict**:
- **stdio**: Command might not be installed yet (e.g., `npx` will download on first use)
- **SSE/HTTP**: Server must be reachable, otherwise spell is useless

**Decision: Auto-generate steering from tools**

**Why**:
- Dramatically reduces manual work
- Ensures consistency across spells
- Improves intent resolution (keywords match tool names)
- Users can still edit generated steering

**Decision: ~/.grimoire for all platforms**

**Why**:
- Follows Claude Code convention (`~/.claude`)
- Cross-platform simplicity (no `env-paths` needed)
- Easy to find, backup, and version control
- Standard for CLI tools (npm, docker, kubectl)

---

## Deployment Strategy

### Installation Flow

```bash
# User installs globally via npx
npx -y mcp-grimoire install

# Or adds to Claude Desktop config manually:
# ~/.config/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "grimoire": {
      "command": "npx",
      "args": ["-y", "mcp-grimoire"]
    }
  }
}
```

### Power Installation

**Option 1: Manual YAML**

```bash
# User creates ~/.grimoire/postgres.spell.yaml
# (see schema above)
```

**Option 2: CLI Helper**

```bash
npx mcp-grimoire add postgres \
  --command "npx @modelcontextprotocol/server-postgres" \
  --keywords "database,sql,query" \
  --env DATABASE_URL="postgresql://..."
```

**Option 3: Power Marketplace (Future)**

```bash
npx mcp-grimoire install-power nomic/postgres-power
# Downloads pre-configured .spell.yaml from registry
```

### Package Structure

```
mcp-grimoire/
├── package.json
├── index.js              # Main entry point
├── lib/
│   ├── gateway.js        # MCP server implementation
│   ├── discovery.js      # Power scanning
│   ├── intent.js         # Resolution engine
│   ├── lifecycle.js      # Process management
│   ├── steering.js       # Injection engine
│   └── embeddings.js     # Semantic search (optional)
├── bin/
│   └── cli.js            # CLI commands (install, add, list)
└── models/
    └── all-MiniLM-L6-v2/ # Bundled embedding model (if semantic)
```

### NPM Package Configuration

```json
{
  "name": "mcp-grimoire",
  "version": "1.0.0",
  "bin": {
    "mcp-grimoire": "./bin/cli.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "yaml": "^2.0.0"
  },
  "optionalDependencies": {
    "@xenova/transformers": "^2.17.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Note**: Embedding model auto-downloads on first run if semantic mode enabled

---

## Technology Stack

### Core Dependencies

| Component       | Technology                  | Version  | Purpose                     |
| --------------- | --------------------------- | -------- | --------------------------- |
| MCP SDK         | `@modelcontextprotocol/sdk` | 1.0.0    | MCP protocol implementation |
| YAML Parser     | `yaml`                      | 2.0.0    | Parse .spell.yaml files     |
| Process Manager | Node.js `child_process`     | Built-in | Spawn MCP servers           |
| Embedding Model | `@xenova/transformers`      | 2.17.0   | Semantic search (optional)  |
| Vector Search   | In-memory array             | N/A      | Cosine similarity           |

### Embedding Model Details

**Package**: `@xenova/transformers`  
**Model**: `Xenova/all-MiniLM-L6-v2`  
**Download**: Auto-fetch from HuggingFace on first run  
**Cache**: `~/.cache/huggingface/` (standard location)  
**Initialization**:

```javascript
import { pipeline } from '@xenova/transformers';

const embedder = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2',
  { quantized: true } // Smaller size, minimal accuracy loss
);
```

**Performance Optimization**:

- Pre-compute power embeddings at startup
- Cache user query embeddings (LRU cache, max 100 entries)
- Use quantized model (reduces size from 90MB → 23MB)

---

## Implementation Phases

### Phase 1: Core Gateway (MVP)

**Duration**: 2 weeks  
**Features**:

- [x] Power discovery (.spell.yaml scanning)
- [x] Keyword-based intent resolution
- [x] Process spawning/killing
- [x] Tool routing
- [x] Basic steering injection
- [x] `resolve_intent` tool

**Deliverable**: Working gateway with keyword matching

### Phase 2: Semantic Search

**Duration**: 1 week  
**Features**:

- [x] Integrate transformers.js
- [x] Download and cache embedding model
- [x] Pre-compute power embeddings
- [x] Cosine similarity matching
- [x] Fallback to keyword matching

**Deliverable**: Enhanced intent resolution

### Phase 3: Lifecycle Management

**Duration**: 1 week  
**Features**:

- [x] Turn-based tracking
- [x] 5-turn inactivity threshold
- [x] Automatic cleanup
- [x] Graceful process termination
- [x] tools/list_changed notifications

**Deliverable**: Efficient memory management

### Phase 4: CLI & UX

**Duration**: 1 week  
**Features**:

- [x] `npx mcp-grimoire install`
- [x] `add` command for creating powers
- [x] `list` command for viewing installed powers
- [x] `test` command for validating configurations
- [x] Error messages and logging

**Deliverable**: User-friendly installation

### Phase 5: Testing & Polish

**Duration**: 1 week  
**Features**:

- [x] Unit tests (intent resolution, lifecycle)
- [x] Integration tests (full workflows)
- [x] Performance benchmarks
- [x] Documentation (README, examples)
- [x] Error handling improvements

**Deliverable**: Production-ready v1.0.0

---

## Success Metrics

### Performance Targets

| Metric                    | Target | Measurement                   |
| ------------------------- | ------ | ----------------------------- |
| Token reduction           | >90%   | Compare to traditional MCP    |
| Intent resolution latency | <50ms  | Semantic mode, cached         |
| Cold spawn time           | <300ms | Process spawn + MCP handshake |
| Memory footprint          | <500MB | Gateway + 2 active children   |
| Cleanup efficiency        | 100%   | No orphaned processes         |

### Quality Metrics

| Metric                   | Target | Measurement                    |
| ------------------------ | ------ | ------------------------------ |
| Intent accuracy          | >95%   | Correct power selected         |
| Steering injection       | 100%   | Always appears in descriptions |
| Process reliability      | >99.9% | No crashes or hangs            |
| NPM installation success | >95%   | First-time installs work       |

### User Experience

| Metric            | Target       | Measurement                     |
| ----------------- | ------------ | ------------------------------- |
| Setup time        | <5 min       | From install to first power     |
| Power creation    | <2 min       | Manual YAML creation            |
| Perceived latency | Unnoticeable | Users don't see spawning delays |
| Claude behavior   | Natural      | AI doesn't mention gateway      |

---

## Security Considerations

### Process Isolation

- Each child MCP server runs in separate process
- No shared memory between children
- Environment variables isolated per power

### Input Validation

- Validate all .spell.yaml files on startup
- Sanitize user queries before embedding
- Prevent command injection in `server.command`

### Resource Limits

- Max 10 active child processes simultaneously
- Max 5000 characters for steering
- Max 20 keywords per power
- Kill processes after 1 hour of activity (safety)

---

## Future Enhancements

### Phase 6: Advanced Features

1. **Power Marketplace**: Centralized registry for sharing powers
2. **Auto-steering generation**: Use LLM to generate steering from docs
3. **Analytics**: Track which powers are most used
4. **Multi-user support**: Shared spell configurations
5. **Web interface**: GUI for managing powers

### Phase 7: Enterprise Features

1. **Access control**: Role-based power access
2. **Audit logging**: Track all tool usage
3. **Remote MCP servers**: Support network-based servers
4. **High availability**: Redundant gateway processes
5. **Telemetry**: Usage metrics and error reporting

---

## Appendix A: Example Power Configurations

### Example 1: PostgreSQL

```yaml
name: postgres
version: 1.0.0
description: PostgreSQL database operations and queries

server:
  command: npx
  args:
    - '-y'
    - '@modelcontextprotocol/server-postgres'
  env:
    DATABASE_URL: postgresql://localhost/mydb

keywords:
  - database
  - sql
  - query
  - users
  - postgres
  - tables
  - select
  - insert

steering: |
  # Schema
  - users (id, email, created_at)
  - orders (id, user_id, amount, status)

  # Security: Always use parameterized queries
  # Performance: Use indexes for date filters
  # Best practice: LIMIT results, handle NULLs
```

### Example 2: Stripe Payments

```yaml
name: stripe
version: 1.0.0
description: Stripe payment processing and subscription management

server:
  command: npx
  args:
    - '-y'
    - 'mcp-server-stripe'
  env:
    STRIPE_API_KEY: sk_test_...

keywords:
  - payment
  - stripe
  - subscription
  - charge
  - customer
  - invoice

steering: |
  # Always set idempotency keys for safety
  # Test mode uses sk_test_, production uses sk_live_
  # Handle webhooks asynchronously
  # Verify signatures on webhook events
```

---

## Appendix B: Glossary

- **MCP**: Model Context Protocol - Standard for AI tool integration
- **Power**: A package combining MCP server + metadata + steering
- **Steering**: Expert guidance injected into tool descriptions
- **Intent Resolution**: Matching user query to appropriate power
- **Child Server**: MCP server spawned by gateway
- **Turn**: One user message + AI response cycle
- **Cleanup**: Killing inactive child processes
- **Token**: Unit of text processed by AI (≈4 chars)

---

## Document Control

**Version History**:

- v1.0 (2026-01-10): Initial architecture document
- v1.1 (2026-01-15): Added comprehensive CLI Architecture section with server probing details

**Review Schedule**: Monthly or after major changes

**Stakeholders**:

- Development Team
- Product Management
- DevOps
- Documentation Team

**Contact**: [Project maintainer email/Discord]

---

**End of Architecture Document**
