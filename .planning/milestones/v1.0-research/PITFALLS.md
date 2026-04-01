# Domain Pitfalls

**Domain:** AI-assisted development guardrails and global memory
**Researched:** 2026-03-29

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Function Map Staleness (Silent False Negatives)
**What goes wrong:** Function Map says function X has 3 callers. In reality, a previous execution added 2 more callers but did not update the map. Impact analysis misses 2 callers. Breakage ships silently.
**Why it happens:** Map updates are easy to skip -- agents forget, execution gets interrupted, map update step fails silently.
**Consequences:** The entire value proposition ("no silent breakage") collapses. Users lose trust in the system.
**Prevention:**
1. Make map update a MANDATORY step in execute-phase, not optional
2. Verify map freshness: compare file modification timestamps vs map generation timestamp
3. When in doubt, use Serena `find_referencing_symbols` as live verification (not just map lookup)
4. Add a "last_updated" field per file entry in function-map.json
**Detection:** Compare `git log --name-only` of recently modified files against function-map.json timestamps. Any mismatch = stale map.

### Pitfall 2: Context Window Overflow from Function Map
**What goes wrong:** Function Map grows to 200KB+ on a medium project. Agent loads it into context, leaving no room for the actual code being modified. Execution quality degrades.
**Why it happens:** Mapping every symbol in every file without selectivity. Including internal helpers, private functions, type definitions.
**Consequences:** Agents run out of context, produce lower-quality output, or refuse long operations.
**Prevention:**
1. Map ONLY exported/public symbols. Internal helpers are not cross-file concerns.
2. Set a hard size limit (target: <100KB for function-map.json)
3. Load selectively: only entries for files the agent is about to modify + their callers
4. Provide an index (symbol name -> file) that is always small, load full entries on demand
**Detection:** Monitor function-map.json size. Alert if >100KB.

### Pitfall 3: Behavioral vs Structural Misclassification
**What goes wrong:** Agent classifies a behavioral change as structural and auto-resolves it. Or classifies a structural change as behavioral and bothers the user unnecessarily.
**Why it happens:** The boundary is genuinely ambiguous. Changing a default parameter value is structural (signature unchanged) but potentially behavioral (callers relying on the old default).
**Consequences:** Auto-resolved behavioral changes = silent bugs. Over-escalation = user ignores alerts (alert fatigue).
**Prevention:**
1. Err on the side of escalation for v1 (false positives are cheaper than false negatives)
2. Define clear classification rules in the prompt, with examples:
   - STRUCTURAL: param added/removed/renamed, return type changed, function renamed
   - BEHAVIORAL: logic inside function body changed, default values changed, error handling changed, side effects changed
3. When ambiguous, escalate with explanation: "Changed default from X to Y. N callers may rely on old default."
**Detection:** Track user overrides. Too many "just do it" = rules too strict. Bugs after auto-resolve = too few escalations.

### Pitfall 4: ADR Proliferation Without Curation
**What goes wrong:** Agents create an ADR for every minor decision. 50 ADRs in a 3-phase project. Subsequent agents cannot read them all, so they ignore the directory entirely.
**Why it happens:** The "create ADR" instruction is too broad. Agents interpret "architectural decision" loosely.
**Consequences:** ADR system becomes noise. The amnesia problem returns because agents skip reading a 50-file directory.
**Prevention:**
1. Define "architectural" clearly in the prompt: decisions that affect multiple files, constrain future choices, or deviate from common patterns
2. Limit: max 3-5 ADRs per milestone
3. Require an ADR index file (.planning/decisions/INDEX.md) that summarizes all decisions in <20 lines
4. Agents read INDEX.md (compact) rather than all individual ADRs
**Detection:** Count ADRs per milestone. If >5, review for over-documentation.

## Moderate Pitfalls

