# Remote MCP Servers Support

**Date**: 2026-01-11
**Status**: Implemented
**SDK Version**: @modelcontextprotocol/sdk ^1.25.2

---

## Overview

Grimoire supports connecting to **remote MCP servers** in addition to spawning local child processes. This allows you to:

- Connect to MCP servers running on remote machines
- Use centralized MCP services
- Integrate with cloud-hosted MCP servers
- Share MCP servers across multiple clients

## Supported Transport Types

### 1. stdio (Local Child Process)

**Use Case**: Local MCP servers that run as child processes

**Configuration**:

```yaml
name: postgres-local
version: 1.0.0
description: Local PostgreSQL MCP server
keywords:
  - database
  - sql
  - postgres
server:
  transport: stdio # Can be omitted (default)
  command: npx
  args:
    - '-y'
    - '@modelcontextprotocol/server-postgres'
  env:
    POSTGRES_URL: postgresql://localhost:5432/mydb
```

**How It Works**:

- Grimoire spawns a child process using `child_process.spawn()`
- Communicates via stdio (stdin/stdout)
- Process is killed when power is deactivated

---

### 2. sse (Legacy SSE Transport)

**Use Case**: Legacy remote MCP servers using Server-Sent Events

**Configuration**:

```yaml
name: test-sse-server
version: 1.0.0
description: Remote MCP server via SSE transport
keywords:
  - test
  - sse
  - remote
server:
  transport: sse
  url: http://127.0.0.1:8000/sse
```

**How It Works**:

- Grimoire connects to the remote server (NO spawning!)
- Uses SSE for server-to-client messages
- Server must already be running
- Connection is closed when power is deactivated

**Example Remote Server**:

```bash
# Start your SSE MCP server first
npx mcp-server-sse --port 8000
```

---

### 3. http (Modern Streamable HTTP)

**Use Case**: Modern remote MCP servers using Streamable HTTP protocol

**Configuration**:

```yaml
name: test-http-server
version: 1.0.0
description: Remote MCP server via Streamable HTTP
keywords:
  - test
  - http
  - remote
server:
  transport: http
  url: http://0.0.0.0:7777/mcp
```

**How It Works**:

- Uses `StreamableHTTPClientTransport` from MCP SDK
- HTTP POST for client-to-server messages
- HTTP GET + SSE for server-to-client events
- Supports session management, reconnection, OAuth
- Server must already be running
- Connection is closed when power is deactivated

**Example Remote Server**:

```bash
# Start your HTTP MCP server first
npx mcp-server-http --port 7777
```

---

## Key Differences: Local vs Remote

| Aspect               | stdio (Local)                 | sse/http (Remote)                   |
| -------------------- | ----------------------------- | ----------------------------------- |
| **Process Spawning** | ✅ Yes - spawns child process | ❌ No - connects to existing server |
| **Server Lifetime**  | Managed by Grimoire           | Independent                         |
| **Configuration**    | `command` + `args`            | `url`                               |
| **Network**          | Local only                    | Can be remote                       |
| **Latency**          | Very low (~1ms)               | Network-dependent (~10-100ms)       |
| **Overhead**         | Memory per process            | Network connections                 |
| **Use Case**         | Development, single-user      | Production, multi-user              |

---

## Important Clarifications

### From [mcp-server-spawning-clarification.md](./mcp-server-spawning-clarification.md):

> **Remote servers are NOT spawned by Grimoire**. The gateway only _connects_ to servers that are already running elsewhere.

This means:

1. **stdio**: Grimoire **spawns** the MCP server as a child process
2. **sse/http**: Grimoire **connects** to an already-running server

### Why This Matters

When using remote transports (sse/http):

- ✅ The remote server must be started **before** Grimoire tries to connect
- ✅ The server lifetime is **independent** of Grimoire
- ✅ Multiple Grimoire instances can connect to the same server
- ❌ Grimoire **cannot** start/stop the remote server

---

## Configuration Examples

### Example 1: Mixed Local and Remote

