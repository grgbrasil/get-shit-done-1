<purpose>
Creative exploration workflow for a GSD phase. Helps users form vision BEFORE discuss-phase
when they don't have clear requirements yet. Produces BRAINSTORM.md with soft decisions
(Likely confidence) that discuss-phase can refine or override.

This is a GSD-native interactive workflow -- NOT a subagent. It runs as direct conversation
between Claude and the user. NEVER use Task tool or spawn subagents.
</purpose>

<anti_patterns>
**CRITICAL: Enforce these throughout the workflow.**

- **NEVER ask multiple questions in the same turn.** One question at a time, always. Wait for
  the user's response before asking the next question.
- **NEVER use Task tool or spawn subagents.** This is direct conversation, not delegation.
- **NEVER suggest plan-phase as next step.** Brainstorm feeds discuss-phase, period.
- **NEVER treat brainstorm decisions as locked.** They are Likely confidence -- discuss-phase
  can override everything.
</anti_patterns>

<answer_validation>
**IMPORTANT: Answer validation** -- After every AskUserQuestion call, check if the response
is empty or whitespace-only. If so:
1. Retry the question once with the same parameters
2. If still empty, present the options as a plain-text numbered list

**Text mode (`workflow.text_mode: true` in config or `--text` flag):**
When text mode is active, do not use AskUserQuestion at all. Present every question as a
plain-text numbered list and ask the user to type their choice number.
</answer_validation>

<process>

<step name="initialize" priority="first">
Phase number from argument (required).

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`,
`padded_phase`, `has_brainstorm`, `has_context`, `has_research`, `has_plans`,
`roadmap_exists`, `commit_docs`.

**If `phase_found` is false:**
```
Phase [X] not found in roadmap.

