# 13. Use Environment Variable Expansion for Secrets in Spell Configs

Date: 2026-01-15

## Status

Proposed

## Context

**Security Best Practice:** Never hardcode secrets (API keys, tokens, credentials) in configuration files that might be committed to version control.

**Current State:**

- **stdio transport:** Uses environment variables successfully
  - Evidence: `create-with-env.integration.test.ts` proves this works
  - Pattern: `env: { API_KEY: ${API_KEY} }` in spell config
  - Child process receives: `process.env.API_KEY` with actual value
- **HTTP/SSE transports:** Need credential management for:
  - Bearer tokens
  - OAuth client secrets
  - Custom header values

**Credential Management Options Considered:**

1. **Direct values in YAML** - Simple but insecure (secrets committed to git)
2. **External secret management system** - Over-engineering (AWS Secrets Manager, Vault)
3. **Environment variable references with `${VAR}` syntax** - Consistent, simple, secure
4. **Encrypted credentials in config** - Complex, key management burden

**User Experience Considerations:**

Users are already familiar with `${VAR}` syntax from:

- Shell scripts: `echo ${HOME}`
- Docker: `environment: - API_KEY=${API_KEY}`
- GitHub Actions: `${{ secrets.API_KEY }}`
- Kubernetes: `env: - name: API_KEY valueFrom: secretKeyRef:`

## Decision

Support **`${VAR}` environment variable expansion syntax** in spell configuration files for all credential fields (Bearer tokens, OAuth client secrets, custom header values).

### Implementation Details

1. **Pattern Detection:** When reading auth config, detect `${VAR_NAME}` pattern using regex
2. **Runtime Replacement:** Replace with `process.env.VAR_NAME` value at spawn time
3. **YAML Storage:** Store original `${VAR}` in YAML (not expanded value) - safe to commit
4. **Error Handling:** Log warnings if referenced env vars are undefined

### Example Configuration

```yaml
# ~/.grimoire/github.spell.yaml
name: github
server:
  transport: http
  url: https://api.github.com/mcp
  auth:
    type: bearer
    token: ${GITHUB_TOKEN} # Expands to process.env.GITHUB_TOKEN at runtime
```

### Consistency with stdio Transport

This matches stdio transport behavior where env vars are passed directly to child processes:

```yaml
# stdio transport (existing)
server:
  transport: stdio
  command: npx
  args: ['-y', '@modelcontextprotocol/server-github']
  env:
    GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN}
```

## Consequences

### Positive Consequences

1. **No secrets hardcoded** - YAML files safe to commit to git
2. **Consistent with stdio** - Same credential management approach across all transports
3. **Simple implementation** - Regex replacement, no external dependencies
4. **Familiar syntax** - Users already know `${VAR}` from shell, Docker, etc.
5. **No external dependencies** - No need for dotenv, AWS SDK, Vault client, etc.
6. **Cross-platform** - Works on Linux, macOS, Windows

### Negative Consequences

1. **User must set env vars** - Must run `export API_KEY=xxx` before starting grimoire
   - Mitigation: Document in README, error messages guide users
2. **No validation until runtime** - Can't validate env vars exist when editing YAML
   - Mitigation: `grimoire validate` command can check for undefined vars
3. **Error messages less clear** - Shows "empty token" instead of "GITHUB_TOKEN undefined"
   - Mitigation: Add specific error message when expansion results in empty string
4. **Cannot use literal `${VAR}` strings** - Must escape if needed in actual config values
   - Mitigation: Rare edge case, document escaping with `\${VAR}` if needed

### Risks

- **Env var typos** - `${GITHUB_TOKNE}` won't be caught until runtime
  - Mitigation: Validate during spell creation, lint command
- **Env var leakage** - Process environment visible to all child processes
  - Mitigation: Standard practice, same as stdio transport
- **Shell injection** - Malicious env var values could cause issues
  - Mitigation: Values used as strings, not executed as commands

## Alternatives Considered

### Alternative 1: Hardcode Secrets in YAML

**Pros:**

- No environment setup required
- Works immediately
- Simple user experience

**Cons:**

- **MAJOR SECURITY RISK** - Secrets committed to git
- **Accidental exposure** - Git history retains secrets even after removal
- **Sharing configs impossible** - Can't share spell configs without exposing credentials
- **Violation of security best practices** - Industry standard to never hardcode secrets

**Why rejected:** Unacceptable security risk. Accidental git commits would expose credentials.

### Alternative 2: Separate `.env` File with dotenv Library

**Pros:**

- Popular pattern in Node.js
- Clear separation of secrets
- Can `.gitignore` the `.env` file

**Cons:**

- Adds dependency (`dotenv` package)
- Not consistent with stdio approach (no `.env` file used there)
- Another file to manage
- Different pattern than stdio transport

**Why rejected:** Adds unnecessary dependency and inconsistent with stdio pattern. Environment variables already work without dotenv.

### Alternative 3: External Secret Management (AWS Secrets Manager, HashiCorp Vault)

**Pros:**

- Enterprise-grade security
- Centralized secret management
- Audit logging
- Secret rotation support
- Fine-grained access control

**Cons:**

- **YAGNI violation** - Over-engineering for local tool
- Requires cloud account or Vault server
- Complex setup and maintenance
- Network dependency (fails offline)
- Adds significant dependencies
- Overkill for local development tool

**Why rejected:** Massive over-engineering for a local CLI tool. YAGNI principle applies - users needing this can implement it externally.

### Alternative 4: Encrypted Credentials with Master Key

**Pros:**

- Secrets encrypted at rest
- Can commit encrypted values to git
- No external dependencies

**Cons:**

- Key management complexity (where to store master key?)
- Must enter master password on startup
- If master key lost, all secrets lost
- Still need secure place for master key (chicken-and-egg problem)

**Why rejected:** Key management complexity defeats the purpose. Where do you securely store the master key? Still ends up in environment variables anyway.

## Implementation Example

```typescript
/**
 * Expand environment variable references: ${VAR} → process.env.VAR
 *
 * Examples:
 *   expandEnvVar('${API_KEY}') → 'sk-1234567890'
 *   expandEnvVar('Bearer ${TOKEN}') → 'Bearer abc123'
 *   expandEnvVar('literal text') → 'literal text'
 */
function expandEnvVar(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    const envValue = process.env[varName];
    if (!envValue) {
      logger.warn(`Environment variable ${varName} is not set`);
      return '';
    }
    return envValue;
  });
}
```

## User Documentation

README should include:

````markdown
### Using Environment Variables for Secrets

Never hardcode API keys in spell configurations. Use environment variable expansion:

```yaml
server:
  transport: http
  url: https://api.example.com
  auth:
    type: bearer
    token: ${MY_API_KEY}
```
````

Set the environment variable before running grimoire:

```bash
export MY_API_KEY=sk-1234567890
npx grimoire
```

For permanent setup, add to your shell profile (~/.bashrc, ~/.zshrc):

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
export STRIPE_API_KEY=sk_live_xxxxxxxxxxxx
```

```

## References

- [ADR-0011 - Multi-Tier Authentication Strategy](./0011-http-sse-authentication-multi-tier-strategy.md)
- [OWASP - Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [12-Factor App - III. Config](https://12factor.net/config)
- [GitHub - Removing Sensitive Data from Repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [stdio-auth-test-server.ts](../../tests/fixtures/test-servers/stdio-auth-test-server.ts) - Example of env var authentication
- [create-with-env.integration.test.ts](../../src/cli/__tests__/create-with-env.integration.test.ts) - Evidence it works
```
