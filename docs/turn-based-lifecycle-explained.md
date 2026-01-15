# Turn-Based Lifecycle Management - Explained

**Last Updated**: 2026-01-14
**Status**: ⚠️ **Implementation Incomplete** - Code exists but not wired to gateway
**Reference**: [ADR-0006: 5-Turn Inactivity Threshold](adr/0006-five-turn-inactivity-threshold.md)

---

## Quick Summary

MCP Grimoire uses a **global turn counter** to track when MCP servers (spells) should be killed to prevent token accumulation. After **5 consecutive turns** without using a spell's tools, the spell is automatically killed and can be re-spawned later if needed.

**Key Principle**: **GLOBAL** turn tracking, not per-spell.

---

## Turn Definition

**Turn** = User message + AI response + Tool call(s)

Each interaction with the system increments the global turn counter by 1, regardless of which spell is used.

---

## How It Works

### Global State (in ProcessLifecycleManager)

```typescript
private currentTurn = 0;  // Single counter across ALL spells
private usageTracking = new Map<string, { lastUsedTurn: number }>();
```

### Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User sends message to Claude                             │
├─────────────────────────────────────────────────────────────┤
│ 2. Claude calls resolve_intent or tool                      │
│    → incrementTurn()        [currentTurn++]                 │
│    → markUsed(spellName)    [lastUsedTurn = currentTurn]    │
├─────────────────────────────────────────────────────────────┤
│ 3. Check for cleanup (after every tool call)                │
│    → getInactiveSpells(5)   [currentTurn - lastUsedTurn ≥ 5]│
│    → cleanupInactive(5)     [Kill inactive spells]          │
│    → notifyToolsChanged()   [Send tools/list_changed]       │
└─────────────────────────────────────────────────────────────┘
```

### Inactivity Calculation

```typescript
function getInactiveSpells(threshold: number): string[] {
  const inactive: string[] = [];

  for (const [spellName, usage] of usageTracking) {
    const turnsSinceUse = currentTurn - usage.lastUsedTurn;

    if (turnsSinceUse >= threshold) {
      inactive.push(spellName);  // Will be killed
    }
  }

  return inactive;
}
```

**Example**:
- Current turn: 9
- Postgres last used: Turn 3
- Calculation: `9 - 3 = 6 turns inactive`
- Threshold: 5 turns
- Result: `6 >= 5` → **Postgres is killed** ✅

---

## Real-World Example: E-commerce Development

### Scenario: Developer building checkout flow with database queries, payments, and framework research

| Turn | User Says | Claude Does | currentTurn | postgres.lastUsed | stripe.lastUsed | cap-js.lastUsed | Active | Event |
|------|-----------|-------------|-------------|-------------------|-----------------|-----------------|--------|-------|
| 1 | "Show recent orders" | `resolve_intent` → spawn postgres | 1 | 1 | - | - | postgres | ✅ Postgres spawned |
| 2 | "Filter >$100" | `postgres_query_table` | 2 | 2 | - | - | postgres | Postgres used |
| 3 | "User details for order 12345" | `postgres_query_table` | 3 | 3 | - | - | postgres | Postgres used |
| 4 | "Process refund via Stripe" | `resolve_intent` → spawn stripe | 4 | 3 | 4 | - | postgres, stripe | ✅ Stripe spawned, postgres idle |
| 5 | "Refund $50 to abc@example.com" | `stripe_create_refund` | 5 | 3 | 5 | - | postgres, stripe | Stripe used, postgres idle (2 turns) |
| 6 | "Check refund status" | `stripe_get_refund` | 6 | 3 | 6 | - | postgres, stripe | Stripe used, postgres idle (3 turns) |
| 7 | "Send confirmation email" | `stripe_send_receipt` | 7 | 3 | 7 | - | postgres, stripe | Stripe used, postgres idle (4 turns) |
| 8 | "Explain CAP framework" | `resolve_intent` → spawn cap-js | 8 | 3 | 7 | 8 | postgres, stripe, cap-js | ✅ Cap-js spawned, postgres idle (5 turns) |
| 9 | "Explain CDS entities" | `cap_search_docs` + **cleanup()** | 9 | - | 7 | 9 | stripe, cap-js | ❌ **Postgres KILLED** (6 turns idle) |
| 10 | "Show CAP examples" | `cap_search_docs` | 10 | - | 7 | 10 | stripe, cap-js | Postgres gone |
| 11 | "Create service definition" | `cap_generate_code` | 11 | - | 7 | 11 | stripe, cap-js | Stripe idle (4 turns) |
| 12 | "Add auth annotations" | `cap_generate_code` | 12 | - | 7 | 12 | stripe, cap-js | Stripe idle (5 turns) |
| 13 | "Deploy service" | `cap_deploy` | 13 | - | 7 | 13 | stripe, cap-js | Stripe idle (6 turns) |
| 14 | "Test API endpoint" | `cap_test_service` + **cleanup()** | 14 | - | - | 14 | cap-js | ❌ **Stripe KILLED** (7 turns idle) |
| 15 | "Show orders again" | `resolve_intent` → spawn postgres | 15 | 15 | - | 14 | postgres, cap-js | ✅ **Postgres RE-SPAWNED** (seamless) |

### Key Insights from This Example

1. **Turn 9**: Postgres killed after 6 turns idle (last used turn 3, current 9, threshold 5)
   - Calculation: `9 - 3 = 6 >= 5` ✅

2. **Turn 14**: Stripe killed after 7 turns idle (last used turn 7, current 14, threshold 5)
   - Calculation: `14 - 7 = 7 >= 5` ✅

3. **Turn 15**: Postgres re-spawned seamlessly when user returns to database work
   - No disruption, fast re-activation (~2s with cached dependencies)

4. **Bounded Context Maintained**:
   - Peak: 3 active spells at turn 8
   - Steady state: 1-2 active spells after cleanup
   - Token savings: 67% reduction from peak

---

## Why Global Turns (Not Per-Spell)?

### ❌ Wrong Mental Model: Per-Spell Turns

```
postgres:  Turn 1, Turn 2, Turn 3  [WRONG]
stripe:    Turn 1, Turn 2, Turn 3  [WRONG]
cap-js:    Turn 1, Turn 2, Turn 3  [WRONG]
```

This doesn't work because:
- No way to compare activity across spells
- Can't detect context switching (user moving to different domain)
- Cleanup becomes ambiguous (kill postgres at its turn 5? But what if only 2 global turns passed?)

### ✅ Correct Model: Global Turn Counter

```
Global:    Turn 1, Turn 2, Turn 3, ..., Turn 14
postgres:  lastUsedTurn = 3
stripe:    lastUsedTurn = 7
cap-js:    lastUsedTurn = 14
```

This works because:
- Clear timeline: All spells on same clock
- Easy inactivity detection: `currentTurn - lastUsedTurn`
- Natural context switching: User shifts focus → old spells become inactive → cleanup

---

## Implementation Status

### ✅ What Exists (All Tests Pass)

**File**: `src/application/process-lifecycle.ts`

```typescript
export class ProcessLifecycleManager {
  private currentTurn = 0;
  private usageTracking = new Map<string, { lastUsedTurn: number }>();

