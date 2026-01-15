# 5. Keyword-Based Intent Resolution First (YAGNI)

Date: 2026-01-11

## Status

Accepted

## Context

Intent resolution matches user queries to appropriate MCP servers. Options:
1. **Keyword matching**: Simple substring matching
2. **Semantic search**: ML-based embeddings (transformers.js)
3. **LLM-based**: Use Claude for resolution

## Decision

Start with **simple keyword matching** (exact substring search with scoring). Add semantic search only if keyword matching proves insufficient.

**Implementation**: KeywordResolver with:
- Case-insensitive substring matching
- Score = number of matched keywords
- Confidence calculation based on winner vs runner-up

## Consequences

**Pros**:
- Simple (<1ms resolution time)
- No dependencies (no ML models)
- Easy to debug and test
- Fast implementation

**Cons**:
- Misses synonyms ("db" vs "database")
- Requires exact keyword matches
- Can add semantic search in Phase 2 if needed

## Alternatives Considered

**Alternative**: Implement semantic search immediately
- **Why rejected**: YAGNI violation, adds complexity, 90MB model download, can defer to Phase 2

## References

- architecture.md - Lines 292-319 (shows keyword matching as Mode A, default)
- CLAUDE.md - YAGNI principle
