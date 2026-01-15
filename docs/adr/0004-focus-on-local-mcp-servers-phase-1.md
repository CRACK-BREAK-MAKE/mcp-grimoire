# 4. Focus on Local MCP Servers Only (Phase 1)

Date: 2026-01-11

## Status

Accepted

## Context

MCP servers can be:
1. **Local**: Spawned by Claude Desktop (e.g., `npx @modelcontextprotocol/server-postgres`)
2. **Remote**: Already running, accessed via `npx mcp-remote https://...`

From research: Claude Desktop spawns ALL local servers at startup, but for remote servers it only spawns the `mcp-remote` proxy (server already running).

**Problem**: Token overload affects both local and remote servers differently.

## Decision

Grimoire Phase 1 will **ONLY support local MCP servers** that need spawning. Remote MCP servers are out of scope.

## Consequences

**Pros**:
- Simpler architecture (only manage child processes)
- Solves primary use case (95% of users use local servers)
- Addresses core problem (spawning overhead)
- Faster to implement and test

**Cons**:
- Doesn't help with remote server token overload
- Limited to local execution
- Remote servers still load all tools at startup

## Alternatives Considered

**Alternative**: Support both local and remote servers in Phase 1
- **Why rejected**: Remote servers require different architecture (protocol-level proxy), adds complexity, defers Phase 1 completion

## References

- [docs/mcp-server-spawning-clarification.md](../mcp-server-spawning-clarification.md)
- architecture.md - Lines 110-170 (only shows local child servers)
