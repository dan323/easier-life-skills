# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

A Claude Code plugin marketplace containing reusable skill plugins for Claude Code and GitHub Copilot. Each plugin wraps a Markdown skill (`SKILL.md`) that instructs an AI agent how to perform a specialized multi-phase workflow (e.g., generating changelogs, finding dead code, writing documentation).

## Installation

### Claude Code (recommended)

```
/plugin marketplace add dan323/skill-easy-life
```

Then install individual plugins:

```
/plugin install changelog@skill-easy-life
/plugin install brainstorm@skill-easy-life
```

## Repository Structure

```
.claude-plugin/
  marketplace.json        ← Marketplace catalog (lists all plugins)
plugins/
  <skill-name>/
    .claude-plugin/
      plugin.json         ← Plugin manifest (name, version, description, keywords)
    skills/
      <skill-name>/
        SKILL.md          ← The skill itself
    agents/               ← Optional: sub-agents spawned by the skill
      <agent-name>.md     ← Sub-agent definition (frontmatter + system prompt)
    references/           ← Optional: reference docs the skill agent reads at runtime
      <topic>.md          ← Concise, non-obvious facts for the agent (not LLM basics)
    evals/
      evals.json          ← Test cases for the skill-creator tooling
```

## Skill/Plugin Design Principles

- Skills must be **idempotent** — re-running should not corrupt existing files. Use `Edit` over `Write` when updating existing content.
- Skills use **graceful degradation** — if an optional CLI tool (e.g., `vulture`, `tsc`) is unavailable, fall back to grep-based analysis.
- Skills are **framework-aware** — e.g., `find-dead-code` knows not to flag Spring `@Bean` methods or DI-injected classes as dead.
- Skills support **monorepos** — detect multi-package layouts and apply per-package logic when appropriate.
- **Deduplication** is required — skills that append to existing files must check for existing entries before writing.

**Evals (`evals/evals.json`):**
- Array of `{ "description", "setup", "assertions[] }` objects
- `setup` contains shell commands to create a test environment
- `assertions` are plain-language statements verified by the skill creator tooling

## Current Plugins

| Plugin                   | Purpose                                                                                                         |
|--------------------------|-----------------------------------------------------------------------------------------------------------------|
| `brainstorm`             | Read the project and suggest the 5 most valuable next features or improvements                                  |
| `changelog`              | Generate/update CHANGELOG.md from git history                                                                   |
| `document-project`       | Create README + `/docs` structure                                                                               |
| `find-breaking-rest-api` | Find breaking REST API changes — multi-file routers, shared schemas, auth                                       |
| `find-dead-code`         | Find unused functions, classes, imports across languages                                                        |
| `improve-logging`        | Audit logging quality and produce prioritised fix recommendations                                               |
| `task-agent`             | Read tasks from agent-tasks.yml, spawn agents per task, open PRs, and automatically fix Copilot review comments |

## Adding a New Plugin

1. Create `plugins/<skill-name>/` with the structure above.
2. Write `plugins/<skill-name>/skills/<skill-name>/SKILL.md` following the phase-based format of existing skills.
3. Add `plugins/<skill-name>/.claude-plugin/plugin.json` with name, version, description, and keywords.
4. Add `plugins/<skill-name>/evals/evals.json` with at least 3–5 test scenarios.
5. Register it in `.claude-plugin/marketplace.json` under `plugins`.
6. Optionally add sub-agents to `plugins/<skill-name>/agents/<agent-name>.md` — each must have valid YAML frontmatter (`name`, `description`, `tools`). Skills spawn them via the Agent tool using `subagent_type`.
7. Optionally add reference docs to `plugins/<skill-name>/references/<topic>.md` — keep these minimal: only non-obvious, trap-prone facts the agent would otherwise get wrong. Do not document things any LLM already knows.

## Doc rules

Every time you modify anything, fix the documentation and CHANGELOG.md accordingly, if needed.
