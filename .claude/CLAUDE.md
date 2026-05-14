# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

A Claude Code plugin marketplace containing reusable skill plugins for Claude Code and GitHub Copilot. Each plugin wraps a Markdown skill (`SKILL.md`) that instructs an AI agent how to perform a specialized multi-phase workflow (e.g., generating changelogs, finding dead code, writing documentation).

## Installation

### Claude Code (recommended)

```
/plugin marketplace add dan323/easier-life-skills
```

Then install individual plugins:

```
/plugin install easier-life-skills/changelog
/plugin install easier-life-skills/brainstorm
```

### NPM (non-interactive)

```
npx @dan323/easier-life-skills
```

The installer lives in `installer/` and requires Node.js ≥ 18. Every install goes through `claude plugin marketplace add` + `claude plugin install`, so plugins land in `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` and are tracked in `installed_plugins.json`. The path differs only in which marketplace gets added:

- **Marketplace sources** (have `.claude-plugin/marketplace.json`) → `claude plugin marketplace add <owner>/<repo>` (cached per session) + `claude plugin install <pluginName>@<repo>` (deduped).
- **Plugin-only sources** (no marketplace.json — currently just `mattpocock/skills`) → write a per-plugin synthetic shim at `~/.config/easier-life-skills/shims/<pluginName>/.claude-plugin/marketplace.json` whose plugin entry uses `source: { source: "url", url: "https://github.com/<owner>/<repo>" }`, then `claude plugin marketplace add <shim-path>` + `claude plugin install <pluginName>@<pluginName>`. Claude Code resolves the URL source on install — no `git` required, no `~/.claude/skills/` clone path, and `claude plugin list`/`update`/`uninstall` see the install just like any other.

The split is driven by `skills_index.json`'s `meta.sources[<owner/repo>].isMarketplace` flag, populated by `scripts/lib/fetch-marketplace.ts` based on which manifest it found.

## Repository Structure

```
.claude/
  CLAUDE.md                 ← This file
.claude-plugin/
  marketplace.json          ← Generated from plugins/ scan — committed; do not edit by hand
  external-overrides.json   ← Category overrides for external plugins/skills
.github/
  workflows/
    pages.yml               ← GitHub Pages deployment workflow
assets/
  src/                      ← TypeScript / Preact source for the web UI
    app.tsx                 ← Entry point — renders <App> into #root (esbuild)
    analytics.ts            ← Optional GA4 wiring (initAnalytics + track); gated on the GA_ID build-time define
    api.ts                  ← Fetches skills_index.json
    constants.ts            ← BUILTIN_REPO and other constants
    marketplace.ts          ← Pure data loader (returns parsed index + source counts)
    url-state.ts            ← read/write filter+view+sort state to the URL hash
    utils.ts, types.ts
    components/             ← Preact component tree
      App.tsx               ← Top-level state owner (useState / useLayoutEffect)
      Header.tsx, QuickStart.tsx, Footer.tsx
      Controls.tsx, Filters.tsx, MarketplaceBar.tsx, Grid.tsx
      PluginPanel.tsx, EntityPanel.tsx
      ConsentBanner.tsx     ← GA4 consent banner (Consent Mode v2, default-denied)
      CopyButton.tsx, Expandable.tsx
      cards/                ← PluginCard, SkillCard, AgentCard, McpCard, CommandCard, HookCard, BundleCard
  bundle.js                 ← Compiled output — gitignored, built by npm run build
  style.css                 ← Marketplace web UI styling
tests/                      ← Vitest + happy-dom regression suite for the web UI
  harness.ts                ← Boots app.tsx against a fixture
  fixtures/skills_index.json
  *.test.ts                 ← initial-render, search, sort, view-toggle, filters, panels, url-state, copy-buttons
vitest.config.ts            ← @preact/preset-vite + happy-dom env
docs/
  architecture.md           ← System design documentation
  contributing.md           ← Guide for adding new plugins
  getting-started.md
installer/
  bin/install.js            ← NPM installer script
  package.json              ← @dan323/easier-life-skills NPM package
  README.md
plugins/
  <skill-name>/
    .claude-plugin/
      plugin.json           ← Plugin manifest (name, version, description, keywords)
    skills/
      <skill-name>/
        SKILL.md            ← The skill itself
        evals/
          evals.json        ← Test cases (most plugins place evals here)
    agents/                 ← Optional: sub-agents spawned by the skill
      <agent-name>.md       ← Sub-agent definition (YAML frontmatter + system prompt)
    references/             ← Optional: reference docs the skill agent reads at runtime
      <topic>.md            ← Concise, non-obvious facts for the agent (not LLM basics)
    examples/               ← Optional: sample input/output files
    evals/
      evals.json            ← Alternative evals location (document-project uses this)
    run.sh                  ← Optional: non-interactive entry point (task-agent only)
scripts/
  build-index.ts            ← Generates skills_index.json, CATALOG.md, catalog.html, and marketplace.json
  lib/
    fetch-marketplace.ts    ← Fetches/discovers skills, agents, MCP servers from one repo
    catalog.ts              ← Generates CATALOG.md (markdown) and catalog.html (styled standalone page)
    frontmatter.ts          ← YAML frontmatter parser
    types.ts                ← Shared TypeScript types
tsconfig.json               ← TypeScript config for scripts/ (NodeNext)
tsconfig.web.json           ← TypeScript config for assets/src/ (bundler + DOM, JSX react-jsx / preact)
assets/tsconfig.json        ← IDE-facing config that extends ../tsconfig.web.json — exists so IntelliJ
                              walking up from assets/src/**.tsx finds JSX settings without inspecting
                              the non-default tsconfig.web.json name; not used by the CLI typecheck
CATALOG.md                  ← Human-readable catalog with suggested bundles (gitignored; build output)
catalog.html                ← Standalone styled catalog page deployed to GitHub Pages (gitignored; build output)
CHANGELOG.md                ← Version history (Keep a Changelog format)
README.md                   ← Project overview and quick-start
index.html                  ← Static web UI for browsing the marketplace
skills_index.json           ← Generated index; rebuild with: npm run build
```

