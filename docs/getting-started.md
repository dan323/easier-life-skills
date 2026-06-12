[â† Back to README](../README.md)

# Getting Started

## Prerequisites

- **Claude Code** (`claude` CLI) â€” [install guide](https://claude.ai/code) â€” or **GitHub Copilot** with skills support
- **Git** (required by several skills at runtime)
- **Bash** (Unix) or **PowerShell** (Windows) to run the installer

## Install

### Claude Code (recommended)

```
/plugin marketplace add dan323/easier-life-skills
```

Then install individual plugins:

```
/plugin install easier-life-skills/docs
/plugin install easier-life-skills/brainstorm
```

## First Use

Skills trigger automatically when Claude recognises a matching request — you do not need to name the skill explicitly. For example:

| You say                          | Skill triggered          | Plugin |
|----------------------------------|--------------------------|--------|
| "Generate a changelog"           | `changelog`              | `docs` |
| "Document this project"          | `document-project`       | `docs` |
| "Find dead code"                 | `find-dead-code`         | `code-audit` |
| "Review our logging"             | `improve-logging`        | `code-audit` |
| "Find breaking API changes"      | `find-breaking-rest-api` | `code-audit` |
| "What should I build next?"      | `brainstorm`             | `brainstorm` |
| "What skills should I use?"      | `find-skills`            | `find-skills` |

Each skill produces output in your current working directory (report files, updated `CHANGELOG.md`, new `README.md`, etc.).

## Marketplace Browser

Browse all skills, agents, commands, hooks, and MCP servers at **https://ai.dan323.dev/**

| Shortcut | Action |
|----------|--------|
| Press `/` | Focus the search box |
| Click **A→Z** button | Toggle sort direction |
| Click a plugin card | Open the right-side detail panel with full description and install command (also shows `/plugin marketplace add …` for non-builtin sources) |
| Click a skill / agent / MCP / command / hook card | Open the left-side detail panel with full description, tools or events, source link, and install command |
| Click a source tag | Filter by marketplace |
| Click the `+` on a source tag | Copy `/plugin marketplace add <owner>/<repo>` to your clipboard |

## Updating

```
/plugin update easier-life-skills/<name>
```

---

## See Also

- [Architecture](architecture.md) — how skills are structured and how they work
- [Contributing a Skill](contributing.md) — how to write and test your own skill
