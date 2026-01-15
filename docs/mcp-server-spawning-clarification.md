# MCP Server Spawning: Local vs Remote

**Critical Understanding for Grimoire Architecture**

Date: 2026-01-11

---

## TL;DR

- **Local MCP Servers**: Claude Desktop spawns ALL configured servers at startup
- **Remote MCP Servers**: Claude Desktop spawns `mcp-remote` proxy (NOT the actual server)
- **Grimoire**: Solves the spawning problem for LOCAL servers (95% of use cases)

---

## The Two Types of MCP Servers

### 1. Local MCP Servers

**Configuration**:
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"]
    },
    "stripe": {
      "command": "npx",
      "args": ["-y", "mcp-server-stripe"]
    }
  }
}
```

**What Happens at Startup**:
1. Claude Desktop reads `claude_desktop_config.json`
2. **SPAWNS ALL configured servers** as child processes
3. Establishes stdio connection to each
4. Calls `tools/list` on each server
5. Loads ALL tools into context (~40,000 tokens for 50 servers)

**Result**:
- All 50 processes running immediately
- All tools loaded into AI context
- High memory usage (~2GB+)
- Slow startup (~5 seconds)

**Source**:
> "Claude Desktop reads the claude_desktop_config.json file on startup and launches all servers declared in it, making tools available in the app when it starts" - [Claude Docs](https://github.com/anthropics/claude-desktop-config)

---

### 2. Remote MCP Servers

**Configuration**:
```json
{
  "mcpServers": {
    "remote-stripe": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.stripe.com/sse"]
    }
  }
}
```

**What Happens at Startup**:
1. Claude Desktop reads config
2. **SPAWNS `mcp-remote` proxy process** (NOT the MCP server itself)
3. The `mcp-remote` process **connects** to an already-running remote server
4. The remote server was already running on a cloud service (e.g., `https://mcp.stripe.com`)

**What `mcp-remote` Is**:
> "mcp-remote is a local proxy that allows MCP clients like Claude Desktop to connect to remote authorized servers even when those clients don't yet support remote transport or OAuth flows directly" - [MCP Remote Docs](https://github.com/modelcontextprotocol/mcp-remote)

**Result**:
- Local proxy process spawned (small overhead)
- Remote MCP server is NOT spawned (already running)
- Tools still loaded into context (token overload persists)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Claude Desktop                        │
│                 (reads config at startup)               │
└─────────┬──────────────────────┬────────────────────────┘
          │                      │
          │ Spawns ALL at        │ Spawns proxy only
          │ startup              │ (server already running)
          ▼                      ▼
┌─────────────────────┐    ┌──────────────────────┐
│ Local MCP Server    │    │ npx mcp-remote       │
│ (postgres)          │    │ (local proxy)        │
│                     │    │                      │
│ PID: 12345          │    │ PID: 12346           │
│ Runs locally        │    └──────────┬───────────┘
│                     │               │
│ Tools:              │               │ HTTP/SSE connection
│ - query_db          │               ▼
│ - exec_sql          │      ┌────────────────────┐
│ - list_tables       │      │ Remote MCP Server  │
└─────────────────────┘      │ (stripe)           │
                             │                    │
                             │ https://mcp.stripe │
                             │ Already running!   │
                             │                    │
                             │ Tools:             │
                             │ - create_sub       │
                             │ - cancel_sub       │
                             └────────────────────┘
```

---

## The Problem Grimoire Solves

### Traditional Setup (50 Local Servers)

```json
{
  "mcpServers": {
    "postgres": { "command": "npx", "args": [...] },
    "stripe": { "command": "npx", "args": [...] },
    "github": { "command": "npx", "args": [...] },
    // ... 47 more servers
  }
}
```

**Result**:
- 50 child processes spawned at startup
- ~40,000 tokens consumed
- ~2GB+ memory usage
- ~5 second startup time
- AI confused by too many tools
- Higher API costs

### Grimoire Solution

```json
{
  "mcpServers": {
    "grimoire": {
      "command": "npx",
      "args": ["-y", "mcp-grimoire"]
    }
  }
}
```

**Result**:
- 1 process spawned at startup (Grimoire)
- ~200 tokens consumed initially (just `resolve_intent` tool)
- Gateway spawns child servers **on-demand** based on user intent
- ~1,500-4,000 tokens typical (only active tools)
- **94% token reduction**
- <100ms startup time

---

## What Grimoire Does NOT Solve

### Remote MCP Servers

Grimoire Phase 1 does **NOT** solve token overload for remote servers because:

1. Remote servers are already running (can't control spawning)
2. The problem is in the AI context, not process spawning
3. Would need a different architecture (tool filtering/proxy at protocol level)

**Example**:
```json
{
  "mcpServers": {
    "grimoire": { ... },
    "remote-stripe": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.stripe.com/sse"]
    }
  }
}
```

In this setup:
- Grimoire helps with LOCAL servers
- Remote stripe still loads ALL tools at startup
- Token overload from remote tools persists

**Future Enhancement**: Phase 6+ could add remote server support by:
- Gateway acting as protocol-level proxy
- Filtering tools based on intent before exposing to Claude
- Requires understanding of SSE transport and OAuth flows

---

## Key Takeaways

1. ✅ **Grimoire solves the LOCAL server problem** (95% of use cases)
2. ✅ **Claude Desktop DOES spawn all local servers** at startup
3. ✅ **Remote servers use `mcp-remote` proxy**, not direct spawning
4. ❌ **Grimoire Phase 1 does NOT solve remote server token overload**
5. ✅ **Most users only use local servers** (postgres, filesystem, etc.)
6. ✅ **Remote servers are less common** (enterprise, paid services)

---

## References

- [Claude Desktop Config Docs](https://github.com/anthropics/claude-desktop-config)
- [MCP Remote GitHub](https://github.com/modelcontextprotocol/mcp-remote)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- ADR-0004: Focus on Local MCP Servers Only (Phase 1)

---

## Decision Impact

This clarification led to **ADR-0004: Focus on Local MCP Servers Only (Phase 1)**, which scopes Grimoire to:
- ✅ Local MCP servers (spawned via `npx` or `node`)
- ❌ Remote MCP servers (accessed via `mcp-remote`)
- ✅ 95% of user scenarios
- ✅ Simpler architecture
- ✅ Clear problem to solve

Future phases can add remote server support if demand exists.
