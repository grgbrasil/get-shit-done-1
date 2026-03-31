# External Integrations

**Analysis Date:** 2026-03-29

## APIs & External Services

**Web Search:**
- Brave Search API - Full-text web search for research phases
  - SDK/Client: Fetch API (built-in Node.js)
  - Endpoint: `https://api.search.brave.com/res/v1/web/search`
  - Auth: `BRAVE_API_KEY` environment variable
  - Implementation: `get-shit-done/bin/lib/commands.cjs` (websearch command)
  - Optional: Checks via `process.env.BRAVE_API_KEY` and fallback file path

- Exa Search API - Vector-based semantic search
  - Status: Detection only (planned integration)
  - Env: `EXA_API_KEY`
  - Used by: Researchers during brownfield analysis

- Firecrawl API - Web scraping and content extraction
  - Status: Detection only (planned integration)
  - Env: `FIRECRAWL_API_KEY`
  - Used by: Research agents for parsing web content

## AI Model Services

**Anthropic Claude Models:**
- Service: Anthropic API (via Claude Agent SDK)
- Models: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-3-5
  - Resolved per agent via model profile (quality/balanced/budget)
  - Configurable in `.planning/config.json` → `model_profile` field
  - Override per session via `SessionOptions.model`
- SDK: `@anthropic-ai/claude-agent-sdk ^0.2.84`
- Auth: Implicit via SDK (credentials managed by SDK user)
- Usage: Core execution loop via `query()` function
- Implementation: `sdk/src/session-runner.ts` → `query()` call with:
  - System prompt (preset: 'claude_code' + executor context)
  - Tool restrictions from agent definition or defaults
  - Budget limits (default: 5 USD per execution)
  - Turn limits (default: 50 turns)

## Data Storage

**Databases:**
- Not applicable - GSD is stateless across executions
- State managed entirely via filesystem (`.planning/` directory)

**File Storage:**
- Local filesystem only
  - `.planning/` directory structure
  - Project root configuration in `.planning/config.json`
  - Plans in `.planning/phases/*/` directories
  - State file: `.planning/STATE.md` (frontmatter-based)
  - No remote storage integration

**Caching:**
- None - Each execution is independent
- Message history streamed from Agent SDK (not persisted)

## Authentication & Identity

**Auth Provider:**
- None - GSD is a CLI tool, not a multi-user system
- Anthropic API credentials: Handled by SDK (user provides via environment)
- Search API keys: Environment variables or filesystem keyfiles

**API Key Management:**
- Environment variables (checked first):
  - `BRAVE_API_KEY` - Brave Search
  - `FIRECRAWL_API_KEY` - Firecrawl
  - `EXA_API_KEY` - Exa Search
- Fallback filesystem locations:
  - `~/.brave-search-api-key` for Brave API
  - `~/.firecrawl-api-key` for Firecrawl
  - `~/.exa-api-key` for Exa Search
- Detection: `get-shit-done/bin/lib/config.cjs` checks availability without loading secrets

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to console or structured events

**Logs:**
- Stream-based via `GSDEventStream` (`sdk/src/event-stream.ts`)
- Events emitted during plan execution:
  - `SessionInit` - Plan started
  - `SessionComplete` - Plan finished
  - `CostUpdate` - Running cost tracking
  - `TurnComplete` - Per-turn results
  - `Spawn` - Agent invocation
  - Various status events
- Transport handlers:
  - `CLITransport` - ANSI-colored console output
  - `WSTransport` - JSON broadcast over WebSocket
  - Custom handlers via `TransportHandler` interface
- No persistent log storage

## CI/CD & Deployment

**Hosting:**
- npm Registry - Primary distribution channel
  - Main package: `get-shit-done-cc`
  - SDK package: `@gsd-build/sdk`
  - Published via `prepublishOnly` hook that runs `npm run build:hooks`

**CI Pipeline:**
- GitHub Actions (configured via `.github/`)
  - Installation agent: `gsd-build/get-shit-done`
  - Agents installed to `.github/agents/` and `.github/skills/`
  - Runtime support: Claude, GitHub Copilot, OpenCode, Gemini, Codex
- Testing: `npm run test` and `npm run test:coverage` (c8 with 70% threshold)
- Build: TypeScript compilation and esbuild hook bundling

**Release Process:**
- Version bumped in `package.json` and `sdk/package.json`
- Changelog and README updates committed
- Git tagging for releases
- Auto-published to npm on version change

## Environment Configuration

**Required env vars:**
- None mandatory for basic operation
- Optional for enhanced functionality:
  - `BRAVE_API_KEY` - Enable web search in research phases
  - `FIRECRAWL_API_KEY` - Enable content scraping
  - `EXA_API_KEY` - Enable semantic search
  - Anthropic API credentials (managed by SDK)

**Secrets location:**
- Environment variables (preferred)
- Fallback: Keyfiles in home directory (`~/.brave-search-api-key`, etc.)
- Never stored in `.env` file (committed to git)
- `.gitignore` excludes environment files

**Configuration storage:**
- `.planning/config.json` - Project-level settings (git-safe)
  - Not a secret file - stores profiles, workflow toggles, git strategies
  - Defaults in `sdk/src/config.ts` as fallback

## Webhooks & Callbacks

**Incoming:**
- None - GSD is a CLI tool, not a server

**Outgoing:**
- Git commits - Triggered by phase completion or manual commands
  - `git commit` via `execSync` in `get-shit-done/bin/lib/commands.cjs`
  - Sign commits with GPG (unless `--no-verify` used)
  - Handles multiple remotes (main, sub-repos)
- Agent spawning - Indirect via Agent SDK (SDK manages subprocess lifecycle)

## Agent Integration

**Agent Definition Loading:**
- Optional agent definition file for tool/role extraction
- Location: Resolved by `resolveGsdToolsPath()` in `sdk/src/gsd-tools.ts`
- Fallback: Repo-local `get-shit-done/bin/gsd-tools.cjs` or global installation
- Tool restrictions: Parsed from agent definition or uses `DEFAULT_ALLOWED_TOOLS`

**Tool Scoping:**
- Per-phase tools defined in `sdk/src/tool-scoping.ts`
- Maps phase type → allowed tools
- Can be overridden per execution via `SessionOptions.allowedTools`
- Default tools include: file reading, filesystem operations, git commands

---

*Integration audit: 2026-03-29*
