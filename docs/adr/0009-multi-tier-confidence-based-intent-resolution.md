# 9. Multi-Tier Confidence-Based Intent Resolution

Date: 2026-01-11

## Status

Accepted

## Context

Grimoire uses a hybrid intent resolver (keyword + semantic search) to match user queries to appropriate MCP servers. The resolver returns confidence scores ranging from 0.3 to 1.0, but the system lacked a clear strategy for handling different confidence levels.

**The Problem**:

Current hybrid resolver works well for exact matches (confidence ≥0.85) but produces ambiguous results in the 0.5-0.84 range:

```
User Query: "Check my DB for recent orders"

Hybrid Resolver Output:
- postgres (0.67, hybrid)
- mysql (0.62, semantic)
- mongodb (0.58, keyword)

Question: Should we auto-spawn postgres? All three are plausible!
```

**Requirements**:

1. **High confidence queries**: Auto-spawn immediately (zero friction)
2. **Medium confidence queries**: Need disambiguation (which database?)
3. **Low confidence queries**: Weak matches, may need user clarification
4. **No match queries**: Clear error with helpful suggestions

**Original Misconception**:

Initial proposal suggested adding LLM-based disambiguation in the gateway to route low-confidence queries. This was architecturally flawed because:

- ❌ Grimoire is a simple MCP server (no LLM access)
- ❌ Gateway has no conversation history
- ❌ Would add latency and cost
- ❌ Violates separation of concerns

**Architectural Reality**:

```
┌──────────────────────────────────────┐
│  Claude/AI Agent                     │
│  - HAS full conversation context     │
│  - HAS LLM capabilities              │
│  - CAN ask user questions            │
│  - SHOULD make tool selection        │
└──────────────┬───────────────────────┘
               │ MCP Protocol
               │ calls: resolve_intent(query)
               ▼
┌──────────────────────────────────────┐
│  Grimoire                       │
│  - NO LLM access                     │
│  - NO conversation history           │
│  - ONLY has: current query           │
│  - SHOULD return: structured results │
└──────────────────────────────────────┘
```

**Key Insight**: The AI agent already has all the context needed to make smart decisions. Gateway just needs to return structured data with confidence tiers!

## Decision

Implement a **3-tier confidence-based routing strategy** that leverages the AI agent's existing intelligence:

### Tier 1: High Confidence (≥0.85) - Auto-Spawn

**Action**: Immediately spawn MCP server and return tools

**Rationale**: Hybrid resolver is highly confident (exact keyword + semantic alignment)

**Response Format**:
```json
{
  "status": "activated",
  "power": {
    "name": "postgres",
    "confidence": 0.94,
    "match_type": "hybrid"
  },
  "tools": [
    { "name": "query_database", "description": "..." },
    { "name": "execute_sql", "description": "..." }
  ]
}
```

**User Experience**: Zero friction, instant activation ✅

---

### Tier 2: Medium Confidence (0.5-0.84) - Return Alternatives

**Action**: Return top 2-3 candidates with descriptions, let AI agent choose

**Rationale**:
- Multiple plausible matches
- AI agent has conversation context to decide
- Token efficient (~300-500 tokens vs 40,000 for all tools)

**Response Format**:
```json
{
  "status": "multiple_matches",
  "query": "check my database",
  "matches": [
    {
      "name": "postgres",
      "confidence": 0.67,
      "match_type": "hybrid",
      "description": "PostgreSQL database operations",
      "keywords": ["database", "sql", "postgres", "query", "tables"]
    },
    {
      "name": "mysql",
      "confidence": 0.64,
      "match_type": "semantic",
      "description": "MySQL database management",
      "keywords": ["database", "mysql", "sql", "query"]
    },
    {
      "name": "mongodb",
      "confidence": 0.59,
      "match_type": "keyword",
      "description": "MongoDB NoSQL database",
      "keywords": ["database", "mongo", "nosql"]
    }
  ],
  "message": "Multiple database tools found. Use activate_power(name) to select one."
}
```

**User Experience**:
- AI agent either chooses based on context (0 extra turns)
- Or asks user for clarification (1 extra turn)

**Example**:
```
Claude: "You have PostgreSQL, MySQL, and MongoDB configured.
Based on our earlier conversation about your e-commerce app,
I'll use PostgreSQL."

[Calls: activate_power({ name: "postgres" })]
```

---

### Tier 3: Low/No Match (<0.5) - Weak Matches or Error

