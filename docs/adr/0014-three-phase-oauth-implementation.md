# 14. Three-Phase OAuth Implementation Strategy

Date: 2026-01-15

## Status

Proposed

## Context

Full OAuth 2.1 implementation is complex and includes:

**OAuth 2.1 Components:**

- Authorization endpoints (for user consent)
- Token endpoints (for obtaining tokens)
- PKCE (Proof Key for Code Exchange) - code verifier and challenge
- Refresh tokens (for long-lived sessions)
- Token caching (to avoid repeated token requests)
- Browser-based consent flows (launching browser, handling callback)
- Endpoint discovery (RFC 8414 well-known endpoints)
- Error handling with retries (401 responses, token expiry)

**Implementation Risk:**

Implementing everything at once is high risk:

- Complex to test all interactions
- Difficult to debug failures
- Hard to verify correctness
- High chance of subtle bugs

**User Requirement:**

User explicitly requested: "Let's create ADRs and implement all the phases at once so we can create proper integrations tests and release."

This creates a tension:

- Need incremental approach for development and testing
- Must deliver complete solution in single release (not separate releases)

**MCP Specification Requirements:**

The MCP spec requires:

1. OAuth 2.1 support (not 2.0)
2. PKCE for authorization code flow
3. Bearer token transmission via header (not query string)
4. No token passthrough (anti-pattern)
5. Token audience validation (RFC 8707)

**Current State:**

0% OAuth implementation exists. Starting from scratch.

## Decision

Implement OAuth support in **three incremental phases within a single release cycle**, following **strict TDD (Test-Driven Development)** methodology.

### Phase 1: Bearer Tokens (Simplest, Covers 80% Use Cases)

**Goal:** Enable simple API key authentication

**Components:**

- Implement `buildAuthHeaders()` function
- Environment variable expansion (`${VAR}`)
- `requestInit` with Authorization header
- No OAuth, no token management

**Test Strategy:**

- RED: Write tests for header building, env var expansion
- GREEN: Implement to pass tests
- REFACTOR: Extract constants, simplify functions

**Evidence it works:**

- Unit tests pass
- Integration tests with authenticated test server pass
- Can connect to real APIs (GitHub, Stripe)

### Phase 2: OAuth Client Credentials (Machine-to-Machine)

**Goal:** Enable OAuth for automated systems (no user interaction)

**Components:**

- Implement `ClientCredentialsProvider` class
- Token caching with expiry checking
- 401 error handling with automatic token refresh
- `authProvider` integration with MCP SDK

**Test Strategy:**

- RED: Write tests for token caching, refresh, 401 handling
- GREEN: Implement ClientCredentialsProvider
- REFACTOR: Extract token management logic

**Evidence it works:**

- Tokens cached correctly (only one request for multiple calls)
- Expired tokens refreshed automatically
- 401 errors trigger token refresh and retry

### Phase 3: OAuth Authorization Code + PKCE (Full Spec Compliance)

**Goal:** Enable full OAuth 2.1 with user consent

**Components:**

- Implement PKCE utilities (`generateCodeVerifier()`, `generateCodeChallenge()`)
- `AuthorizationCodeProvider` class
- Browser launch for user consent
- Local callback server for redirect handling
- Refresh token management
- Endpoint discovery (RFC 8414 `.well-known` endpoints)

**Test Strategy:**

- RED: Write tests for PKCE flow, browser launch, callback handling
- GREEN: Implement AuthorizationCodeProvider
- REFACTOR: Extract OAuth flow logic

**Evidence it works:**

- PKCE challenge/verifier validation works
- Browser opens with correct authorization URL
- Callback server receives authorization code
- Tokens obtained and cached
- Refresh tokens used when access token expires

### Development Workflow (Red-Green-Refactor)

For each phase:

1. **RED (Write Tests First)**
   - Write comprehensive unit tests
   - Write integration tests
   - All tests should fail initially

2. **GREEN (Make Tests Pass)**
   - Implement minimum code to pass tests
   - Don't worry about code quality yet
   - Focus on correctness

3. **REFACTOR (Improve Code)**
   - Extract constants
   - Simplify functions (<20 lines each)
   - Add JSDoc comments
   - Follow SRP strictly
   - Verify tests still pass

**Critical:** All phases completed before release. No partial releases.

## Consequences

### Positive Consequences

1. **Incremental complexity** - Can verify each phase works before building next
2. **TDD ensures quality** - Comprehensive test coverage at each level
3. **Clear separation of concerns** - Bearer vs OAuth Client Creds vs OAuth Full are distinct
4. **Easier debugging** - If Phase 3 has bugs, Phases 1-2 still functional
5. **Single release** - Users get complete solution immediately
6. **Proper integration testing** - Can test interactions between all phases before release

