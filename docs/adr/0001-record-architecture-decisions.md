# 1. Record Architecture Decisions

Date: 2026-01-11

## Status

Accepted

## Context

During the development of MCP Grimoire, we need to make many architectural decisions:

- Which technologies to use (TypeScript vs JavaScript)
- How to implement features (lazy loading vs eager loading)
- Which patterns to follow (SOLID, YAGNI, DRY)
- Trade-offs between competing solutions

**Problems without ADRs**:

- **Lost Context**: Future developers don't understand WHY decisions were made
- **Repeated Discussions**: Same debates happen multiple times
- **Poor Onboarding**: New team members can't understand system evolution
- **Inconsistent Decisions**: Different parts of codebase use different approaches
- **No Accountability**: Unclear who made decisions and why

**Real Example from this Project**:

In the previous session, we discovered that:

- We were implementing MCP gateway correctly using the SDK
- But hit TypeScript errors and started creating a "simple" version
- We forgot WHY we were using the SDK (it's the standard, maintained by Anthropic)
- An ADR would have prevented this deviation

## Decision

We will use **Architecture Decision Records (ADRs)** as defined by Michael Nygard.

**Key Principles**:

1. **Document significant decisions**: Record important architectural choices
2. **Immutable records**: Once accepted, ADRs are not edited (create new ADR to supersede)
3. **Honest trade-offs**: Include both positive and negative consequences
4. **Alternatives considered**: Document what we evaluated and why we rejected it
5. **Living documentation**: ADRs are part of the codebase, versioned with Git

**ADR Structure**:

- Context: What problem are we solving?
- Decision: What did we decide?
- Consequences: What becomes easier or harder?
- Alternatives Considered: What else did we evaluate?
- References: Links to docs, discussions, prototypes

**Storage**: All ADRs will be stored in `docs/adr/` directory with sequential numbering.

**Tool**: Use the `adr-generator` skill in Claude Code for creating ADRs.

## Consequences

### Positive Consequences

- **Historical Context**: Future developers understand decision rationale
- **Onboarding**: New team members can read ADRs to understand system design
- **Consistency**: Decisions are documented and can be referenced
- **Accountability**: Clear record of who decided what and when
- **Prevent Rework**: Avoid revisiting settled questions
- **Better Discussions**: Structured format for evaluating options

### Negative Consequences

- **Time Investment**: Writing ADRs takes time (~30-60 minutes per ADR)
- **Maintenance**: Need to keep ADR index updated
- **Discipline Required**: Team must remember to create ADRs
- **Potential Overhead**: Could slow down fast prototyping if overused

### Risks

- **ADR Fatigue**: Team might create ADRs for trivial decisions
  - Mitigation: Clear guidelines in CLAUDE.md about when to create ADRs
- **Stale ADRs**: Old decisions might not reflect current reality
  - Mitigation: Status field (Deprecated, Superseded) to mark outdated ADRs
- **Not Following ADRs**: Code doesn't match documented decisions
  - Mitigation: Reference ADRs in code comments and commit messages

## Alternatives Considered

### Alternative 1: No Documentation

**Pros**:

- Fast development (no documentation overhead)
- No process to follow

**Cons**:

- Lost context over time
- Repeated discussions
- Poor knowledge transfer
- Inconsistent decisions

**Why rejected**: The cost of lost context far outweighs the time investment in ADRs. We've already experienced this problem in the current session.

### Alternative 2: Design Documents

**Pros**:

- More detailed than ADRs
- Can include diagrams, code samples
- Good for complex systems

**Cons**:

- Time-consuming to write and maintain
- Often become outdated
- Hard to keep synchronized with code
- Too heavyweight for most decisions

**Why rejected**: ADRs are lightweight and focused. For complex systems, we can combine ADRs with design docs (ADRs document decisions, design docs explain how).

### Alternative 3: Wiki or Notion

**Pros**:

- Easy to edit and update
- Rich formatting options
- Good search capabilities

**Cons**:

- Not versioned with code
- Can diverge from reality
- Requires external tool/service
- Not part of code review process

**Why rejected**: ADRs should be versioned alongside code. Git provides all the versioning, review, and history we need.

### Alternative 4: Comments in Code

**Pros**:

- Close to implementation
- Always up to date (hopefully)
- No separate documentation

**Cons**:

- Scattered across codebase
- Hard to find decisions
- No structured format
- Lost when code is refactored

**Why rejected**: Code comments are for HOW, ADRs are for WHY. They serve different purposes and should coexist.

## Implementation Plan

1. ✅ Create `docs/adr/` directory
2. ✅ Write ADR-0001 (this document)
3. ✅ Update CLAUDE.md with ADR guidelines
4. ⏳ Create ADRs for existing decisions:
   - ADR-0002: Use TypeScript
   - ADR-0003: Use MCP SDK for Gateway
   - ADR-0004: Focus on Local Servers (Phase 1)
   - ADR-0005: Keyword-Based Intent Resolution (YAGNI)
   - ADR-0006: 5-Turn Inactivity Threshold
5. ⏳ Create ADR index (README.md)
6. 🔜 Reference ADRs in code and commits going forward

## References

- [Michael Nygard's Original ADR Article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [adr-tools GitHub](https://github.com/npryce/adr-tools)
- [ADR GitHub Organization](https://adr.github.io/)
- CLAUDE.md Section: Development Workflow → Architecture Decision Records

---

**Note**: This is the first and most important ADR - it establishes that we will use ADRs. All future architectural decisions should be documented using this pattern.
