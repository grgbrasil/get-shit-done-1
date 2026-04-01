# Brainstorm Template

Template for `.planning/phases/XX-name/{phase_num}-BRAINSTORM.md` - captures exploratory design decisions before discuss-phase.

**Purpose:** Pre-discuss exploration artifact. When the user doesn't have a clear vision yet, brainstorm-phase helps them explore the domain and form soft decisions that discuss-phase can refine.

**Key principle:** Decisions here are Likely confidence, not locked. discuss-phase can override everything. This is creative exploration, not final commitment.

**Downstream consumers:**
- `discuss-phase` (both modes) — Reads `<design_decisions>` and `<pre_context>` sections during `load_prior_context`. Injects brainstorm decisions as Likely-confidence assumptions that the user can confirm, correct, or reject.
- `gsd-phase-researcher` — Indirectly benefits via discuss-phase decisions that incorporate brainstorm output.

---

## File Template

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
- **BD-02:** [Decision explored] -- Confidence: Likely
  - Trade-off: [what was weighed]
  - Why this way: [reasoning]
</design_decisions>

<tradeoffs_explored>
## Trade-offs Explored
### [Topic]
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| A      | ...  | ...  | Recommended    |
| B      | ...  | ...  |                |

### [Topic 2]
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| A      | ...  | ...  |                |
| B      | ...  | ...  | Recommended    |
</tradeoffs_explored>

<pre_context>
## Pre-Context for discuss-phase
### Assumptions (Likely confidence)
[These feed into discuss-phase as pre-populated assumptions]
- [Assumption 1]
- [Assumption 2]

### Open Questions
[Items that need user decision in discuss-phase]
- [Question 1]
- [Question 2]
</pre_context>
```

---

<guidelines>
**This template captures EXPLORATORY decisions for discuss-phase.**

The output should answer: "What did we explore? What directions look promising? What still needs the user's definitive input?"

**Good content (concrete exploration with trade-offs):**
- "BD-01: Card-based layout over timeline -- Confidence: Likely"
- "Trade-off: Cards use more vertical space but group information better"
- "Option A: Infinite scroll (Recommended) -- familiar UX, lower cognitive load"

**Bad content (too vague or too final):**
- "Should look nice"
- "We decided on cards" (too definitive for brainstorm -- use Likely, not Confident)
- "Modern and responsive" (not actionable)

**Confidence levels:**
- **Confident** — User was definitive, this is almost certainly the right call
- **Likely** — Good evidence supports this direction, but discuss-phase should confirm
- **Unclear** — Multiple valid approaches, needs more user input in discuss-phase

**After creation:**
- File lives in phase directory: `.planning/phases/XX-name/{phase_num}-BRAINSTORM.md`
- discuss-phase reads `<design_decisions>` and `<pre_context>` during load_prior_context
- Decisions are NOT locked -- discuss-phase can override everything
- BRAINSTORM.md does NOT replace CONTEXT.md -- it is a pre-step that feeds into it
</guidelines>
