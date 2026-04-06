# GSD Dashboard — Design Spec

## Overview

Local web dashboard for GSD that provides a graphical interface to navigate projects, view plan status, edit markdown files, and visualize parallel vs sequential work. Integrated into the SDK as `gsd-sdk dashboard`.

**Target:** MVP with opinionated defaults. Architecture supports configurability in v2 but does not implement it.

**Port:** 4747 (default)

---

## Architecture

```
Browser (SPA)                         Express Server (SDK)
Vue 3 + Vite + Milkdown              ┌─────────────────────────┐
                                      │  REST API               │
HTTP ─────────────────────────────►   │  /api/projects          │
                                      │  /api/projects/:id/*    │
                                      │                         │
WS (dashboard events) ◄──────────    │  chokidar file watcher  │
WS (SDK bridge, optional) ◄──────   │  SDK WS bridge          │
                                      │  Process manager        │
                                      └─────────┬───────────────┘
                                                │
                                      .planning/ files
                                      gsd-tools.cjs (parsing)
```

### Key Decisions

- Server reuses existing GSD libs (`roadmap.cjs`, `phase.cjs`, `state.cjs`, `frontmatter.cjs`) for parsing — zero logic duplication
- Two separate WebSocket channels: dashboard (file changes) and SDK bridge (session events)
- Server is stateless — all truth comes from `.planning/` files on disk
- Command: `gsd-sdk dashboard --port 4747`

---

## Multi-Project Support

### Project Registry

File: `~/.gsd/dashboard.json`

```json
{
  "projects": [
    { "id": "gsd", "name": "Get Shit Done", "path": "/path/to/get-shit-done" },
    { "id": "sijur", "name": "SIJUR", "path": "/path/to/sijur" }
  ]
}
```

- Projects added/removed via UI
- Server validates that path contains `.planning/` before registering
- ID auto-generated from directory name (slugified)

---

## Layout and Navigation

```
+----------+-------------------------------------------+
|          |  Breadcrumb: Project > Phase 3 > Plan 03-02|
| Projects |-------------------------------------------+
|          |                                           |
| > SIJUR  |         Main Content Area                 |
| v GSD    |                                           |
|   State  |  Changes based on selection:              |
|   Roadmap|   - Project overview (metrics)            |
|   Phases |   - Roadmap overview                      |
|   Config |   - Kanban by wave                        |
|          |   - Markdown editor                       |
| > Outro  |   - State dashboard                       |
|          |                                           |
|----------|                                           |
| Session  |                                           |
| * Active |                                           |
+----------+-------------------------------------------+
```

### Sidebar — Progressive Disclosure

- Level 1: Project list (each registered `.planning/`)
- Level 2: Expand project -> State, Roadmap, Phases, Config
- Level 3: Expand Phases -> list of phases with status
- Level 4: Expand phase -> individual plans
- Footer: Session indicator (active/inactive + start button)

### Main Content — Changes with Selection

- **Project selected** -> overview (progress bars, metrics from STATE.md)
- **Roadmap** -> phase overview with status and dependencies
- **Phase selected** -> Kanban by wave
- **Plan selected** -> Markdown editor (Milkdown) with Save button
- **Config** -> config.json viewer/editor

### Breadcrumb Navigation

Top bar for context and back-navigation.

---

## Kanban Board (Phase View)

### Structure

Columns = waves. Cards = plans.

```
Wave 1                    Wave 2                    Wave 3
+------------------+     +------------------+     +------------------+
| 03-01            |     | 03-04            |     | 03-06            |
| Setup DB schema  |     | API endpoints    |     | Integration tests|
| Completed        |     | In progress      |     | Blocked          |
+------------------+     +------------------+     +------------------+
| 03-02            |     | 03-05            |
| Model layer      |     | Auth middleware   |
| Completed        |     | Ready            |
+------------------+     +------------------+
| 03-03            |
| Seed data        |
| Completed        |
+------------------+
```

### Status Badges

| Badge | Condition |
|-------|-----------|
| Completed | SUMMARY.md exists for this plan |
| In progress | Active session executing this plan |
| Ready (green) | No file conflicts with running plans, wave dependencies met |
| Blocked | Previous wave incomplete, or file conflict with plan in execution |
| Not started | Wave available but not initiated |

### File Conflict Detection

- Plans within the same wave that share `files_modified` get a colored cluster dot
- Hover on dot -> tooltip listing shared files
- If a conflicting plan is in execution, others with overlap show as Blocked

### Card Interaction

- Click card -> navigate to plan (markdown editor)
- If Ready: show option "Start in terminal" with copiable command or direct spawn

### Phase Header

- Name, goal, progress bar (X/Y plans complete)
- Phase dependency indicator (if previous phase incomplete, entire phase blocked)

---

## Markdown Editor

### Milkdown Integration

