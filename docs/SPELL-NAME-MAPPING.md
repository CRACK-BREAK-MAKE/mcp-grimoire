# Spell Name Mapping - Test Files

**Date**: January 21, 2026  
**Purpose**: Document spell names used in integration tests matching actual MCP server names

---

## Overview

Integration tests now use **MCP server names** directly as spell names, rather than generic test names. This ensures:

- ✅ **Authentic testing**: Spell names reflect real-world usage
- ✅ **Unique artifacts**: Each test preserves its spell file for manual verification
- ✅ **Clear mapping**: Easy to identify which spell belongs to which server

---

## Server Name Mapping

Based on FastMCP constants in `tests/fastmcp/src/common/constants.py`:

| Test File                                                    | Old Spell Name                   | New Spell Name           | Server Name (from constants)                         |
| ------------------------------------------------------------ | -------------------------------- | ------------------------ | ---------------------------------------------------- |
| `cli-create-basic-auth-http.integration.test.ts`             | `test-basic-auth-http-spell`     | `project-manager`        | Project Manager v1.0                                 |
| `cli-create-basic-auth-sse.integration.test.ts`              | `test-basic-auth-sse-spell`      | `file-storage-service`   | File Storage Service v1.0                            |
| `cli-create-api-key-http.integration.test.ts`                | `test-api-key-http-spell`        | `weather-api`            | Weather API v2.0                                     |
| `cli-create-api-key-sse.integration.test.ts` (Test 1)        | `test-api-key-sse-spell`         | `news-aggregator-bearer` | News Aggregator v1.5 (Bearer auth)                   |
| `cli-create-api-key-sse.integration.test.ts` (Test 2)        | `test-api-key-sse-custom-header` | `news-aggregator-header` | News Aggregator v1.5 (Custom header)                 |
| `cli-create-security-keys-http.integration.test.ts` (GitHub) | `test-security-keys-http-spell`  | `github-mcp-http`        | Database Query Tool v1.0 (simulating GitHub MCP)     |
| `cli-create-security-keys-http.integration.test.ts` (Brave)  | `test-security-keys-http-spell`  | `brave-mcp-http`         | Database Query Tool v1.0 (simulating Brave MCP)      |
| `cli-create-security-keys-sse.integration.test.ts` (GitHub)  | `test-security-keys-sse-spell`   | `github-mcp-sse`         | Database Query Tool SSE v1.0 (simulating GitHub MCP) |
| `cli-create-security-keys-sse.integration.test.ts` (Brave)   | `test-security-keys-sse-spell`   | `brave-mcp-sse`          | Database Query Tool SSE v1.0 (simulating Brave MCP)  |
| `cli-create-no-auth-http.integration.test.ts`                | `test-no-auth-http-spell`        | `calculator-utilities`   | Calculator & Utilities v1.0                          |
| `cli-create-no-auth-sse.integration.test.ts`                 | `test-no-auth-sse-spell`         | `system-monitor`         | System Monitor v1.0                                  |
| `cli-create-stdio-capjs.integration.test.ts`                 | `test-stdio-capjs-spell`         | `cds-mcp`                | cds-mcp (CAP.js server)                              |
| `cli-create-stdio-ui5-with-env.integration.test.ts`          | `test-stdio-ui5-env-spell`       | `ui5-mcp`                | UI5 MCP server                                       |

---

## Expected Spell Files After Full Test Run

Running all 10 integration test files will create **14 spell files** (some tests create multiple spells):

```
~/.grimoire/
├── project-manager.spell.yaml         # Basic Auth HTTP
├── file-storage-service.spell.yaml    # Basic Auth SSE
├── weather-api.spell.yaml             # API Key HTTP
├── news-aggregator-bearer.spell.yaml  # API Key SSE (Bearer)
├── news-aggregator-header.spell.yaml  # API Key SSE (Custom header)
├── github-mcp-http.spell.yaml         # Security Keys HTTP (GitHub)
├── brave-mcp-http.spell.yaml          # Security Keys HTTP (Brave)
├── github-mcp-sse.spell.yaml          # Security Keys SSE (GitHub)
├── brave-mcp-sse.spell.yaml           # Security Keys SSE (Brave)
├── calculator-utilities.spell.yaml    # No Auth HTTP
├── system-monitor.spell.yaml          # No Auth SSE
├── cds-mcp.spell.yaml                 # stdio CAP.js
├── ui5-mcp.spell.yaml                 # stdio UI5 with env
└── .env                               # Environment variables
```

