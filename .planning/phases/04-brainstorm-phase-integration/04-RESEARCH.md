# Phase 4: brainstorm-phase-integration - Research

**Researched:** 2026-04-01
**Domain:** GSD workflow extension -- new command, workflow, template, and integration patch
**Confidence:** HIGH

## Summary

This phase creates a new GSD command (`/gsd:brainstorm-phase`) with its workflow, template, and infrastructure hooks. The domain is entirely internal to the GSD codebase -- no external libraries, APIs, or dependencies are involved. All work follows well-established patterns from the existing `discuss-phase` command and the superpowers brainstorming skill.

The core deliverables are: (1) command markdown file, (2) workflow markdown file, (3) BRAINSTORM.md template, (4) `getPhaseFileStats()` + `init.cjs` extension for `has_brainstorm` detection, (5) patches to `discuss-phase.md` and `discuss-phase-assumptions.md` `load_prior_context` steps, and (6) routing updates in `do.md` and `help.md`.

**Primary recommendation:** Follow the `discuss-phase` pattern exactly for command/workflow structure. The brainstorm workflow is simpler (no subagent spawning, no assumptions analyzer) -- it is a direct interactive Q&A session that produces a structured markdown artifact.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Arquivo `{NN}-BRAINSTORM.md` no diretorio da fase (ex: `.planning/phases/03-name/03-BRAINSTORM.md`), seguindo o padrao de `CONTEXT.md`, `RESEARCH.md`, `VERIFICATION.md`
- **D-02:** Adicionar deteccao `has_brainstorm` em `getPhaseFileStats()` (core.cjs) e exposicao via `init.cjs`, mesmo padrao dos outros artifacts
- **D-03:** discuss-phase detecta `{NN}-BRAINSTORM.md` durante `load_prior_context` (mesmo-fase, nao cross-fase) e injeta decisoes como gray areas pre-respondidas
- **D-04:** Decisoes do BRAINSTORM.md tratadas como "Likely" confidence -- discuss-phase as apresenta como assumptions pre-populadas que o usuario pode corrigir (nao sao locked como prior CONTEXT.md de fases anteriores)
- **D-05:** Workflow independente GSD-nativo inspirado no superpowers brainstorming -- NAO reutiliza o skill diretamente
- **D-06:** Perguntas uma por vez (one question at a time) -- nunca multiplas perguntas no mesmo turno
- **D-07:** Propor 2-3 approaches com trade-offs e recomendacao antes de cada decisao de design
- **D-08:** Output e `{NN}-BRAINSTORM.md` com secoes: domain boundary, design decisions, trade-offs explorados, pre-contexto para discuss-phase
- **D-09:** Ao finalizar, sugere `/clear` + `/gsd:discuss-phase <N>` como proximo passo (nunca transiciona para writing-plans ou plan-phase diretamente)
- **D-10:** Comando `commands/gsd/brainstorm-phase.md` segue padrao exato de `discuss-phase.md` (frontmatter + objective + execution_context -> workflow)
- **D-11:** Workflow `get-shit-done/workflows/brainstorm-phase.md` segue padrao de steps XML como `discuss-phase.md` e `discuss-phase-assumptions.md`
- **D-12:** Template `get-shit-done/templates/brainstorm.md` define a estrutura do `{NN}-BRAINSTORM.md`
- **D-13:** Atualizar `do.md` routing para apontar "brainstorming" ao novo comando em vez de discuss-phase
- **D-14:** Atualizar `help.md` para incluir o novo comando na lista de comandos disponíveis

### Claude's Discretion
- Texto exato das perguntas de brainstorming (adaptar ao domínio da fase)
- Quantas perguntas fazer antes de propor approaches (heurística baseada em complexidade)
- Se inclui visual companion offer (como superpowers) ou se mantém text-only por default
- Estrutura interna exata das secoes do BRAINSTORM.md template

### Deferred Ideas (OUT OF SCOPE)
- **Visual companion**: Superpowers brainstorming tem visual companion para mockups no browser -- deixar para iteracao futura se houver demanda
- **Auto mode (--auto)**: Brainstorming e inerentemente interativo -- auto mode nao faz sentido na v1, talvez em futuro com heuristicas
- **BRAIN requirements**: BRAIN-01 through BRAIN-04 nao estao definidos em REQUIREMENTS.md -- precisam ser adicionados como parte da execucao desta fase
</user_constraints>

