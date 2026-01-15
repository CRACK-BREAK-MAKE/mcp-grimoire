# 2. Use TypeScript for Development

Date: 2026-01-11

## Status

Accepted

## Context

We need to choose a programming language for implementing MCP Grimoire.

**Project Requirements**:
- Type safety to prevent bugs
- Good IDE support and developer experience
- Integration with Node.js ecosystem (MCP SDK is TypeScript)
- Ability to publish as npm package via `npx`
- Maintainability for long-term development

**Target Environment**:
- Runs as Node.js process (spawned by Claude Desktop)
- stdio communication with parent and child processes
- Must work with `npx` (no installation required)

## Decision

We will use **TypeScript** with strict mode enabled for all development.

**Configuration**:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

**Tooling**:
- **Linter**: ESLint with `@typescript-eslint` plugin
- **Formatter**: Prettier
- **Testing**: Jest with `ts-jest`
- **Build**: `tsc` (TypeScript compiler)

## Consequences

### Positive Consequences

- **Type Safety**: Catch errors at compile-time, not runtime
  - Example: MCP SDK type errors caught immediately
- **Better IDE Support**: Autocomplete, go-to-definition, refactoring
- **Self-Documenting**: Types serve as inline documentation
- **Refactoring Confidence**: Compiler verifies all usages are updated
- **Industry Standard**: Large community, extensive tooling
- **MCP SDK Compatibility**: Official SDK is TypeScript, perfect fit

### Negative Consequences

- **Build Step Required**: Must compile TypeScript → JavaScript before running
- **Learning Curve**: Team must know TypeScript (interfaces, generics, etc.)
- **Slower Initial Development**: Writing types takes time upfront
- **Type Definitions**: Third-party libraries may lack types (use `@types/*`)

### Risks

- **Type System Complexity**: Advanced types can be confusing
  - Mitigation: Start simple, use basic types. Add complexity only when needed
- **Build Configuration**: tsconfig.json can be tricky
  - Mitigation: Use standard config, document in CLAUDE.md

## Alternatives Considered

### Alternative 1: Plain JavaScript (ES2022+)

**Pros**:
- No build step (faster development loop)
- No type annotations (less code to write)
- Simpler tooling setup
- Immediate execution

**Cons**:
- No compile-time type checking
- Poor IDE support (no autocomplete)
- Harder to refactor safely
- Runtime errors that types would catch
- MCP SDK types not leveraged

**Why rejected**: Type safety is critical for production code. The MCP SDK provides extensive TypeScript types that help us use it correctly. Runtime errors in a gateway are unacceptable.

### Alternative 2: Python

**Pros**:
- Strong typing with mypy
- Great for ML/data work (if we add semantic search later)
- Large standard library
- Excellent for scripting

**Cons**:
- Not native to Node.js ecosystem
- MCP SDK is JavaScript/TypeScript-first
- Harder to integrate with Claude Desktop (expects Node.js)
- More complex packaging for npx distribution
- Child process management less straightforward

**Why rejected**: Node.js/JavaScript ecosystem is the primary target for MCP tools. Claude Desktop spawns Node.js processes. TypeScript gives us both strong typing AND JavaScript ecosystem.

### Alternative 3: Go

**Pros**:
- Strongly typed
- Excellent concurrency (good for process management)
- Fast compilation and execution
- Single binary distribution

**Cons**:
- No official MCP SDK for Go
- Must implement MCP protocol from scratch
- Not standard for MCP ecosystem
- Harder to distribute via npx
- Would need CGo for some Node.js interop

**Why rejected**: Lack of official MCP SDK is a dealbreaker. We'd spend weeks implementing the protocol instead of solving the actual problem.

## Real-World Impact

**Example from Development**:

In gateway.ts, TypeScript caught this error immediately:
```typescript
// ❌ ERROR caught at compile-time
server.setRequestHandler('tools/list', handler);
// Error: Argument of type 'string' is not assignable to parameter of type 'AnyObjectSchema'
```

Without TypeScript, this would have been a runtime error when Claude tried to connect, wasting hours of debugging.

**With TypeScript**:
```typescript
// ✅ Correct - TypeScript guides us to the right API
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
server.setRequestHandler(ListToolsRequestSchema, handler);
```

## Implementation Guidelines

From CLAUDE.md:

1. **Strict Mode**: Always enabled
2. **No `any` types**: Use `unknown` and type guards
3. **Explicit return types**: On all public functions
4. **Readonly types**: For configuration and immutable data
5. **Type guards**: For runtime validation (`isSpellConfig`)

## References

- [TypeScript Official Documentation](https://www.typescriptlang.org/)
- [MCP SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- CLAUDE.md - TypeScript Production Guidelines section
- architecture.md - Lines 718-730 (Technology Stack)

---

**This decision establishes TypeScript as our development language, enabling type-safe integration with the MCP SDK.**