  incrementTurn(): void {
    this.currentTurn++;
  }

  markUsed(name: string): void {
    this.usageTracking.set(name, { lastUsedTurn: this.currentTurn });
  }

  getInactiveSpells(threshold: number): string[] {
    // Returns spells where (currentTurn - lastUsedTurn >= threshold)
  }

  async cleanupInactive(thresholdTurns = 5): Promise<string[]> {
    // Kills inactive spells, returns killed names
  }
}
```

**Tests**: 70+ unit tests in `src/application/__tests__/turn-based-lifecycle.test.ts` ✅

### ❌ What's Missing (Gateway Integration)

**File**: `src/presentation/gateway.ts`

**Current** (line 411):
```typescript
private async handleToolCall(toolName: string, args: unknown) {
  // ... existing code ...

  this.lifecycle.markUsed(spellName);  // ✅ This exists

  return { content: ... };
}
```

**Needed**:
```typescript
private async handleToolCall(toolName: string, args: unknown) {
  // ... existing code ...

  // ✅ Mark spell as used
  this.lifecycle.markUsed(spellName);

  // ❌ MISSING: Increment turn counter
  this.lifecycle.incrementTurn();

  // ❌ MISSING: Check for cleanup
  const killedSpells = await this.lifecycle.cleanupInactive(5);

  // ❌ MISSING: Notify Claude if tools changed
  if (killedSpells.length > 0) {
    logger.info('LIFECYCLE', 'Spells cleaned up', { killed: killedSpells });
    this.notifyToolsChanged();
  }

  return { content: ... };
}
```

**Impact**: Turn counter stays at 0 forever, no cleanup ever happens, token accumulation unbounded

---

## Token Savings Impact

### Current Behavior (Without Cleanup)

```
Turn 1:  Spawn postgres    → 2 tools  = 300 tokens
Turn 4:  Spawn stripe      → 5 tools  = 750 tokens
Turn 8:  Spawn cap-js      → 12 tools = 1800 tokens
Turn 14: All still active  → 19 tools = 2850 tokens ❌