> **Evals location note:** Most plugins place `evals.json` at
> `skills/<name>/evals/evals.json`. `document-project` is the exception and
> places it at the plugin root `evals/evals.json`. Follow the pattern of the
> plugin you are modifying.

## Plugin Manifest Format (`plugin.json`)

```json
{
  "name": "plugin-name",
  "version": "X.Y.Z",
  "description": "What the plugin does",
  "author": { "name": "dan323" },
  "category": "productivity",
  "skills": ["./skills/plugin-name"],
  "agents": ["./agents/agent-name"]
}
```

`category` is a free-form string — the build accepts any value and the web UI builds its filter bar dynamically from whatever appears in the data. The vocabulary currently in use across local plugins and `.claude-plugin/external-overrides.json` is:

| Category       | Scope |
|----------------|-------|
| `productivity` | Thinking aids, brainstorming, prompt engineering, discovery, workflow helpers |
| `documentation`| Narrative docs, changelogs, format-specific docs (docx/pdf/xlsx) |
| `code-quality` | Static analysis, refactoring, review, dead-code / breaking-change detection, logging, architecture |
| `testing`      | TDD, test generation, QA, test automation, webapp testing |
| `security`     | Security audits and scanning |
| `performance`  | Performance optimisation and auditing |
| `automation`   | Task orchestration, triage, issue creation, repeat-task automation (not deployment) |
| `devops`       | CI/CD, containers, deployment, infrastructure |
| `development`  | Building apps / skills / APIs / databases / MCP servers |
| `design`       | Visual art, theming, canvas, brand, frontend design |
| `mixed`        | Reserved for plugin bundles with no single goal — a collection of unrelated entities. The build also auto-assigns this to any plugin whose skills span more than one category and that does not declare one explicitly. Do not use `mixed` for individual skills/agents/commands. |

When adding a new plugin or override, pick the closest fit — keep this list short on purpose. If nothing fits, prefer leaving the entity uncategorised over inventing a one-off label. The build script reads `plugin.json` to generate `.claude-plugin/marketplace.json` automatically — no separate registry file needed.

