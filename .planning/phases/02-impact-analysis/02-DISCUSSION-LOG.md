# Phase 2: Impact Analysis - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the reasoning.

**Date:** 2026-03-30
**Phase:** 02-impact-analysis
**Mode:** discuss (advisor-researched)
**Areas discussed:** Trigger mechanism, Classification structural vs behavioral, Auto-resolve strategy, Escalation UX

## Gray Areas Identified

4 gray areas surfaced from codebase analysis + requirements cross-referencing:
1. Trigger mechanism (how executor knows to consult fmap)
2. Structural vs behavioral classification (how to distinguish change types)
3. Auto-resolve strategy (how to update callers at scale)
4. Escalation UX (user experience for behavioral changes)

User selected all 4 for discussion.

## Research Conducted

4 parallel gsd-advisor-researcher agents spawned (sonnet model), each analyzing one gray area against:
- Existing gsd-executor.md deviation rules and checkpoint patterns
- fmap.cjs capabilities and function-map.json schema
- gsd-cataloger.md provider patterns
- REQUIREMENTS.md IMPACT-01 through IMPACT-06
- ARCHITECTURE.md patterns and pitfalls

## Decisions Made

### 1. Trigger Mechanism
- **Options presented:** Prompt + Hook (rec) / Solo prompt / Solo hook
- **User chose:** Prompt + Hook
- **Rationale:** Dual-layer gives both guidance (prompt) and enforcement (hook). PreToolUse hook pattern already exists commented-out in executor frontmatter.

### 2. Classification: Structural vs Behavioral
- **Options presented:** Hybrid sentinel + LLM (rec) / Pure LLM / Signature sentinel only
- **User chose:** Hybrid sentinel + LLM
- **Rationale:** Signature diff in fmap is deterministic and free for structural. LLM judgment is the only language-agnostic option for behavioral. Bias toward escalation in ambiguity.

### 3. Auto-Resolve Strategy
- **Options presented:** Threshold-split (rec) / Always inline / Always sub-agent
- **User chose:** Threshold-split
- **Rationale:** Most cases will have <=10 callers (inline is fine). Sub-agents for medium, human escalation for large. Thresholds in config.json for tunability.

### 4. Escalation UX
- **Options presented:** Impact card hard stop (rec) / Deferred batch / Hard stop simple
- **User chose:** Impact card (hard stop)
- **Rationale:** Reuses existing checkpoint:decision pattern. Structured card gives senior dev exactly what's needed to decide fast. Hard stop avoids complex rollback scenarios. "Modify" deferred to v2.

## Deferred Ideas

- "Modify" negotiation path in escalation UX
- Cross-phase impact analysis
- Automated git rollback on rejection
- Impact analysis for non-function changes

---

*Discussion completed: 2026-03-30*
*All recommendations accepted*
