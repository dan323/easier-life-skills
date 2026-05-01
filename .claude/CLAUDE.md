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

The installer lives in `installer/` and requires Node.js ≥ 18.

## Repository Structure

```
.claude/
  CLAUDE.md                 ← This file
.claude-plugin/
  marketplace.json          ← Generated from plugins/ scan — committed; do not edit by hand
.github/
  workflows/
    pages.yml               ← GitHub Pages deployment workflow
assets/
  app.js                    ← Marketplace web UI JavaScript
  style.css                 ← Marketplace web UI styling
docs/
  architecture.md           ← System design documentation
  contributing.md           ← Guide for adding new plugins
  final-plan-architecture.md
  getting-started.md
  plan.md
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
  build-index.js            ← Generates skills_index.json, CATALOG.md, and marketplace.json
CATALOG.md                  ← Human-readable catalog with suggested bundles
CHANGELOG.md                ← Version history (Keep a Changelog format)
README.md                   ← Project overview and quick-start
index.html                  ← Static web UI for browsing the marketplace
skills_index.json           ← Generated index; rebuild with: node scripts/build-index.js
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

`category` must be one of `productivity`, `documentation`, `code-quality`, `automation`. The build script reads this file to generate `.claude-plugin/marketplace.json` automatically — no separate registry file needed.

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
- Read-only skills (e.g., `find-dead-code`, `find-breaking-rest-api`, `improve-logging`, `find-skills`) must never write or modify files in the target project.

## Current Plugins

| Plugin                   | Version | Category      | Purpose                                                                                                         |
|--------------------------|---------|---------------|-----------------------------------------------------------------------------------------------------------------|
| `brainstorm`             | 1.0.0   | Productivity  | Read the project and suggest the 5 most valuable next features or improvements                                  |
| `changelog`              | 1.0.0   | Documentation | Generate/update CHANGELOG.md from git history (Keep a Changelog format)                                         |
| `document-project`       | 1.0.0   | Documentation | Create README + `/docs` structure                                                                               |
| `find-breaking-rest-api` | 3.0.0   | Code Quality  | Find breaking REST API changes — multi-file routers, shared schemas, auth                                       |
| `find-dead-code`         | 1.0.0   | Code Quality  | Find unused functions, classes, imports across languages                                                        |
| `improve-logging`        | 1.0.0   | Code Quality  | Audit logging quality and produce prioritised fix recommendations                                               |
| `task-agent`             | 1.1.0   | Automation    | Read tasks from agent-tasks.yml, spawn agents per task, open PRs, and automatically fix Copilot review comments |
| `find-skills`            | 1.0.0   | Productivity  | Analyze the active repository and recommend relevant Claude Code skills from known marketplaces                 |

## Adding a New Plugin

1. Create `plugins/<skill-name>/` with the structure above.
2. Write `plugins/<skill-name>/skills/<skill-name>/SKILL.md` following the phase-based format of existing skills.
3. Add `plugins/<skill-name>/.claude-plugin/plugin.json` with name, version, description, category, and skills[].
4. Add `plugins/<skill-name>/skills/<skill-name>/evals/evals.json` with at least 3–5 test scenarios.
5. Run `node scripts/build-index.js` — this automatically adds the plugin to `.claude-plugin/marketplace.json`.
7. Optionally add sub-agents to `plugins/<skill-name>/agents/<agent-name>.md` — each must have valid YAML frontmatter (`name`, `description`, `tools`). Skills spawn them via the Agent tool using `subagent_type`.
8. Optionally add reference docs to `plugins/<skill-name>/references/<topic>.md` — keep these minimal: only non-obvious, trap-prone facts the agent would otherwise get wrong. Do not document things any LLM already knows.
9. Optionally add `plugins/<skill-name>/examples/` with sample input/output files.

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

`index.html` + `assets/` provide a static marketplace browser deployed via GitHub Pages (`.github/workflows/pages.yml`). The page reads `skills_index.json` at runtime. The build also generates `.claude-plugin/marketplace.json` — a combined catalog with absolute source references for all repos in `marketplaces.json`. Always run `node scripts/build-index.js` after adding or modifying a plugin.

## Doc Rules

Every time you modify anything, fix the documentation and `CHANGELOG.md` accordingly, if needed.
