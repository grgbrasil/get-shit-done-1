# Feature Landscape

**Domain:** AI-assisted development guardrails and global memory
**Researched:** 2026-03-29

## Table Stakes

Features that are required for the system to deliver its core value ("no silent breakage").

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| ADR shared registry | Without it, agents in Phase 3 repeat mistakes decided against in Phase 1. Core amnesia problem. | Low | Markdown files + template. Agents already read .planning/ files. |
| Function Map (JSON) | Without it, agents modify shared functions blindly. The whole premise of impact analysis requires knowing callers. | Medium | Serena extraction + JSON schema. Needs initial population workflow + incremental updates. |
| Impact analysis pre-modification | Without it, breakage is detected after the fact (or never). Must happen BEFORE the change lands. | Medium | JSON lookup + Serena find_referencing_symbols + LLM classification. |
| Auto-resolve structural changes | If every signature change requires human approval, system is too noisy. Structural changes (add param, change return type) are mechanically resolvable. | Medium | Agent updates all callers. Requires accurate caller list from Function Map. |
| Escalation for behavioral changes | If behavioral changes auto-resolve, system is dangerous. Logic changes need human judgment. | Low | Agent detects "same signature, different behavior" and asks human. Prompt-level implementation. |
| Cross-plan memory | Without it, each plan starts from zero. Discoveries, constraints, and decisions must persist across plans. | Low | .planning/memory/ directory with structured markdown. Read by planners/executors. |
| Function Map auto-update | If map goes stale, impact analysis gives false negatives. Must update after every execution, not just commits. | Medium | Hook in execute-phase that triggers map refresh for modified files. |

## Differentiators

Features that set this apart from basic codebase mapping (which GSD already has via /gsd:map-codebase).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Mid-execution impact check | Unlike pre-commit hooks or CI checks, this catches breakage BEFORE the agent writes the change. Prevents rather than detects. | Medium | Requires Function Map consultation as a mandatory step in execute-phase. |
| Structural vs behavioral classification | Smart escalation -- not "approve everything" or "approve nothing" but "auto-fix what's mechanical, ask about what's semantic." | Medium | LLM-driven classification. The hard part is getting the prompt right, not the tooling. |
| Caller cascade updates | When a function signature changes, automatically propagate to all callers. Like an IDE refactor but driven by LLM agents. | High | Requires accurate callers list + agent capability to modify multiple files in sequence. |
| Decision inheritance across milestones | ADRs from milestone 1 inform milestone 2 without human re-explanation. "We chose X because Y" persists. | Low | ADR files already in .planning/decisions/, just need to be included in planner context. |
| Guardrail enforcement via prompt injection | Rather than external tooling, guardrails are enforced by injecting constraints into agent prompts. The LLM IS the enforcement engine. | Low | Modify execute-phase and plan-phase prompts to include ADR + Function Map consultation steps. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Visual dashboard for Function Map | PROJECT.md: "JSON consultavel e suficiente." Adds UI complexity for zero value -- agents read JSON, not dashboards. | Keep as flat JSON. Humans use jq or read raw if curious. |
| Deep AST parsing engine | PROJECT.md: "AST parsing -- mapeamento baseado em grep/serena e suficiente para v1." Native deps break install. | Use Serena MCP (LSP-based, already available) + grep fallback. |
| Language-specific analyzers | Building per-language parsers is a black hole. Serena handles 40+ languages via LSP. | Delegate language-specific intelligence to Serena. Keep GSD language-agnostic. |
| Pre-commit hooks for impact analysis | PROJECT.md: "mid-execution, nao pre-commit hook." Pre-commit is too late -- the change is already written. | Impact check happens in execute-phase, before the agent modifies the file. |
| Automatic behavioral change resolution | Dangerous. If the system auto-resolves logic changes, it can silently break business rules. | Always escalate behavioral changes to human. Only auto-resolve structural (signature) changes. |
| Full dependency graph visualization | Nice-to-have that becomes a maintenance burden. The Function Map JSON already encodes the graph. | Keep callers and calls arrays in Function Map. That IS the graph. |
| Version history of Function Map | Git already provides history. Don't build a separate versioning system. | Function Map is git-tracked in .planning/. Use git log / git diff for history. |

## Feature Dependencies

```
ADR System (standalone, no deps)
    |
    v
Function Map ---------> Impact Analysis (requires Function Map)
    |                        |
    v                        v
Auto-Update Hook        Structural Auto-Resolve (requires Impact Analysis)
    |                        v
    v                   Behavioral Escalation (requires Impact Analysis)
Cross-Plan Memory
```

Key ordering constraints:
- Function Map MUST exist before Impact Analysis can work
- ADR system is independent, can ship in parallel with Function Map
- Auto-update hook is useless without Function Map to update
- Cross-plan memory builds on ADR + Function Map patterns

## MVP Recommendation

**Phase 1 -- Foundation (build together):**
1. ADR system (MADR template + .planning/decisions/ + read in plan-phase)
2. Function Map JSON schema + initial population workflow (Serena-based)

**Phase 2 -- Impact analysis layer:**
3. Impact analysis mid-execution (consult Function Map before modifying)
4. Structural auto-resolve (update callers on signature change)
5. Behavioral escalation (ask human on logic change)

**Phase 3 -- Persistence and maintenance:**
6. Function Map auto-update after each execution
7. Cross-plan memory (.planning/memory/)

**Defer to v2:**
- Caller cascade across multiple levels (indirect callers) -- complexity explosion
- Multi-repository impact analysis -- single repo is hard enough for v1
- Confidence scoring on impact predictions -- nice but not essential

## Sources

- PROJECT.md -- Requirements and constraints
- [Serena MCP](https://github.com/oraios/serena) -- Symbol extraction capabilities
- [MADR 4.0](https://adr.github.io/madr/) -- ADR template standard
- [Aider RepoMap](https://aider.chat/docs/repomap.html) -- Function mapping patterns in AI tools
