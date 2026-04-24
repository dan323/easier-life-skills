# easier-life-skills

A Claude Code plugin marketplace with reusable skill plugins for [Claude Code](https://claude.ai/code) and GitHub Copilot. Each skill gives an AI agent detailed, phase-by-phase instructions for performing a specialized development task — generating changelogs, auditing logging, finding dead code, and more.

## Quick Start

### Claude Code (recommended)

```
/plugin marketplace add dan323/easier-life-skills
/plugin install changelog@easier-life-skills
```

## Plugins

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

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Contributing a Skill](docs/contributing.md)
- [Roadmap](docs/plan.md)
- [Target Architecture](docs/final-plan-architecture.md)
