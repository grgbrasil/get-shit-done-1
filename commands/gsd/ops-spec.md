# /ops:spec

Manage specs (rules, contracts, invariants) for an OPS area.

## Usage

`/ops:spec <area> show` -- Display current specs
`/ops:spec <area> edit` -- Create specs.md with template (if missing) or open existing
`/ops:spec <area> add <rule>` -- Append a rule to the specs

## What it does

Manages `.planning/ops/{area}/specs.md` -- a structured markdown file with sections for business rules, API contracts, invariants, and notes. These specs are advisory: `/ops:investigate` and `/ops:feature` read and consider them, but they do not block execution.

## Implementation

### Show specs
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops spec <area> show --raw
```
Returns `{ found: true, area, content }` or `{ found: false, message }` when missing.

### Create or open specs
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops spec <area> edit
```
Creates `.planning/ops/{area}/specs.md` with 4-section template if it does not exist. Returns path to file.

### Add a rule
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops spec <area> add "Rule text here"
```
Appends `- Rule text here` to the end of specs.md.

## Specs.md Format

```markdown
# Specs: {Area Name}

## Regras de Negocio

- (business rules)

## Contratos de API

- (API contracts)

## Invariantes

- (system invariants)

## Notas

- (general notes)
```

Sections are starting suggestions -- users can add or rename sections freely. Specs are read by `/ops:investigate` and `/ops:feature` for context.

## Notes

- Specs are advisory only -- they inform operations but do not gate or block them
- The file is plain markdown -- can be edited manually at any time
- Run `/ops:status <area>` to see if specs are defined (clears `no_specs` health flag)
