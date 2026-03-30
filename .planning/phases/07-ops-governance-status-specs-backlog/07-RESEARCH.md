# Phase 7: OPS Governance -- Status + Specs + Backlog - Research

**Researched:** 2026-03-30
**Domain:** CLI command handlers (CommonJS), per-area JSON/Markdown persistence, OPS governance
**Confidence:** HIGH

## Summary

Phase 7 adds three governance commands (`status`, `spec`, `backlog`) to the existing OPS system. All three follow established patterns from Phases 5-6: CommonJS `cmd*` functions in `ops.cjs`, dispatcher routing in `gsd-tools.cjs`, and skill command markdown files in `commands/gsd/`. No new dependencies, no new file formats beyond what is already used (JSON for structured data, markdown for human-readable content).

The implementation is straightforward because all building blocks already exist: `readRegistry()`, `readTreeJson()`, `appendHistory()`, `areaDir()`, `ensureAreaDir()`, `output()`, `error()`. Status aggregates data from existing files (tree.json, history.json, specs.md, backlog.json, registry.json). Spec formalizes the specs.md file already referenced by `cmdOpsDebug` at line 990. Backlog introduces a new `backlog.json` per area with simple CRUD operations.

**Primary recommendation:** Implement as three cmd* functions following the exact cmdOpsInvestigate/cmdOpsDebug pattern. Wave 1 = status + spec (read-heavy, independent). Wave 2 = backlog (write-heavy, references spec existence for status).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** cmdOpsStatus recebe area slug, le tree.json + specs.md + backlog.json + history.json e computa metricas agregadas
- **D-02:** Metricas: nodes_count, edges_count, specs_defined (bool), spec_rules_count, backlog_items_count, backlog_by_priority, last_operation (do history.json), days_since_last_op, tree_last_scanned (do registry.json)
- **D-03:** Output JSON para consumo programatico (agents), human-readable summary quando chamado diretamente -- mesmo padrao de cmdOpsList/cmdOpsGet
- **D-04:** Sem area = status de TODAS as areas (table summary). Com area = detalhe completo da area especifica
- **D-05:** Health scoring simples: green/yellow/red baseado em regras fixas (sem specs = yellow, >30 dias sem operacao = yellow, backlog >10 items = yellow, combinacao = red)
- **D-06:** Specs vivem em `.planning/ops/{area}/specs.md` -- markdown estruturado, nao YAML. Legivel por humanos E LLMs, editavel manualmente
- **D-07:** Formato: sections com headers (## Regras de Negocio, ## Contratos de API, ## Invariantes, ## Notas) -- categories emergem do conteudo, nao predefinidas
- **D-08:** cmdOpsSpec subcomandos: `show` (exibe specs), `edit` (abre/cria specs.md com template), `add <rule>` (append regra ao final da secao relevante)
- **D-09:** `/ops:investigate` e `/ops:feature` ja leem specs.md se existir (Phase 6 codigo em ops.cjs:990-994). Phase 7 formaliza o formato e adiciona o comando de gestao
- **D-10:** Specs sao advisory -- operacoes leem e consideram, nao bloqueiam execucao. Alinhado com impact guard advisory-only (Phase 2 D-01)
- **D-11:** Backlog vive em `.planning/ops/{area}/backlog.json` -- array de items com schema `{ id, title, description?, priority: "high"|"medium"|"low", created_at, promoted_to?, status: "pending"|"promoted"|"done" }`
- **D-12:** cmdOpsBacklog subcomandos: `list` (mostra items por prioridade), `add <title>` (append item, default priority medium), `prioritize <id> <priority>` (muda prioridade), `promote <id>` (marca como promoted, retorna contexto para /gsd:quick ou /gsd:plan-phase)
- **D-13:** `promote` nao executa -- apenas marca o item e emite contexto (area, tree summary, item description) para o usuario decidir como executar (/gsd:quick, /ops:feature, etc.)
- **D-14:** IDs numericos auto-incrementais simples (1, 2, 3...) -- nao UUIDs. Backlog e per-area, nao precisa de unicidade global
- **D-15:** `done <id>` marca item como concluido. Items concluidos permanecem no JSON para historico (nao deleta)
- **D-16:** Tres novos subcomandos no dispatcher ops do gsd-tools.cjs: `status`, `spec`, `backlog`
- **D-17:** Tres novas funcoes em ops.cjs: cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog -- seguindo padrao cmd* existente
- **D-18:** Tres novos skill commands: `commands/gsd/ops-status.md`, `commands/gsd/ops-spec.md`, `commands/gsd/ops-backlog.md`
- **D-19:** registry.json nao muda de schema -- status le dados existentes sem adicionar campos ao registry

### Claude's Discretion
- Template exato do specs.md quando criado pela primeira vez
- Formato exato do human-readable output do status (table vs lista)
- Logica de auto-detect da secao relevante no `spec add`
- Ordenacao do backlog list (por prioridade, por data, ou ambos)

### Deferred Ideas (OUT OF SCOPE)
- Dashboard visual de saude de todas as areas
- Spec validation automatica (assertions executaveis)
- Cross-area backlog view (todos os backlogs unificados)
- Backlog auto-promotion baseado em prioridade e tempo
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-10 | `/ops:status [area]` mostra saude -- cobertura de specs, backlog pendente, mudancas recentes | cmdOpsStatus reads tree.json, specs.md, backlog.json, history.json, registry.json. Health scoring green/yellow/red per D-05. All-areas summary table or single-area detail per D-04 |
| OPS-11 | `/ops:spec [area]` gerencia regras/contratos da area que operacoes validam | cmdOpsSpec with show/edit/add subcommands. Formalizes existing specs.md reference at ops.cjs:990-994. Advisory only per D-10 |
| OPS-12 | `/ops:backlog [area]` gerencia items pendentes -- adicionar, priorizar, promover | cmdOpsBacklog with list/add/prioritize/promote/done subcommands. backlog.json per area with auto-increment IDs per D-14 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:fs | built-in | Read/write JSON and markdown files | Same as all existing ops.cjs functions |
| node:path | built-in | Path resolution for per-area dirs | Same as all existing ops.cjs functions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:test | built-in | Test runner | Project convention (not vitest for CJS) |
| node:assert | built-in | Test assertions | Project convention |

**No new dependencies.** Everything uses existing Node.js built-ins and project helpers from `core.cjs` and `ops.cjs`.

## Architecture Patterns

### File Layout (what gets modified/created)
```
get-shit-done/bin/lib/ops.cjs          # Add 3 new cmd* functions + helpers
get-shit-done/bin/gsd-tools.cjs        # Extend ops dispatcher with 3 subcommands
commands/gsd/ops-status.md             # New skill command
commands/gsd/ops-spec.md               # New skill command
commands/gsd/ops-backlog.md            # New skill command
tests/ops-governance.test.cjs          # New test file
```

### Per-Area File Structure (already exists, extended)
```
.planning/ops/{area}/
  tree.json       # Existing (Phase 5) -- read by status
  history.json    # Existing (Phase 6) -- read by status
  specs.md        # NEW (Phase 7) -- created/managed by spec
  backlog.json    # NEW (Phase 7) -- created/managed by backlog
```

### Pattern 1: cmd* Function Signature
**What:** Every ops command follows `function cmdOpsXxx(cwd, area, ...otherArgs, raw)`
**When to use:** Always for new commands
**Example from cmdOpsDebug:**
```javascript
function cmdOpsDebug(cwd, area, symptom, raw) {
  if (!area) { error('Usage: gsd-tools ops debug <area> <symptom>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }
  // ... do work ...
  output(result, raw);
}
```

### Pattern 2: Dispatcher Routing in gsd-tools.cjs
**What:** `else if (subcommand === 'xxx')` blocks inside `case 'ops':`
**Example from existing code (line 914-940):**
```javascript
} else if (subcommand === 'status') {
  ops.cmdOpsStatus(cwd, args[2], raw);
} else if (subcommand === 'spec') {
  ops.cmdOpsSpec(cwd, args[2], args.slice(3), raw);
} else if (subcommand === 'backlog') {
  ops.cmdOpsBacklog(cwd, args[2], args.slice(3), raw);
}
```

### Pattern 3: Skill Command Markdown
**What:** `commands/gsd/ops-xxx.md` with Usage, What it does, Implementation, Output, Notes
**When to use:** Every new user-facing command
**Follow:** `ops-investigate.md` (complex) or `ops-add.md` (simple) as templates

### Pattern 4: JSON output + human-readable flag
**What:** `output(result, raw)` from `core.cjs` handles both modes per D-03
**When to use:** All command outputs

### Anti-Patterns to Avoid
- **Adding fields to registry.json:** D-19 explicitly forbids schema changes. Status reads existing data only.
- **Complex health algorithms:** D-05 specifies simple green/yellow/red with fixed rules. No ML, no weighted scores.
- **Spec blocking execution:** D-10 says advisory only. Never gate operations on spec compliance.
- **Deleting backlog items:** D-15 says done items remain in JSON for history. Only status changes, never deletion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path resolution | Manual path.join chains | `areaDir(cwd, slug)` | Already handles .planning/ops/{slug} |
| Area directory creation | fs.mkdirSync chains | `ensureAreaDir(cwd, slug)` | Handles recursive creation |
| History recording | Manual JSON append | `appendHistory(cwd, slug, entry)` | Handles file creation, append, timestamps |
| Tree data loading | Manual JSON parse | `readTreeJson(cwd, slug)` | Handles missing/corrupt files gracefully |
| Registry lookup | Manual file read | `readRegistry(cwd)` | Handles missing registry gracefully |
| Slug generation | Manual lowercasing | `slugify(text)` via `generateSlugInternal` | Consistent slug format |
| CLI output | console.log | `output(data, raw)` / `error(msg)` | Consistent JSON/human output format |

## Common Pitfalls

### Pitfall 1: Missing File Graceful Degradation
**What goes wrong:** Crash when tree.json, history.json, specs.md, or backlog.json don't exist
**Why it happens:** New areas or areas that haven't run certain operations yet
**How to avoid:** Check `fs.existsSync()` before every file read. Return sensible defaults (empty array, null, 0) for missing files. Follow the pattern in `readTreeJson()` which returns null on missing file.
**Warning signs:** Tests that only test the "happy path" with all files present

### Pitfall 2: Health Scoring Edge Cases
**What goes wrong:** Status shows misleading health for areas without tree or history
**Why it happens:** An area registered via `/ops:add` has no tree.json, history.json, or specs.md
**How to avoid:** Treat missing data as "unknown" rather than "unhealthy". An area with no operations is not red -- it just hasn't been used yet. Only apply yellow/red rules when data EXISTS but indicates a problem.
**Warning signs:** Brand new areas showing red health

### Pitfall 3: Backlog ID Auto-Increment After Deletion
**What goes wrong:** ID collisions if items are ever removed (they shouldn't be per D-15, but defensive coding matters)
**Why it happens:** Using `array.length + 1` instead of `max(existing_ids) + 1`
**How to avoid:** Compute next ID as `Math.max(0, ...items.map(i => i.id)) + 1`
**Warning signs:** Two items with the same ID

### Pitfall 4: Spec Add Section Detection
**What goes wrong:** `spec add <rule>` appends to wrong section or creates duplicate sections
**Why it happens:** Fuzzy section matching when specs.md has custom headers
**How to avoid:** Simple heuristic: if specs.md is empty/missing, create with default template and append to first section. If exists, append to the last section (or a designated "## Notas" catch-all). Don't try to be too clever with NLP classification.
**Warning signs:** Rules appearing in unexpected sections

### Pitfall 5: Backlog Subcommand Parsing
**What goes wrong:** `prioritize <id> <priority>` and `promote <id>` args parsed incorrectly
**Why it happens:** Variable-length args passed as array from dispatcher
**How to avoid:** cmdOpsBacklog receives `(cwd, area, args, raw)` where args is the remaining array. Parse args[0] as subcommand, args[1..] as subcommand-specific params.
**Warning signs:** "add" title containing spaces gets truncated

## Code Examples

### cmdOpsStatus Structure
```javascript
function cmdOpsStatus(cwd, area, raw) {
  const registry = readRegistry(cwd);

  if (!area) {
    // All-areas summary (D-04)
    const summary = registry.areas.map(a => computeAreaStatus(cwd, a));
    output({ areas: summary }, raw);
    return;
  }

  // Single area detail
  const slug = slugify(area);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const detail = computeAreaStatus(cwd, entry);
  output(detail, raw);
}

function computeAreaStatus(cwd, entry) {
  const slug = entry.slug;
  const tree = readTreeJson(cwd, slug);
  const specsPath = path.join(areaDir(cwd, slug), 'specs.md');
  const backlogPath = path.join(areaDir(cwd, slug), 'backlog.json');
  const historyPath = path.join(areaDir(cwd, slug), 'history.json');

  // Read specs
  const specsExist = fs.existsSync(specsPath);
  let specRulesCount = 0;
  if (specsExist) {
    const content = fs.readFileSync(specsPath, 'utf-8');
    // Count lines starting with "- " under headers as rules
    specRulesCount = (content.match(/^- .+/gm) || []).length;
  }

  // Read backlog
  let backlogItems = [];
  if (fs.existsSync(backlogPath)) {
    try { backlogItems = JSON.parse(fs.readFileSync(backlogPath, 'utf-8')); } catch {}
  }
  const pending = backlogItems.filter(i => i.status === 'pending');

  // Read history
  let history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch {}
  }
  const lastOp = history.length > 0 ? history[history.length - 1] : null;
  const daysSinceLastOp = lastOp
    ? Math.floor((Date.now() - new Date(lastOp.timestamp).getTime()) / 86400000)
    : null;

  // Health scoring (D-05)
  const flags = [];
  if (!specsExist) flags.push('no_specs');
  if (daysSinceLastOp !== null && daysSinceLastOp > 30) flags.push('stale');
  if (pending.length > 10) flags.push('backlog_overflow');

  const health = flags.length >= 2 ? 'red' : flags.length === 1 ? 'yellow' : 'green';

  return {
    slug, name: entry.name,
    nodes_count: tree ? tree.nodes.length : 0,
    edges_count: tree ? tree.edges.length : 0,
    specs_defined: specsExist,
    spec_rules_count: specRulesCount,
    backlog_items_count: pending.length,
    backlog_by_priority: {
      high: pending.filter(i => i.priority === 'high').length,
      medium: pending.filter(i => i.priority === 'medium').length,
      low: pending.filter(i => i.priority === 'low').length
    },
    last_operation: lastOp,
    days_since_last_op: daysSinceLastOp,
    tree_last_scanned: entry.last_scanned,
    health, health_flags: flags
  };
}
```

### Backlog JSON Schema
```json
[
  {
    "id": 1,
    "title": "Fix login timeout on slow connections",
    "description": "Users report 504 errors when login takes >3s",
    "priority": "high",
    "status": "pending",
    "created_at": "2026-03-30T10:00:00Z",
    "promoted_to": null
  },
  {
    "id": 2,
    "title": "Add pagination to user list",
    "priority": "medium",
    "status": "promoted",
    "created_at": "2026-03-30T11:00:00Z",
    "promoted_to": "/gsd:quick"
  }
]
```

### Specs.md Template (Claude's Discretion)
```markdown
# Specs: {Area Name}

## Regras de Negocio

- (add business rules here)

## Contratos de API

- (add API contracts here)

## Invariantes

- (add system invariants here)

## Notas

- (add general notes here)
```

### Dispatcher Extension Pattern
```javascript
// In gsd-tools.cjs, inside case 'ops':
} else if (subcommand === 'status') {
  ops.cmdOpsStatus(cwd, args[2], raw);
} else if (subcommand === 'spec') {
  ops.cmdOpsSpec(cwd, args[2], args.slice(3), raw);
} else if (subcommand === 'backlog') {
  ops.cmdOpsBacklog(cwd, args[2], args.slice(3), raw);
}
```

### module.exports Extension
```javascript
module.exports = {
  cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet,
  cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug, cmdOpsSummary,
  cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog,
  appendHistory, computeBlastRadius, refreshTree
};
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test + node:assert (project convention) |
| Config file | none -- uses node --test runner directly |
| Quick run command | `node --test tests/ops-governance.test.cjs` |
| Full suite command | `node --test tests/*.test.cjs` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-10 | status all-areas returns summary with health per area | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "status all"` | Wave 0 |
| OPS-10 | status single-area returns full metrics (D-02 fields) | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "status single"` | Wave 0 |
| OPS-10 | health scoring green/yellow/red per D-05 rules | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "health"` | Wave 0 |
| OPS-11 | spec show reads existing specs.md | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "spec show"` | Wave 0 |
| OPS-11 | spec edit creates template when no specs.md exists | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "spec edit"` | Wave 0 |
| OPS-11 | spec add appends rule to specs.md | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "spec add"` | Wave 0 |
| OPS-12 | backlog add creates item with auto-increment ID | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "backlog add"` | Wave 0 |
| OPS-12 | backlog list shows items sorted by priority | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "backlog list"` | Wave 0 |
| OPS-12 | backlog prioritize changes item priority | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "backlog prioritize"` | Wave 0 |
| OPS-12 | backlog promote marks item and emits context | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "backlog promote"` | Wave 0 |
| OPS-12 | backlog done marks item as done without deletion | unit | `node --test tests/ops-governance.test.cjs --test-name-pattern "backlog done"` | Wave 0 |
| ALL | dispatcher routes status/spec/backlog subcommands | integration | `node --test tests/ops-governance.test.cjs --test-name-pattern "dispatcher"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/ops-governance.test.cjs`
- **Per wave merge:** `node --test tests/*.test.cjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ops-governance.test.cjs` -- covers OPS-10, OPS-11, OPS-12
- [ ] Test helpers already exist in `tests/helpers.cjs` -- no gaps

## Discretion Recommendations

### Specs.md Template (D-07)
Use four default sections: `## Regras de Negocio`, `## Contratos de API`, `## Invariantes`, `## Notas`. These are starting suggestions -- users can add/rename sections freely since D-07 says "categories emergem do conteudo".

### Human-Readable Status Output
Use a compact table format for all-areas view (similar to cmdOpsList output). For single-area, use labeled key-value pairs. Both are already handled by `output(data, raw)` -- the human-readable format comes from JSON stringification in non-raw mode.

### Spec Add Section Detection
Simple heuristic: if only one `##` section exists, append there. If multiple sections exist, append to `## Notas` (catch-all). If `## Notas` doesn't exist, append to the last section. This avoids the complexity of trying to classify rules semantically.

### Backlog List Ordering
Primary sort by priority (high > medium > low), secondary by created_at (oldest first within same priority). This surfaces urgent + oldest items first.

## Sources

### Primary (HIGH confidence)
- `get-shit-done/bin/lib/ops.cjs` -- All existing patterns, helpers, module.exports (1178 lines)
- `get-shit-done/bin/gsd-tools.cjs` -- Dispatcher routing pattern (lines 914-940)
- `tests/ops.test.cjs` -- Test pattern with node:test, createTempProject, runGsdTools
- `tests/ops-workflows.test.cjs` -- Direct module require pattern for unit testing helpers
- `.planning/phases/07-ops-governance-status-specs-backlog/07-CONTEXT.md` -- All 19 decisions

### Secondary (MEDIUM confidence)
- `commands/gsd/ops-investigate.md` -- Complex skill command pattern
- `commands/gsd/ops-add.md` -- Simple skill command pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all Node.js built-ins already in use
- Architecture: HIGH -- follows exact patterns established in Phases 5-6, no novel architecture
- Pitfalls: HIGH -- derived from reading actual code and understanding edge cases in existing implementations

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- internal project patterns, no external dependencies)
