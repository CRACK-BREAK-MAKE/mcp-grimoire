# Changelog

All notable changes to MCP Grimoire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-01-24

### Added

- YouTube video tutorial in README
- Security masking for sensitive data in logs (Bearer tokens, API keys, Basic auth)

### Fixed

- Environment variable setup documentation (corrected to use `~/.grimoire/.env`)

## [1.0.0] - 2026-01-24

### Added

- **Initial Production Release** of MCP Grimoire - Your intelligent spellbook for MCP servers
- **97% Token Reduction**: From 40,000 → 1,166 tokens average (~$0.20 → ~$0.006 per query)
  - Lazy loading spawns servers only when needed
  - Aggressive cleanup after 5 turns of inactivity
  - Zero overhead when spell is dormant

- **Smart Intent Resolution**: Multi-tier confidence-based matching (keyword + semantic)
  - Tier 1 (≥0.85): Auto-spawn spell instantly (70% of queries)
  - Tier 2 (0.5-0.84): Return alternatives for AI to choose (20% of queries)
  - Tier 3a (0.3-0.49): Suggest weak matches for clarification (10% of queries)
  - Tier 3b (<0.3): List all available spells

- **Transport Support**: Full MCP protocol coverage
  - stdio: Standard Input/Output (most common)
  - SSE: Server-Sent Events for remote servers
  - HTTP: RESTful endpoints with streaming

- **Authentication & Security**:
  - **Bearer Token**: Standard OAuth/API key authentication
  - **Basic Auth**: Username/password authentication
  - **Custom Headers**: Flexible header-based auth (X-API-Key, etc.)
  - **Environment Variables**: Secure `${VAR}` expansion for credentials
  - **No Plain Text Secrets**: Credentials never logged or committed

- **Environment Variable Management**:
  - `.env` file support in `~/.grimoire/.env`
  - `${VAR}` syntax in spell configurations
  - Server-specific environment variables
  - Automatic masking of sensitive values in logs

- **Interactive Spell Creation Wizard**:
  - Step-by-step guided setup
  - Automatic server probing and validation
  - Auto-generated keywords from tool names
  - Built-in steering with best practices

- **Spell File Hot-Reload**: Automatic detection and re-indexing of configuration changes
- **Semantic Search**: AI-powered similarity matching using all-MiniLM-L6-v2 embeddings
- **Steering Injection**: Embeds expert guidance directly into tool descriptions
- **Turn-Based Lifecycle Management**: Automatic cleanup of inactive servers
  - Global turn counter tracks conversation flow
  - Spells idle for 5+ turns are automatically killed
  - Reduces active spells from 3→1 in typical workflows (67% reduction)

- **Persistence & Reliability**:
  - Lifecycle state survives restarts (MessagePack format)
  - Orphaned child process cleanup on startup
  - Graceful handling of corrupted cache files

- **CLI Commands**:
  - `grimoire` or `grimoire start` - Start the gateway (default)
  - `grimoire create` - Interactive spell creation wizard
  - `grimoire list` - List installed spells with status
  - `grimoire example <transport>` - Generate spell template
  - `grimoire validate <file>` - Validate spell YAML syntax

- **Cross-Platform Support**: Full Windows compatibility
  - Proper path handling for Windows file systems
  - Cross-platform process management
  - Windows CI integration

- **Comprehensive Testing**: 827 passing tests with 80%+ coverage
  - Unit tests with full mocking
  - Integration tests with real components
  - End-to-End tests with real MCP server processes

- **TypeScript**: Strict mode with full type safety and IntelliSense

### Fixed

- Windows CI test failures (port conflicts, path resolution)
- Test isolation with GRIMOIRE_HOME environment variable
- Port conflicts in integration tests
- Cross-platform path handling

### Documentation

- Complete Architecture Decision Records (ADRs)
- Authentication and security guidelines
- Environment variable best practices
- Development guidelines and coding principles
- Example spell configurations for all transport types

## [1.0.0-rc.1] - 2026-01-24

### Fixed

- Windows compatibility issues
  - Fixed port conflicts in test suite (port 8050 → 8052)
  - Fixed path resolution for cross-platform testing
  - Conditionally skip flaky Windows tests (file watchers, stdio spawning)

## [1.0.0-rc.0] - 2026-01-17

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