### Negative Consequences

1. **More complex development process** - Must plan all 3 phases upfront
2. **Cannot release early** - Must wait for all phases (no quick win release)
3. **Larger PR** - All 3 phases together means more code to review
4. **More integration testing** - Must test interactions between phases
5. **Higher initial risk** - If any phase has critical bugs, delays entire release

### Risks

- **Phase 3 complexity** - OAuth Authorization Code flow is complex
  - Mitigation: Leverage MCP SDK's `OAuthClientProvider`, follow RFC strictly
- **Testing browser flows** - Difficult to test browser launch and callback
  - Mitigation: Mock browser launch, use test server for OAuth endpoints
- **Token security** - Improper token storage could leak credentials
  - Mitigation: Store tokens in memory only (Phase 1-3), no disk persistence

## Alternatives Considered

### Alternative 1: Single-Phase Implementation (All OAuth at Once)

**Pros:**

- Only one implementation phase
- Only one round of testing

**Cons:**

- Too complex to test all interactions
- High risk of bugs
- Hard to debug failures
- Violates incremental development principle
- If bugs found, hard to isolate which component

**Why rejected:** Too risky. Complex systems should be built incrementally with testing at each stage.

### Alternative 2: Phased Releases (Release Phase 1, Get Feedback, Then Phase 2, etc.)

**Pros:**

- Can get early user feedback on Phase 1
- Smaller PRs to review
- Lower risk per release
- Can iterate based on user needs

**Cons:**

- User explicitly requested all phases at once
- Cannot test full integration until Phase 3
- May introduce breaking changes between phases
- Violates user requirement

**Why rejected:** User explicitly requested "implement all the phases at once so we can create proper integrations tests and release." Cannot ignore direct requirement.

### Alternative 3: Skip OAuth Entirely, Only Bearer Tokens

**Pros:**

- Simplest implementation (1 day)
- Covers 80% of use cases
- Low risk

**Cons:**

- Violates MCP specification requirements
- Blocks future remote server integrations
- Technical debt (must revisit later)
- Incomplete solution

**Why rejected:** MCP specification requires OAuth 2.1 support. Skipping it creates technical debt and blocks compliance.

## Implementation Order

**Total Effort:** 4.5 days (all phases)

### Step 0: ADRs (0.5 days) ✅

- ADR-0011: Multi-Tier Authentication Strategy
- ADR-0012: Bearer Token First Approach
- ADR-0013: Environment Variable Expansion
- ADR-0014: Three-Phase OAuth Strategy (this document)

### Steps 1-3: Phase 1 (1 day)

- Write Phase 1 tests (RED)
- Implement Phase 1 (GREEN)
- Refactor Phase 1 (REFACTOR)

### Steps 4-6: Phase 2 (1 day)

- Write Phase 2 tests (RED)
- Implement Phase 2 (GREEN)
- Refactor Phase 2 (REFACTOR)

### Steps 7-9: Phase 3 (1.5 days)

- Write Phase 3 tests (RED)
- Implement Phase 3 (GREEN)
- Refactor Phase 3 (REFACTOR)

### Step 10: Documentation (0.5 days)

- Update README.md
- Update docs/remote-mcp-servers.md
- Update docs/architecture.md
- Add usage examples

## Success Criteria

**Phase 1 Complete:**

- [ ] Can connect to GitHub API with Bearer token
- [ ] Can connect to Stripe API with API key
- [ ] Environment variable expansion works
- [ ] All Phase 1 tests pass

**Phase 2 Complete:**

- [ ] Tokens cached correctly
- [ ] Expired tokens refreshed automatically
- [ ] 401 errors handled with retry
- [ ] All Phase 2 tests pass

**Phase 3 Complete:**

- [ ] PKCE flow works correctly
- [ ] Browser opens for consent
- [ ] Callback server handles redirect
- [ ] Refresh tokens used appropriately
- [ ] All Phase 3 tests pass

**Release Ready:**

- [ ] All phases complete
- [ ] All tests passing
- [ ] Documentation updated
- [ ] No regressions in stdio auth
- [ ] Integration tests covering all auth types pass

## References

- [ADR-0011 - Multi-Tier Authentication Strategy](./0011-http-sse-authentication-multi-tier-strategy.md)
- [ADR-0012 - Bearer Token First Approach](./0012-bearer-token-authentication-first.md)
- [ADR-0013 - Environment Variable Expansion](./0013-environment-variable-expansion-for-secrets.md)
- [TDD Guidelines - CLAUDE.md](../../CLAUDE.md#test-driven-development)
- [RFC 9728 - OAuth 2.1](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [Implementation Plan](/.claude/plans/eager-wishing-lightning.md)
