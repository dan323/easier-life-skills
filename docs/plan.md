[← Back to README](../README.md)

# Roadmap & Ideas

Brainstormed ideas for the web UI, installer CLI, and new plugins (skills, agents, commands, MCPs).
Items are ranked roughly by value-to-effort within each section.

---

## Web UI

### 1. Clickable skill / agent / command / MCP cards  ·  Days
Plugin cards open a detail panel; all other card types do nothing on click. Each should open a panel showing full description, keywords, tools, readOnly status, and source link — reusing the `renderCardSection` + `panel-content` pattern from `panel.ts`. One new panel file per entity type, or a single generic panel.

### 2. Custom bundle builder  ·  Days
A "Add to bundle" button on every card. A persistent drawer shows the current selection with a generated install script and a "Copy all" button. Replaces the need to browse bundles separately and serves the core use case — getting a curated set of skills installed — better than static bundles.

### 3. GitHub stars on source tags  ·  Hours
Fetch star counts from the GitHub API for each marketplace repo and display them on the source tags (e.g. `dan323/easier-life-skills ★ 42`). Makes the relative popularity of marketplaces visible at a glance.

### 4. SKILL.md preview in panel  ·  Days
For skills and plugins, show a truncated rendering of the raw SKILL.md in the detail panel — the first 1000 chars or the first phase heading. Gives users a sense of what the skill actually does before installing it, without leaving the page.

### 5. Remaining keyboard shortcuts  ·  Hours
`j`/`k` moves between visible cards, `Enter` opens the detail panel for the focused card. (`/` to focus search and `Escape` to close the panel are already implemented.)

---

## Installer CLI (`npx @dan323/easier-life-skills`)

### 1. `--search <query>`  ·  Hours
Filter skills by name/description/keywords before installing. Currently the user must run `--list` and scan manually. A simple `skills.filter(s => ...)` on the already-fetched index.

### 2. `--update`  ·  Hours
Re-download and overwrite already-installed skills. Currently there is no way to update without manually deleting the install directory. Checks installed `plugin.json` version against the index and reports what changed.

### 3. `--uninstall <name>`  ·  Hours
Remove an installed skill directory from `~/.claude/plugins/easier-life-skills/<name>`. Simple `rm -rf` with a confirmation prompt.

### 4. `--marketplace <owner/repo>`  ·  Days
Pull from any compatible `skills_index.json`, not just the hardcoded `dan323` URL. Lets power users install from `mattpocock/skills` or any other marketplace directly from the terminal without touching the web UI.

### 5. Check for updates on run  ·  Hours
When the user runs any install command, quietly compare their installed skill versions against the index and print a summary (`2 skills have updates — run --update to refresh`).

### 6. Interactive mode (no flags)  ·  Days
When run with no flags, show a terminal UI with checkboxes to browse and select skills to install — instead of dropping to the usage text. Uses the built-in `readline` already imported.

---

## Skills

### 1. `security-review`  ·  Days
Scan a codebase for OWASP Top-10 vulnerabilities, hardcoded secrets, insecure dependencies, and unsafe patterns. Read-only output (report of findings ranked by severity). Complements `find-dead-code` and `improve-logging` in a "code health" bundle.

### 2. `generate-tests`  ·  Days
Given a file or function, generate unit and integration test cases. Detects the test framework in use (Jest, Vitest, pytest, JUnit…), follows existing test conventions, and writes tests alongside the source. Idempotent — won't overwrite existing tests.

### 3. `pr-description`  ·  Hours
Generate a pull request title and description from the current branch's diff and commit history. Follows the repo's PR template if one exists. Much faster than the `changelog` skill for the single-PR case.

### 4. `explain-codebase`  ·  Days
Produce an onboarding guide for a new contributor: entry points, data flow, key abstractions, module map, and "where to start" for common tasks. Writes to `docs/onboarding.md` or prints to stdout.

### 5. `dependency-audit`  ·  Hours
Check all dependencies for outdated versions and known vulnerabilities (using `npm audit`, `pip-audit`, `cargo audit`, etc. with grep fallback). Read-only report ranked by severity.

### 6. `performance-audit`  ·  Days
Identify performance bottlenecks: N+1 queries, unindexed DB columns, unnecessary re-renders, large bundle sizes, synchronous I/O in hot paths. Language and framework aware. Read-only report.

