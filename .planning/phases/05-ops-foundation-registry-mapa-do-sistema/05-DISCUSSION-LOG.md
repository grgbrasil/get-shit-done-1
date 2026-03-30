# Phase 5: OPS Foundation — Registry + Mapa do Sistema - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 05-ops-foundation-registry-mapa-do-sistema
**Areas discussed:** Registry Schema, Auto-detection Strategy, Dependency Tree Format, CLI Interface Design
**Mode:** Advisor-assisted (4 parallel gsd-advisor-researcher agents)

---

## Registry Schema & Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Flat JSON single file | Follows fmap.cjs pattern, O(1) lookup | |
| One JSON per area | Self-contained, no merge conflicts | |
| Hybrid: registry.json index + per-area dirs | O(1) listing + per-area richness, OPS-04 natural | ✓ |

**User's choice:** Hybrid (advisor recommendation accepted)
**Notes:** Slim index fields: slug, name, source, created_at, last_scanned, components_count

## Auto-detection Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Route-file-driven | Parse router files, trace dependencies | |
| Directory conventions | Language-agnostic folder scanning | |
| Hybrid: routes first + directory fallback | Best coverage, mirrors Serena+grep pattern | ✓ |
| Serena-only clustering | Semantic analysis via LSP | |

**User's choice:** Hybrid route+directory (advisor recommendation accepted)
**Notes:** Tag detected_by per area for transparent dedup

## Dependency Tree Format (tree.json)

| Option | Description | Selected |
|--------|-------------|----------|
| Flat adjacency (nodes[] + edges[]) | O(1) lookup, bidirectional traversal, cross-area natural | ✓ |
| Nested tree (children[]) | Human-readable but duplicates cross-area refs | |
| Flat with parentId | Simplest but single-parent only | |

**User's choice:** Flat adjacency list (advisor recommendation accepted)
**Notes:** Aligns with function-map.json flat pattern, supports Phase 6 bidirectional traversal needs

## CLI Interface Design

| Option | Description | Selected |
|--------|-------------|----------|
| gsd-tools domain only | Programmatic but no human-friendly skills | |
| Skill commands only | Simple but agents can't compose | |
| Hybrid: ops.cjs + gsd-tools + skills | Full parity with fmap pattern, extensible | ✓ |

**User's choice:** Hybrid (advisor recommendation accepted)
**Notes:** ops.cjs follows fmap.cjs conventions, extensible for P6-7 subcommands

## Claude's Discretion

- Dedup strategy between route-detected and directory-detected areas
- Confidence scoring heuristics
- Per-node-type metadata schema
- Human-readable table format
- Per-area directory initialization strategy (eager vs lazy)

## Deferred Ideas

- /ops:investigate, /ops:feature, /ops:modify, /ops:debug — Phase 6
- /ops:status, /ops:spec, /ops:backlog — Phase 7
- Serena-based semantic clustering — rejected (anti-AST decision)
- Visual tree rendering in terminal — potential backlog
