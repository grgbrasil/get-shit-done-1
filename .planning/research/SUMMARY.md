# Research Summary: GSD Guardrails & Global Memory

**Domain:** AI-assisted development tooling -- guardrails, code intelligence, impact analysis
**Researched:** 2026-03-29
**Overall confidence:** HIGH

## Executive Summary

The GSD Guardrails & Global Memory project adds three capabilities to an existing meta-prompting system: Architecture Decision Records for cross-plan memory, a Function Map (JSON registry of symbols and callers) for code awareness, and mid-execution impact analysis to prevent silent breakage. The critical insight from this research is that **zero new dependencies are needed**. GSD is a meta-prompting system -- its "stack" is prompt templates, JSON schemas, and MCP tool orchestration. The intelligence lives in the LLM agents, not in library code.

For ADRs, the MADR 4.0 template is the industry standard and requires nothing beyond markdown files in `.planning/decisions/`. For the Function Map, Serena MCP (already available in the GSD ecosystem) provides semantic symbol extraction via LSP for 40+ languages, with grep as a fallback for environments without Serena. The Function Map is a flat JSON file designed for O(1) symbol lookup and instant caller identification. For impact analysis, the LLM itself serves as the classification engine -- structural changes (signature modifications) are auto-resolved by updating callers, while behavioral changes (logic modifications) are escalated to the human.

The primary risk is Function Map staleness -- if the map falls behind the actual code, impact analysis produces false negatives, and the core value proposition ("no silent breakage") collapses. Secondary risks include context window overflow from an overly detailed Function Map and misclassification of behavioral vs structural changes. Both are addressable with clear prompt constraints and size limits.

## Key Findings

**Stack:** Zero new npm dependencies. MADR 4.0 templates + flat JSON + Serena MCP + prompt engineering.
**Architecture:** Flat files in `.planning/`, prompt-based guardrails injected into existing GSD workflows.
**Critical pitfall:** Function Map staleness -- must be a mandatory (not optional) step in execute-phase.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: ADR System + Function Map Schema** - Build the data layer first
   - Addresses: ADR storage, Function Map JSON schema, initial population workflow
   - Avoids: Building impact analysis without data to analyze (Pitfall: no map = no analysis)

2. **Intelligence: Impact Analysis + Auto-Resolve** - Add the behavioral layer
   - Addresses: Mid-execution impact check, structural auto-resolve, behavioral escalation
   - Avoids: Misclassification (start conservative, refine with usage)

3. **Persistence: Auto-Update + Cross-Plan Memory** - Close the loop
   - Addresses: Function Map staleness, cross-plan memory, milestone memory summaries
   - Avoids: Memory dump problem (structured schemas from day 1)

4. **Upstream: Generalize + PR** - Make it contribution-ready
   - Addresses: Remove Serena hard dependency, test grep fallback, upstream compatibility
   - Avoids: PR rejection due to external dependencies (Pitfall 11)

**Phase ordering rationale:**
- Phase 1 before Phase 2: Impact analysis REQUIRES the Function Map to exist. Cannot analyze impacts without knowing callers.
- Phase 2 before Phase 3: Auto-update makes no sense without impact analysis consuming the map.
- Phase 3 before Phase 4: Must prove the system works locally before generalizing for upstream.
- ADR can run in parallel with Function Map (no dependency) but both must precede impact analysis.

**Research flags for phases:**
- Phase 2: Needs deeper research on structural vs behavioral classification edge cases (default value changes, error handling changes, side effect changes)
- Phase 3: Needs testing on real projects to validate incremental update performance
- Phase 4: Needs upstream maintainer alignment before investing in PR preparation

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero dependencies is a constraint-driven conclusion, not a guess. MADR 4.0 and Serena are verified. |
| Features | HIGH | Requirements come directly from PROJECT.md. Feature dependencies are structural, not speculative. |
| Architecture | HIGH | Extends existing GSD patterns (.planning/ directory, prompt-based workflows). No new paradigms. |
| Pitfalls | MEDIUM | Staleness and misclassification are well-understood risks. Specific thresholds (100KB limit, 5 ADR max) need validation on real projects. |

## Gaps to Address

- Serena MCP's exact output format for `get_symbols_overview` and `find_referencing_symbols` -- need to test with actual calls to validate JSON schema design
- grep fallback accuracy across languages -- need to test regex patterns against real Vue/PHP/Python codebases
- Context window budget -- how much of the window does a 50-file Function Map consume? Needs measurement.
- Behavioral vs structural classification prompt -- needs iterative refinement with real examples, not just theoretical rules
- Upstream maintainer receptiveness -- unknown whether gsd-build/get-shit-done would accept these extensions