**Action**: Return top 5 weak matches or error with available spells

**Rationale**:
- Confidence <0.5 means semantic similarity is weak
- Still provide options in case AI agent can infer from context
- Clear error for truly unmatched queries

**Response Format (Weak Matches 0.3-0.49)**:
```json
{
  "status": "weak_matches",
  "query": "analyze business performance",
  "matches": [
    { "name": "analytics", "confidence": 0.42, "description": "..." },
    { "name": "postgres", "confidence": 0.38, "description": "..." },
    { "name": "crm", "confidence": 0.36, "description": "..." }
  ],
  "message": "Found weak matches. Please clarify or rephrase."
}
```

**Response Format (No Match <0.3)**:
```json
{
  "status": "not_found",
  "query": "launch rocket to Mars",
  "available_powers": [
    { "name": "postgres", "description": "PostgreSQL database" },
    { "name": "stripe", "description": "Payment processing" }
  ],
  "message": "No relevant tools found. Available tools listed above."
}
```

**User Experience**: AI agent asks user to clarify or rephrase

---

### New Tool: `activate_power`

To support Tier 2 (multiple matches), add a new MCP tool:

```typescript
{
  "name": "activate_power",
  "description": "Activate a specific MCP power server by name. Use when resolve_intent returns multiple matches.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Spell name (e.g., 'postgres', 'stripe')"
      }
    },
    "required": ["name"]
  }
}
```

**Behavior**: Spawn specified power, inject steering, return tools

---

### Threshold Rationale

| Threshold | Rationale |
|-----------|-----------|
| **≥0.85** | Keyword match (0.9+) or strong hybrid. High precision. |
| **0.5-0.84** | Semantic similarity indicates relevance. Multiple plausible candidates. |
| **0.3-0.49** | Weak semantic similarity. Matches may be wrong but worth showing. |
| **<0.3** | Noise. Cosine similarity <0.3 is essentially random. |

Based on semantic similarity research and production systems (Pinecone, Weaviate), these thresholds balance precision and recall.

## Consequences

### Positive Consequences

1. **Leverages AI Agent Intelligence**: Gateway stays simple, agent uses conversation context
   - Agent knows which database user mentioned 5 messages ago
   - Agent can ask user clarifying questions naturally
   - Agent already designed for tool selection

2. **Token Efficient**: Even with alternatives, massive savings
   - High confidence (70%): ~1,000 tokens (just selected tools)
   - Medium confidence (20%): ~1,500 tokens (3 alternatives + selected tools)
   - Low confidence (10%): ~2,000 tokens (5 weak matches + selected tools)
   - **Weighted average**: ~1,166 tokens vs 40,000 baseline = **97% reduction**

3. **Fast**: No LLM calls in gateway
   - Tier 1: 50-300ms (hybrid search + spawn)
   - Tier 2: 30-50ms (hybrid search only)
   - Tier 3: 30-50ms (hybrid search only)
   - **Average**: ~100ms weighted by frequency

4. **Simple Architecture**: Gateway remains a dumb server
   - No LLM integration complexity
   - No API key management
   - No prompt engineering
   - Easy to test and maintain

5. **Graceful Degradation**: Each tier appropriate to confidence level
   - High confidence: instant (best UX)
   - Medium confidence: 0-1 turn delay (acceptable)
   - Low confidence: clarification needed (expected)

6. **Scalable**: Can add hundreds of powers without changing strategy

### Negative Consequences

1. **Extra Turn for Medium Confidence** (15-20% of queries)
   - User may need to clarify which tool to use
   - Mitigation: AI agent can often decide from context (0 extra turns)
   - Trade-off: Better than spawning wrong tool

2. **Activation Latency** (200-300ms on first use)
   - Not present in eager-loading approach
   - Mitigation: Fast enough to be unnoticeable
   - Trade-off: Acceptable for 94% token reduction

3. **Threshold Tuning May Be Needed**
   - 0.85/0.5 thresholds based on research but may need adjustment
   - Mitigation: Monitor metrics, tune based on validation data
   - Trade-off: Can iterate based on real usage

4. **Weak Matches May Be Useless** (<0.5 confidence)
   - When confidence is very low, even top-5 may all be wrong
   - Mitigation: AI agent can see low confidence and ask user to rephrase
   - Trade-off: Better than auto-spawning wrong tool

### Risks

**Risk 1: AI Agent Doesn't Use `activate_power` Correctly**

