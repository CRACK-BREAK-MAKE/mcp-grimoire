# 3. Use MCP SDK for Gateway Server Implementation

Date: 2026-01-11

## Status

Accepted

## Context

Grimoire must act as an MCP server to communicate with Claude Desktop via the Model Context Protocol.

**The Architecture** (from architecture.md lines 110-121):
```
┌─────────────────────────────────────────────────────────┐
│                    Claude Desktop                       │
└────────────────┬────────────────────────────────────────┘
                 │ stdio (MCP Protocol)
                 │
┌────────────────▼────────────────────────────────────────┐
│              POWER GATEWAY PROCESS                      │
│              (Main MCP Server)                          │
```

**Requirements**:
- Implement MCP protocol correctly (tools/list, tools/call)
- Handle stdio transport (Claude Desktop spawns via stdio)
- Send notifications (tools/list_changed when powers activate/deactivate)
- Type-safe request/response handling
- Reliable and maintainable

**The Question**: How do we implement the MCP protocol?

## Decision

We will use **`@modelcontextprotocol/sdk`** version ^1.25.0 (official MCP SDK by Anthropic) to implement the gateway server.

**Specific Choices**:
- Use `McpServer` class (high-level API, not deprecated `Server`)
- Import request schemas from SDK types
- Use `StdioServerTransport` for Claude Desktop communication
- Register handlers using schema objects (not string method names)

**API Pattern**:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new McpServer({
  name: 'mcp-grimoire',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Use schemas, NOT strings
server.setRequestHandler(ListToolsRequestSchema, (request) => {
  return { tools: getAllTools() };
});

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});
```

## Consequences

### Positive Consequences

- **Protocol Compliance**: Official SDK ensures correct MCP implementation
- **Maintained by Anthropic**: Bug fixes and updates from protocol designers
- **Type Safety**: Full TypeScript types prevent protocol violations
- **Less Code**: ~500 lines saved vs implementing protocol manually
- **Documentation**: Official docs and examples available
- **Future-Proof**: SDK evolves with protocol (we don't need to track changes)
- **Testing**: SDK is well-tested, we test business logic only

### Negative Consequences

- **External Dependency**: Rely on SDK versioning and release cycle
- **Learning Curve**: Must understand SDK API (not just protocol spec)
- **Bundle Size**: SDK adds ~200KB to package (acceptable for npx)
- **Version Lock**: Breaking changes require code updates

### Risks

- **SDK Bugs**: If SDK has bugs, we inherit them
  - Mitigation: SDK is production-tested by Anthropic, report issues upstream
- **Breaking Changes**: Major version updates may break our code
  - Mitigation: Pin SDK version in package.json, test before upgrading
- **Deprecated APIs**: SDK may deprecate classes (Server → McpServer)
  - Mitigation: Follow deprecation warnings immediately, update promptly

## Alternatives Considered

### Alternative 1: Implement MCP Protocol from Scratch

**Pros**:
- Full control over implementation
- No external dependencies
- Can optimize for our specific use case
- Understanding of protocol internals

**Cons**:
- High development effort (~2-3 weeks)
- Must maintain protocol compatibility ourselves
- Must write all TypeScript types manually
- Error-prone (easy to violate protocol subtleties)
- Must track and implement protocol changes
- No community support

**Why rejected**: Implementing a protocol correctly is hard. The official SDK exists specifically to solve this. Our value is in the lazy loading and steering, not protocol implementation.

### Alternative 2: Use Lower-Level `Server` Class

**Pros**:
- More control over protocol details
- SDK's original API

**Cons**:
- Deprecated (SDK warning: *"Use McpServer instead"*)
- More boilerplate code required
- Lower-level abstraction
- Will be removed in future SDK versions

**Why rejected**: SDK explicitly recommends `McpServer` for standard use cases. Gateway is a standard MCP server, not an advanced use case.

### Alternative 3: Alternative MCP Implementation (Community)

**Pros**:
- Might be lighter weight
- Could have different trade-offs

**Cons**:
- No known stable alternative exists
- Would lack official support
- Protocol compliance not guaranteed
- Smaller community

**Why rejected**: No viable alternative exists. Anthropic's SDK is the de facto standard in the MCP ecosystem.

## Implementation Notes

### Critical API Discovery

**Initial Mistake** (from previous session):
```typescript
// ❌ This causes TypeScript error
server.setRequestHandler('tools/list', handler);
// Error: Argument of type 'string' is not assignable to parameter of type 'AnyObjectSchema'
```

**Investigation Result**:
SDK v1.25.0+ changed `setRequestHandler` signature to use Zod schemas for type safety instead of string method names.

**Correct Usage**:
```typescript
//  ✅ Import schemas
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ✅ Pass schema objects
server.setRequestHandler(ListToolsRequestSchema, (request) => {
  // TypeScript now knows request structure
  return { tools: [...] };
});
```

### Why Schemas Instead of Strings?

1. **Type Safety**: Request params are typed automatically
2. **Runtime Validation**: SDK validates incoming requests
3. **Refactoring**: Method name changes caught at compile-time
4. **Intent**: Explicit about what we're handling

## Testing Strategy

1. **Unit Tests**: Mock SDK server instance, test handler logic in isolation
2. **Integration Tests**: Real SDK server with in-memory transport
3. **E2E Tests**: Full stdio transport with simulated Claude client

## References

- [MCP SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Protocol Spec](https://spec.modelcontextprotocol.io/)
- architecture.md - Lines 725-729 (declares SDK as core dependency)
- ADR-0002 (TypeScript decision enables SDK usage)
- Previous session transcript: Type error investigation

## Relationship to Other ADRs

- **Depends on ADR-0002 (TypeScript)**: SDK is TypeScript-first, our choice of TypeScript enables natural SDK usage
- **Enables ADR-0004, 0005, 0006**: Gateway functionality depends on SDK providing MCP server capabilities

---

**This ADR commits us to the official MCP SDK, ensuring protocol compliance and maintainability.**
