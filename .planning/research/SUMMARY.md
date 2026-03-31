# Research Summary: GSD Guardrails & Global Memory

**Domain:** AI-assisted development guardrails and global memory  
**Researched:** 2026-03-29  
**Overall confidence:** HIGH

## Executive Summary

The GSD Guardrails & Global Memory system extends the existing GSD meta-prompting architecture with three new data layers and behavioral constraints to prevent silent breakage in AI-assisted development. The system adds: 1) Architecture Decision Records (ADRs) for cross-plan memory, 2) a Function Map (JSON registry of symbols and callers) for code intelligence, and 3) mid-execution impact analysis that auto-resolves structural changes while escalating behavioral changes.

The critical architectural insight is **zero new dependencies** — GSD remains a meta-prompting system where intelligence lives in LLM agents, not library code. The Function Map uses Serena MCP (already available) for semantic extraction with grep fallback, ADRs use MADR 4.0 templates (markdown only), and impact analysis is implemented via prompt injection into existing execute-phase workflows.

The primary risk is Function Map staleness — if the map falls behind actual code, impact analysis produces false negatives, collapsing the core value proposition. Secondary risks include context window overflow from oversized maps and behavioral/structural misclassification. All are addressable with mandatory update steps, size limits, and conservative escalation rules.

## Key Findings

### From STACK.md
- **Zero npm dependencies** — MADR 4.0 templates, flat JSON, Serena MCP, and prompt engineering only
- **Function Map JSON schema** designed for O(1) lookup with `index` field and per-file grouping
- **Two-tier extraction**: Serena MCP (primary) + grep/regex fallback (when Serena unavailable)
- **Impact analysis** via JSON diff + LLM classification (no separate analysis engine)

### From FEATURES.md
- **Table stakes**: ADR registry, Function Map, impact analysis pre-modification, auto-resolve structural, escalate behavioral
- **Differentiators**: Mid-execution (not pre-commit) impact check, structural vs behavioral classification, caller cascade updates
- **Anti-features**: Visual dashboards, deep AST parsing engines, language-specific analyzers, pre-commit hooks
- **Dependencies**: Function Map must exist before impact analysis can work

### From ARCHITECTURE.md
- **Pattern 1**: Prompt-as-code — inject impact analysis instructions directly into execute-phase agent
- **Pattern 2**: Single Source of Truth — one canonical location per data type (no copies/caches)
- **Pattern 3**: Incremental updates — update only modified file entries, not full rebuilds
- **Pattern 4**: Graceful degradation — all features work (reduced quality) without Serena
- **Anti-patterns**: Building separate runtime, over-indexing, synchronous map updates, ADR approval workflows

### From PITFALLS.md
- **Critical**: Function Map staleness (silent false negatives), Context window overflow, Behavioral vs structural misclassification, ADR proliferation
- **Moderate**: Serena unavailability, Circular caller updates, Memory becoming a dump, Schema evolution without migration
- **Minor**: ADR numbering conflicts, grep fallback quality, Upstream PR rejection due to Serena dependency

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1 — Foundation: ADR System + Function Map Schema**  
*Rationale: Build the data layer first. Impact analysis requires Function Map to exist.*  
- ADR system (MADR template + `.planning/decisions/` + read in plan-phase)  
- Function Map JSON schema + initial population workflow (Serena-based)  
- **Must avoid**: Over-indexing (map only exports), ADR proliferation (max 5 per milestone)

**Phase 2 — Intelligence: Impact Analysis + Auto-Resolve**  
*Rationale: Add behavioral layer once data exists. Start conservative.*  
- Impact analysis mid-execution (consult Function Map before modifying)  
- Structural auto-resolve (update callers on signature change)  
- Behavioral escalation (ask human on logic change)  
- **Must avoid**: Misclassification (err toward escalation), Circular updates (single-level limit)

**Phase 3 — Persistence: Auto-Update + Cross-Plan Memory**  
*Rationale: Close the loop to prevent staleness.*  
- Function Map auto-update after each execution (mandatory step)  
- Cross-plan memory (`.planning/memory/` with structured schema)  
- **Must avoid**: Memory dump (structured format, size limits), Staleness (timestamp verification)

**Phase 4 — Upstream: Generalize + PR**  
*Rationale: Make contribution-ready after local validation.*  
- Remove Serena hard dependency (test grep fallback thoroughly)  
- Upstream compatibility testing  
- PR preparation  
- **Must avoid**: PR rejection due to external dependencies

### Research Flags

**Needs deeper research during planning:**
- Phase 2: Structural vs behavioral classification edge cases (default value changes, error handling, side effects)
- Phase 3: Incremental update performance on real projects (100+ file codebases)
- Phase 4: Upstream maintainer alignment and contribution guidelines

**Standard patterns (skip research):**
- Phase 1: MADR 4.0 template implementation (well-documented standard)
- Phase 1: JSON schema design (flat files with index pattern established)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero dependencies is constraint-driven. MADR 4.0 and Serena are verified. |
| Features | HIGH | Requirements from PROJECT.md. Dependencies are structural, not speculative. |
| Architecture | HIGH | Extends existing GSD patterns (`.planning/`, prompt-based workflows). |
| Pitfalls | MEDIUM | Staleness and misclassification understood; specific thresholds need validation. |

## Gaps to Address

1. **Serena MCP output format** — Need to test actual `get_symbols_overview` and `find_referencing_symbols` calls to validate JSON schema design
2. **Grep fallback accuracy** — Need to test regex patterns against real Vue/PHP/Python codebases
3. **Context window budget** — Measure how much of the window a 50-file Function Map consumes
4. **Classification prompt refinement** — Iterate on behavioral vs structural rules with real examples
5. **Upstream maintainer receptiveness** — Unknown whether gsd-build/get-shit-done would accept these extensions

## Sources

**STACK.md Sources:**
- [MADR 4.0.0 Official Documentation](https://adr.github.io/madr/)
- [Serena MCP GitHub](https://github.com/oraios/serena)
- [Aider Repository Map](https://aider.chat/2023/10/22/repomap.html)

**FEATURES.md Sources:**
- PROJECT.md requirements and constraints
- [Serena MCP](https://github.com/oraios/serena)
- [MADR 4.0](https://adr.github.io/madr/)
- [Aider RepoMap](https://aider.chat/docs/repomap.html)

**ARCHITECTURE.md Sources:**
- [Aider RepoMap Architecture](https://aider.chat/2023/10/22/repomap.html)
- [Serena MCP](https://github.com/oraios/serena)
- [MADR 4.0](https://adr.github.io/madr/)
- GSD existing workflows

**PITFALLS.md Sources:**
- PROJECT.md constraints and scope decisions
- [Aider RepoMap](https://aider.chat/docs/repomap.html)
- [ADR community practices](https://adr.github.io/)
- Observed patterns from AI code review tools