## Standard Stack

No external libraries needed. This phase is 100% markdown authoring + minimal JavaScript edits to existing GSD infrastructure files.

### Core Files to Create
| File | Purpose | Pattern Source |
|------|---------|---------------|
| `commands/gsd/brainstorm-phase.md` | Command entry point | `commands/gsd/discuss-phase.md` |
| `get-shit-done/workflows/brainstorm-phase.md` | Interactive workflow | `get-shit-done/workflows/discuss-phase.md` |
| `get-shit-done/templates/brainstorm.md` | BRAINSTORM.md template | `get-shit-done/templates/context.md` |

### Core Files to Modify
| File | Change | Scope |
|------|--------|-------|
| `get-shit-done/bin/lib/core.cjs` line 1179 | Add `hasBrainstorm` to `getPhaseFileStats()` | 1-line addition |
| `get-shit-done/bin/lib/init.cjs` lines 750-755 area | Add `has_brainstorm` exposure | 1-line addition per init function |
| `get-shit-done/workflows/discuss-phase.md` line ~220 | Add BRAINSTORM.md detection in `load_prior_context` | ~15-line patch |
| `get-shit-done/workflows/discuss-phase-assumptions.md` line ~140 | Same patch for assumptions mode | ~15-line patch |
| `get-shit-done/workflows/do.md` line 44 | Route "brainstorming" to `/gsd:brainstorm-phase` | 1-line edit |
| `get-shit-done/workflows/help.md` | Add command entry | ~10-line addition |

## Architecture Patterns

### Command -> Workflow Delegation Pattern (Established)
Every GSD command follows this pattern:
```markdown
---
name: gsd:command-name
description: What it does
argument-hint: "<phase> [--flags]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
  - Task (only if spawning subagents)
---

<objective>
What this command achieves.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/command-name.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)
</context>

<process>
Read and execute the workflow file.
</process>

<success_criteria>
- Bullet points
</success_criteria>
```

**For brainstorm-phase:** Same pattern. No `Task` tool needed (no subagent spawning). Allowed tools: Read, Write, Bash, Glob, Grep, AskUserQuestion.

### Workflow Step Pattern (Established)
Workflows use XML `<step name="...">` tags with bash code blocks for `gsd-tools.cjs` calls. The brainstorm workflow needs these steps:

1. **initialize** -- `gsd-tools.cjs init phase-op ${PHASE}`, parse JSON
2. **check_existing** -- Check if BRAINSTORM.md already exists via `has_brainstorm`
3. **load_prior_context** -- Read PROJECT.md, ROADMAP.md, prior CONTEXT.md files
4. **scout_codebase** -- Lightweight grep/glob for phase-relevant files
5. **explore_domain** -- Interactive Q&A loop: one question at a time, adapt to domain
6. **propose_approaches** -- Present 2-3 approaches with trade-offs and recommendation
7. **capture_decisions** -- Iterate on design decisions until user is satisfied
8. **write_brainstorm** -- Write `{NN}-BRAINSTORM.md` using template
9. **git_commit** -- Commit via `gsd-tools.cjs commit`
10. **confirm_creation** -- Display summary, suggest `/clear` + `/gsd:discuss-phase <N>`

### Artifact Detection Pattern (Established)
In `core.cjs` `getPhaseFileStats()`:
```javascript
// Existing pattern (line 1184):
hasResearch: files.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md'),
hasContext: files.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md'),

// Add:
hasBrainstorm: files.some(f => f.endsWith('-BRAINSTORM.md') || f === 'BRAINSTORM.md'),
```

In `init.cjs` (wherever `has_research`, `has_context` are exposed):
```javascript
has_brainstorm: phaseInfo?.has_brainstorm || false,
```

### BRAINSTORM.md Template Structure
Based on D-08 and the context.md template pattern:
```markdown
# Phase [X]: [Name] - Brainstorm

**Explored:** [date]
**Status:** Pre-context (feeds into discuss-phase)

<domain_boundary>
## Domain Boundary
[Scope from ROADMAP.md -- what this phase delivers]
</domain_boundary>

<design_decisions>
## Design Decisions
### [Area 1]
- **BD-01:** [Decision explored] -- Confidence: Confident|Likely|Unclear
  - Trade-off: [what was weighed]
  - Why this way: [reasoning]

### [Area 2]
- **BD-02:** [Decision] -- Confidence: Likely
  - Trade-off: [what was weighed]
</design_decisions>

<tradeoffs_explored>
## Trade-offs Explored
### [Topic]
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| A      | ...  | ...  | Recommended    |
| B      | ...  | ...  |                |
</tradeoffs_explored>

<pre_context>
## Pre-Context for discuss-phase
### Assumptions (Likely confidence)
[These feed into discuss-phase as pre-populated assumptions that the user can correct]
- [Assumption 1]
- [Assumption 2]

### Open Questions
[Items that need user decision in discuss-phase]
- [Question 1]
- [Question 2]
</pre_context>
```

