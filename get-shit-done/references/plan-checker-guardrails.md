## Dimension 11: Scope Fidelity (Scope Erosion Detection)

**Question:** Do plans deliver the FULL requirement, or silently reduce scope with qualifying language?

**Core principle:** When a plan feels too large, the correct response is to SPLIT into more plans — never to reduce what gets delivered. Scope erosion is when an agent delivers 60% disguised as 100% using qualifying language.

**Process:**
1. Scan ALL plan text (objective, task names, actions, done criteria, must_haves) for scope-reduction patterns
2. For each match, determine if it's genuine (legitimate phasing from ROADMAP) or erosion (agent reducing scope)
3. Cross-reference against ROADMAP.md requirements — if the requirement says "full X" but the plan says "basic X", that's erosion

**Red flag patterns (case-insensitive scan):**

| Category | Patterns | Why It's a Red Flag |
|----------|----------|---------------------|
| Versioning | `v1`, `v2`, `phase 1 of`, `first pass`, `initial version`, `first iteration` | Agent is inventing sub-phases that don't exist in ROADMAP |
| Minimizing | `simplified`, `basic`, `minimal`, `lightweight`, `bare-bones`, `stripped-down`, `lean` | Agent is reducing complexity instead of splitting work |
| Deferring | `for now`, `later we can`, `in a future phase`, `eventually`, `down the road`, `placeholder for now` | Agent is pushing work out of scope without authority |
| Sufficiency theater | `this is enough for`, `sufficient for`, `good enough`, `adequate for`, `meets minimum` | Agent is lowering the bar instead of meeting the requirement |
| Scope hedging | `if time permits`, `stretch goal`, `nice to have`, `optional enhancement`, `bonus` | Agent is making requirements optional when they're not |
| Partial delivery | `skeleton`, `scaffold only`, `stub`, `basic structure`, `foundation only`, `shell` | Agent plans to deliver incomplete artifacts |

**Exceptions (NOT red flags):**
- Language appears in `## Deferred Ideas` section of CONTEXT.md (that's the proper place for deferral)
- Language appears in ROADMAP.md phase description (user defined the scope)
- Task action says "per ROADMAP" or "per D-XX" referencing a user decision that scoped it down
- The word appears in a technical context (e.g., "v1" as an API version path like `/api/v1/users`)

**Severity:**
- **blocker** — Pattern found in task `<action>`, `<done>`, or `must_haves.truths` (these directly shape what gets built)
- **warning** — Pattern found in `<objective>` or task `<name>` (may indicate intent to reduce)

**Example — scope erosion in action:**
```yaml
issue:
  dimension: scope_fidelity
  severity: blocker
  description: "Plan uses scope-reducing language: 'basic authentication flow' — requirement AUTH-01 demands full auth with refresh tokens, not 'basic' auth"
  plan: "01"
  task: 1
  pattern_found: "basic"
  location: "<action>"
  requirement: "AUTH-01: User authentication with JWT refresh rotation"
  fix_hint: "Either deliver full AUTH-01 requirement OR split into multiple plans that together cover 100% — do not reduce scope"
```

**Example — false positive (legitimate):**
```yaml
# NOT an issue — "v1" is an API path, not scope reduction
action: "Create POST /api/v1/users endpoint..."
```

**The fundamental rule:** Plans MUST deliver 100% of their mapped requirements across all plans in the phase. If a single plan can't do it, create more plans. Never deliver less.

## Dimension 12: Research Compliance (Research vs Locked Decisions)

**Question:** Does the RESEARCH.md undermine, contradict, or create justifications to deviate from locked decisions in CONTEXT.md?

**Only check if BOTH CONTEXT.md and RESEARCH.md were provided in the verification context.**

**Core principle:** Locked decisions are NON-NEGOTIABLE. Research should deepen understanding of locked decisions, not argue against them. When a researcher creates justifications to deviate from a locked decision, it's a red flag that the agent found the work too complex and is looking for an easier path.

**Process:**
1. Extract all locked decisions (D-01, D-02, etc.) from CONTEXT.md `## Decisions` section
2. For each locked decision, search RESEARCH.md for:
   a. Direct contradictions ("instead of X, use Y" where X is the locked decision)
   b. Subtle undermining ("X is overkill for this case", "simpler alternative to X", "X adds unnecessary complexity")
   c. Reframing ("while X was decided, a better approach would be...")
   d. Conditional bypasses ("if performance is a concern, skip X", "X can be deferred")
3. Check that plans FOLLOW research recommendations — if research undermines a locked decision and the plan follows the research (not the decision), that's a compound failure

**Red flag patterns in RESEARCH.md:**

| Pattern | Example | Why It's Dangerous |
|---------|---------|-------------------|
| "overkill" near a locked decision | "Redis is overkill for this use case" (when D-03 locked Redis) | Agent is arguing the user's decision is wrong |
| "simpler alternative" | "A simpler alternative to the decided approach..." | Agent is proposing to not do what was decided |
| "consider instead" | "Consider using SQLite instead" (when D-01 locked PostgreSQL) | Agent is reopening a closed decision |
| "not necessary" / "unnecessary" | "JWT refresh rotation is not necessary for this phase" | Agent is removing a locked requirement |
| "complexity" as argument | "This adds unnecessary complexity" about a locked decision | Agent is using complexity as excuse to skip work |
| Presenting alternatives AFTER lock | "Alternatives: ..." section for a locked technology | Research shouldn't explore alternatives to locked decisions |

**Exceptions (NOT red flags):**
- Research discusses trade-offs in `## Claude's Discretion` areas (that's expected — these are open)
- Research notes a genuine compatibility issue (e.g., "D-03 specifies Redis 6 but the hosting only supports Redis 5") — this is valuable information, not undermining
- Research deepens the locked decision (e.g., "D-01 locked React — here's the recommended React pattern for this use case")

**Severity:**
- **blocker** — Research directly contradicts a locked decision AND the plan follows the research instead of the decision
- **blocker** — Research presents alternatives to a locked decision with persuasive language suggesting deviation
- **warning** — Research questions a locked decision but the plan still honors it

**Example — research undermining locked decision:**
```yaml
issue:
  dimension: research_compliance
  severity: blocker
  description: "RESEARCH.md undermines locked decision D-03 (use Redis for caching): states 'Redis is overkill, in-memory cache sufficient' — and Plan 02 implements in-memory cache instead of Redis"
  decision: "D-03: Use Redis for session caching"
  research_text: "Redis adds operational complexity. For this scale, a simple in-memory Map is sufficient."
  plan: "02"
  plan_action: "Implement in-memory session cache using Map..."
  fix_hint: "Research must support locked decisions, not argue against them. Plan must implement Redis per D-03. If Redis is genuinely problematic, escalate to user — don't silently deviate."
```

**Example — legitimate research concern:**
```yaml
# NOT an issue — research identifies a real compatibility problem
research_text: "D-03 specifies Redis 7 features (JSON module). Current hosting runs Redis 6.2 — JSON module unavailable. Recommend: use Redis 6.2 with hash-based workaround to achieve same outcome."
# This SUPPORTS the decision while flagging a constraint. Plan should still use Redis.
```

**The fundamental rule:** Locked decisions can only be changed by the USER. If research finds a genuine problem with a locked decision, it should flag it as an Open Question for user resolution — never silently substitute an alternative.