### Pitfall 5: Serena Unavailability Breaks the Workflow
**What goes wrong:** User does not have Serena configured. Function Map population fails. Impact analysis becomes impossible. System falls back to "do nothing."
**Prevention:**
1. Every Serena-dependent step MUST have a grep-based fallback
2. Test the fallback path as thoroughly as the primary path
3. Detect Serena availability at map-population time, not at impact-analysis time
4. If no Serena: populate map with grep, mark entries as "confidence: grep" so impact analysis knows to be more conservative

### Pitfall 6: Circular Caller Updates
**What goes wrong:** Function A calls function B. Agent changes B's signature. Auto-resolve updates A. But updating A changes A's behavior, which triggers another impact check on A's callers. Infinite loop.
**Prevention:**
1. Structural auto-resolve applies ONLY to call-site adaptation (updating arguments/return handling)
2. If updating a caller requires changing the caller's signature, STOP and escalate
3. Set a recursion limit: max 1 level of caller updates per change
4. v1: only update direct callers, never cascade to indirect callers

### Pitfall 7: Cross-Plan Memory Becomes a Dump
**What goes wrong:** .planning/memory/ accumulates unstructured notes from every execution. By Phase 5, the directory is 50KB of scattered observations. No agent can extract value from it.
**Prevention:**
1. Structured format: each memory file has a clear schema (date, source phase, finding, implication)
2. Deduplicate: before writing, check if the discovery already exists
3. Curate at milestone boundaries: milestone-summary creates a clean memory snapshot
4. Size limit: cap memory files at 5KB each, rotate/archive old entries

### Pitfall 8: Function Map Schema Evolves Without Migration
**What goes wrong:** v1 schema has callers as string array. v2 adds callers as objects with name, file, line. Old maps break with new code. Or new code silently ignores old format.
**Prevention:**
1. Include "version" field in function-map.json from day 1
2. Write a schema validator (simple JSON schema check in the agent prompt)
3. When schema changes: provide migration instructions in the prompt, or auto-migrate on read

## Minor Pitfalls

### Pitfall 9: ADR Numbering Conflicts
**What goes wrong:** Two parallel agents both create ADR 0005. Git merge conflict.
**Prevention:** Use timestamps in filenames instead of sequential numbers (e.g., 2026-03-29-use-serena.md) or let the orchestrator assign numbers (not parallel agents).

### Pitfall 10: grep Fallback Quality
**What goes wrong:** grep-based function extraction misses arrow functions, class methods, destructured exports. Map is incomplete.
**Prevention:** Use multiple patterns. Accept that grep fallback is lossy and mark entries as "confidence: grep". Do not pretend grep is as accurate as Serena.

### Pitfall 11: Upstream PR Rejection Due to Serena Dependency
**What goes wrong:** GSD upstream does not want Serena as a hard dependency. PR is rejected.
**Prevention:** Everything MUST work without Serena (degraded but functional). Serena is an enhancer, not a requirement. Test upstream-compatibility with Serena disabled.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| ADR template + storage | Over-documentation (Pitfall 4) | Clear "what is architectural" definition in prompt |
| Function Map schema | Context overflow (Pitfall 2) | Map only exports, set size limits |
| Function Map population | Serena unavailable (Pitfall 5) | grep fallback tested separately |
| Impact analysis prompts | Misclassification (Pitfall 3) | Examples in prompt, err toward escalation |
| Auto-resolve implementation | Circular updates (Pitfall 6) | Single-level limit, no cascading |
| Auto-update hook | Staleness (Pitfall 1) | Mandatory step, timestamp verification |
| Cross-plan memory | Memory dump (Pitfall 7) | Structured schema, size limits, curation |
| Upstream PR preparation | Serena hard dependency (Pitfall 11) | Test all paths without Serena |

## Sources

- PROJECT.md constraints and explicit scope decisions
- [Aider RepoMap](https://aider.chat/docs/repomap.html) -- Lessons from function mapping at scale
- [ADR community practices](https://adr.github.io/) -- ADR management patterns
- Observed patterns from AI code review tools regarding false positive/negative tradeoffs
