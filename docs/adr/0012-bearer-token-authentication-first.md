# 12. Prioritize Bearer Token Authentication Over OAuth

Date: 2026-01-15

## Status

Proposed

## Context

Analysis of real-world authenticated MCP servers and APIs shows a clear usage pattern:

**Authentication Methods in Practice:**

- **80%** use simple API keys via Bearer tokens (GitHub, Stripe, most SaaS APIs)
- **15%** use OAuth Client Credentials for machine-to-machine authentication
- **5%** require full OAuth 2.1 with user consent flows

**Current Implementation Gap:**

- **stdio servers:** 100% coverage - environment variables work perfectly
  - Evidence: `stdio-auth-test-server.ts` validates env var authentication
  - Evidence: `create-with-env.integration.test.ts` proves env vars work in practice
- **HTTP/SSE servers:** 0% coverage - cannot authenticate at all
  - Evidence: No HTTP/SSE authentication tests exist
  - Evidence: `process-lifecycle.ts` shows no auth parameters passed

**MCP SDK Capabilities:**

The MCP SDK supports both approaches:

- Bearer tokens via `requestInit` headers (simple, direct)
- OAuth 2.1 via `authProvider` interface (complex, requires token management)

**User Impact:**

Currently, users cannot connect to ANY authenticated remote servers. This is a complete blocker for:

- Public SaaS APIs (Stripe, GitHub, etc.)
- Internal enterprise APIs
- Cloud service integrations
- Authenticated database connections

## Decision

Implement **Bearer token authentication (Phase 1) first**, then OAuth Client Credentials (Phase 2), then full OAuth 2.1 with PKCE (Phase 3).

### Phase 1 Implementation Details

1. **Add `AuthConfig` type** with bearer token support

   ```typescript
   interface AuthConfig {
     type: 'bearer' | 'client_credentials' | 'oauth2' | 'none';
     token?: string; // For Bearer tokens
     // OAuth fields for later phases
   }
   ```

2. **Implement `buildAuthHeaders()`** to add Authorization header

   ```typescript
   function buildAuthHeaders(
     customHeaders?: Record<string, string>,
     auth?: AuthConfig
   ): Record<string, string> {
     // Adds Authorization: Bearer <token> header
   }
   ```

3. **Support `${VAR}` environment variable expansion**
   - Same pattern as stdio transport
   - Secure: no hardcoded secrets

4. **Pass `requestInit` with headers to MCP SDK transports**
   - SSEClientTransport constructor accepts requestInit
   - StreamableHTTPClientTransport constructor accepts requestInit

**Follows YAGNI Principle:** Implement simplest solution that covers majority of use cases first.

## Consequences

### Positive Consequences

1. **Quick wins for 80% of users** - Most users only need Bearer tokens
2. **Simple implementation** - Reduces risk of bugs, easier to test
3. **Secure credential management** - Environment variable expansion prevents hardcoded secrets
4. **Consistent with stdio** - Both transports use env vars, familiar pattern
5. **Can release faster if needed** - If OAuth implementation faces delays, working solution exists

### Negative Consequences

1. **OAuth users must wait** - Users needing OAuth must wait for Phase 2/3
   - Mitigation: All phases implemented together in single release
2. **Two auth patterns** - Bearer vs OAuth adds some complexity
   - Mitigation: Clear separation of concerns, both well-documented
3. **No auto-refresh** - Bearer tokens don't auto-refresh like OAuth tokens
   - Mitigation: Most APIs use long-lived API keys, not expiring tokens

### Risks

- **Bearer token security** - Tokens in environment variables could leak
  - Mitigation: Standard practice, same as stdio transport, document best practices
- **Token rotation** - No built-in support for rotating tokens
  - Mitigation: Users can update env vars and restart gateway (acceptable for Phase 1)

## Alternatives Considered

### Alternative 1: Implement OAuth 2.1 First

**Pros:**

- Full spec compliance immediately
- Single authentication mechanism
- Professional enterprise solution

**Cons:**

- Over-engineering for 80% of users (YAGNI violation)
- Much more complex implementation (higher risk)
- Longer time to deliver working solution
- Worse developer experience for simple API keys

**Why rejected:** Violates YAGNI principle. 80% of users don't need OAuth complexity. Bearer tokens are sufficient and simpler.

### Alternative 2: Support Only OAuth, No Bearer Tokens

**Pros:**

- Single mechanism to learn and document
- Forces best practices
- OAuth provides better security features

**Cons:**

- Forces unnecessary complexity on majority of users
- Worse onboarding experience
- Many APIs don't support OAuth (only API keys)
- Alienates 80% of potential users

**Why rejected:** Poor user experience. Forcing OAuth for simple API keys is overkill and adds friction.

### Alternative 3: Support Query Parameter Tokens

**Pros:**

- Some legacy APIs use this pattern
- Simple to implement

**Cons:**

- **MAJOR SECURITY RISK** - Tokens appear in logs, browser history, etc.
- **MCP spec explicitly forbids** tokens in query strings
- Encourages bad security practices
- URLs may be cached by intermediaries

**Why rejected:** Major security risk. MCP specification explicitly forbids this pattern. Would encourage insecure practices.

## Implementation Priority

Phase 1 (Bearer tokens) covers:

- GitHub API (`GITHUB_PERSONAL_ACCESS_TOKEN`)
- Stripe API (`STRIPE_API_KEY`)
- Most REST APIs with simple API keys
- Internal APIs with Bearer authentication
- **80% of real-world use cases**

Phase 2 (OAuth Client Credentials) adds:

- Machine-to-machine OAuth
- Auth0, Okta, Azure AD service principals
- **15% of real-world use cases**

Phase 3 (OAuth Authorization Code + PKCE) adds:

- User-based OAuth flows
- Browser-based consent
- **5% of real-world use cases (mostly SaaS integrations)**

## References

- [ADR-0011 - Multi-Tier Authentication Strategy](./0011-http-sse-authentication-multi-tier-strategy.md)
- [YAGNI Principle - CLAUDE.md](../../CLAUDE.md#yagni-you-arent-gonna-need-it)
- [GitHub Personal Access Tokens Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Stripe API Authentication](https://stripe.com/docs/api/authentication)
- [MCP Specification - Security](https://spec.modelcontextprotocol.io/specification/2025-01-15/security/)
