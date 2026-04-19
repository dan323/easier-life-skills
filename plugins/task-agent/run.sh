#!/usr/bin/env bash
# task-agent runner
# Invoke claude non-interactively with the skill loaded.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${1:-$PWD}"   # pass the directory containing agent-tasks.yml as $1, or use CWD

cd "$CONFIG_DIR"

exec claude \
  --skill "$SKILL_DIR/SKILL.md" \
  --print \
  "Run the task-agent skill: read agent-tasks.yml in the current directory, pick the next pending task, and complete it."
