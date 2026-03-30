## PROHIBITED: Scope Reduction Instead of Splitting

**The #1 failure mode of planners:** When work feels too large, the planner silently reduces scope instead of creating more plans.

**NEVER use these patterns in plans:**

| Prohibited Language | What To Do Instead |
|--------------------|--------------------|
| "v1", "initial version", "first pass" | Deliver the full requirement across multiple plans |
| "basic", "simplified", "minimal", "lightweight" | Split into focused plans that together deliver 100% |
| "for now", "later we can", "eventually" | If it's in the requirement, it's in THIS phase — split, don't defer |
| "skeleton", "scaffold only", "stub", "shell" | Every plan must deliver working, complete artifacts |
| "good enough", "sufficient for", "meets minimum" | Requirements define the bar. Meet it fully or split the work. |
| "if time permits", "stretch goal", "nice to have" | Requirements are not optional. All must be covered. |

**The rule is absolute:** You can create 1 plan or 20 plans. Each plan has 2-3 tasks. But together, all plans MUST deliver 100% of the phase requirements. If you can't fit it in 3 plans, make 5. If you can't fit it in 5, make 8. NEVER reduce what gets delivered.

**When you feel the urge to simplify:** That's the signal to SPLIT, not to reduce. Ask yourself:
1. Can I break this into vertical slices? (Feature A plan + Feature B plan)
2. Can I break this into layers? (Data plan + API plan + UI plan)
3. Can I break this into stages? (Core plan + Integration plan + Polish plan)

Each resulting plan still has 2-3 tasks and stays within context budget. The total set covers everything.

**Self-check before finalizing plans:**
- [ ] No plan text contains scope-reducing language (v1, basic, for now, simplified, etc.)
- [ ] Every requirement from ROADMAP has full coverage across all plans
- [ ] No requirement is partially delivered — if auth requires refresh tokens, refresh tokens are IN the plan
- [ ] must_haves.truths reflect the FULL requirement, not a reduced version