---

## Agents

### 1. `pr-reviewer`  ·  Days
A background agent that polls open PRs and posts a structured code review comment: summary of changes, potential bugs, style issues, and suggested improvements. Complements the existing `copilot-review-fixer` (which fixes comments) by generating the comments in the first place.

### 2. `dependency-updater`  ·  Days
A background agent that runs on a schedule, checks for outdated dependencies, opens a PR per package manager with the bumped version, and fills in the PR description with the changelog diff. Combines `dependency-audit` with the task-agent PR-opening pattern.

### 3. `issue-triager`  ·  Days
Reads new GitHub issues, labels them by type (bug/feature/question), checks for duplicates, and posts a triage comment with reproduction steps requested or a pointer to existing issues. Runs as a background agent triggered by webhook or schedule.

---

## Commands

### 1. `commit-message`  ·  Hours
Generate a conventional commit message (`feat:`, `fix:`, `chore:`, etc.) from the current staged diff. Copies it to the clipboard or prints it. The most-used one-shot command in a developer's day.

### 2. `new-issue`  ·  Hours
Create a GitHub issue from the current conversation context — title, description, labels, and assignee inferred from what was discussed. Wraps `gh issue create`.

### 3. `explain-error`  ·  Hours
Paste a stack trace or compiler error; the command explains what went wrong, why, and the most likely fix in plain language. Useful as a quick lookup without context-switching.

### 4. `standup`  ·  Hours
Summarise today's git commits and open PRs into a standup-ready paragraph. Wraps `git log --since=midnight` and `gh pr list`.

---

## Hooks

Claude Code hooks are shell commands wired to events (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`). The marketplace already has the `Hook` type, `events[]` field, and `hooks-grid` rendered in the UI — but no actual hook plugins exist yet. Items below are the first five to ship.

### 1. `notify-on-stop`  ·  Hours  ·  Feature
Fire a desktop notification (or terminal bell) when Claude finishes a long task. Hooks into the `Stop` and `SubagentStop` events; shell command is `notify-send` on Linux, `osascript` on macOS, `powershell … New-BurntToastNotification` on Windows. No project dependency — works everywhere, immediately useful without configuration.

### 2. `no-main-push`  ·  Hours  ·  Feature
`PreToolUse` hook on Bash calls containing `git push`. Inspects the command for a `main` or `master` target and exits non-zero to block it, printing a message like `"Direct push to main blocked — open a PR instead."` Simple pattern match, high safety value for any team using Claude to write and commit code.

### 3. `secret-scanner`  ·  Days  ·  Feature
`PreToolUse` hook on `Write` and `Edit`. Reads the incoming file content from the hook's stdin JSON, runs a regex sweep for high-entropy strings, AWS/GCP/GitHub token patterns, and common secret field names (`password`, `api_key`, `secret`). Blocks the write and prints the offending line if a match is found. Prevents Claude from accidentally persisting credentials.

### 4. `auto-format`  ·  Days  ·  Feature
`PostToolUse` hook on `Write` and `Edit`. Detects the project formatter from config files (`prettier`, `.prettierrc`, `pyproject.toml [tool.black]`, `.golangci.yml`, etc.) and runs it on the file Claude just wrote. Keeps formatting consistent without requiring the user to remember to run it — particularly valuable when Claude generates large files in a single write.

---

## MCPs

### 1. GitHub Issues MCP  ·  Days
An MCP server wrapping `gh` commands for creating, listing, updating, and commenting on issues and PRs. Lets skills and agents interact with GitHub Issues natively without shell commands, and makes the integration available to any Claude session.

### 2. Local search MCP  ·  Hours
An MCP server wrapping `ripgrep` and `fd` for fast local file search. Exposes `search_content(pattern, path)` and `find_files(glob, path)` as MCP tools — faster and more capable than the built-in Glob/Grep tools for large codebases.

### 3. Secrets scanner MCP  ·  Hours
An MCP server that scans a file or directory for secrets (API keys, tokens, credentials) using pattern matching and entropy analysis. Useful as a pre-commit gate or as a tool available to the `security-review` skill.

---

## See Also

- [Architecture](architecture.md) — plugin and skill file format
- [Contributing a Skill](contributing.md) — how to write a new plugin
- [Getting Started](getting-started.md) — install and first use