Total context: 2850 tokens + growing
```

### Intended Behavior (With Cleanup)

```
Turn 1:  Spawn postgres    → 2 tools  = 300 tokens
Turn 4:  Spawn stripe      → 5 tools  = 750 tokens
Turn 8:  Spawn cap-js      → 12 tools = 1800 tokens
Turn 9:  Kill postgres     → 17 tools = 2550 tokens ✅
Turn 14: Kill stripe       → 12 tools = 1800 tokens ✅

Total context: 1800 tokens (capped)
Savings: 1050 tokens (37% reduction)
```

Over 100 turns with 10 spells:
- Without cleanup: 8000+ tokens (all spells active)
- With cleanup: 1800 tokens (≤3 spells active)
- **Savings: 77% token reduction** 🎉

---

## Common Questions

### Q: What if I need a spell again after it's killed?

**A**: Just call `resolve_intent` again. The spell re-spawns in ~2 seconds (faster with cached dependencies). No data loss, seamless UX.

### Q: Will this kill spells I'm actively using?

**A**: No. The 5-turn threshold protects multi-step workflows. Example:
- Turn 1: Query database
- Turn 2: Analyze results
- Turn 3: Modify data
- Turn 4: Verify changes
- Turn 5: Commit transaction

All these happen within 5 turns, so the spell stays active throughout.

### Q: What if I alternate between two spells?

**A**: Both stay active as long as you use each within 5 turns. Example:
- Turn 1: Use postgres
- Turn 2: Use stripe
- Turn 3: Use postgres (resets lastUsedTurn)
- Turn 4: Use stripe (resets lastUsedTurn)
- Both stay active indefinitely ✅

### Q: Can I configure the threshold?

**A**: Currently hardcoded to 5 turns (per ADR-0006). Future versions may support configuration via environment variable or spell YAML.

---

## Next Steps (To Complete Implementation)

1. **Wire up gateway integration** (`src/presentation/gateway.ts`):
   - Call `incrementTurn()` after every tool call
   - Call `cleanupInactive(5)` periodically
   - Send `tools/list_changed` notification after cleanup

2. **Add integration tests** (`src/presentation/__tests__/gateway-lifecycle.integration.test.ts`):
   - Test turn incrementing
   - Test cleanup triggering at 5-turn threshold
   - Test notification sending
   - Test multi-spell cleanup scenario

3. **Update metrics** (`src/presentation/gateway.ts`):
   - Log turn counter in startup banner
   - Track cleanup events in telemetry
   - Report token savings in logs

---

## References

- **ADR-0006**: [5-Turn Inactivity Threshold](adr/0006-five-turn-inactivity-threshold.md) (updated with real-world example)
- **Phase 3 Plan**: [Lifecycle Management Implementation](plans/phase-3-lifecycle-management.md)
- **Implementation**: `src/application/process-lifecycle.ts`
- **Tests**: `src/application/__tests__/turn-based-lifecycle.test.ts`
- **Architecture**: `docs/architecture.md` (section on bounded context)

---

**Document Status**: ✅ Complete explanation, ⚠️ Implementation incomplete
