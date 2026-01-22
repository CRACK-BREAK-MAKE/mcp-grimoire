# OAuth2 Client Credentials Flow - Implementation Plan

## Current Status (Updated 2026-01-20)

### ✅ Completed Components

#### 1. OAuth2 Provider (Authorization Server) - FULLY WORKING ✅

**Files**: `tests/fastmcp/src/servers/oauth2/provider.py`

Implemented and tested:

- ✅ JWT token generation with proper claims (iss, sub, aud, exp, iat, jti, scope, client_id, grant_type)
- ✅ Client Credentials grant flow
- ✅ Token validation endpoint (`/oauth/validate`) with JWT signature verification
- ✅ Authorization Server metadata (`/.well-known/oauth-authorization-server`)
- ✅ Scope support: `mcp:tools:read`, `mcp:tools:write`, `mcp:tools:call`
- ✅ Token introspection with active status checking

**Verified Commands**:

```bash
# 1. AS Metadata
curl http://localhost:9000/.well-known/oauth-authorization-server | jq

# 2. Request Token
curl -X POST http://localhost:9000/oauth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=test-client-id" \
  -d "client_secret=test-client-secret" \
  -d "scope=mcp:tools:read mcp:tools:write" | jq

# 3. Validate Token
curl -X POST http://localhost:9000/oauth/validate \
  -H "Authorization: Bearer <token>" | jq
```

**Token Claims** (decoded JWT):

```json
{
  "iss": "http://localhost:9000",
  "sub": "test-client-id",
  "aud": "http://localhost:8005",
  "exp": 1768917873,
  "iat": 1768914273,
  "jti": "UbpH6Dq1hcOky1XVyPbIiw",
  "scope": "mcp:tools:read mcp:tools:write",
  "client_id": "test-client-id",
  "grant_type": "client_credentials"
}
```

#### 2. OAuth2 MCP Server (Resource Server) - IMPLEMENTED BUT BLOCKED ⚠️

**Files**: `tests/fastmcp/src/servers/oauth2/http_server.py`

Implemented:

- ✅ OAuth2BearerMiddleware for token validation
- ✅ Token validation against provider's `/oauth/validate` endpoint
- ✅ Proper 401 responses with WWW-Authenticate header
- ✅ PRM endpoint handler function (`protected_resource_metadata`)
- ✅ Scope checking in middleware
- ✅ MCP tools: greet, echo, add, get_oauth_info

**BLOCKER IDENTIFIED**:

- ⚠️ FastMCP SSE transport doesn't trigger custom middleware for authentication
- ⚠️ FastMCP doesn't easily support custom HTTP routes (PRM endpoint) alongside MCP SSE
- 🔍 Investigation shows middleware returns 401 for invalid auth, but SSE endpoint bypasses this

**Possible Solutions**:

1. **Switch to HTTP transport** - FastMCP HTTP transport may support custom routes better
2. **Separate PRM server** - Run PRM endpoint on port 8006, MCP on 8005
3. **Document PRM URL** - Hard-code PRM URL in configuration
4. **Use FastMCP HTTP transport with custom Starlette app** - Mount both MCP and PRM routes

### 🔄 In Progress

- Resolving FastMCP architectural limitation for authentication and custom routes
- Need to choose solution approach (HTTP transport vs separate PRM server)

### 📋 TODO (Remaining Phases)

- Complete MCP Server authentication and PRM endpoint deployment
- Phase 3: Implement OAuth2 detection in probing logic (mcp-probe.ts)
- Phase 4: Update CLI create command for OAuth2 flow
- Phase 5: Implement OAuth2TokenManager in client spawning
- Phase 6: Create integration tests

---

## Original Implementation Plan

## Current Status

- ✅ OAuth2 provider server exists (`provider.py`)
- ✅ OAuth2 HTTP MCP server exists (`http_server.py`)
- ⚠️ Flow is incomplete - missing proper Client Credentials with PRM discovery
- ⚠️ Probing logic doesn't support OAuth2 flow
- ⚠️ MCP client spawning doesn't support token acquisition

