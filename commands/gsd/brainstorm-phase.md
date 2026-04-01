---
name: gsd:brainstorm-phase
description: Creative exploration for a phase -- produces BRAINSTORM.md with design decisions and trade-offs that feed into discuss-phase.
argument-hint: "<phase>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
Run creative exploration to form vision BEFORE discuss-phase. When a user doesn't yet have clear requirements or is unsure about the design direction, brainstorm-phase helps them explore the domain through one-question-at-a-time dialogue, propose 2-3 approaches with trade-offs for each design area, and capture soft decisions.

**Output:** `{NN}-BRAINSTORM.md` with soft decisions (Likely confidence) that discuss-phase can refine. Brainstorm decisions are NOT locked -- discuss-phase can override everything.

**Flow:**
1. Load project context (PROJECT.md, ROADMAP.md, STATE.md, prior CONTEXT.md files)
2. Scout codebase for reusable assets and patterns
3. Explore domain through interactive Q&A (one question at a time)
4. Propose 2-3 approaches with trade-offs and recommendations
5. Capture design decisions with confidence levels
6. Write BRAINSTORM.md with domain_boundary, design_decisions, tradeoffs_explored, pre_context sections
7. Direct user to `/clear` + `/gsd:discuss-phase N` as next step
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/brainstorm-phase.md
@~/.claude/get-shit-done/templates/brainstorm.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)
</context>

<process>
**MANDATORY:** The execution_context files listed above ARE the instructions. Read the workflow file BEFORE taking any action. The objective and success_criteria sections in this command file are summaries -- the workflow file contains the complete step-by-step process with all required behaviors, config checks, and interaction patterns. Do not improvise from the summary.
</process>

<success_criteria>
- Phase domain explored through one-question-at-a-time dialogue
- 2-3 approaches proposed with trade-offs for each design area
- BRAINSTORM.md created with domain_boundary, design_decisions, tradeoffs_explored, pre_context sections
- User directed to `/clear` + `/gsd:discuss-phase N` as next step
</success_criteria>
