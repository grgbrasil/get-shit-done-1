# Roadmap: GSD Guardrails & Global Memory

## Overview

This project extends the GSD meta-prompting system with three capabilities: Architecture Decision Records for persistent cross-plan decisions, a Function Map for code-aware impact analysis, and mid-execution guardrails that auto-resolve structural changes while escalating behavioral ones. The roadmap moves from independent data layers (ADR + memory), through the Function Map substrate, into impact analysis intelligence, model routing for cost efficiency, and finally integration with existing GSD workflows.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: ADR System & Cross-Plan Memory** - Persistent decision records and structured memory that survives across plans and milestones
- [ ] **Phase 2: Function Map** - JSON registry of all symbols, signatures, callers, and dependencies with O(1) lookup
- [ ] **Phase 3: Impact Analysis** - Mid-execution guardrails that detect, classify, and resolve cascading impacts
- [ ] **Phase 4: Model Routing** - Configurable model assignment per agent type for cost-efficient execution
- [ ] **Phase 5: Integration & Hardening** - Wire all components into existing GSD workflows as seamless extensions

## Phase Details

### Phase 1: ADR System & Cross-Plan Memory
**Goal**: Agents have persistent, structured memory -- decisions survive across plans and milestones, context is never lost
**Depends on**: Nothing (first phase)
**Requirements**: ADR-01, ADR-02, ADR-03, ADR-04, ADR-05, MEM-01, MEM-02, MEM-03, MEM-04
**Success Criteria** (what must be TRUE):
  1. An executor can create an ADR in `.planning/decisions/` and a subsequent planner in a different plan can read it
  2. ADRs with status "accepted" are automatically present in agent context; deprecated/superseded ADRs are not
  3. An executor about to contradict an existing ADR is warned before proceeding
  4. A planner starting a new plan can see decisions and discoveries from all previous plans in `.planning/memory/`
  5. Memory entries from recent plans take priority over older ones when context budget is tight
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Function Map
**Goal**: Any agent can instantly look up any function's signature, purpose, callers, and dependencies from a single JSON file
**Depends on**: Phase 1
**Requirements**: FMAP-01, FMAP-02, FMAP-03, FMAP-04, FMAP-05, FMAP-06, FMAP-07
**Success Criteria** (what must be TRUE):
  1. A flat JSON file exists with every function/method/class in the project, including signature, purpose, file path, callers, and dependencies
  2. Looking up a function by `file::function` key returns its entry in O(1) -- no scanning or filtering needed
  3. The Function Map can be populated via Serena MCP, and falls back to grep-based extraction when Serena is unavailable
  4. The Function Map is refreshed automatically during each execution, not just at commit time
  5. The cataloger agent that populates the map runs on a cheap model (Haiku/OpenRouter), not on premium models
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Impact Analysis
**Goal**: No execution can silently break existing callers -- structural changes are auto-fixed, behavioral changes require human approval
**Depends on**: Phase 2
**Requirements**: IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04, IMPACT-05, IMPACT-06
**Success Criteria** (what must be TRUE):
  1. Before modifying any function, the executor knows every caller of that function and what would break
  2. When a function's signature changes (arguments, return type), all callers are automatically updated without human intervention
  3. When a function's behavior changes (business logic, semantic result), the executor stops and explains the impact to the user before proceeding
  4. When a caller is auto-updated, the system checks one level deeper -- callers of that caller -- for cascading impact
  5. After all impacts are resolved, the Function Map reflects the new state (updated signatures, new callers)
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Model Routing
**Goal**: Each GSD agent type runs on the right model for its task -- cheap models for cataloging, quality models for planning, balanced for execution
**Depends on**: Phase 2 (cataloger agent needs routing)
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04
**Success Criteria** (what must be TRUE):
  1. config.json contains per-agent model configuration that the user can override
  2. A project without explicit model config auto-generates sensible defaults on first run
  3. Third-party providers (OpenRouter, local models) work for agents that do not need premium models
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Integration & Hardening
**Goal**: All guardrail components work as seamless extensions of existing GSD workflows, not as separate systems
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4
**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, FMAP-08
**Success Criteria** (what must be TRUE):
  1. Running `/gsd:plan-phase`, `/gsd:execute-phase`, and `/gsd:discuss-phase` works exactly as before when guardrails are not activated
  2. Function Map and active ADRs are injected into agent context via the existing Context Engine -- no separate loading step
  3. Impact Analysis runs as an automatic step within execute-phase when the user has opted in
  4. Parallel execution (waves) works without write conflicts on shared files (Function Map, ADRs, memory)
  5. `/gsd:new-project` asks the user whether to activate Function Map + Impact Analysis + ADR system (opt-in)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. ADR System & Cross-Plan Memory | 0/2 | Not started | - |
| 2. Function Map | 0/2 | Not started | - |
| 3. Impact Analysis | 0/2 | Not started | - |
| 4. Model Routing | 0/1 | Not started | - |
| 5. Integration & Hardening | 0/2 | Not started | - |