- WYSIWYG by default (headings, bold, lists, code blocks rendered visually)
- Toggle to raw markdown (source mode)
- Minimal toolbar: H1-H3, bold, italic, code, list, link
- Explicit **Save** button (no auto-save)
- "Unsaved changes" indicator when content diverges from disk
- File changed on disk (detected via watcher) -> banner: "File changed on disk. Reload?"

### Frontmatter Awareness

- Plan frontmatter YAML displayed as structured form at the top (typed fields: wave, depends_on, files_modified, requirements)
- Markdown body below in Milkdown editor
- Save serializes frontmatter + body back to file

### Edit Scope

- Any `.md` inside `.planning/` -> editable
- `config.json` -> dedicated JSON editor (not Milkdown)
- Files outside `.planning/` -> read-only

---

## Sessions and Process Management

### Session Indicator (Sidebar Footer)

- Green dot + "Active" when `gsd-sdk auto` session running
- Gray dot + "Start" button when inactive
- Start -> spawns `gsd-sdk auto --project-dir <path> --ws-port <port>` as detached child process
- Stop -> SIGTERM on process

### Port Allocation

- Dashboard: 4747 (default)
- SDK WebSocket: 4748 (dashboard port + 1, automatic)
- If port occupied (session running outside dashboard), attempt connection before spawning

### Live Updates (Session Active)

- Kanban cards update status in real-time (via SDK event bridge)
- Collapsible log panel at bottom (last N events)
- Currently executing plan pulses visually on kanban

### Without Active Session

- Dashboard works 100% — read files, edit, navigate
- Kanban shows status based on SUMMARY.md (completed) and STATE.md (current position)
- Start button available but never mandatory

---

## REST API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List registered projects |
| POST | `/api/projects` | Register project (path) |
| DELETE | `/api/projects/:id` | Remove registration |
| GET | `/api/projects/:id/overview` | STATE.md + ROADMAP.md parsed (metrics, progress) |
| GET | `/api/projects/:id/roadmap` | Parsed roadmap (phases, deps, status) |
| GET | `/api/projects/:id/phases` | List phases with plans, waves, status |
| GET | `/api/projects/:id/phases/:phaseId` | Detailed phase (plans + file conflicts) |
| GET | `/api/projects/:id/plans/:planId` | Full plan (frontmatter + body) |
| PUT | `/api/projects/:id/files/*` | Save markdown file (editor) |
| GET | `/api/projects/:id/files/*` | Read raw file |
| GET | `/api/projects/:id/config` | config.json |
| POST | `/api/projects/:id/session/start` | Spawn `gsd-sdk auto` |
| DELETE | `/api/projects/:id/session/stop` | Kill active session |
| GET | `/api/projects/:id/session/status` | Session status |

### File Write Security

- Only accepts writes inside `.planning/` of registered project
- Path traversal blocked (rejects `../`)
- Validates resolved path is within project boundary

---

## WebSocket Events

```typescript
type DashboardEvent =
  | { type: 'file:changed'; project: string; path: string }
  | { type: 'file:created'; project: string; path: string }
  | { type: 'file:deleted'; project: string; path: string }
  | { type: 'session:started'; project: string; pid: number }
  | { type: 'session:stopped'; project: string }
  | { type: 'sdk:event'; project: string; event: GSDEvent }
```

---

## Directory Structure

```
sdk/
  src/
    cli.ts                    # adds 'dashboard' command
    ws-transport.ts           # existing, reused
  dashboard/
    server/
      index.ts                # Express + WS + chokidar
      routes/
        projects.ts
        roadmap.ts
        phases.ts
        files.ts
        session.ts
      watcher.ts              # chokidar file watcher
      ws.ts                   # Dashboard WebSocket
      sdk-bridge.ts           # Bridge to SDK WebSocket
    ui/
      index.html
      vite.config.ts
      src/
        App.vue
        main.ts
        router.ts
        stores/               # Pinia
          projects.ts
          phases.ts
          session.ts
        components/
          Sidebar.vue
          Breadcrumb.vue
          KanbanBoard.vue
          KanbanCard.vue
          MarkdownEditor.vue
          FrontmatterForm.vue
          ProjectOverview.vue
          SessionIndicator.vue
          ConfigEditor.vue
        composables/
          useWebSocket.ts
          useFileConflicts.ts
      package.json            # frontend deps
```

## Build and Dev

- **Dev mode:** `gsd-sdk dashboard --dev` — Vite dev server with proxy to Express
- **Prod mode:** `gsd-sdk dashboard` — Express serves static build from `ui/dist/`
- Frontend build integrated into existing SDK pipeline

## Dependencies

### Server (added to SDK)
- `express`
- `chokidar`
- `cors`

### Frontend (ui/package.json)
- `vue` + `vue-router` + `pinia`
- `@milkdown/*` (editor)
- `vite`

---

## Out of Scope (v2)

- Configurable themes/layouts
- Multi-user / remote access
- Authentication
- Custom kanban column definitions
- Plugin system for custom views
- Drag-and-drop plan reordering
- Diff viewer for file changes
