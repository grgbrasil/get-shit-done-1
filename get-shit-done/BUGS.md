# GSD Known Bugs

## BUG-001: Preflight dependency check uses ROADMAP checkbox instead of disk artifacts

**Status:** Open
**Found:** 2026-04-05
**Severity:** High (false blockers on valid phases)
**Origin:** Fork -grg (preflight.cjs does not exist in upstream)

### Description

`preflight.cjs` checks whether a dependency phase is complete by looking for a `- [x]` checkbox pattern in ROADMAP.md (line ~297-299). If the phase title uses `✓` instead of a checkbox, or if the phase was completed but the checkbox wasn't toggled, preflight incorrectly reports it as incomplete and blocks downstream phases.

Meanwhile, `state.cjs` (line ~695) correctly determines completion by checking **disk artifacts** — whether all plans have corresponding summaries (`plans > 0 && summaries >= plans`).

### Root Cause

Two different completion detection strategies in the same tool:
- `preflight.cjs:299` — `checkboxPattern` regex looking for `- [x]` in ROADMAP
- `state.cjs:695` — disk-based: `plans > 0 && summaries >= plans`

The ROADMAP checkbox is a presentation artifact, not source of truth. The disk artifacts are the ground truth.

### Steps to Reproduce

1. Complete a phase (all plans have summaries, VERIFICATION.md exists)
2. Mark it with `✓` in the title but without a `- [x]` checkbox
3. Run preflight on a phase that depends on it
4. Preflight incorrectly reports dependency as incomplete

### Fix Proposal

`preflight.cjs` should use the same disk-based check as `state.cjs`:
1. Find the phase directory in `.planning/phases/`
2. Count PLAN.md and SUMMARY.md files
3. Phase is complete if `plans > 0 && summaries >= plans`

Fallback to ROADMAP checkbox only if phase directory doesn't exist (phase not yet started).

### Affected File

`bin/lib/preflight.cjs` — function around line 286-313

### Workaround

Manually add `✓` to the phase title in ROADMAP.md, or ensure `- [x]` checkbox exists for completed phases.