## Required Implementation

### Phase 1: MCP Server (Resource Server) Changes

#### 1.1 Protected Resource Metadata (PRM) Endpoint

**File**: `tests/fastmcp/src/servers/oauth2/http_server.py`

Add PRM endpoint that returns:

```json
{
  "authorization_servers": ["http://localhost:9000"],
  "resource": "http://localhost:8005/mcp",
  "bearer_methods_supported": ["header"],
  "resource_documentation": "http://localhost:8005/docs"
}
```

#### 1.2 Proper 401 Response with WWW-Authenticate Header

When request lacks valid token:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="MCP Server",
                  resource_metadata="http://localhost:8005/.well-known/oauth-protected-resource"
Content-Type: application/json

{
  "error": "invalid_token",
  "error_description": "Access token required"
}
```

### Phase 2: OAuth2 Provider (Authorization Server) Changes

#### 2.1 Client Credentials Token Endpoint

**File**: `tests/fastmcp/src/servers/oauth2/provider.py`

Enhance `handle_client_credentials()` to:

- Validate `client_id` and `client_secret` from request body
- Support scope validation (`mcp:tools:read`, `mcp:tools:write`)
- Generate JWT tokens with proper claims:
  ```json
  {
    "iss": "http://localhost:9000",
    "sub": "mcp-client",
    "aud": "http://localhost:8005",
    "exp": 1234567890,
    "iat": 1234567800,
    "scope": "mcp:tools:read mcp:tools:write",
    "client_id": "test-client-id"
  }
  ```

#### 2.2 Well-Known Endpoints

Add discovery endpoints:

- `/.well-known/oauth-authorization-server` → Server metadata
- `/oauth/token` → Token endpoint (already exists)

### Phase 3: MCP Client Probing Logic Changes

#### 3.1 OAuth2 Detection in Probe

**File**: `src/cli/utils/mcp-probe.ts`

Add OAuth2 flow detection:

```typescript
async function probeMCPServer(config: ProbeConfig): Promise<ProbeResult> {
  // 1. Try initial request without token
  const response = await fetch(config.url);

  // 2. If 401 with WWW-Authenticate, detect OAuth2
  if (response.status === 401) {
    const wwwAuth = response.headers.get('www-authenticate');
    if (wwwAuth?.includes('resource_metadata')) {
      // Extract PRM URL and discover AS
      return await handleOAuth2Flow(config, wwwAuth);
    }
  }
}
```

#### 3.2 OAuth2 Token Acquisition

```typescript
async function handleOAuth2Flow(config: ProbeConfig, wwwAuth: string) {
  // 1. Fetch PRM document
  const prmUrl = extractPRMUrl(wwwAuth);
  const prm = await fetch(prmUrl).then((r) => r.json());

  // 2. Get AS endpoints
  const asUrl = prm.authorization_servers[0];
  const asMetadata = await fetch(`${asUrl}/.well-known/oauth-authorization-server`).then((r) =>
    r.json()
  );

  // 3. Request token from AS
  const tokenResponse = await fetch(asMetadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.oauth2?.clientId || 'default-client',
      client_secret: config.oauth2?.clientSecret || 'default-secret',
      scope: 'mcp:tools:read mcp:tools:write',
    }),
  });

  const { access_token } = await tokenResponse.json();

  // 4. Retry original request with token
  return await probeMCPServerWithToken(config, access_token);
}
```

### Phase 4: MCP Client Spawning Logic Changes

#### 4.1 Spell Configuration for OAuth2

**File**: `src/core/types.ts`

Add OAuth2 config to spell:

```typescript
interface SpellConfig {
  // ... existing fields
  server: {
    // ... existing fields
    auth?: {
      type: 'oauth2-client-credentials';
      authorizationServer: string; // AS URL
      clientId: string; // from .env: ${OAUTH2_CLIENT_ID}
      clientSecret: string; // from .env: ${OAUTH2_CLIENT_SECRET}
      scope?: string; // optional scopes
    };
  };
}
```

#### 4.2 Token Management in Client

**File**: `src/presentation/mcp-client-manager.ts`

Add token refresh logic:

```typescript
class OAuth2TokenManager {
  private token: string | null = null;
  private expiresAt: number = 0;

