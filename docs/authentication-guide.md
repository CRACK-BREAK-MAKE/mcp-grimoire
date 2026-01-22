# Authentication Implementation Guide

**MCP Grimoire - Comprehensive Authentication Support**

Version: 1.0
Last Updated: 2026-01-19

---

## Table of Contents

1. [Overview](#overview)
2. [Supported Authentication Types](#supported-authentication-types)
3. [Interactive CLI Wizard Flows](#interactive-cli-wizard-flows)
4. [Spell File Structure](#spell-file-structure)
5. [Environment Variable Resolution](#environment-variable-resolution)
6. [CLI Server Probing](#cli-server-probing)
7. [Gateway Server Spawning](#gateway-server-spawning)
8. [Complete Examples](#complete-examples)
9. [Troubleshooting](#troubleshooting)

---

## Overview

MCP Grimoire supports multiple authentication methods for MCP servers. Authentication is handled differently depending on the transport type:

- **stdio**: Authentication via environment variables passed to child process
- **HTTP/SSE**: Authentication via HTTP headers (Authorization or custom headers)

### Key Principles

1. **Security First**: Credentials stored in `~/.grimoire/.env` with 0600 permissions
2. **Placeholder Pattern**: YAML files contain `${VAR}` placeholders, not literal secrets
3. **Live Reloading**: `.env` file watched for changes, no restart needed
4. **Priority Chain**: `.env file` > `process.env` > empty string + warning

---

## Supported Authentication Types

### 1. None (No Authentication)

**Transports**: stdio, HTTP, SSE
**Use Case**: Public servers, local development
**Example**: Local MCP server without auth

### 2. Bearer Token (API Key)

**Transports**: HTTP, SSE
**Use Case**: Simple API key authentication
**Header**: `Authorization: Bearer <token>`
**Example**: OpenAI API, Anthropic API

### 3. Basic Auth (Username + Password)

**Transports**: HTTP, SSE
**Use Case**: Traditional username/password authentication
**Header**: `Authorization: Basic <base64(username:password)>`
**Example**: Protected internal APIs, legacy systems

### 4. OAuth Client Credentials

**Transports**: HTTP, SSE
**Use Case**: Machine-to-machine authentication
**Flow**: Token exchange at `tokenUrl`, cached and auto-refreshed
**Example**: Azure AD, Auth0, Okta

### 5. Custom Headers

**Transports**: HTTP, SSE
**Use Case**: Non-standard auth mechanisms (e.g., `X-API-Key`)
**Example**: APIs that use custom header names

### 6. Environment Variables (stdio only)

**Transports**: stdio
**Use Case**: Pass API keys to child process via env vars
**Example**: Python scripts that read `os.environ['API_KEY']`

---

## Interactive CLI Wizard Flows

### Command

```bash
npx @crack-break-make/mcp-grimoire create
```

### Flow: No Authentication

```
? Spell name: my-public-api
? Transport type: http
? Server URL: http://localhost:8000
? Does this server require authentication? No
? Does this server require custom headers? No
? Probe server to test connection? No

✓ Spell created: ~/.grimoire/my-public-api.spell.yaml
```

### Flow: Bearer Token

```
? Spell name: openai-api
? Transport type: http
? Server URL: https://api.openai.com/v1
? Does this server require authentication? Yes
? Authentication type: bearer - Bearer Token (API Key)
? Bearer token (use ${VAR_NAME} to read from environment): ${OPENAI_API_KEY}
? Does this server require custom headers? No
? Probe server to test connection? Yes

✓ Spell created: ~/.grimoire/openai-api.spell.yaml
✓ Probing successful - Server is working
```

**What happens**:

- User enters `${OPENAI_API_KEY}` (placeholder)
- YAML file stores: `token: ${OPENAI_API_KEY}`
- No .env update (placeholder already used)
- During probing: Reads `OPENAI_API_KEY` from process.env or .env

**Alternative (Literal Value)**:

```
? Bearer token (use ${VAR_NAME} to read from environment): sk-abc123xyz
```

**What happens**:

- User enters literal value `sk-abc123xyz`
- YAML file stores: `token: ${API_TOKEN}`
- .env file gets: `API_TOKEN=sk-abc123xyz`
- CLI transforms literal → placeholder automatically

### Flow: Basic Auth

```
? Spell name: internal-api
? Transport type: http
? Server URL: https://internal.company.com/api
? Does this server require authentication? Yes
? Authentication type: basic - Basic Auth (Username + Password)
? Username (use ${VAR} for environment variable): admin
? Password (use ${VAR} for environment variable): secret123
? Does this server require custom headers? No
? Probe server to test connection? Yes

✓ Environment variables saved: ~/.grimoire/.env
   Variables: API_USERNAME, API_PASSWORD
✓ Spell created: ~/.grimoire/internal-api.spell.yaml
✓ Probing successful - Server is working
```

**What happens**:

- User enters literals: `admin`, `secret123`
- YAML file stores:
  ```yaml
  auth:
    type: basic
    username: ${API_USERNAME}
    password: ${API_PASSWORD}
  ```
- .env file gets:
  ```
  API_USERNAME=admin
  API_PASSWORD=secret123
  ```

### Flow: OAuth Client Credentials

```
? Spell name: azure-api
? Transport type: sse
? Server URL: https://api.azure.com
? Does this server require authentication? Yes
? Authentication type: client_credentials - OAuth Client Credentials
? Client ID (use ${VAR} for environment variable): ${AZURE_CLIENT_ID}
? Client Secret (use ${VAR} for environment variable): ${AZURE_CLIENT_SECRET}
? Token endpoint URL: https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token
? Does this OAuth flow require a scope? Yes
? OAuth scope (space-separated): https://api.azure.com/.default
? Does this server require custom headers? No
? Probe server to test connection? No

✓ Spell created: ~/.grimoire/azure-api.spell.yaml
```

**What happens**:

- User enters placeholders (good practice for OAuth secrets)
- YAML stores placeholders as-is
- User must manually add to .env:
  ```
  AZURE_CLIENT_ID=your-client-id
  AZURE_CLIENT_SECRET=your-client-secret
  ```

### Flow: Custom Headers (X-API-Key style)

```
? Spell name: stripe-api
? Transport type: http
? Server URL: https://api.stripe.com
? Does this server require authentication? No
? Does this server require custom headers? Yes
? Header name: X-API-Key
? Header value (use ${VAR_NAME} to read from environment): ${STRIPE_API_KEY}
? Add another header? No
? Probe server to test connection? Yes

✓ Spell created: ~/.grimoire/stripe-api.spell.yaml
```

### Flow: stdio with Environment Variables

```
? Spell name: python-script
? Transport type: stdio
? Command to run: python
? Arguments (space-separated): /path/to/script.py
? Does this server require environment variables? Yes
? Environment variable name: API_KEY
? Environment variable value (use ${VAR_NAME} to read from environment): ${PYTHON_API_KEY}
? Add another environment variable? No
? Probe server to test connection? Yes

✓ Environment variables saved: ~/.grimoire/.env
✓ Spell created: ~/.grimoire/python-script.spell.yaml
```

---

## Spell File Structure

### No Authentication

```yaml
# ~/.grimoire/my-public-api.spell.yaml
name: my-public-api
version: 1.0.0
description: Public API server
keywords: [public, api, server]
server:
  transport: http
  url: http://localhost:8000
```

### Bearer Token

```yaml
# ~/.grimoire/openai-api.spell.yaml
name: openai-api
version: 1.0.0
description: OpenAI API integration
keywords: [openai, gpt, ai]
server:
  transport: http
  url: https://api.openai.com/v1
  auth:
    type: bearer
    token: ${OPENAI_API_KEY} # Placeholder resolved at runtime
```

**Corresponding .env**:

```
# ~/.grimoire/.env
OPENAI_API_KEY=sk-abc123xyz
```

### Basic Auth

```yaml
# ~/.grimoire/internal-api.spell.yaml
name: internal-api
version: 1.0.0
description: Internal company API
keywords: [internal, company, api]
server:
  transport: http
  url: https://internal.company.com/api
  auth:
    type: basic
    username: ${API_USERNAME}
    password: ${API_PASSWORD}
```

**Corresponding .env**:

```
# ~/.grimoire/.env
API_USERNAME=admin
API_PASSWORD=secret123
```

### OAuth Client Credentials

```yaml
# ~/.grimoire/azure-api.spell.yaml
name: azure-api
version: 1.0.0
description: Azure API integration
keywords: [azure, microsoft, api]
server:
  transport: sse
  url: https://api.azure.com
  auth:
    type: client_credentials
    clientId: ${AZURE_CLIENT_ID}
    clientSecret: ${AZURE_CLIENT_SECRET}
    tokenUrl: https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token
    scope: https://api.azure.com/.default
```

**Corresponding .env**:

```
# ~/.grimoire/.env
AZURE_CLIENT_ID=your-client-id-here
AZURE_CLIENT_SECRET=your-client-secret-here
```

### Custom Headers

```yaml
# ~/.grimoire/stripe-api.spell.yaml
name: stripe-api
version: 1.0.0
description: Stripe payment API
keywords: [stripe, payment, api]
server:
  transport: http
  url: https://api.stripe.com
  headers:
    X-API-Key: ${STRIPE_API_KEY}
    X-Custom-Header: ${CUSTOM_VALUE}
```

**Corresponding .env**:

```
# ~/.grimoire/.env
STRIPE_API_KEY=sk_test_abc123
CUSTOM_VALUE=my-custom-value
```

### stdio with Environment Variables

```yaml
# ~/.grimoire/python-script.spell.yaml
name: python-script
version: 1.0.0
description: Python MCP server
keywords: [python, script, mcp]
server:
  transport: stdio
  command: python
  args:
    - /path/to/script.py
  env:
    API_KEY: ${PYTHON_API_KEY}
    DATABASE_URL: ${DATABASE_URL}
```

**Corresponding .env**:

```
# ~/.grimoire/.env
PYTHON_API_KEY=secret-key-123
DATABASE_URL=postgresql://localhost/mydb
```

---

## Environment Variable Resolution

### Resolution Flow

```
┌─────────────────────────────────────────┐
│ User creates spell with auth            │
│ e.g., username: "admin"                 │
└────────────┬────────────────────────────┘
             │
             v
┌─────────────────────────────────────────┐
│ CLI transforms literal → placeholder    │
│ YAML: username: ${API_USERNAME}         │
│ .env: API_USERNAME=admin                │
└────────────┬────────────────────────────┘
             │
             v
┌─────────────────────────────────────────┐
│ Gateway/Probing reads spell YAML        │
│ Sees: username: ${API_USERNAME}         │
└────────────┬────────────────────────────┘
             │
             v
┌─────────────────────────────────────────┐
│ EnvManager.expand("${API_USERNAME}")    │
│ Priority: .env > process.env > ""       │
└────────────┬────────────────────────────┘
             │
             v
┌─────────────────────────────────────────┐
│ Expanded value: "admin"                 │
│ Used in Authorization header            │
└─────────────────────────────────────────┘
```

### Priority Chain

1. **~/.grimoire/.env** (highest priority)
   - User-managed secrets
   - Live-reloaded with 100ms debounce
   - Permissions: 0600 (owner read/write only)

2. **process.env**
   - System environment variables
   - Useful for CI/CD, Docker, etc.

3. **Empty string + warning** (fallback)
   - Logs warning: "Environment variable X is not defined"
   - Returns empty string (prevents crashes)

### Example

```bash
# In ~/.grimoire/.env
API_TOKEN=from_env_file

# In shell
export API_TOKEN=from_shell

# Result
EnvManager.expand("${API_TOKEN}") → "from_env_file"
# .env file wins!
```

---

## CLI Server Probing

### What is Probing?

Server probing verifies that:

1. Server is reachable
2. Authentication works
3. Server returns valid MCP tools list
4. Auto-generates keywords and steering from tools

### Probing with --probe Flag

```bash
grimoire create \
  --name test-server \
  --transport http \
  --url "http://localhost:8001" \
  --auth-type bearer \
  --auth-token "test_token_123" \
  --probe \
  --no-interactive
```

### How Probing Uses Auth

1. **CLI parses auth flags**:
   - `--auth-type bearer`
   - `--auth-token "test_token_123"`

2. **Creates temporary config**:

   ```typescript
   const tempConfig: SpellConfig = {
     name: 'test-server',
     server: {
       transport: 'http',
       url: 'http://localhost:8001',
       auth: {
         type: 'bearer',
         token: 'test_token_123', // Literal value for probe
       },
     },
   };
   ```

3. **Spawns temporary MCP client**:
   - ProcessLifecycleManager.spawn() called
   - Auth headers built: `Authorization: Bearer test_token_123`
   - Connects to server
   - Calls `tools/list`

4. **Validation**:
   - ✅ Success: Server responds with tools list
   - ❌ Failure: Auth error, connection refused, etc.

5. **After probe succeeds**:
   - Transforms literal → placeholder
   - Writes to YAML: `token: ${API_TOKEN}`
   - Writes to .env: `API_TOKEN=test_token_123`

### Probing with Different Auth Types

#### Bearer Token

```bash
grimoire create -n test -t http \
  --url "http://localhost:8001" \
  --auth-type bearer \
  --auth-token "abc123" \
  --probe --no-interactive
```

#### Basic Auth

```bash
grimoire create -n test -t http \
  --url "http://localhost:8004" \
  --auth-type basic \
  --auth-username "admin" \
  --auth-password "secret" \
  --probe --no-interactive
```

#### OAuth Client Credentials

```bash
grimoire create -n test -t sse \
  --url "http://localhost:8003" \
  --auth-type client_credentials \
  --auth-client-id "client123" \
  --auth-client-secret "secret456" \
  --auth-token-url "http://localhost:8003/token" \
  --probe --no-interactive
```

#### Custom Headers

```bash
grimoire create -n test -t http \
  --url "http://localhost:8001" \
  --headers "X-API-Key=mykey123" \
  --probe --no-interactive
```

### Probing Flow Diagram

```
┌──────────────────────────────┐
│ User runs: grimoire create   │
│ with --probe flag            │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Parse auth flags             │
│ Build temporary config       │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ ProcessLifecycleManager      │
│ .spawn(tempConfig)           │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Expand auth with EnvManager  │
│ (uses process.env for probe) │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ buildAuthHeaders()           │
│ Creates Authorization header │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Connect to MCP server        │
│ Send auth headers            │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Call tools/list              │
│ Get tool definitions         │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ ✓ Probe success              │
│ Generate steering & keywords │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Transform literals →         │
│ placeholders, write to .env  │
└──────────────────────────────┘
```

---

## Gateway Server Spawning

### What is Gateway Spawning?

When Claude uses a spell, the gateway:

1. Detects intent via keywords/semantic search
2. Spawns MCP server for that spell
3. Authenticates using credentials from .env
4. Routes tool calls to spawned server
5. Kills server after 5 turns of inactivity

### Spawning Flow

```
┌──────────────────────────────┐
│ Claude asks: "query database" │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ resolve_intent tool called   │
│ Matches: "postgres" spell    │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Load postgres.spell.yaml     │
│ auth:                        │
│   type: bearer               │
│   token: ${PG_API_TOKEN}     │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ EnvManager.load()            │
│ Reads ~/.grimoire/.env       │
│ Cache: PG_API_TOKEN=secret123│
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ ProcessLifecycleManager      │
│ .spawn("postgres", config)   │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Expand auth placeholders:    │
│ token: ${PG_API_TOKEN}       │
│ → token: "secret123"         │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ buildAuthHeaders()           │
│ Authorization: Bearer        │
│ secret123                    │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Connect to MCP server        │
│ (SSE, HTTP, or stdio)        │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ tools/list → Claude          │
│ Claude sees tools + steering │
└──────────┬───────────────────┘
           │
           v
┌──────────────────────────────┐
│ Claude calls tools           │
│ Gateway routes to server     │
└──────────────────────────────┘
```

### Auth Expansion in Gateway

#### Bearer Token

**YAML**:

```yaml
server:
  transport: http
  url: http://localhost:8001
  auth:
    type: bearer
    token: ${API_TOKEN}
```

**Code Flow** (`process-lifecycle.ts` lines 447-451):

```typescript
let expandedAuth = serverConfig.auth;
if (expandedAuth.type === 'bearer' && expandedAuth.token) {
  expandedAuth = {
    ...expandedAuth,
    token: this.envManager.expand(expandedAuth.token),
    // Result: token: "actual-token-value"
  };
}
```

**Auth Provider** (`auth-provider.ts` lines 43-49):

```typescript
if (auth?.type === 'bearer' && auth.token !== undefined) {
  const expandedToken = expandEnvVar(auth.token);
  headers['Authorization'] = `Bearer ${expandedToken}`;
}
```

**Result**: `Authorization: Bearer actual-token-value`

#### Basic Auth

**YAML**:

```yaml
server:
  transport: http
  url: http://localhost:8004
  auth:
    type: basic
    username: ${API_USERNAME}
    password: ${API_PASSWORD}
```

**Code Flow** (`process-lifecycle.ts` lines 452-463):

```typescript
else if (expandedAuth.type === 'basic' &&
         expandedAuth.username && expandedAuth.password) {
  expandedAuth = {
    ...expandedAuth,
    username: this.envManager.expand(expandedAuth.username),
    password: this.envManager.expand(expandedAuth.password),
  };
}
```

**Auth Provider** (`auth-provider.ts` lines 52-71):

```typescript
if (auth?.type === 'basic') {
  const expandedUsername = expandEnvVar(auth.username);
  const expandedPassword = expandEnvVar(auth.password);

  const credentials = Buffer.from(`${expandedUsername}:${expandedPassword}`).toString('base64');

  headers['Authorization'] = `Basic ${credentials}`;
}
```

**Result**: `Authorization: Basic YWRtaW46c2VjcmV0` (base64 of "admin:secret")

#### OAuth Client Credentials

**YAML**:

```yaml
server:
  transport: sse
  url: http://localhost:8003
  auth:
    type: client_credentials
    clientId: ${OAUTH_CLIENT_ID}
    clientSecret: ${OAUTH_CLIENT_SECRET}
    tokenUrl: http://localhost:8003/token
    scope: api.read
```

**Code Flow** (`oauth-client-credentials.ts`):

```typescript
class ClientCredentialsProvider {
  async getAccessToken(): Promise<string> {
    // 1. Check cache
    if (this.cachedToken && !this.isTokenExpired()) {
      return this.cachedToken.access_token;
    }

    // 2. Fetch new token
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${base64(clientId:clientSecret)}`,
      },
      body: `grant_type=client_credentials&scope=${scope}`,
    });

    // 3. Cache token with expiry
    this.cachedToken = await response.json();
    return this.cachedToken.access_token;
  }
}
```

**Result**: `Authorization: Bearer <oauth-access-token>`

#### stdio with Environment Variables

**YAML**:

```yaml
server:
  transport: stdio
  command: python
  args: [/path/to/script.py]
  env:
    API_KEY: ${PYTHON_API_KEY}
    DATABASE_URL: ${DB_URL}
```

**Code Flow** (`process-lifecycle.ts` lines 388-413):

```typescript
let expandedEnv: Record<string, string> | undefined;
if (serverConfig.env && this.envManager) {
  expandedEnv = {};
  for (const [key, value] of Object.entries(serverConfig.env)) {
    expandedEnv[key] = this.envManager.expand(value);
  }

  // Validate all placeholders resolved
  const missingVars: string[] = [];
  for (const [key, value] of Object.entries(serverConfig.env)) {
    const missing = this.envManager.validatePlaceholders(value);
    if (missing.length > 0) {
      throw new ProcessSpawnError(`Missing environment variables: ${missing.join(', ')}`);
    }
  }
}

// Spawn child process with expanded env
mcpTransport = new StdioClientTransport({
  command: normalizedCommand,
  args: serverConfig.args,
  env: expandedEnv, // Passed to child process
});
```

**Result**: Child process receives:

```
API_KEY=actual-python-key
DATABASE_URL=postgresql://localhost/db
```

---

## Complete Examples

### Example 1: Bearer Token (OpenAI-style API)

**1. Create spell interactively**:

```bash
npx @crack-break-make/mcp-grimoire create

? Spell name: openai-mcp
? Transport type: http
? Server URL: http://localhost:8001
? Does this server require authentication? Yes
? Authentication type: bearer - Bearer Token (API Key)
? Bearer token: my-secret-token-123
? Does this server require custom headers? No
? Probe server to test connection? Yes

✓ Environment variables saved: ~/.grimoire/.env
   Variables: API_TOKEN
✓ Probing successful - Server is working
✓ Spell created: ~/.grimoire/openai-mcp.spell.yaml
   Tools: 5
```

**2. Spell file created**:

```yaml
# ~/.grimoire/openai-mcp.spell.yaml
name: openai-mcp
version: 1.0.0
description: OpenAI-style MCP server
keywords: [openai, ai, chat, completion, gpt]
server:
  transport: http
  url: http://localhost:8001
  auth:
    type: bearer
    token: ${API_TOKEN}
steering: |
  This server provides OpenAI-compatible chat completion tools.
  Available tools: chat_completion, embeddings, ...
```

**3. Environment file**:

```bash
# ~/.grimoire/.env
API_TOKEN=my-secret-token-123
```

**4. Gateway spawns server**:

```
User: "Use OpenAI to generate text"
→ resolve_intent("Use OpenAI to generate text")
→ Match: "openai-mcp" (keyword: "openai")
→ Load ~/.grimoire/openai-mcp.spell.yaml
→ EnvManager.expand("${API_TOKEN}") → "my-secret-token-123"
→ buildAuthHeaders({ type: 'bearer', token: 'my-secret-token-123' })
→ HTTP request with header: Authorization: Bearer my-secret-token-123
→ Server responds with tools
→ Claude sees tools + steering
```

### Example 2: Basic Auth (Internal API)

**1. Create spell**:

```bash
grimoire create \
  --name internal-api \
  --transport http \
  --url https://internal.company.com/mcp \
  --auth-type basic \
  --auth-username admin \
  --auth-password secret123 \
  --probe \
  --no-interactive
```

**2. Spell file**:

```yaml
name: internal-api
version: 1.0.0
description: Internal company MCP API
keywords: [internal, company, crm, database]
server:
  transport: http
  url: https://internal.company.com/mcp
  auth:
    type: basic
    username: ${API_USERNAME}
    password: ${API_PASSWORD}
```

**3. Environment file**:

```
API_USERNAME=admin
API_PASSWORD=secret123
```

**4. Gateway spawning**:

```
→ EnvManager.expand("${API_USERNAME}") → "admin"
→ EnvManager.expand("${API_PASSWORD}") → "secret123"
→ credentials = base64("admin:secret123") → "YWRtaW46c2VjcmV0MTIz"
→ Header: Authorization: Basic YWRtaW46c2VjcmV0MTIz
```

### Example 3: OAuth Client Credentials (Azure AD)

**1. Create spell**:

```bash
grimoire create

? Spell name: azure-api
? Transport type: sse
? Server URL: https://api.azure.com/mcp
? Does this server require authentication? Yes
? Authentication type: client_credentials - OAuth Client Credentials
? Client ID: ${AZURE_CLIENT_ID}
? Client Secret: ${AZURE_CLIENT_SECRET}
? Token endpoint URL: https://login.microsoftonline.com/tenant/oauth2/v2.0/token
? Does this OAuth flow require a scope? Yes
? OAuth scope: https://api.azure.com/.default
```

**2. Manually add to .env**:

```bash
echo "AZURE_CLIENT_ID=abc-123-def" >> ~/.grimoire/.env
echo "AZURE_CLIENT_SECRET=xyz-789-uvw" >> ~/.grimoire/.env
```

**3. Spell file**:

```yaml
name: azure-api
version: 1.0.0
description: Azure API integration
keywords: [azure, microsoft, cloud]
server:
  transport: sse
  url: https://api.azure.com/mcp
  auth:
    type: client_credentials
    clientId: ${AZURE_CLIENT_ID}
    clientSecret: ${AZURE_CLIENT_SECRET}
    tokenUrl: https://login.microsoftonline.com/tenant/oauth2/v2.0/token
    scope: https://api.azure.com/.default
```

**4. Gateway spawning**:

```
→ createAuthProvider(auth) creates ClientCredentialsProvider
→ provider.getAccessToken():
  1. POST to tokenUrl with Basic Auth (clientId:clientSecret)
  2. Response: { access_token: "ey...", expires_in: 3600 }
  3. Cache token for 3600s (with 10% margin = 3240s)
→ Header: Authorization: Bearer ey...
```

### Example 4: stdio with Environment Variables (Python Script)

**1. Create spell**:

```bash
grimoire create

? Spell name: python-data
? Transport type: stdio
? Command to run: python
? Arguments: /opt/scripts/data_processor.py
? Does this server require environment variables? Yes
? Environment variable name: DATABASE_URL
? Environment variable value: postgresql://localhost/mydb
? Add another environment variable? Yes
? Environment variable name: API_KEY
? Environment variable value: ${DATA_API_KEY}
```

**2. Spell file**:

```yaml
name: python-data
version: 1.0.0
description: Python data processing MCP server
keywords: [python, data, processing, etl]
server:
  transport: stdio
  command: python
  args:
    - /opt/scripts/data_processor.py
  env:
    DATABASE_URL: ${DATABASE_URL}
    API_KEY: ${DATA_API_KEY}
```

**3. Environment file**:

```
DATABASE_URL=postgresql://localhost/mydb
DATA_API_KEY=secret-data-key-789
```

**4. Gateway spawning**:

```
→ Expand env vars:
  DATABASE_URL: ${DATABASE_URL} → postgresql://localhost/mydb
  API_KEY: ${DATA_API_KEY} → secret-data-key-789
→ spawn child process:
  python /opt/scripts/data_processor.py
  with env:
    DATABASE_URL=postgresql://localhost/mydb
    API_KEY=secret-data-key-789
→ Python script reads: os.environ['API_KEY']
```

---

## Troubleshooting

### Error: "Bearer token expanded to empty string"

**Cause**: `${VAR_NAME}` not found in .env or process.env

**Solution**:

```bash
# Check .env file
cat ~/.grimoire/.env

# Add missing variable
echo "VAR_NAME=your-value" >> ~/.grimoire/.env

# Or export in shell
export VAR_NAME=your-value
```

### Error: "Basic Auth requires both username and password"

**Cause**: Username or password is empty after expansion

**Solution**:

```bash
# Check spell file
cat ~/.grimoire/your-spell.spell.yaml
# Look for:
#   username: ${API_USERNAME}
#   password: ${API_PASSWORD}

# Add to .env
echo "API_USERNAME=your-username" >> ~/.grimoire/.env
echo "API_PASSWORD=your-password" >> ~/.grimoire/.env
```

### Error: "Missing environment variables"

**Cause**: Placeholder not resolved during spawning

**Solution**:

```bash
# Grimoire shows helpful message:
# Missing environment variables for spell 'my-spell': API_KEY
# Add these to ~/.grimoire/.env file.

echo "API_KEY=your-key-here" >> ~/.grimoire/.env

# Grimoire auto-reloads .env (no restart needed)
```

### OAuth Token Expired

**Cause**: Cached OAuth token expired

**Solution**: Automatic! Gateway auto-refreshes expired tokens.

**Debug**:

```bash
# Check logs
tail -f ~/.grimoire/logs/grimoire.log

# Look for:
[AUTH] OAuth token expired, refreshing...
[AUTH] New token obtained, expires in 3600s
```

### Probing Fails with Auth

**Cause**: Incorrect credentials or server not running

**Solution**:

```bash
# Test manually first
curl -H "Authorization: Bearer your-token" http://localhost:8001

# If working, try probe again
grimoire create -n test -t http --url http://localhost:8001 \
  --auth-type bearer --auth-token "your-token" \
  --probe --no-interactive

# Check detailed logs
grimoire create --verbose ...
```

### stdio Server Not Getting Environment Variables

**Cause**: Env vars not passed to child process

**Debug**:

```bash
# Check spell file has env section
cat ~/.grimoire/your-spell.spell.yaml

# Should have:
server:
  transport: stdio
  command: python
  args: [/path/to/script.py]
  env:
    API_KEY: ${YOUR_API_KEY}

# Check .env file
grep YOUR_API_KEY ~/.grimoire/.env

# Test Python script directly
export YOUR_API_KEY=test-value
python /path/to/script.py
```

---

## Security Best Practices

### 1. Never Commit .env Files

```bash
# Add to .gitignore
echo ".env" >> ~/.grimoire/.gitignore
```

### 2. Use Placeholders in YAML

✅ **Good**:

```yaml
auth:
  type: bearer
  token: ${API_TOKEN} # Placeholder
```

❌ **Bad**:

```yaml
auth:
  type: bearer
  token: sk-abc123xyz # Literal secret!
```

### 3. File Permissions

```bash
# Verify .env permissions
ls -la ~/.grimoire/.env
# Should show: -rw------- (0600)

# Fix if needed
chmod 600 ~/.grimoire/.env
```

### 4. Rotate Credentials Regularly

```bash
# Update in one place
vim ~/.grimoire/.env

# Grimoire auto-reloads (100ms debounce)
# No restart needed!
```

### 5. Use Different Credentials per Environment

```bash
# Development
# ~/.grimoire/.env
API_TOKEN=dev-token-123

# Production (different machine)
# ~/.grimoire/.env
API_TOKEN=prod-token-xyz
```

---

## Summary Table

| Auth Type                | Transports       | Header/Env            | Probing | Gateway | CLI Flags                                                                             |
| ------------------------ | ---------------- | --------------------- | ------- | ------- | ------------------------------------------------------------------------------------- |
| None                     | stdio, HTTP, SSE | -                     | ✅      | ✅      | -                                                                                     |
| Bearer                   | HTTP, SSE        | Authorization: Bearer | ✅      | ✅      | --auth-type bearer --auth-token                                                       |
| Basic Auth               | HTTP, SSE        | Authorization: Basic  | ✅      | ✅      | --auth-type basic --auth-username --auth-password                                     |
| OAuth Client Credentials | HTTP, SSE        | Authorization: Bearer | ✅      | ✅      | --auth-type client_credentials --auth-client-id --auth-client-secret --auth-token-url |
| Custom Headers           | HTTP, SSE        | Custom header name    | ✅      | ✅      | --headers "Key=Value"                                                                 |
| Environment Variables    | stdio only       | Child process env     | ✅      | ✅      | --env "KEY=value"                                                                     |

---

## References

- ADR-0011: Multi-Tier Authentication for HTTP/SSE Transports
- ADR-0012: Prioritize Bearer Token Authentication Over OAuth
- ADR-0013: Use Environment Variable Expansion for Secrets
- ADR-0014: Three-Phase OAuth Implementation Strategy
- ADR-0015: Environment Variable Resolution with .env File

---

**End of Authentication Implementation Guide**
