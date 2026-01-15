# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for MCP Grimoire.

## Index

| ADR                                                           | Title                                                           | Status   | Date       |
| ------------------------------------------------------------- | --------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-record-architecture-decisions.md)                 | Record Architecture Decisions                                   | Accepted | 2026-01-11 |
| [0002](0002-use-typescript-for-development.md)                | Use TypeScript for Development                                  | Accepted | 2026-01-11 |
| [0003](0003-use-mcp-sdk-for-gateway-server.md)                | Use MCP SDK for Gateway Server Implementation                   | Accepted | 2026-01-11 |
| [0004](0004-focus-on-local-mcp-servers-phase-1.md)            | Focus on Local MCP Servers Only (Phase 1)                       | Accepted | 2026-01-11 |
| [0005](0005-keyword-based-intent-resolution-yagni.md)         | Keyword-Based Intent Resolution First (YAGNI)                   | Accepted | 2026-01-11 |
| [0006](0006-five-turn-inactivity-threshold.md)                | 5-Turn Inactivity Threshold for Process Cleanup                 | Accepted | 2026-01-11 |
| [0007](0007-messagepack-embedding-storage.md)                 | Use MessagePack for Embedding Storage                           | Accepted | 2026-01-11 |
| [0008](0008-use-simple-grimoire-path.md)                      | Use ~/.grimoire Path (Claude Code Convention)                   | Accepted | 2026-01-13 |
| [0009](0009-multi-tier-confidence-based-intent-resolution.md) | Multi-Tier Confidence-Based Intent Resolution                   | Accepted | 2026-01-11 |
| [0010](0010-cli-architecture-and-server-probing.md)           | CLI Architecture with Interactive Wizard and Server Probing     | Accepted | 2026-01-15 |
| [0011](0011-http-sse-authentication-multi-tier-strategy.md)   | Implement Multi-Tier Authentication for HTTP/SSE Transports     | Proposed | 2026-01-15 |
| [0012](0012-bearer-token-authentication-first.md)             | Prioritize Bearer Token Authentication Over OAuth               | Proposed | 2026-01-15 |
| [0013](0013-environment-variable-expansion-for-secrets.md)    | Use Environment Variable Expansion for Secrets in Spell Configs | Proposed | 2026-01-15 |
| [0014](0014-three-phase-oauth-implementation.md)              | Three-Phase OAuth Implementation Strategy                       | Proposed | 2026-01-15 |

## By Category

### Process & Methodology

- ADR-0001: Record Architecture Decisions

### Technology Choices

- ADR-0002: Use TypeScript for Development
- ADR-0003: Use MCP SDK for Gateway Server Implementation
- ADR-0008: Use ~/.grimoire Path (Claude Code Convention)

### Architecture & Design

- ADR-0004: Focus on Local MCP Servers Only (Phase 1)
- ADR-0005: Keyword-Based Intent Resolution First (YAGNI)
- ADR-0006: 5-Turn Inactivity Threshold for Process Cleanup
- ADR-0009: Multi-Tier Confidence-Based Intent Resolution
- ADR-0010: CLI Architecture with Interactive Wizard and Server Probing

### Security & Authentication

- ADR-0011: Implement Multi-Tier Authentication for HTTP/SSE Transports
- ADR-0012: Prioritize Bearer Token Authentication Over OAuth
- ADR-0013: Use Environment Variable Expansion for Secrets in Spell Configs
- ADR-0014: Three-Phase OAuth Implementation Strategy

### Infrastructure & Storage

- ADR-0007: Use MessagePack for Embedding Storage
- ADR-0008: Use ~/.grimoire Path (Claude Code Convention)

## Status

- **Accepted**: 10
- **Proposed**: 4
- **Deprecated**: 0
- **Superseded**: 0
