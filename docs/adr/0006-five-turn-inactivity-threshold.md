# 6. 5-Turn Inactivity Threshold for Process Cleanup

Date: 2026-01-11

## Status

Accepted

## Context

Child MCP servers must be killed when inactive to save resources. Need to balance:

- **Too aggressive**: Frequent respawning (bad UX, wasted cycles)
- **Too lenient**: Memory waste, many idle processes

**Turn definition**: One user message + AI response cycle

## Decision

Use **5-turn inactivity threshold**. After 5 turns without using a power's tools, kill the child process.

### Key Design Principles

1. **Global Turn Counter**: Single counter across all spells (not per-spell)
2. **Usage Tracking**: Each spell tracks its `lastUsedTurn` timestamp
3. **Inactivity Calculation**: `currentTurn - lastUsedTurn >= 5` triggers cleanup
4. **Turn Definition**: One turn = user message + AI response + tool call(s)

### Real-World Example: E-commerce Development Workflow

**Scenario**: Developer building e-commerce checkout flow

| Turn | User Action                                 | AI Action                                    | Global Turn | postgres lastUsed | stripe lastUsed | cap-js lastUsed | Active Spells                | Notes                                                      |
| ---- | ------------------------------------------- | -------------------------------------------- | ----------- | ----------------- | --------------- | --------------- | ---------------------------- | ---------------------------------------------------------- |
| 1    | "Show me recent orders from the database"   | Calls `resolve_intent` → spawns **postgres** | 1           | 1                 | -               | -               | postgres (1)                 | Postgres activated                                         |
| 2    | "Filter orders over $100"                   | Calls `postgres_query_table`                 | 2           | 2                 | -               | -               | postgres (1)                 | Postgres used                                              |
| 3    | "Get user details for order 12345"          | Calls `postgres_query_table`                 | 3           | 3                 | -               | -               | postgres (1)                 | Postgres used                                              |
| 4    | "Now I need to process a refund via Stripe" | Calls `resolve_intent` → spawns **stripe**   | 4           | 3                 | 4               | -               | postgres, stripe (2)         | Stripe activated, postgres idle (1 turn)                   |
| 5    | "Refund customer abc@example.com $50"       | Calls `stripe_create_refund`                 | 5           | 3                 | 5               | -               | postgres, stripe (2)         | Stripe used, postgres idle (2 turns)                       |
| 6    | "Check if the refund was successful"        | Calls `stripe_get_refund`                    | 6           | 3                 | 6               | -               | postgres, stripe (2)         | Stripe used, postgres idle (3 turns)                       |
| 7    | "Send a refund confirmation email"          | Calls `stripe_send_receipt`                  | 7           | 3                 | 7               | -               | postgres, stripe (2)         | Stripe used, postgres idle (4 turns)                       |
| 8    | "Now help me understand CAP framework"      | Calls `resolve_intent` → spawns **cap-js**   | 8           | 3                 | 7               | 8               | postgres, stripe, cap-js (3) | Cap-js activated, postgres idle (5 turns)                  |
| 9    | "Explain CDS entities"                      | Calls `cap_search_docs` → **CLEANUP RUNS**   | 9           | -                 | 7               | 9               | stripe, cap-js (2)           | **Postgres KILLED** (9-3=6 turns idle, threshold exceeded) |
| 10   | "Show CAP service examples"                 | Calls `cap_search_docs`                      | 10          | -                 | 7               | 10              | stripe, cap-js (2)           | Postgres remains killed                                    |
| 11   | "Create a CAP service definition"           | Calls `cap_generate_code`                    | 11          | -                 | 7               | 11              | stripe, cap-js (2)           | Cap-js used, stripe idle (4 turns)                         |
| 12   | "Add authentication annotations"            | Calls `cap_generate_code`                    | 12          | -                 | 7               | 12              | stripe, cap-js (2)           | Cap-js used, stripe idle (5 turns)                         |
| 13   | "Deploy the service"                        | Calls `cap_deploy`                           | 13          | -                 | 7               | 13              | stripe, cap-js (2)           | Cap-js used, stripe idle (6 turns)                         |
| 14   | "Test the API endpoint"                     | Calls `cap_test_service` → **CLEANUP RUNS**  | 14          | -                 | -               | 14              | cap-js (1)                   | **Stripe KILLED** (14-7=7 turns idle, threshold exceeded)  |

**Result**:

- Turn 9: Postgres killed after 6 turns inactive (last used turn 3, current turn 9)
- Turn 14: Stripe killed after 7 turns inactive (last used turn 7, current turn 14)
- Turn 14: Only cap-js remains active (bounded context maintained)
- Token savings: Started with 3 active spells, ended with 1 (67% reduction)

**If user needs postgres again at turn 15**:

- Turn 15: "Show me orders again" → `resolve_intent` → Re-spawns postgres (fast, cached)
- Turn 15: postgres.lastUsedTurn = 15
- No disruption to user - seamless re-activation

### Implementation Details

```typescript
// Global state in ProcessLifecycleManager
private currentTurn = 0;  // Single counter for all spells
private usageTracking = new Map<string, { lastUsedTurn: number }>();

// After every tool call
incrementTurn();  // currentTurn++
markUsed(spellName);  // usageTracking.set(spellName, { lastUsedTurn: currentTurn })

// Periodic cleanup check
const inactive = getInactiveSpells(5);  // Returns spells where (currentTurn - lastUsedTurn >= 5)
await cleanupInactive(5);  // Kills inactive spells
notifyToolsChanged();  // Sends tools/list_changed to Claude
```

### Why This Works

1. **Multi-step workflows protected**: 5 turns is enough for "query → analyze → modify → verify → commit" sequences
2. **Context switching detected**: When user shifts focus (database → payments → framework), old spells are cleaned up
3. **Bounded context maintained**: Typically only 1-3 spells active at any time, preventing token accumulation
4. **Re-spawning is cheap**: If user returns to postgres later, it re-spawns in <2s with cached dependencies

## Consequences

**Pros**:

- Balances performance and resource usage
- Long enough for multi-step workflows (e.g., query → analyze → modify)
- Short enough to prevent resource waste

**Cons**:

- Arbitrary number (not data-driven)
- May need tuning based on user feedback
- Could be configurable in future

## Alternatives Considered

**Alternative 1**: 3-turn threshold

- **Why rejected**: Too aggressive, would kill during natural workflows

**Alternative 2**: 10-turn threshold

- **Why rejected**: Too lenient, wastes memory

**Alternative 3**: Time-based (5 minutes)

- **Why rejected**: Turn-based is simpler, aligns with conversation flow

## References

- architecture.md - Lines 399 (declares 5-turn threshold)
- plan.md - Phase 3 will implement this cleanup logic