### discuss-phase Integration Pattern
The `load_prior_context` step in both `discuss-phase.md` and `discuss-phase-assumptions.md` needs a new sub-step after reading prior CONTEXT.md files:

```markdown
**Step 2.5: Read same-phase BRAINSTORM.md (if exists)**
```bash
ls ${phase_dir}/*-BRAINSTORM.md 2>/dev/null || true
```

If BRAINSTORM.md exists for the CURRENT phase (same phase, not prior phases):
- Read the `<design_decisions>` section
- Read the `<pre_context>` section
- Treat BD-* decisions as "Likely" confidence assumptions (NOT locked decisions)
- Pre-populate gray areas with brainstorm findings
- Present as assumptions the user can correct (same as assumptions mode behavior)

**Key distinction:** Prior CONTEXT.md from earlier phases = locked decisions. Same-phase BRAINSTORM.md = soft assumptions.
```

### Anti-Patterns to Avoid
- **Do NOT spawn subagents in brainstorm workflow:** The brainstorm is a direct conversation between Claude and the user. No `Task` tool, no gsd-assumptions-analyzer. The whole point is human-in-the-loop exploration.
- **Do NOT auto-transition to plan-phase:** D-09 explicitly states suggest `/clear` + `/gsd:discuss-phase`, never plan-phase. The brainstorm is a pre-step to discuss, not a replacement.
- **Do NOT treat BRAINSTORM.md decisions as locked:** D-04 explicitly states "Likely" confidence. discuss-phase can override everything in BRAINSTORM.md.
- **Do NOT add --auto flag:** Deferred per CONTEXT.md. Brainstorming is inherently interactive.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phase directory detection | Custom path resolution | `gsd-tools.cjs init phase-op` | Already handles all edge cases |
| Git commits | Manual git commands | `gsd-tools.cjs commit` | Handles commit_docs=false, message formatting |
| Artifact detection | Custom file scanning | `getPhaseFileStats()` extension | Centralized, used by all commands |
| Interactive questions | Custom input handling | `AskUserQuestion` tool | GSD standard, handles text_mode fallback |

## Common Pitfalls

### Pitfall 1: Forgetting init.cjs has multiple init functions
**What goes wrong:** Adding `has_brainstorm` to one init output but missing others.
**Why it happens:** `init.cjs` has multiple code paths that construct phase info objects -- `phase-op`, `progress-context`, `roadmap-detail`, and the default empty objects.
**How to avoid:** Grep for every occurrence of `has_research` or `has_context` in init.cjs and add `has_brainstorm` alongside each one.
**Warning signs:** `has_brainstorm` shows up in `init phase-op` output but not in `progress-context`.

### Pitfall 2: Patching only one discuss-phase workflow
**What goes wrong:** Brainstorm detection works in discuss mode but not assumptions mode (or vice versa).
**Why it happens:** There are TWO discuss workflow files: `discuss-phase.md` (interactive) and `discuss-phase-assumptions.md` (codebase-first). Both have `load_prior_context` steps.
**How to avoid:** Patch BOTH files with identical BRAINSTORM.md detection logic.
**Warning signs:** `/gsd:discuss-phase` in one mode picks up brainstorm, the other doesn't.

### Pitfall 3: Cross-phase vs same-phase BRAINSTORM.md confusion
**What goes wrong:** discuss-phase reads BRAINSTORM.md from ALL phases instead of only the current phase.
**Why it happens:** The `load_prior_context` step already iterates over prior CONTEXT.md files. It's tempting to add BRAINSTORM.md to the same loop.
**How to avoid:** BRAINSTORM.md detection is SAME-PHASE ONLY (D-03). Use `has_brainstorm` from init (which reads current phase dir), not a find across all phases.
**Warning signs:** Phase 5 discuss-phase shows assumptions from Phase 3's brainstorm.

### Pitfall 4: do.md routing clobbers existing discuss-phase route
**What goes wrong:** "discussing vision" intent no longer routes to discuss-phase.
**Why it happens:** The routing table has "brainstorming" and "discussing vision" in the same row currently.
**How to avoid:** Split the routing: "brainstorming" -> `/gsd:brainstorm-phase`, "discussing vision/how should X look" -> `/gsd:discuss-phase`. Keep both routes.
**Warning signs:** User says "let's discuss how phase 3 should work" and gets routed to brainstorm instead of discuss.

### Pitfall 5: Template uses wrong XML tag names
**What goes wrong:** discuss-phase can't parse BRAINSTORM.md sections.
**Why it happens:** Using different XML tag names in template vs what the parser expects.
**How to avoid:** Define tag names in template, then reference those exact names in the discuss-phase patch.
**Warning signs:** discuss-phase reads BRAINSTORM.md but finds no decisions.

## Code Examples

### Example 1: getPhaseFileStats extension (core.cjs)
```javascript
// Source: core.cjs line 1179, existing pattern
function getPhaseFileStats(phaseDir) {
  const files = fs.readdirSync(phaseDir);
  return {
    plans: filterPlanFiles(files),
    summaries: filterSummaryFiles(files),
    hasResearch: files.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md'),
    hasContext: files.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md'),
    hasVerification: files.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md'),
    hasReviews: files.some(f => f.endsWith('-REVIEWS.md') || f === 'REVIEWS.md'),
    // NEW:
    hasBrainstorm: files.some(f => f.endsWith('-BRAINSTORM.md') || f === 'BRAINSTORM.md'),
  };
}
```

### Example 2: Command frontmatter (brainstorm-phase.md)
```markdown
---
name: gsd:brainstorm-phase
description: Creative exploration for a phase — produces BRAINSTORM.md with design decisions and trade-offs that feed into discuss-phase.
argument-hint: "<phase>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---
```

### Example 3: discuss-phase load_prior_context patch
```markdown
**Step 2.5: Read same-phase BRAINSTORM.md (if exists)**

Check if a brainstorm artifact exists for THIS phase (not prior phases):

If `has_brainstorm` from init is true:
- Read `${phase_dir}/*-BRAINSTORM.md`
- Extract `<design_decisions>` section -- treat BD-* items as Likely confidence assumptions
- Extract `<pre_context>` section -- use assumptions list and open questions
- Store as `<brainstorm_prior>` for use in gray area analysis

**Usage in subsequent steps:**
- `analyze_phase` / `deep_codebase_analysis`: Pre-populate assumptions with brainstorm decisions (Likely confidence)
- `present_gray_areas` / `present_assumptions`: Show brainstorm decisions as pre-answered (user can override)
- Gray areas that match brainstorm decisions are presented as "From brainstorm: [decision]. Keep or change?"
```

### Example 4: Workflow interactive loop pattern
```markdown
<step name="explore_domain">
Explore the phase domain through one-question-at-a-time dialogue.

Read the phase goal from ROADMAP.md. Identify 3-5 key design areas that need exploration.

For each area, ask ONE question at a time using AskUserQuestion:
- Prefer multiple-choice when possible
- Open-ended when the domain requires it
- Adapt follow-up questions based on responses
- Stop exploring an area when the user's intent is clear

**Question flow heuristic:**
1. Start with the highest-impact design decision
2. Ask 2-4 questions per area (fewer for simple areas, more for complex)
3. After understanding the area, move to the next
4. Total: ~8-15 questions across all areas

**Text mode:** When `workflow.text_mode: true`, present questions as numbered lists instead of AskUserQuestion.
</step>

<step name="propose_approaches">
For each major design decision, present 2-3 approaches:

Format:
```
### [Decision Area]

**Option A: [Name]** (Recommended)
[Description, 2-3 sentences]
- Pros: [key advantages]
- Cons: [key disadvantages]

**Option B: [Name]**
[Description, 2-3 sentences]
- Pros: [key advantages]
- Cons: [key disadvantages]

**Option C: [Name]** (if applicable)
...

My recommendation: Option A because [reasoning].
```

Use AskUserQuestion for each decision:
- header: "[Area Name]"
- question: "Which approach?"
- options: [Option A (recommended), Option B, Option C, "Let me explain what I want"]
</step>
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (main package) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAIN-01 | `/gsd:brainstorm-phase N` runs creative exploration | manual-only | N/A -- interactive workflow, markdown files | N/A |
| BRAIN-02 | Generates `{NN}-BRAINSTORM.md` with correct sections | unit | `node -e "require('./get-shit-done/bin/lib/core.cjs').getPhaseFileStats(...)"` | Wave 0 |
| BRAIN-03 | discuss-phase reads BRAINSTORM.md as prior context | manual-only | N/A -- workflow behavior in markdown | N/A |
| BRAIN-04 | Suggests `/clear` + `/gsd:discuss-phase` at end | manual-only | N/A -- output text in markdown | N/A |

### Sampling Rate
- **Per task commit:** Verify `getPhaseFileStats()` detects `-BRAINSTORM.md` files
- **Per wave merge:** Manual test: create a dummy BRAINSTORM.md, run `gsd-tools.cjs init phase-op N`, verify `has_brainstorm: true`
- **Phase gate:** Full manual walkthrough of brainstorm -> discuss flow

### Wave 0 Gaps
- No automated test gaps -- BRAIN-02 is the only testable unit (artifact detection in core.cjs), and existing test patterns for `getPhaseFileStats` can be extended
- Manual testing covers BRAIN-01, BRAIN-03, BRAIN-04 (interactive workflows cannot be unit tested)

## Open Questions

1. **BRAIN-01 through BRAIN-04 requirement definitions**
   - What we know: CONTEXT.md deferred section notes these are not yet defined in REQUIREMENTS.md
   - What's unclear: Exact wording of each requirement
   - Recommendation: Define them during planning based on success criteria from ROADMAP.md. Suggested mapping:
     - BRAIN-01: Command exists and runs interactive exploration with one-question-at-a-time
     - BRAIN-02: Generates `{NN}-BRAINSTORM.md` with domain boundary, design decisions, trade-offs, pre-context sections
     - BRAIN-03: discuss-phase detects and integrates BRAINSTORM.md as Likely-confidence assumptions
     - BRAIN-04: Workflow ends with `/clear` + `/gsd:discuss-phase <N>` suggestion

2. **Visual companion offer**
   - What we know: Superpowers brainstorming offers visual companion for mockups
   - What's unclear: Whether to include even as text-only mention in brainstorm workflow
   - Recommendation: Skip entirely for v1 (deferred in CONTEXT.md). Keep workflow text-only. Can be added later as a step between initialize and explore_domain.

3. **Number of init.cjs locations to patch**
   - What we know: `has_research`/`has_context` appear in ~10 locations across init.cjs
   - What's unclear: Some may be dead code or edge-case handlers
   - Recommendation: Grep for `has_context` in init.cjs and add `has_brainstorm` at every occurrence to be safe. Worst case is a few extra harmless booleans.

## Sources

### Primary (HIGH confidence)
- `commands/gsd/discuss-phase.md` -- Command pattern, frontmatter structure, execution_context delegation
- `get-shit-done/workflows/discuss-phase.md` -- Full workflow with steps XML, load_prior_context, gray area analysis
- `get-shit-done/workflows/discuss-phase-assumptions.md` -- Assumptions mode workflow, load_prior_context, scout_codebase, subagent pattern
- `get-shit-done/templates/context.md` -- Template structure with XML sections, examples, guidelines
- `get-shit-done/bin/lib/core.cjs` lines 1179-1189 -- `getPhaseFileStats()` artifact detection
- `get-shit-done/bin/lib/init.cjs` lines 740-766 -- Init output structure with `has_*` booleans
- `get-shit-done/workflows/do.md` line 44 -- Current routing table
- `get-shit-done/workflows/help.md` -- Full command reference
- `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/SKILL.md` -- Brainstorming interaction patterns (one-question-at-a-time, 2-3 approaches, design presentation)

### Secondary (MEDIUM confidence)
- `.planning/phases/04-brainstorm-phase-integration/04-CONTEXT.md` -- User decisions from discuss-phase (assumptions mode)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no external dependencies, all internal GSD patterns
- Architecture: HIGH -- direct replication of established command/workflow/template patterns
- Pitfalls: HIGH -- identified from direct code reading of init.cjs and discuss-phase workflows
- Integration points: HIGH -- exact line numbers and function names identified

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable internal codebase, no external dependency drift)
