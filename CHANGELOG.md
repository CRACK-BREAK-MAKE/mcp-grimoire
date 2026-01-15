# Changelog

All notable changes to MCP Grimoire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-14

### Added
- Initial release of MCP Grimoire
- **Lazy Loading**: Spawn MCP servers only when needed (94% token reduction)
- **Intent Resolution**: Multi-tier confidence-based resolution (keyword + semantic)
  - Tier 1 (≥0.85): Auto-spawn spell (high confidence)
  - Tier 2 (0.5-0.84): Return alternatives for AI to choose
  - Tier 3a (0.3-0.49): Suggest weak matches for clarification
  - Tier 3b (<0.3): List available spells
- **Spell File Hot-Reload**: Automatic detection and re-indexing of spell configuration changes
- **Automatic Directory Creation**: Creates ~/.grimoire on first run
- **Semantic Search**: AI-powered similarity matching using all-MiniLM-L6-v2 embeddings
- **Steering Injection**: Embeds expert guidance into tool descriptions
- **Turn-Based Lifecycle Management (ADR-0006)**: Automatic cleanup of inactive MCP servers
  - Global turn counter increments with each interaction
  - Spells idle for 5+ turns are automatically killed
  - Reduces active spells from 3→1 in typical workflows (67% reduction)
  - Prevents unbounded token accumulation
- **Persistence**: Lifecycle state survives restarts
  - Turn counter and usage tracking stored in MessagePack format
  - Orphaned child processes cleaned up on startup
  - Graceful handling of corrupted cache files
- **CLI Commands**:
  - `grimoire` or `grimoire start` - Start the gateway (default)
  - `grimoire create` - Create new spell configuration
  - `grimoire list` - List installed spells
  - `grimoire example <transport>` - Generate spell template
  - `grimoire validate <file>` - Validate spell YAML
- **Transport Support**: stdio, SSE (Server-Sent Events), HTTP
- **Comprehensive Testing**: 597 passing tests with 80%+ coverage
  - Unit tests with full mocking
  - Integration tests with real components
  - End-to-End tests with real MCP server processes
- **TypeScript**: Strict mode with full type safety
- **Cross-Platform**: Works on macOS, Linux, and Windows

### Documentation
- Complete Architecture Decision Records (ADRs)
- Development guidelines and coding principles
- Example spell configurations
- Quick start guide

[1.0.0]: https://github.com/crack-break-make/mcp-grimoire/releases/tag/v1.0.0
