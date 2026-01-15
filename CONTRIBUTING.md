# Contributing to MCP Grimoire

Thank you for your interest in contributing to MCP Grimoire! This guide will help you get started with development.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Coding Principles](#coding-principles)
4. [Architecture Guidelines](#architecture-guidelines)
5. [Testing Strategy](#testing-strategy)
6. [Documentation](#documentation)
7. [Pull Request Process](#pull-request-process)

---

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **pnpm** 8.x or higher
- **Git**

### Setup

1. **Fork and Clone**

```bash
git clone https://github.com/YOUR_USERNAME/mcp-grimoire.git
cd mcp-grimoire
```

2. **Install Dependencies**

```bash
pnpm install
```

3. **Build the Project**

```bash
pnpm build
```

4. **Run Tests**

```bash
pnpm test
```

### Development Commands

```bash
# Development with hot reload
pnpm dev

# Build TypeScript
pnpm build

# Run tests
pnpm test              # All tests
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests only
pnpm test:coverage     # With coverage report

# Linting and formatting
pnpm lint              # Check for issues
pnpm lint:fix          # Auto-fix issues
pnpm format            # Format with Prettier

# Type checking
pnpm type-check        # Verify TypeScript types
```

---

## Development Workflow

### Branch Strategy

We use a simple branch-based workflow:

```bash
# Create feature branch
git checkout -b feature/my-feature

# Or for bug fixes
git checkout -b fix/issue-description
```

**Branch naming conventions**:
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

Longer description if needed (optional).

- Detail 1
- Detail 2

Refs: #123
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic change)
- `refactor`: Code restructure (no behavior change)
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, config)

**Examples**:

```bash
feat(intent): add semantic search with embeddings

Implement semantic intent resolution using all-MiniLM-L6-v2 model.
Falls back to keyword matching if semantic search fails.

- Add EmbeddingService class
- Integrate transformers.js
- Add cosine similarity calculation

Refs: #42
```

```bash
fix(lifecycle): prevent orphaned child processes

Children weren't being killed on gateway shutdown. Now track all
spawned processes and kill them in beforeExit handler.

Refs: #89
```

---

## Coding Principles

### Core Principles

#### 1. YAGNI (You Aren't Gonna Need It)

**Implement only what is needed now**, not what might be needed later.

```typescript
// ✅ GOOD: Simple solution for current needs
function resolveIntent(query: string): string | null {
  for (const [name, config] of spells) {
    if (query.toLowerCase().includes(name)) {
      return name;
    }
  }
  return null;
}

// ❌ BAD: Over-engineering for hypothetical future
// Don't add caching, ML models, predictive loading
// until proven necessary
```

#### 2. DRY (Don't Repeat Yourself)

**Every piece of knowledge should have a single source of truth.**

```typescript
// ✅ GOOD: Extract common logic
class ProcessLifecycle {
  private spawn(name: string): void {
    // All spawning logic in one place
  }
}

// ❌ BAD: Duplicating logic across files
// gateway.ts has spawn logic
// intent.ts has spawn logic
// Different implementations = bugs
```

#### 3. SRP (Single Responsibility Principle)

**Each module/class should have one reason to change.**

```typescript
// ✅ GOOD: Focused responsibilities
class SpellDiscovery {
  // Only discovers .spell.yaml files
  scan(): Map<string, SpellConfig> {}
}

class IntentResolver {
  // Only resolves queries to spell names
  resolve(query: string): string | null {}
}

// ❌ BAD: God class doing everything
class Gateway {
  scan() {} // Discovery
  resolve() {} // Intent
  spawn() {} // Lifecycle
  route() {} // Routing
  inject() {} // Steering
}
```

### SOLID Principles

#### Open/Closed Principle

Open for extension, closed for modification:

```typescript
// ✅ GOOD: Add new resolvers without modifying existing code
interface IntentResolver {
  resolve(query: string): Promise<string | null>;
}

class KeywordResolver implements IntentResolver {
  async resolve(query: string) { /* keyword logic */ }
}

class SemanticResolver implements IntentResolver {
  async resolve(query: string) { /* semantic logic */ }
}

// New resolvers don't modify existing code
class LLMResolver implements IntentResolver {
  async resolve(query: string) { /* LLM logic */ }
}
```

#### Dependency Inversion Principle

Depend on abstractions, not concretions:

```typescript
// ✅ GOOD: Depend on interfaces
interface ConfigLoader {
  load(path: string): Promise<SpellConfig>;
}

class Gateway {
  constructor(private configLoader: ConfigLoader) {}
}

// Easy to test with mocks
class MockConfigLoader implements ConfigLoader {
  async load() { return mockConfig; }
}

// ❌ BAD: Tight coupling
class Gateway {
  private loader = new YAMLConfigLoader(); // Hard-coded!
}
```

### Naming Conventions

#### Files and Directories

```
✅ GOOD:
src/
  gateway.ts              # kebab-case for files
  intent-resolver.ts      # Multi-word with hyphens
  config/
    spell-config.ts

❌ BAD:
src/
  GateWay.ts              # Wrong case
  intentResolver.ts       # camelCase in filename
  plm.ts                  # Abbreviations
```

#### Classes and Interfaces

```typescript
// ✅ GOOD: PascalCase, descriptive
class SpellDiscovery {}
class IntentResolver {}
interface SpellConfig {}
type ResolutionResult = string | null;

// ❌ BAD
class spellDiscovery {}  // Wrong case
class PDEngine {}        // Abbreviations
interface ISpellConfig {} // No "I" prefix
```

#### Functions and Variables

```typescript
// ✅ GOOD: camelCase, descriptive
function resolveIntent(query: string): string | null {}
const activePowers = new Map();
const isActive = true;  // Boolean with is/has/can prefix

// ❌ BAD
function ResolveIntent() {}  // Wrong case
function intent() {}         // Missing verb
const ir = new IntentResolver();  // Abbreviation
const active = true;         // Boolean without prefix
```

---

## Architecture Guidelines

### Project Structure

```
src/
├── core/                    # Domain models (types, configs)
│   ├── types.ts
│   └── spell-config.ts
├── application/             # Business logic
│   ├── intent-resolver.ts
│   ├── process-lifecycle.ts
│   └── hybrid-resolver.ts
├── infrastructure/          # External systems
│   ├── config-loader.ts
│   ├── embedding-service.ts
│   └── embedding-storage.ts
├── presentation/            # Gateway server, API
│   ├── gateway.ts
│   └── tool-router.ts
├── cli/                     # CLI commands
│   ├── commands/
│   ├── templates/
│   └── utils/
└── utils/                   # Shared utilities
    ├── logger.ts
    └── paths.ts
```

### Layered Architecture

```
┌─────────────────────────────────┐
│    Presentation Layer           │ ← gateway.ts, tool-router.ts
│  (Client-facing interface)      │
├─────────────────────────────────┤
│    Application Layer            │ ← intent-resolver.ts
│  (Business logic)               │   process-lifecycle.ts
├─────────────────────────────────┤
│    Domain Layer                 │ ← spell-config.ts, types.ts
│  (Core models)                  │
├─────────────────────────────────┤
│    Infrastructure Layer         │ ← config-loader.ts
│  (External systems)             │   embedding-service.ts
└─────────────────────────────────┘
```

**Rules**:
- Higher layers depend on lower layers
- Lower layers never import from higher layers
- Domain layer has no external dependencies

### Error Handling

```typescript
// ✅ GOOD: Custom error hierarchy
class GrimoireError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'GrimoireError';
  }
}

class ConfigurationError extends GrimoireError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
  }
}

// ✅ GOOD: Explicit error handling
async function spawnSpell(name: string): Promise<void> {
  try {
    const config = await loadConfig(name);
    const process = await spawnProcess(config);
    await waitForReady(process);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      logger.error('Invalid configuration', { name, error });
      throw error;
    }
    throw error;
  }
}

// ❌ BAD: Silent failures
try {
  await spawnSpell(name);
} catch {
  return null; // Lost error context!
}
```

---

## Testing Strategy

### Test Structure

We use co-located tests:

```
src/
  application/
    intent-resolver.ts
    __tests__/
      intent-resolver.test.ts
      intent-resolver.integration.test.ts
```

### Test Levels

**Unit Tests**: Test single functions/classes

```typescript
describe('IntentResolver', () => {
  it('should match exact keyword', () => {
    const resolver = new KeywordResolver();
    const spells = new Map([['postgres', { keywords: ['database', 'sql'] }]]);

    const result = resolver.resolve('query database', spells);

    expect(result).toBe('postgres');
  });
});
```

**Integration Tests**: Test multiple components

```typescript
describe('Gateway Integration', () => {
  it('should spawn spell on intent resolution', async () => {
    const gateway = await createTestGateway();

    await gateway.resolveIntent('query database');

    expect(gateway.isActive('postgres')).toBe(true);
  });
});
```

**E2E Tests**: Test full workflows

```typescript
describe('Full Workflow', () => {
  it('should handle database query workflow', async () => {
    const gateway = await startGateway();

    // Resolve intent
    const response1 = await gateway.handleToolCall('resolve_intent', {
      query: 'Show users from database',
    });
    expect(response1.activated).toContain('postgres');

    // Call tool
    const response2 = await gateway.handleToolCall('query_database', {
      query: 'SELECT * FROM users',
    });
    expect(response2.results).toBeDefined();
  });
});
```

### Coverage Requirements

- **Minimum**: 80% coverage (lines, branches, functions)
- **Core logic**: 90%+ coverage (intent resolution, lifecycle)
- **Error paths**: Must be tested
- **Happy paths**: Must be tested

Run coverage:

```bash
pnpm test:coverage
```

---

## Documentation

### Code Comments

Only comment **why**, not **what**:

```typescript
// ✅ GOOD: Explains reasoning
// Use 5-turn threshold to balance multi-step workflows
// vs resource cleanup. See ADR-0006 for analysis.
const INACTIVE_THRESHOLD = 5;

// ❌ BAD: States the obvious
// Set threshold to 5
const INACTIVE_THRESHOLD = 5;
```

### Architecture Decision Records (ADRs)

For significant decisions, create an ADR:

```bash
# Use the adr-generator skill (if available)
/adr-generator --title "Use Hybrid Intent Resolution" --status proposed
```

ADRs go in `docs/adr/` with sequential numbering:

```
docs/adr/
├── 0001-record-architecture-decisions.md
├── 0002-use-typescript.md
└── 0010-your-new-decision.md
```

**When to create ADRs**:
✅ Technology choices (frameworks, libraries)
✅ Architectural patterns
✅ Trade-off decisions
✅ System boundaries

❌ Trivial decisions (variable naming)
❌ Obvious choices (use Git)

### API Documentation

Document public APIs with JSDoc:

```typescript
/**
 * Resolve user query to spell name
 *
 * Uses hybrid keyword + semantic matching to find the most
 * relevant spell for the given query.
 *
 * @param query - Natural language query (e.g., "query database")
 * @param minConfidence - Minimum confidence threshold (0-1)
 * @returns Spell name if found, null otherwise
 *
 * @example
 * ```typescript
 * const spell = await resolver.resolve("query postgres");
 * // Returns: "postgres"
 * ```
 */
async resolve(query: string, minConfidence = 0.5): Promise<string | null> {
  // Implementation
}
```

---

## Pull Request Process

### Before Submitting

**Checklist**:
- [ ] Tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Types compile (`pnpm type-check`)
- [ ] Code formatted (`pnpm format`)
- [ ] Documentation updated (if applicable)
- [ ] ADR created (for significant changes)
- [ ] CHANGELOG.md updated (for user-facing changes)

### PR Template

Your PR should include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested this

## Related Issues
Fixes #123

## Screenshots (if applicable)
```

### Review Process

1. **Automated Checks**: CI runs tests, linting, type checking
2. **Code Review**: Maintainer reviews code quality, architecture
3. **Approval**: At least one maintainer approval required
4. **Merge**: Squash and merge to main

### Getting Help

- 💬 [GitHub Discussions](https://github.com/crack-break-make/mcp-grimoire/discussions)
- 🐛 [Report Issues](https://github.com/crack-break-make/mcp-grimoire/issues)
- 📧 Email: mohan.sharma@sap.com

---

## Code Quality Standards

We maintain high standards:

✅ **80%+ test coverage** (unit + integration)
✅ **Strict TypeScript** (`strict: true`)
✅ **ESLint + Prettier** (enforced by pre-commit hooks)
✅ **No `any` types** (enforced by linter)
✅ **Comprehensive error handling**
✅ **Clear naming conventions**

---

## License

By contributing, you agree that your contributions will be licensed under the ISC License.

---

**Thank you for contributing to MCP Grimoire! 🧙✨**
