# easier-life-skills

[![Claude Code Marketplace](https://ai.dan323.dev/badge.svg)](https://ai.dan323.dev/)

A Claude Code plugin marketplace with reusable skill plugins for [Claude Code](https://claude.ai/code) and GitHub Copilot. Each skill gives an AI agent detailed, phase-by-phase instructions for performing a specialized development task — generating changelogs, auditing logging, finding dead code, and more.

## Quick Start

### Claude Code (recommended)

```
/plugin marketplace add dan323/easier-life-skills
/plugin install docs@easier-life-skills
```

The marketplace browser at the bottom of this README also surfaces plugins from other Claude Code marketplaces. To install those, add each of their marketplaces alongside this one — for example:

```
/plugin marketplace add anthropics/skills
/plugin marketplace add mattpocock/skills
/plugin install document-skills@skills
```

Or copy the right command directly from the [marketplace browser](#marketplace-browser): every source tag has a `+` button that copies its `/plugin marketplace add …` line, and every plugin detail panel shows both the `marketplace add` and `plugin install` commands you need.

## Plugins

### Skills

| Plugin                                                                                            | What it does                                                                                                            |
|---------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| [`docs`](plugins/docs/.claude-plugin/plugin.json)                                                  | Documentation bundle â€” `changelog` ([SKILL](plugins/docs/skills/changelog/SKILL.md)) and `document-project` ([SKILL](plugins/docs/skills/document-project/SKILL.md))   |
| [`code-audit`](plugins/code-audit/.claude-plugin/plugin.json)                                      | Code-quality bundle â€” `find-dead-code` ([SKILL](plugins/code-audit/skills/find-dead-code/SKILL.md)), `find-breaking-rest-api` ([SKILL](plugins/code-audit/skills/find-breaking-rest-api/SKILL.md)), and `improve-logging` ([SKILL](plugins/code-audit/skills/improve-logging/SKILL.md)) |
| [`brainstorm`](plugins/brainstorm/skills/brainstorm/SKILL.md)                                     | Suggest the 5 most valuable features or improvements to build next                                                      |
| [`task-agent`](plugins/task-agent/skills/task-agent/SKILL.md)                                     | Read tasks from a YAML file (unified single-file format with `id`/`status`, or legacy two-file mode), implement one per run via an agent, open a PR, and fix Copilot review comments automatically |
| [`find-skills`](plugins/find-skills/skills/find-skills/SKILL.md)                                  | Analyze the active repository and recommend relevant Claude Code skills from known marketplaces                         |
| [`scaffold`](plugins/scaffold/skills/scaffold/SKILL.md)                                           | Generate a complete plugin skeleton (`plugin.json`, `SKILL.md`, evals, optional agents/references) from a single prompt |
| [`workflow`](plugins/workflow/skills/workflow/SKILL.md)                                           | Run multi-step skill workflows declared in workflow YAML — sequential execution with `${{ … }}` interpolation          |
| [`auto-board-task`](plugins/auto-board-task/skills/auto-board-task/SKILL.md)                      | Process the top Todo card on a GitHub Project end-to-end â€” bundles the `gh-project-sync` board â‡„ `tasks.yml` reconciler and chains it with `task-agent` via the `workflow` skill so one invocation pulls the board into `tasks.yml`, opens a PR for the top pending task, and syncs the card to **In Review** with the PR link |
| [`security-review`](plugins/security-review/skills/security-review/SKILL.md)                     | Scan a codebase for OWASP Top-10 vulnerabilities, hardcoded secrets, insecure dependencies, and unsafe patterns. Read-only report ranked by severity (Critical / High / Medium / Low) |

### Agents

| Agent                                                                       | Plugin       | What it does                                                                          |
|-----------------------------------------------------------------------------|--------------|---------------------------------------------------------------------------------------|
| [`copilot-review-fixer`](plugins/task-agent/agents/copilot-review-fixer.md) | `task-agent` | Reads unresolved Copilot review comments on a PR and applies code fixes automatically |

## Marketplace Browser

Browse and search skills, agents, commands, hooks, and MCP servers from **multiple Claude Code marketplaces** (currently `dan323/easier-life-skills`, `anthropics/skills`, and `mattpocock/skills`) at the interactive marketplace:

**https://ai.dan323.dev/**

| Action                          | What it does                                                                                          |
|---------------------------------|-------------------------------------------------------------------------------------------------------|
| Press **`/`**                   | Focus the search box                                                                                  |
| Toggle **Aâ†’Z / Zâ†’A**             | Flip sort direction                                                                                   |
| Click a **source tag**           | Filter results down to that marketplace                                                              |
| Click the **`+`** on a tag       | Copy `/plugin marketplace add <owner>/<repo>` to your clipboard                                       |
| Click a **plugin card**          | Open a detail panel; for non-builtin sources the panel shows both the `marketplace add` and `plugin install` commands |

The list of aggregated marketplaces is defined in [`marketplaces.json`](marketplaces.json); a PR adding your own marketplace there will surface it on the next build.

The deployed site uses **Google Analytics 4** for aggregate engagement metrics (panel opens and install-command copies). Visitors see a consent banner on first visit with equally-prominent Accept / Decline buttons (Consent Mode v2; default-denied until accepted; revocable from the footer at any time). No PII is captured and forks/local dev have it off by default â€” see [`docs/architecture.md` â†’ Analytics](docs/architecture.md#analytics) for details and how to wire your own GA4 id.

## Bundles

Install a curated set of skills in one go:

| Bundle                 | Skills                                                                     |
|------------------------|----------------------------------------------------------------------------|
| Backend Developer      | `find-breaking-rest-api`, `find-dead-code`, `improve-logging` (all via `code-audit`), `changelog` (via `docs`) |
| Open Source Maintainer | `changelog`, `document-project` (via `docs`), `brainstorm`, `find-skills`              |
| Code Quality Reviewer  | `find-dead-code`, `improve-logging`, `find-breaking-rest-api` (all via `code-audit`)   |
| Full Stack             | all skills                                                                 |

## Schema Compatibility

This marketplace follows the [Anthropic plugin schema](https://anthropic.com/claude-code/marketplace.schema.json). Each `plugin.json` declares which skills and MCP servers the plugin provides:

```json
{
  "name": "task-agent",
  "description": "...",
  "author": { "name": "dan323" },
  "category": "automation",
  "skills": ["./skills/task-agent"]
}
```

Sub-agents live in `plugins/<name>/agents/` and are auto-discovered by Claude Code from that directory â€” they do not need to be listed in `plugin.json`.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Contributing a Skill](docs/contributing.md)
- [Roadmap](docs/plan.md)
