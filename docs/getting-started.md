[← Back to README](../README.md)

# Getting Started

## Prerequisites

- **Claude Code** (`claude` CLI) — [install guide](https://claude.ai/code) — or **GitHub Copilot** with skills support
- **Git** (required by several skills at runtime)
- **Bash** (Unix) or **PowerShell** (Windows) to run the installer

## Install

### Claude Code (recommended)

```
/plugin marketplace add dan323/skill-easy-life
```

Then install individual plugins:

```
/plugin install changelog@skill-easy-life
/plugin install brainstorm@skill-easy-life
```


3. Verify by starting a new Claude Code session and asking it to use one of the skills:

   ```
   Generate a changelog for this project
   ```

## First Use

Skills trigger automatically when Claude recognises a matching request — you do not need to name the skill explicitly. For example:

| You say                     | Skill triggered          |
|-----------------------------|--------------------------|
| "Generate a changelog"      | `changelog`              |
| "Document this project"     | `document-project`       |
| "Find dead code"            | `find-dead-code`         |
| "Review our logging"        | `improve-logging`        |
| "Find breaking API changes" | `find-breaking-rest-api` |

Each skill produces output in your current working directory (report files, updated `CHANGELOG.md`, new `README.md`, etc.).

## Updating

```
/plugin update <name>@skill-easy-life
```

---

## See Also

- [Architecture](architecture.md) — how skills are structured and how they work
- [Contributing a Skill](contributing.md) — how to write and test your own skill