Use /gsd:progress to see available phases.
```
Exit workflow.

**If `phase_found` is true:** Continue to check_existing.

Check text mode:
```bash
TEXT_MODE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.text_mode 2>/dev/null || echo "false")
```
If `--text` flag present in ARGUMENTS, set TEXT_MODE to true.
</step>

<step name="check_existing">
Check if BRAINSTORM.md already exists using `has_brainstorm` from init.

```bash
ls ${phase_dir}/*-BRAINSTORM.md 2>/dev/null || true
```

**If exists:**

Use AskUserQuestion:
- header: "Brainstorm"
- question: "Phase [X] already has a brainstorm. What do you want to do?"
- options:
  - "Update existing" -- Re-explore and refresh brainstorm
  - "View it" -- Show me what's there
  - "Skip" -- Use existing brainstorm as-is

If "Update existing": Load existing BRAINSTORM.md for reference, continue to load_prior_context.
If "View it": Display BRAINSTORM.md, then re-ask with "Update" / "Skip" options.
If "Skip": Exit workflow.

**If doesn't exist:** Continue to load_prior_context.
</step>

<step name="load_prior_context">
Read project-level and prior phase context to build understanding.

**Step 1: Read project-level files**
```bash
cat .planning/PROJECT.md 2>/dev/null || true
cat .planning/ROADMAP.md 2>/dev/null || true
cat .planning/STATE.md 2>/dev/null || true
```

Extract from these:
- **PROJECT.md** -- Vision, principles, non-negotiables
- **ROADMAP.md** -- Phase goal and description for current phase
- **STATE.md** -- Current progress, any relevant decisions from prior phases

**Step 2: Read prior CONTEXT.md files**
```bash
(find .planning/phases -name "*-CONTEXT.md" 2>/dev/null || true) | sort
```

For each CONTEXT.md where phase number < current phase:
- Read the `<decisions>` section -- these are locked preferences
- Read `<specifics>` -- particular references or examples
- Note patterns (e.g., "user consistently prefers X over Y")

**Step 3: Build internal `<prior_decisions>` context**

Structure the extracted information for use in exploration. This helps avoid
re-exploring areas where decisions are already locked from prior phases.
</step>

<step name="scout_codebase">
Lightweight scan of existing code to inform exploration.

**Step 1: Check for existing codebase maps**
```bash
ls .planning/codebase/*.md 2>/dev/null || true
```

**If codebase maps exist:** Read relevant ones (CONVENTIONS.md, STRUCTURE.md, STACK.md).
Extract reusable components, patterns, integration points. Skip to Step 3.

**Step 2: If no codebase maps, do targeted grep**

Extract key terms from the phase goal (from ROADMAP.md). Search for related files:
```bash
grep -rl "{term1}\|{term2}" src/ app/ lib/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.cjs" 2>/dev/null | head -10
```

Read the 3-5 most relevant files to understand existing patterns.

**Step 3: Build internal `<codebase_context>`**

Identify reusable assets, established patterns, and creative options. Store internally
for use when proposing approaches in later steps.
</step>

<step name="explore_domain">
Interactive Q&A loop to understand the user's vision for this phase.

**Step 1: Read the phase goal from ROADMAP.md**

Identify the phase boundary -- what this phase delivers. This is fixed scope.

**Step 2: Identify 3-5 key design areas needing exploration**

Based on the phase goal, prior context, and codebase scout, determine which design areas
have ambiguity that the user should weigh in on. These are areas where multiple valid
approaches exist and the choice would change the result.

**Step 3: For each area, ask ONE question at a time using AskUserQuestion**

Question flow heuristic:
- Start with the highest-impact design decision
- 2-4 questions per area depending on complexity
- Total ~8-15 questions across all areas
- Prefer multiple-choice when possible (options parameter)
- Open-ended when the domain requires freeform thinking
- Adapt follow-up questions based on responses
- Stop exploring an area when user's intent is clear

**CRITICAL: ONE question per turn. NEVER batch multiple questions.**

When `TEXT_MODE` is true: Present numbered lists instead of AskUserQuestion.

Example question flow:
```
Area: "Data Loading Strategy"

Q1: "How should data load when users open this view?"
Options: ["Eager load everything upfront", "Load on demand as they scroll", "Hybrid -- critical data first, rest on demand"]

[User picks "Hybrid"]

Q2: "What counts as critical data that must load immediately?"
Options: ["Header + first 10 items", "Just the summary counts", "Let me describe..."]

[Intent is clear -- move to next area]
```
</step>

<step name="propose_approaches">
For each major design decision identified in explore_domain, present 2-3 approaches with
trade-offs and a recommendation.

Format each approach block as:

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
```

**For each decision area:** Use AskUserQuestion:
- header: [area name]
- question: "Which approach?"
- options: [Option names, recommended option marked with "(recommended)"]

Record user's selection for each area.

**CRITICAL: ONE decision area per turn. Present approaches, ask, wait for response,
then move to the next area.**
</step>

<step name="capture_decisions">
Iterate on design decisions until user is satisfied.

For each approach selected in propose_approaches, record as BD-NN with confidence level:
- **Confident** -- User was definitive, stated clear preference
- **Likely** -- User went with recommendation or said "sounds good"
- **Unclear** -- User was hesitant, said "maybe", or deferred

Present summary of all captured decisions:

```
## Brainstorm Decisions Summary

### [Area 1]
- BD-01: [Decision] -- Confidence: Likely
- BD-02: [Decision] -- Confidence: Confident

### [Area 2]
- BD-03: [Decision] -- Confidence: Likely

### [Area 3]
- BD-04: [Decision] -- Confidence: Unclear
```

Ask user via AskUserQuestion:
- header: "Decisions"
- question: "These are the decisions so far. Anything to add or change?"
- options:
  - "Looks good" -- Proceed to write BRAINSTORM.md
  - "Change something" -- Revisit specific decisions
  - "Add more" -- Explore additional areas

If "Change something": Ask which decision to revisit, re-explore that area.
If "Add more": Identify new areas and loop back to explore_domain for those areas.
If "Looks good": Continue to write_brainstorm.
</step>

<step name="write_brainstorm">
Write `{NN}-BRAINSTORM.md` to `${phase_dir}/` using the template from
`get-shit-done/templates/brainstorm.md`.

**File:** `${phase_dir}/${padded_phase}-BRAINSTORM.md`

Fill in all 4 sections:

1. **`<domain_boundary>`** -- Phase scope from ROADMAP.md
2. **`<design_decisions>`** -- All BD-NN items from capture_decisions with confidence levels,
   trade-offs, and reasoning
3. **`<tradeoffs_explored>`** -- Approach comparison tables from propose_approaches
4. **`<pre_context>`** -- Two subsections:
   - **Assumptions (Likely confidence):** Likely and Confident items that discuss-phase
     should treat as pre-populated assumptions
   - **Open Questions:** Unclear items or unexplored areas that need user decision
     in discuss-phase

Write the file using the Write tool.
</step>

<step name="git_commit">
Commit the brainstorm artifact:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(${padded_phase}): brainstorm phase exploration" --files ${phase_dir}/${padded_phase}-BRAINSTORM.md
```

If `commit_docs` is false, skip this step.
</step>

<step name="confirm_creation">
Display summary of what was explored and decided.

```
Created: ${phase_dir}/${padded_phase}-BRAINSTORM.md

## Brainstorm Summary

### [Area 1]
- BD-01: [Key decision] (Likely)

### [Area 2]
- BD-02: [Key decision] (Confident)

[Repeat for each area]

## Open Questions for discuss-phase
- [Any Unclear items or unexplored areas]

---

Next steps:
1. /clear (fresh context window)
2. /gsd:discuss-phase [phase_number]
```

**CRITICAL:** NEVER suggest plan-phase or any other command after brainstorm. The brainstorm
feeds discuss-phase, period. The flow is: brainstorm-phase (optional) -> discuss-phase ->
plan-phase -> execute-phase.
</step>

</process>

<success_criteria>
- Phase domain explored through one-question-at-a-time dialogue
- 2-3 approaches proposed with trade-offs for each design area
- User selected preferred approach for each area
- Decisions captured with appropriate confidence levels (Confident/Likely/Unclear)
- BRAINSTORM.md created with domain_boundary, design_decisions, tradeoffs_explored, pre_context sections
- User directed to `/clear` + `/gsd:discuss-phase N` as next step
- No Task tool used, no subagents spawned
- No suggestion of plan-phase as next step
</success_criteria>
