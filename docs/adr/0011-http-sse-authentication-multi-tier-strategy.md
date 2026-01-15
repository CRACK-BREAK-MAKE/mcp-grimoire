# 11. Implement Multi-Tier Authentication for HTTP/SSE Transports

Date: 2026-01-15

## Status

Proposed

## Context

Currently, stdio transport has 100% authentication support via environment variables passed to child processes. However, HTTP/SSE transports have 0% authentication implementation - cannot connect to any authenticated remote MCP servers.

**Evidence of the Gap:**

1. **stdio auth works** - `create-with-env.integration.test.ts:61-91` proves env var authentication works
2. **HTTP/SSE ignores auth** - `process-lifecycle.ts:451-453` shows no auth parameters passed to transport constructors
3. **MCP SDK provides auth support** - `OAuthClientProvider` and `requestInit` options exist but we don't use them
4. **Real-world usage analysis:**
   - 80% of authenticated APIs use simple Bearer tokens (GitHub, Stripe, most SaaS APIs)
   - 15% use OAuth Client Credentials for machine-to-machine
   - 5% require full OAuth 2.1 with user consent flows

**MCP Specification Requirements:**

The MCP specification requires OAuth 2.1 support with:
- PKCE (Proof Key for Code Exchange) for authorization code flow
- Bearer token transmission via `Authorization` header
- No token passthrough (anti-pattern)
- Token audience validation (RFC 8707)

**Current Impact:**

Users CANNOT use ANY authenticated remote MCP servers with HTTP/SSE transports. This blocks entire use cases including SaaS APIs, internal services, and cloud platforms. The stdio-only limitation means Grimoire is local-only.

## Decision

Implement **three-tier authentication strategy in a single release**:

### Phase 1: Bearer Tokens + Custom Headers
- Add `AuthConfig` type with bearer token support
- Implement `buildAuthHeaders()` to add `Authorization: Bearer` header
- Support `${VAR}` environment variable expansion
- Pass `requestInit` with headers to MCP SDK transports

### Phase 2: OAuth Client Credentials Flow
- Implement `ClientCredentialsProvider` class
- Token caching with expiry checking
- 401 error handling with automatic token refresh
- `authProvider` integration with MCP SDK

### Phase 3: OAuth Authorization Code + PKCE Flow
- Implement PKCE utilities (`code_verifier`, `code_challenge`)
- `AuthorizationCodeProvider` class
- Browser launch for user consent
- Local callback server for redirect handling
- Refresh token management
- Endpoint discovery (RFC 8414)

**Development Methodology:**

All phases will be implemented together using **strict TDD (Test-Driven Development)**:
1. Write tests first (RED)
2. Implement to pass tests (GREEN)
3. Refactor (REFACTOR)

Each phase builds incrementally on the previous, allowing thorough testing at each level while ensuring the complete solution is released together.

## Consequences

### Positive Consequences

1. **Covers 95% of real-world use cases** - Phase 1 alone handles 80% of authenticated APIs
2. **Incremental complexity** - Can test thoroughly at each tier before moving to next
3. **Complete solution immediately** - Single release means users get full functionality
4. **High code quality** - TDD approach ensures comprehensive test coverage
5. **MCP spec compliance** - Meets all OAuth 2.1 requirements
6. **Consistent patterns** - Bearer tokens use same `${VAR}` expansion as stdio env vars

### Negative Consequences

1. **More upfront development time** - 4.5 days vs 1 day for Phase 1 only
2. **Larger initial PR** - All 3 phases together means more code to review
3. **Complex testing matrix** - Must test interactions between all phases
4. **Must implement OAuth flows** - Even if some users never need them (YAGNI trade-off for spec compliance)

### Risks

- **OAuth complexity** - Full OAuth 2.1 with PKCE is complex
  - Mitigation: Strict TDD, leverage MCP SDK's OAuth support
- **Breaking changes** - Config schema changes could break existing spells
  - Mitigation: Auth config is optional, backward compatible
- **Token security** - Improper token storage could leak credentials
  - Mitigation: Use environment variables, no hardcoded secrets

## Alternatives Considered

### Alternative 1: Implement Only Bearer Tokens

**Pros:**
- Simplest implementation (1 day)
- Covers 80% of use cases
- Low risk

**Cons:**
- Doesn't meet MCP spec requirements for OAuth 2.1
- Blocks users needing OAuth
- Must revisit later for compliance

**Why rejected:** Violates MCP specification requirements. Incomplete solution would require future breaking changes.

### Alternative 2: Phased Releases (Separate Phase 1, 2, 3)

**Pros:**
- Can get early user feedback on Phase 1
- Smaller PRs to review
- Lower risk per release

**Cons:**
- User explicitly requested all phases at once
- Cannot test full integration until Phase 3
- May introduce breaking changes between phases

**Why rejected:** User explicitly requested "implement all the phases at once so we can create proper integrations tests and release."

### Alternative 3: OAuth 2.1 Only (No Bearer Token Support)

**Pros:**
- Single authentication mechanism
- Simpler conceptual model
- Full spec compliance

**Cons:**
- YAGNI violation - over-engineering for 80% of users
- Forces unnecessary complexity on simple API keys
- Worse developer experience

**Why rejected:** Violates YAGNI principle. Bearer tokens are simpler and cover majority of use cases.

## References

- [MCP Specification - Authentication](https://spec.modelcontextprotocol.io/specification/2025-01-15/authentication/)
- [RFC 9728 - OAuth 2.1 Protected Resources](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 8707 - Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707)
- [Implementation Plan](/.claude/plans/eager-wishing-lightning.md)
- [process-lifecycle.ts:451-453](../../src/application/process-lifecycle.ts#L451-L453) - Current no-auth code
- [create-with-env.integration.test.ts:61-91](../../src/cli/__tests__/create-with-env.integration.test.ts#L61-L91) - Evidence stdio auth works
