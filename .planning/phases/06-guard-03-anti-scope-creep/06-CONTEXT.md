# Phase 6: guard-03-anti-scope-creep - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Implementar GUARD-03 (anti-scope-creep) — a unica requirement unsatisfied que bloqueia o milestone. Adicionar regras anti-scope-creep no CLAUDE.md global e/ou agent prompts para prevenir executores de adicionar features alem do plano.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraint from REQUIREMENTS.md: "Don't add features beyond the plan, 3 lines > premature abstraction"

Prior art from Phase 3 (guardrails-upgrade): GUARD-01/02/04/05/06 established pattern of multi-layer guardrails — CLAUDE.md global rules + agent-level XML blocks + hooks. GUARD-03 should follow same layered pattern.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `/Users/gg/.claude/CLAUDE.md` — already has Etica, Preservacao, Integridade, Compaction sections from Phase 3
- `agents/gsd-executor.md` — already has `<anti_false_claims>` and `<context_persistence>` XML blocks from Phase 3
- `agents/gsd-planner.md` — already has `<context_persistence>` from Phase 3

### Established Patterns
- Phase 3 used `<anti_false_claims>` XML blocks in agents for reinforcement
- CLAUDE.md sections use `##` headers with bullet rules
- Hook-based enforcement not needed for scope creep (it's a behavioral guardrail, not a file-operation guard)

### Integration Points
- CLAUDE.md global → all Claude Code sessions
- Agent prompts → executor and planner behavior during plan execution

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