```yaml
# ~/.grimoire/postgres-local.spell.yaml
name: postgres-local
version: 1.0.0
description: Local PostgreSQL MCP server
keywords: [database, sql, postgres, local]
server:
  transport: stdio
  command: npx
  args: ['-y', '@modelcontextprotocol/server-postgres']
```

```yaml
# ~/.grimoire/analytics-remote.spell.yaml
name: analytics-remote
version: 1.0.0
description: Centralized analytics MCP server
keywords: [analytics, reports, metrics, remote]
server:
  transport: http
  url: https://analytics.company.com/mcp
```

### Example 2: Development vs Production

**Development** (local):

```yaml
server:
  transport: stdio
  command: npx
  args: ['-y', 'mcp-server-dev']
```

**Production** (remote):

```yaml
server:
  transport: http
  url: https://mcp.production.com/api
```

---

## Validation

Grimoire validates configurations based on transport type:

### stdio Validation

- ✅ Requires: `command` (string)
- ✅ Requires: `args` (array)
- ✅ Optional: `env` (object)
- ❌ Rejects: `url`

### sse/http Validation

- ✅ Requires: `url` (valid URL)
- ❌ Rejects: `command`, `args`
- URL must be a valid HTTP/HTTPS URL

Example validation errors:

```bash
# Error: stdio missing command
server:
  transport: stdio
  url: http://localhost  # Wrong! Use command + args

# Error: http missing url
server:
  transport: http
  command: npx  # Wrong! Use url instead
```

---

## Testing Your Remote Servers

### 1. Start Your Remote Server

**SSE Server**:

```bash
# Example: Start an SSE server on port 8000
node my-sse-server.js --port 8000
```

**HTTP Server**:

```bash
# Example: Start an HTTP server on port 7777
node my-http-server.js --port 7777
```

### 2. Create Power Configuration

```yaml
# ~/.grimoire/my-remote-server.spell.yaml
name: my-remote-server
version: 1.0.0
description: My remote MCP server
keywords: [test, remote, example]
server:
  transport: http
  url: http://localhost:7777/mcp
```

### 3. Query Grimoire

```javascript
// Grimoire will connect (not spawn!) to your server
const response = await gateway.handleResolveIntentCall({
  query: 'test my remote server',
});

// If matched, gateway connects and loads tools
if (response.status === 'activated') {
  console.log('Connected to remote server!');
  console.log('Tools:', response.tools);
}
```

---

## Troubleshooting

### Problem: "Connection refused"

**Cause**: Remote server is not running

**Solution**:

```bash
# Start your remote server first
node your-server.js --port 8000

# Then start Grimoire
npx mcp-grimoire
```

### Problem: "Invalid URL format"

**Cause**: URL is malformed in configuration

**Solution**:

```yaml
# ❌ Bad
url: localhost:8000

# ✅ Good
url: http://localhost:8000/mcp
```

### Problem: "Server command required"

**Cause**: Using stdio config for remote transport

**Solution**:

```yaml
# ❌ Bad
transport: http
command: npx

# ✅ Good
transport: http
url: http://localhost:7777/mcp
```

---

## Performance Considerations

### Local (stdio) Servers

- **Pros**: Very low latency, direct process control
- **Cons**: One process per activation, higher memory usage

### Remote (sse/http) Servers

- **Pros**: Shared resources, centralized, scalable
- **Cons**: Network latency, requires server infrastructure

### When to Use Remote

Use remote transports when:

- ✅ Server needs to be shared across multiple clients
- ✅ Server requires significant resources (GPU, large datasets)
- ✅ Server is maintained by another team
- ✅ Centralized control/monitoring needed
- ✅ Cloud deployment

Use local (stdio) when:

- ✅ Single-user development
- ✅ Fast iteration needed
- ✅ Offline operation required
- ✅ No network access available

---

## References

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Streamable HTTP Transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/client/README.md)
- [MCP Server Spawning Clarification](./mcp-server-spawning-clarification.md)

---

**Last Updated**: January 11, 2026