  async getToken(config: OAuth2Config): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) {
      return this.token;
    }

    // Fetch new token from AS
    const response = await this.fetchToken(config);
    this.token = response.access_token;
    this.expiresAt = Date.now() + response.expires_in * 1000;

    return this.token;
  }

  private async fetchToken(config: OAuth2Config) {
    // Implement token request to AS
  }
}
```

## Implementation Steps

### Step 1: Fix OAuth2 Provider (AS)

1. ✅ Review existing `provider.py`
2. ⬜ Enhance `handle_client_credentials()` with proper validation
3. ⬜ Add JWT token generation with claims
4. ⬜ Add `/.well-known/oauth-authorization-server` endpoint
5. ⬜ Add scope validation support

### Step 2: Fix OAuth2 MCP Server (RS)

1. ⬜ Add PRM endpoint (`/.well-known/oauth-protected-resource`)
2. ⬜ Update 401 responses with proper `WWW-Authenticate` header
3. ⬜ Implement proper JWT token validation
4. ⬜ Add token expiration checking

### Step 3: Update Probing Logic

1. ⬜ Add OAuth2 detection in `mcp-probe.ts`
2. ⬜ Implement PRM discovery
3. ⬜ Implement AS metadata discovery
4. ⬜ Implement token acquisition flow
5. ⬜ Add retry with Bearer token

### Step 4: Update CLI Create Command

1. ⬜ Detect OAuth2 during server probing
2. ⬜ Prompt user for `client_id` and `client_secret`
3. ⬜ Store credentials in `.env` file
4. ⬜ Generate spell with OAuth2 config

### Step 5: Update Client Spawning

1. ⬜ Add OAuth2TokenManager class
2. ⬜ Integrate token acquisition before MCP requests
3. ⬜ Add token refresh on 401 responses
4. ⬜ Pass Bearer token in Authorization header

### Step 6: Integration Tests

1. ⬜ Test OAuth2 provider standalone
2. ⬜ Test MCP server with OAuth2
3. ⬜ Test probing with OAuth2 flow
4. ⬜ Test client spawning with token refresh
5. ⬜ Test end-to-end flow

## Testing Strategy

### Manual Testing

```bash
# 1. Start OAuth2 provider
cd tests/fastmcp
uv run python -m servers.oauth2.provider

# 2. Start OAuth2 MCP server
uv run python -m servers.oauth2.http_server

# 3. Test token acquisition
curl -X POST http://localhost:9000/oauth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=test-client" \
  -d "client_secret=test-secret" \
  -d "scope=mcp:tools:read mcp:tools:write"

# 4. Test MCP server with token
curl http://localhost:8005/mcp \
  -H "Authorization: Bearer <token>"
```

### Integration Test

```typescript
describe('OAuth2 Client Credentials Flow', () => {
  it('should complete full OAuth2 flow', async () => {
    // 1. Start servers
    // 2. Probe server (triggers OAuth2 flow)
    // 3. Verify token acquisition
    // 4. Verify MCP connection with token
    // 5. Verify token refresh on expiration
  });
});
```

## Timeline Estimate

- Phase 1 (MCP Server): 2-3 hours
- Phase 2 (OAuth2 Provider): 2-3 hours
- Phase 3 (Probing Logic): 3-4 hours
- Phase 4 (Client Spawning): 3-4 hours
- Phase 5 (Testing): 2-3 hours
- **Total**: 12-17 hours of focused development

## Dependencies

- JWT library for token generation/validation
- Existing OAuth2 provider code
- Existing MCP probing infrastructure

## Success Criteria

✅ MCP client can discover OAuth2 AS from 401 response
✅ MCP client can acquire token using client credentials
✅ MCP client can successfully connect to protected MCP server
✅ Tokens are automatically refreshed on expiration
✅ Integration tests pass for complete OAuth2 flow
✅ Documentation updated with OAuth2 setup instructions
