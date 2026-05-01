# easier-life-skills

A Claude Code plugin marketplace with reusable skill plugins for [Claude Code](https://claude.ai/code) and GitHub Copilot. Each skill gives an AI agent detailed, phase-by-phase instructions for performing a specialized development task — generating changelogs, auditing logging, finding dead code, and more.

## Quick Start

### Claude Code (recommended)

```
/plugin marketplace add dan323/easier-life-skills
/plugin install changelog@easier-life-skills
```

## Plugins

### Skills

| Plugin                                                                                            | What it does                                                                                                            |
|---------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| [`changelog`](plugins/changelog/skills/changelog/SKILL.md)                                        | Generate or update `CHANGELOG.md` from git history                                                                      |
| [`document-project`](plugins/document-project/skills/document-project/SKILL.md)                   | Create a root `README.md` and `/docs` pages for a project                                                               |
| [`find-dead-code`](plugins/find-dead-code/skills/find-dead-code/SKILL.md)                         | Find unused functions, classes, imports, and variables                                                                  |
| [`improve-logging`](plugins/improve-logging/skills/improve-logging/SKILL.md)                      | Audit log quality and produce prioritised fix recommendations                                                           |
| [`find-breaking-rest-api`](plugins/find-breaking-rest-api/skills/find-breaking-rest-api/SKILL.md) | Detect breaking changes in REST APIs by comparing git history                                                           |
| [`brainstorm`](plugins/brainstorm/skills/brainstorm/SKILL.md)                                     | Suggest the 5 most valuable features or improvements to build next                                                      |
| [`task-agent`](plugins/task-agent/skills/task-agent/SKILL.md)                                     | Read tasks from `agent-tasks.yml`, implement each via an agent, open PRs, and fix Copilot review comments automatically |
| [`find-skills`](plugins/find-skills/skills/find-skills/SKILL.md)                                  | Analyze the active repository and recommend relevant Claude Code skills from known marketplaces                         |

### Agents

| Agent                                                                       | Plugin       | What it does                                                                          |
|-----------------------------------------------------------------------------|--------------|---------------------------------------------------------------------------------------|
| [`copilot-review-fixer`](plugins/task-agent/agents/copilot-review-fixer.md) | `task-agent` | Reads unresolved Copilot review comments on a PR and applies code fixes automatically |

## Marketplace Browser

Browse and search all available skills, agents, and MCP servers at the interactive marketplace:

**https://dan323.github.io/easier-life-skills/**

The website supports adding other marketplaces — paste any `owner/repo` that publishes a compatible `skills_index.json`.

## Bundles

Install a curated set of skills in one go:

| Bundle                 | Skills                                                                     |
|------------------------|----------------------------------------------------------------------------|
| Backend Developer      | `find-breaking-rest-api`, `find-dead-code`, `improve-logging`, `changelog` |
| Open Source Maintainer | `changelog`, `document-project`, `brainstorm`, `find-skills`               |
| Code Quality Reviewer  | `find-dead-code`, `improve-logging`, `find-breaking-rest-api`              |
| Full Stack             | all skills                                                                 |

## Schema Compatibility

This marketplace follows the [Anthropic plugin schema](https://anthropic.com/claude-code/marketplace.schema.json). Each `plugin.json` declares which skills, agents, and MCP servers the plugin provides:

```json
{
  "name": "task-agent",
  "description": "...",
  "author": { "name": "dan323" },
  "skills": ["./skills/task-agent"],
  "agents": ["./agents/copilot-review-fixer"]
}
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Contributing a Skill](docs/contributing.md)
- [Roadmap](docs/plan.md)
- [Target Architecture](docs/final-plan-architecture.md)