---

## Key Changes

### Security Keys Tests (HTTP & SSE)

**Before**: Both GitHub and Brave tests used the same spell name, so the second test overwrote the first.

```typescript
// OLD: Single spell name for all tests
const testSpellName = 'test-security-keys-http-spell';

it('GitHub test') { /* creates spell */ }
it('Brave test') {
  await rm(spellFilePath); // DELETES GitHub spell!
  /* creates new spell */
}
```

**After**: Each test uses a unique spell name.

```typescript
// NEW: Unique spell name per test
it('GitHub test') {
  const testSpellName = 'github-mcp-http';
  /* creates spell */
}
it('Brave test') {
  const testSpellName = 'brave-mcp-http';
  /* creates spell - no deletion */
}
```

### API Key SSE Tests

**Before**: Multiple tests used similar names but not based on server.

**After**: Clear differentiation between Bearer auth and custom header tests.

---

## File Overwrite Behavior

The `create.ts` command automatically **overwrites** existing spell files without prompting:

```typescript
// In create.ts
writeFileSync(filePath, template, 'utf-8'); // Overwrites by default
```

**Behavior**:

- ✅ Non-interactive mode: Silently overwrites if spell exists
- ✅ Interactive mode: Silently overwrites if spell exists
- ❌ No confirmation prompt (by design for test efficiency)

This is intentional for the following reasons:

1. **User is in control**: They chose the spell name
2. **Conscious action**: Creating a spell with existing name implies replacement
3. **Test efficiency**: Tests can re-run without cleanup
4. **Simple UX**: No "are you sure?" prompts to interrupt workflow

---

## Verification Commands

### List all spell files

```bash
ls -1 ~/.grimoire/*.spell.yaml | sort
```

### Count spell files

```bash
ls -1 ~/.grimoire/*.spell.yaml 2>/dev/null | wc -l
```

### Show spell names only

```bash
ls -1 ~/.grimoire/*.spell.yaml | xargs -n1 basename | sed 's/.spell.yaml$//'
```

### Clean up test spell files

```bash
rm ~/.grimoire/*.spell.yaml
rm ~/.grimoire/.env
```

---

## Testing Workflow

1. **Run all tests**:

   ```bash
   pnpm vitest --run src/cli/__tests__/cli-create-*.integration.test.ts
   ```

2. **Verify 14 spell files created**:

   ```bash
   ls -1 ~/.grimoire/*.spell.yaml | wc -l
   # Expected output: 14
   ```

3. **Manually inspect spell files** to verify:
   - Correct server names in descriptions
   - Proper credential placeholders in YAML
   - Literal values in `.env` file
   - Keywords match tool names

4. **Clean up after verification**:
   ```bash
   rm ~/.grimoire/*.spell.yaml ~/.grimoire/.env
   ```

---

## Benefits

### 1. **Authentic Naming**

Spell names now match real MCP servers users would create:

- `github-mcp-http` vs `test-security-keys-http-spell`
- `weather-api` vs `test-api-key-http-spell`

### 2. **Unique Artifacts**

Each test preserves its spell file for manual verification:

- No overwrites between tests
- Easy to identify which test created which file
- Can inspect all spell files after test run

### 3. **Real-World Testing**

Tests now simulate actual user behavior:

- Users would name spells after services (`github-mcp`, not `test-xyz`)
- Demonstrates practical naming conventions
- Examples users can follow in documentation

---

## Notes

- **No prefix**: Removed `test-` prefix from spell names
- **Lowercase with hyphens**: Follows spell naming convention `/^[a-z0-9][a-z0-9-]*$/`
- **MCP suffix**: Added `-mcp` to stdio servers (cds-mcp, ui5-mcp) for clarity
- **Transport suffix**: Added transport type to security keys tests (github-mcp-**http** vs github-mcp-**sse**)
- **Auth suffix**: Added auth method to API Key SSE tests (bearer vs header)

---

**Last Updated**: January 21, 2026
