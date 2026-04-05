# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## BUG-001-preflight-disk-check --- preflight dependency check uses ROADMAP checkbox instead of disk artifacts
- **Date:** 2026-04-05
- **Error patterns:** false blockers, preflight reports dependency incomplete, ROADMAP checkbox, phase completion, dependency check
- **Root cause:** checkDependencies() uses ROADMAP checkbox regex (`- [x]`) to determine phase completion instead of disk artifacts (plan/summary file counts). ROADMAP checkboxes are presentation artifacts, not source of truth.
- **Fix:** Replace checkbox regex with disk-based check using findPhaseInternal + getPhaseFileStats. Fallback to ROADMAP checkbox only if phase directory doesn't exist.
- **Files changed:** get-shit-done/bin/lib/preflight.cjs
---