The plugin's category propagates to every agent, hook, command, and MCP server bundled with it, so all five entity types share the same filter group in the web UI and the catalog. To override a specific sub-entity, add a `category:` field to that agent/hook/command's YAML frontmatter (MCP servers don't have YAML; override them via the overrides file). For external repos, add overrides per entity type under `.claude-plugin/external-overrides.json`:

```json
{
  "owner/repo": {
    "plugins":    { "name": { "category": "automation" } },
    "skills":     { "name": { "category": "code-quality" } },
    "agents":     { "name": { "category": "automation" } },
    "hooks":      { "name": { "category": "automation" } },
    "commands":   { "name": { "category": "productivity" } },
    "mcpServers": { "name": { "category": "automation" } }
  }
}
```

Resolution order, per entity: external override → frontmatter (where applicable) → parent plugin category → `null` ("Uncategorized" in the UI).

## Evals Format (`evals.json`)

```json
{
  "skill_name": "plugin-name",
  "evals": [
    {
      "id": 0,
      "prompt": "User-facing prompt that triggers the skill",
      "description": "What this eval validates and why it is tricky",
      "setup": "Bash commands that create the test environment in /tmp/eval-<name>-<id>/",
      "expected_output": "Plain-English description of what the skill must produce",
      "files": [],
      "assertions": [
        {
          "id": "kebab-case-id",
          "text": "Plain-language statement verified by the skill-creator tooling"
        }
      ]
    }
  ]
}
```

Include at least 3–5 evals per plugin. Cover the happy path, idempotent re-runs, and at least one tricky/degenerate case.

## Skill/Plugin Design Principles

- Skills must be **idempotent** — re-running should not corrupt existing files. Use `Edit` over `Write` when updating existing content.
- Skills use **graceful degradation** — if an optional CLI tool (e.g., `vulture`, `tsc`) is unavailable, fall back to grep-based analysis.
- Skills are **framework-aware** — e.g., `find-dead-code` knows not to flag Spring `@Bean` methods or DI-injected classes as dead.
- Skills support **monorepos** — detect multi-package layouts and apply per-package logic when appropriate.
- **Deduplication** is required — skills that append to existing files must check for existing entries before writing.
- Read-only skills (e.g., `find-dead-code`, `find-breaking-rest-api`, `improve-logging`, `find-skills`) must never write or modify files in the target project. A skill is auto-tagged `readOnly` by the build pipeline when its `tools` list contains no `Write`, `Edit`, or `NotebookEdit` — no explicit marker needed.

## Current Plugins

| Plugin                   | Version | Category      | Purpose                                                                                                         |
|--------------------------|---------|---------------|-----------------------------------------------------------------------------------------------------------------|
| `brainstorm`             | 1.0.0   | Productivity  | Read the project and suggest the 5 most valuable next features or improvements                                  |
| `changelog`              | 1.0.0   | Documentation | Generate/update CHANGELOG.md from git history (Keep a Changelog format)                                         |
| `cost-tracker`           | 1.0.0   | Productivity  | Append token usage and estimated cost to `~/.claude/cost-log.jsonl` on every Stop event                         |
| `cv-linkedin`            | 2.1.0   | Productivity  | Improve a CV and LinkedIn profile from the official export — stronger language, quantified achievements         |
| `document-project`       | 1.0.0   | Documentation | Create README + `/docs` structure                                                                               |
| `find-breaking-rest-api` | 3.0.0   | Code Quality  | Find breaking REST API changes — multi-file routers, shared schemas, auth                                       |
| `find-dead-code`         | 1.0.0   | Code Quality  | Find unused functions, classes, imports across languages                                                        |
| `find-skills`            | 1.0.0   | Productivity  | Analyze the active repository and recommend relevant Claude Code skills from known marketplaces                 |
| `improve-logging`        | 1.0.0   | Code Quality  | Audit logging quality and produce prioritised fix recommendations                                               |
| `scaffold`               | 1.0.0   | Productivity  | Generate a complete plugin skeleton (plugin.json, SKILL.md, evals, optional agents/references) from a prompt    |
| `site-audit`             | 1.3.0   | Code Quality  | Audit a website for UX, accessibility, performance, and bugs — fans out to specialised sub-agents in parallel   |
| `task-agent`             | 1.1.0   | Automation    | Read tasks from agent-tasks.yml, spawn agents per task, open PRs, and automatically fix Copilot review comments |
| `workflow`               | 1.0.0   | Automation    | Run multi-step skill workflows declared in workflow YAML — sequential execution with `${{ … }}` interpolation   |

## Adding a New Plugin

1. Create `plugins/<skill-name>/` with the structure above.
2. Write `plugins/<skill-name>/skills/<skill-name>/SKILL.md` following the phase-based format of existing skills.
3. Add `plugins/<skill-name>/.claude-plugin/plugin.json` with name, version, description, category, and skills[].
4. Add `plugins/<skill-name>/skills/<skill-name>/evals/evals.json` with at least 3–5 test scenarios.
5. Run `npm run build` — this automatically adds the plugin to `.claude-plugin/marketplace.json`.
6. Optionally add sub-agents to `plugins/<skill-name>/agents/<agent-name>.md` — each must have valid YAML frontmatter (`name`, `description`, `tools`). Skills spawn them via the Agent tool using `subagent_type`.
7. Optionally add reference docs to `plugins/<skill-name>/references/<topic>.md` — keep these minimal: only non-obvious, trap-prone facts the agent would otherwise get wrong. Do not document things any LLM already knows.
8. Optionally add `plugins/<skill-name>/examples/` with sample input/output files.

## task-agent Plugin Details

`task-agent` (v1.1.0) has additional structure beyond the standard layout:

```
plugins/task-agent/
  agents/
    copilot-review-fixer.md   ← Background sub-agent: polls open PRs for unresolved
                                  Copilot comments and applies fixes automatically
  examples/
    agent-tasks.yml           ← Sample task config format
    agent-tasks-state.yml     ← Sample completed-task state file
  references/                 ← Language/build-tool quick-reference docs read at runtime
    java.md
    javascript.md
    typescript.md
    maven.md
    gradle.md
    npm.md
    isabelle.md               ← Isabelle theorem prover build commands, Isar proof language
    IsarMathLib.md            ← IsarMathLib style guide (declarative Isar, naming rules)
  run.sh                      ← Non-interactive entry point for CI/automation use
```

## Web UI and GitHub Pages

`index.html` + `assets/` provide a static marketplace browser deployed via GitHub Pages (`.github/workflows/pages.yml`). `index.html` is a minimal shell with `<div id="root">`; the page is rendered by **Preact** from `assets/bundle.js` (compiled from `assets/src/app.tsx` by esbuild with `--jsx=automatic --jsx-import-source=preact`). All visible markup, IDs, and CSS classes are owned by the Preact components in `assets/src/components/`.

App state lives in the top-level `<App>` component via `useState` hooks; URL sync, the `/` keyboard shortcut, and the panel Escape handlers use `useLayoutEffect` so behavior is observable synchronously after each event (this is what makes the regression tests deterministic). There is no global state singleton — components communicate only through props and callbacks.

The build also generates `.claude-plugin/marketplace.json` — a combined catalog with absolute source references for all repos in `marketplaces.json`.

**Scripts:**
- `npm run dev` — one-command local dev. Runs build-index once, then esbuild's `--serve` mode on `http://127.0.0.1:4567/`. `index.html` contains a tiny inline snippet that listens to esbuild's `/esbuild` SSE endpoint and reloads on every rebuild (active only on `localhost`/`127.0.0.1`). Ctrl+C to stop.
- `npm run build` — production build. Run this after adding or modifying a plugin.
- `npm run typecheck` — type-checks scripts and the web app.
- `npm test` / `npm run test:watch` — vitest + happy-dom regression suite. When touching anything under `assets/src/`, these tests must stay green.

## Doc Rules

Every time you modify anything, fix the documentation and `CHANGELOG.md` accordingly, if needed.
