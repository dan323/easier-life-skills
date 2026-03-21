# Changelog

## [Unreleased]

### Changed
- Repo restructured as a Claude Code plugin marketplace. Each skill is now a plugin under `plugins/<name>/` with a `.claude-plugin/plugin.json` manifest and `skills/<name>/SKILL.md`.
- Added `.claude-plugin/marketplace.json` — marketplace catalog; install all plugins with `/plugin marketplace add dan323/skill-easy-life`.
- Removed `scripts/` — installation is now handled entirely by the Claude Code plugin system.

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