- **Risk**: Agent sees alternatives but doesn't call activate_power
- **Likelihood**: Low (Claude is good at following tool instructions)
- **Mitigation**:
  - Clear message in response: "Use activate_power(name) to select"
  - Tool description explicitly states usage
  - Integration testing with Claude Desktop
- **Fallback**: Agent will call resolve_intent again (harmless retry)

**Risk 2: Medium Confidence Tier Too Wide (0.5-0.84)**

- **Risk**: Too many queries fall in "uncertain" range, lots of user friction
- **Likelihood**: Medium (need validation data to confirm)
- **Mitigation**:
  - Tune threshold based on validation data
  - Could narrow to 0.6-0.84 (push more to high confidence)
  - Monitor metrics in production
- **Fallback**: User can always specify exact power in query

**Risk 3: Threshold Values Not Optimal**

- **Risk**: 0.85/0.5 thresholds chosen from research but may not fit our data
- **Likelihood**: Medium (won't know until real usage)
- **Mitigation**:
  - Create validation dataset (50-100 queries)
  - Measure accuracy at different thresholds
  - Iterate based on metrics
- **Fallback**: Thresholds are configurable

## Alternatives Considered

### Alternative 1: LLM-Based Disambiguation in Gateway

**Approach**: Gateway calls LLM API to route ambiguous queries

```typescript
// Gateway calls Claude Haiku to decide
const result = await llm.complete(
  `Select tool for: "${query}"\nOptions: ${tools}`
);
```

**Pros**:
- More accurate routing
- Can handle very ambiguous queries

**Cons**:
- ❌ **Gateway has no LLM access** (architectural violation)
- ❌ **No conversation context** (worse than agent deciding)
- ❌ Adds latency (500-2000ms)
- ❌ Adds cost ($0.0001 per query)
- ❌ Requires API key management
- ❌ Network dependency

**Why rejected**: Architecturally flawed. Gateway is a simple MCP server. The AI agent already has LLM capabilities and conversation context - use that instead!

---

### Alternative 2: Always Return All Alternatives

**Approach**: Never auto-spawn, always return 3-5 options

**Pros**:
- Simple (no thresholds)
- User/agent always in control

**Cons**:
- ❌ Token waste: ~1,500 tokens even for obvious queries
- ❌ User friction: Extra turn for every query
- ❌ Slower: No instant activation path

**Why rejected**: Sacrifices UX for 70% of queries that have clear matches. 0.85 threshold catches most exact matches with zero friction.

---

### Alternative 3: User-Configurable Thresholds

**Approach**: Let users configure thresholds in config

```yaml
confidence:
  auto_spawn: 0.85
  show_alternatives: 0.5
  use_llm: 0.3
```

**Pros**:
- Flexible
- Power users can tune

**Cons**:
- ⚠️ Requires understanding semantic similarity
- ⚠️ Most users won't tune
- ⚠️ Bad defaults = bad experience
- ⚠️ Adds configuration complexity

**Why rejected for Phase 2**: Good defaults more important than configurability. Could add as advanced feature in Phase 4+ if users request it.

---

### Alternative 4: Learn from User Feedback

**Approach**: Track which powers agent selects, improve resolver over time

```typescript
// Track selections
if (status === 'multiple_matches' && userSelected) {
  learningService.record(query, userSelected, candidates);
}

// Fine-tune resolver based on selections
```

**Pros**:
- Improves accuracy over time
- Personalized to user's workflow

**Cons**:
- ⚠️ Complex: feedback loop, storage, retraining
- ⚠️ Privacy: logging user queries
- ⚠️ Requires many samples to be useful
- ⚠️ Out of scope for v1

**Why rejected for Phase 2**: Too complex. Good idea for Phase 6+ (analytics & learning) if demand exists.

---

### Alternative 5: Predictive Pre-Loading

**Approach**: ML model predicts likely next tool, pre-loads it

**Pros**:
- Could reduce activation latency to zero
- Smarter than lazy loading

**Cons**:
- ❌ Very complex (ML model, training data)
- ❌ Still wastes resources on wrong predictions
- ❌ Over-engineering (YAGNI violation)
- ❌ Adds ML dependency and maintenance

**Why rejected**: Way too complex for the problem. 200-300ms activation latency is acceptable. Could revisit if latency becomes a real issue in production.

## Implementation Plan

### Week 1: Core Infrastructure (5 days)

**Day 1-2**: Update response format
- Add `status` field: `activated | multiple_matches | weak_matches | not_found`
- Add `matches` array for Tier 2/3
- Add `message` field for user guidance
- Update TypeScript types

**Day 3**: Implement confidence-based routing
```typescript
class PowerGatewayServer {
  async handleResolveIntent(query: string) {
    const results = await hybridResolver.resolveTopN(query, 5);

    if (results.length === 0 || results[0].confidence < 0.3) {
      return this.handleNoMatch(query);
    }
    if (results[0].confidence >= 0.85) {
      return await this.handleHighConfidence(results[0]);
    }
    if (results[0].confidence >= 0.5) {
      return this.handleMultipleMatches(results.slice(0, 3));
    }
    return this.handleWeakMatches(results);
  }
}
```

**Day 4**: Implement `activate_power` tool
- Add tool definition to gateway
- Add handler that spawns specified power
- Inject steering and return tools
- Send tools/list_changed notification

**Day 5**: Unit and integration tests
- Test all 4 tiers (high, medium, weak, none)
- Test activate_power workflow
- Test error cases (invalid spell name, etc.)

### Week 2: Validation & Documentation (5 days)

**Day 1-2**: Create validation dataset
- 20 high-confidence queries (expect auto-spawn)
- 20 medium-confidence queries (expect alternatives)
- 20 low-confidence queries (expect weak matches)
- 10 no-match queries (expect error)

**Day 3**: Measure accuracy
- Run validation dataset
- Measure: correct tier classification, correct power in results
- Target: >90% tier classification, >95% correct power in top-3
- Tune thresholds if needed

**Day 4**: Integration testing
- Test with real Claude Desktop
- Verify activate_power UX
- Measure real-world latency
- Test edge cases

**Day 5**: Documentation
- Update [architecture.md](../architecture.md)
- Update [plan.md](../plans/plan.md)
- Add examples to README
- Update API documentation

## Metrics

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Token reduction | >95% | Compare to 40,000 baseline |
| Average latency | <100ms | Weighted by frequency |
| Tier classification accuracy | >90% | Validation dataset |
| Top-3 accuracy | >95% | Correct power in top-3 |
| User friction (high confidence) | 0 turns | Should auto-spawn |
| User friction (medium confidence) | 0-1 turns | Agent decides or asks |

### Performance Targets

- Tier 1 (high): 50-300ms (search + spawn)
- Tier 2 (medium): 30-50ms (search only)
- Tier 3 (low/none): 30-50ms (search only)

### Token Cost Analysis

```
Weighted average per query:
= 0.70 × 1,000  (high confidence)
+ 0.20 × 1,500  (medium confidence)
+ 0.08 × 2,000  (low confidence)
+ 0.02 × 300    (no match)

= 700 + 300 + 160 + 6
= 1,166 tokens average

Savings: (40,000 - 1,166) / 40,000 = 97.1%
```

## References

- [intent-resolution-solution.md](../intent-resolution-solution.md) - Detailed solution design
- [architecture.md](../architecture.md) - System architecture
- [Hybrid Search in Production](https://www.elastic.co/blog/improving-information-retrieval-elastic-stack-hybrid) - Elasticsearch approach
- [Semantic Similarity Thresholds](https://arxiv.org/abs/1908.10084) - Research on cosine similarity
- [LangChain Router Chains](https://python.langchain.com/docs/use_cases/tool_use/routing) - Production routing patterns
- Phase 1 implementation: HybridResolver, SemanticResolver, KeywordResolver
- Discussion: Issue #TBD (intent resolution enhancement)

## Related ADRs

- [ADR-0005](0005-keyword-based-intent-resolution-yagni.md) - Keyword matching (Phase 1)
- [ADR-0007](0007-messagepack-embedding-storage.md) - Embedding storage for semantic search

## Future Enhancements

**Phase 4+** (if user feedback indicates need):

1. **Configurable Thresholds**: Allow power users to tune confidence levels
2. **Learning from Feedback**: Track selections, improve accuracy over time
3. **Analytics Dashboard**: Show which powers are used, accuracy metrics
4. **A/B Testing**: Test different threshold values with subsets of users

**Phase 6+** (advanced features):

1. **Multi-Tool Scenarios**: Handle queries needing multiple powers simultaneously
2. **Context-Aware Matching**: Use conversation history in gateway (if MCP protocol adds support)
3. **Fine-Tuned Models**: Train custom embedding model on MCP domain

---

**Decision Made**: January 11, 2026
**Approved By**: Development team
**Implementation Target**: Phase 2 (Week 1-2)
