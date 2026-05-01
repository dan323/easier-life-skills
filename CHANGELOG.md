# Changelog

## [1.2.0] - 2026-05-01

### Added
- **Plugin detail panel** — clicking a plugin in the website opens a slide-in drawer showing its description (or a copyable prompt if none), skills, agents, MCP servers, and bundle membership
- **Plugins view** — new default tab in the website; plugins, skills, agents, MCP servers, and bundles each have their own grid view
- **Agent support** — build pipeline and website now index and display agents; `copilot-review-fixer` is the first registered agent (bundled with `task-agent`)
- **MCP server support** — build pipeline and website now index and display MCP servers
- `.claude-plugin/bundles.json` — bundle definitions extracted from build script into a standalone config file
- `scripts/lib/catalog.js` — generates Agents and MCP Servers sections in `CATALOG.md`

### Changed
- **`marketplace.json` is now generated from `plugins/*/` scan** — `build-index.js` reads each `plugins/<name>/.claude-plugin/plugin.json`, derives `name`, `description`, `category`, `source`, and `homepage`, and writes `.claude-plugin/marketplace.json`; the old hand-maintained `marketplace.source.json` is retired
- **CI commits `marketplace.json` back** — `pages.yml` upgraded to `contents: write`; after `npm run build` the pipeline commits `.claude-plugin/marketplace.json` to the branch if it changed (with `[skip ci]` to prevent loops)
- **`plugin.json` now declares `category`** — each of the 8 local plugins has a `category` field; categories no longer live in a separate registry file
- **`fetch-marketplace.js` rewritten** — skills and agents are now auto-discovered from their default directories (`skills/`, `agents/`) when not explicitly declared; a string declaration is treated as a parent directory to scan (via GitHub Contents API for remote repos); MCP servers now accept an object keyed by server name, a string path to a JSON file, or a `.mcp.json` at the plugin root
- **`skills_index.json`** now includes `plugins`, `agents`, `mcpServers`, and updated `meta` counts alongside `skills`
- `marketplaces.json` now accepts an optional `description` per marketplace entry, used in the generated `marketplace.json`
- External plugin categories flow from the upstream `marketplace.json` directly; `external-overrides.json` supplements where the upstream does not declare one
- `pages.yml` — removed AI categorisation; no longer needs `models: read` permission or `MODELS_TOKEN`

### Removed
- `marketplace.source.json` — replaced by per-plugin `category` in `plugin.json` and build-time generation
- AI-based categorisation via GitHub Models API (`categorize.js` deleted, `MODELS_TOKEN` removed from CI)
- "Add marketplace" runtime feature from the website — was non-functional; marketplace list is now build-time only
- `$schema` field removed from generated `marketplace.json` (URL was a 404 with no replacement)

## [1.1.0] - 2026-04-19

### Added
- `find-skills` plugin — analyzes the active repository and recommends relevant Claude Code skills from known marketplaces
- `plugins/task-agent/references/isabelle.md` — General Isabelle language reference: build commands, Isar proof language, tactics, locales, sessions, and HOL vs ZF comparison
- `plugins/task-agent/references/IsarMathLib.md` — IsarMathLib style guide (declarative Isar, comment conventions, file structure, naming rules)
- `brainstorm` trigger added to `docs/getting-started.md` trigger table

### Changed
- Repo restructured as a Claude Code plugin marketplace. Each skill is now a plugin under `plugins/<name>/` with a `.claude-plugin/plugin.json` manifest and `skills/<name>/SKILL.md`.
- Added `.claude-plugin/marketplace.json` — marketplace catalog; install all plugins with `/plugin marketplace add dan323/easier-life-skills`.
- Removed `scripts/` — installation is now handled entirely by the Claude Code plugin system.

## [1.0.0] - 2026-02-01

### Added
- `task-agent` skill — reads `agent-tasks.yml`, picks the next pending task, clones the target repo, spawns a Claude agent to implement the change, opens a PR, and persists state to `agent-tasks-state.yml`
- `agent-tasks.yml` — sample config demonstrating the task-agent format
- `plugins/task-agent/run.sh` — entry point for non-interactive invocation

## [0.1.0] - 2026-01-01

### Added
- `changelog` skill
- `document-project` skill
- `find-dead-code` skill
- `find-breaking-rest-api` skill
- `improve-logging` skill
- `brainstorm` skill
