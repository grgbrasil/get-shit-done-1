## Impact Analysis Protocol

**When active:** Impact analysis is active when `.planning/function-map.json` exists in the project root.

**BEFORE editing any function/method/class:**

1. Identify the function key: `<relative_path>::<ClassName>::<methodName>` or `<relative_path>::<functionName>`
2. Run: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" fmap impact "<key>"`
3. Record the pre-edit snapshot: `signature`, `purpose`, `callers`, `caller_count`
4. If `found: false`: proceed with edit, but log that function is not yet in the map

**AFTER editing:**

5. Compare the pre-edit `signature` with the new function signature in the code you just wrote:
   - **Signature changed** (parameters added/removed/retyped, return type changed, function renamed) = **STRUCTURAL CHANGE**
   - **Signature unchanged but behavior/logic changed** (different algorithm, different return values for same inputs, changed side effects) = **BEHAVIORAL CHANGE**
   - **Neither** (cosmetic, comments, internal variable rename) = **NO IMPACT** -- skip to step 9

**STRUCTURAL CHANGE resolution (per D-03):**

6. Count callers from the pre-edit snapshot `caller_count`:
   - **0 callers:** No impact. Skip to step 9.
   - **1-10 callers:** Update each caller inline using Edit tool. Adapt each call site to match the new signature.
   - **11-50 callers:** Group callers by directory. Spawn a sub-agent (Task tool) for each group with: old signature, new signature, list of files:lines to update.
   - **>50 callers:** STOP. Return `checkpoint:decision` -- too many callers signals a refactoring need, not a silent fix. Present the caller count and ask the user how to proceed.
7. **Cascade check (1 level deep, per IMPACT-05):** For each caller you updated in step 6, run `gsd-tools fmap impact "<caller_key>"`. If updating that caller changed ITS signature too (e.g., you changed a parameter it passes through), repeat step 6 for that caller's callers. Only go 1 level deep -- do NOT recurse further.
8. Verify all updated callers still work (run tests if available, or at minimum confirm no syntax errors).

**BEHAVIORAL CHANGE escalation (per D-04):**

6b. STOP execution immediately. Return a `checkpoint:decision` with this impact card format:

```
## IMPACT DETECTED

**Type:** Behavioral Change
**Function:** `<key>`
**Callers affected:** <caller_count> (<comma-separated file:line list>)

**Old behavior:** <purpose field from pre-edit snapshot>
**New behavior:** <your assessment of what changed semantically>

**Risk:** <what could break for callers relying on old behavior>

**Options:**
1. **Approve** -- Continue with behavioral change. Callers may need manual review.
2. **Reject** -- Revert this change. Continue task without the behavioral modification.
3. **Skip** -- Defer to deferred-items.md. Continue task without behavioral change.
```

When in doubt between structural and behavioral, **bias toward behavioral escalation** -- a false positive escalation (asking the user unnecessarily) is far cheaper than a silent behavioral breakage.

**POST-RESOLUTION (per IMPACT-06):**

9. Update the Function Map for every function whose signature or callers changed:
   ```bash
   node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" fmap update --data '{"<key>": {"signature": "<new_sig>", "purpose": "<new_purpose>", "callers": [...], "calls": [...], "kind": "<kind>", "language": "<lang>", "exported": <bool>, "last_updated": "<ISO_NOW>"}}'
   ```
   Update entries for: the modified function AND any callers whose signatures changed during resolution.

**Thresholds** are configurable in `.planning/config.json` under `impact_analysis.auto_resolve_threshold` (default: 10) and `impact_analysis.sub_agent_threshold` (default: 50). Read these at runtime if the config file exists; fall back to defaults if not.
