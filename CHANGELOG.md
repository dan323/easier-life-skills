# Changelog

## [Unreleased]

### Added
- **`cost-tracker` hook plugin** — `Stop`/`SubagentStop` hook that appends a JSON line to `~/.claude/cost-log.jsonl` with `date`, `session_id`, `input_tokens`, `output_tokens`, and `estimated_usd` (Sonnet pricing by default); aggregatable with `jq` one-liners; requires Python 3
- **Sort controls** — A→Z / Z→A toggle button in the controls bar; applies to all views (plugins, skills, agents, MCP servers, commands, hooks); sort direction is persisted in the URL hash
- **Keyboard shortcut** — press `/` anywhere on the page to focus the search box and select all text
- **"Add your marketplace →" CTA** — link in the marketplace bar opens a GitHub issue template (`.github/ISSUE_TEMPLATE/add-marketplace.yml`) that collects `owner/repo`, description, and a requirements checklist

### Fixed
- **`task-agent` plugin manifest** — removed the `agents` field from `plugin.json`; Claude Code's current manifest validator rejected the `["./agents/…"]` string-array format with "agents: Invalid input", preventing the plugin from loading
- **Local-first marketplace resolution** — `fetch-marketplace.ts` now reads `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` via `readFile` (local-filesystem-first) instead of always fetching remotely; local builds now pick up newly added plugins immediately without needing to push first

## [1.5.0] - 2026-05-03

### Added
- **Commands and Hooks support** — build pipeline, web UI, and type definitions now index and display Command and Hook entities alongside plugins, skills, agents, and MCP servers; each has its own grid view and card component
- **URL state sharing** — active view, search query, category filters, and repo filters are now synced to the URL hash (`#view=skills&q=…&cat=…&repo=…`); links to specific filtered states are now shareable and survive page reload (`url-state.ts`)
- **`card-hook.ts`** — dedicated card component for hooks, showing event trigger chips alongside install command

### Changed
- **Web UI component split** — monolithic `components.ts` (250 lines) replaced by individual `card-plugin.ts`, `card-skill.ts`, `card-agent.ts`, `card-mcp.ts`, `card-command.ts`, `card-bundle.ts`, `source-tag.ts`, `filters.ts`, and `utils.ts`; each entity type is now independently editable
- **Skill-specific model URLs** — each skill's `rawSkillUrl` now links directly to its source file in the upstream repo with the correct branch ref

### Fixed
- **Skill path resolution at plugin root** — when a skill is declared as `"./"` in `plugin.json`, `parseSkill` now falls back to the plugin name instead of producing an empty string, and uses `filter(Boolean)` to avoid double-slash paths (deeea00)

## [1.4.0] - 2026-05-02

### Fixed
- **`main`/`master` branch mismatch** — the GitHub Trees API requires the exact branch ref; repos that use `main` as their default branch (e.g. `anthropics/knowledge-work-plugins`) previously returned 404 for all tree lookups because the build always tried `master` first. Raw content fetches (`raw.githubusercontent.com`) silently redirect `master`→`main` so file reads worked, but tree-based skill discovery failed entirely. Fix: if the Trees API returns 404, retry with the alternate canonical name (`master`↔`main`). Skills for `knowledge-work-plugins` jumped from ~146 to ~300 after this fix.
- **External plugin skill discovery** — `fetch-marketplace.ts` no longer uses the local repo's filesystem when resolving skills for external plugins (repos referenced via `source: url` or `source: git-subdir`); previously, paths like `skills/` would match the local directory instead of fetching from the remote repo
- **SHA-pinned sources** — plugins with `sha`-pinned upstream refs (no `ref` branch) now correctly resolve to the pinned SHA instead of defaulting to `main`; affects `fastly-agent-toolkit`, `brightdata-plugin`, `searchfit-seo`, `ai-firstify`, `product-tracking-skills`, `box`, and similar externally-hosted plugins
- **Per-repo root isolation** — `build-index.ts` now passes `null` as the local root for all non-local marketplaces, ensuring no cross-contamination between the local repo's file tree and remote repo content

### Added
- **Tree API response cache** — successful GitHub tree fetches are written to `.cache/trees/` (gitignored); subsequent builds reuse the disk cache, so only the first build with `GITHUB_TOKEN` needs to hit the API for each repo
- **CI tree cache** — `pages.yml` uses `actions/cache@v4` to persist `.cache/trees/` between CI runs, keyed on `marketplaces.json` content

## [1.3.0] - 2026-05-02

### Added
- **TypeScript migration** — build scripts (`scripts/build-index.ts`, `scripts/lib/*.ts`) and web assets (`assets/src/*.ts`) are now written in TypeScript; `tsconfig.json` covers scripts, `tsconfig.web.json` covers the browser app
- **esbuild bundling** — web assets are compiled from `assets/src/app.ts` into a single `assets/bundle.js`; `npm run build` now runs both the index generator and the bundler
- **`npm run typecheck`** — checks both the scripts and the web app
- **External category overrides** — `.claude-plugin/external-overrides.json` now categorises all uncategorised plugins and skills from `anthropics/knowledge-work-plugins` and `anthropics/skills`

### Changed
- **Read-only detection** — skills are now tagged `readOnly` based on their declared `tools` frontmatter: no `Write`, `Edit`, or `NotebookEdit` in the tool list = read-only; the old text-string heuristic (`"This skill is read-only"`) is removed
- **Remote directory listing** — `fetch-marketplace.ts` now fetches one recursive git tree per repo (GitHub Trees API) instead of one Contents API call per directory listing; significantly fewer API calls and more rate-limit friendly
- **CI** — `GITHUB_TOKEN` is now passed to the `npm run build` step so the tree fetch uses the higher authenticated rate limit
- `assets/bundle.js` is gitignored; it is generated by CI and included in the GitHub Pages deployment artifact

### Removed
- Old JS source files in `scripts/lib/` (`catalog.js`, `fetch-marketplace.js`, `frontmatter.js`) and `scripts/build-index.js` — replaced by TypeScript equivalents
- Old JS web asset modules (`assets/app.js`, `assets/api.js`, `assets/state.js`, `assets/components.js`, `assets/marketplace.js`, `assets/render.js`, `assets/panel.js`) — replaced by `assets/src/*.ts`

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

[Unreleased]: https://github.com/dan323/skill-easy-life/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/dan323/skill-easy-life/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/dan323/skill-easy-life/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/dan323/skill-easy-life/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/dan323/skill-easy-life/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dan323/skill-easy-life/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dan323/skill-easy-life/compare/v0.1.0...v1.0.0
