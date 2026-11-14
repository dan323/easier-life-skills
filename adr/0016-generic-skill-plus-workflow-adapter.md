# ADR 0016 — Generic skill plus a thin `<skill>-workflow` adapter

- **Status**: Accepted
- **Date**: 2026-11-14
- **Scope**: `plugins/task-agent/skills/{task-agent,pr-reviewer,review-fixer}` and their `*-workflow` adapters; the `workflow` plugin's examples; `auto-board-task`
- **Issue**: [#139](https://github.com/dan323/easier-life-skills/issues/139)

## Context

`task-agent` (Phase 4.3) and `pr-reviewer` (Step 5) wrote a JSON object to `$WORKFLOW_OUTPUT` when that variable was set. Someone who only wants "review this PR" therefore got a skill whose instructions were partly about a workflow runner, and every skill that wanted to be composable had to repeat the same convention and document its keys.

## Decision

Two layers per composable skill:

1. **Generic skill** (`pr-reviewer`, `review-fixer`, `task-agent`): standalone and human-oriented, never mentions `$WORKFLOW_OUTPUT`. Besides its human report it ends with a **result block**: the label `result:` followed by a fenced `json` block. The block is generic (any caller can read it), not workflow-specific.
2. **Adapter** (`<skill>-workflow`): invokes the generic skill through the `Skill` tool, inline (no extra agent), parses the last result block and writes it to `$WORKFLOW_OUTPUT`. The step output keys (`steps.<id>.output.<key>`) are documented on the adapter. It never parses the prose report.

Workflows reference the adapter (`skill: pr-reviewer-workflow`); everyone else uses the generic skill.

Placement and naming:

- Adapters live in the **same plugin** as the skill they wrap, so they are versioned and released together and cannot drift from the result block they map.
- The `-workflow` suffix is the discovery convention; no separate `workflow-adapters` plugin, and no new marketplace tag for now.
- For third-party skills that have no adapter, an `extract:` mechanism on the workflow step (#137) is the intended route; adapters are for skills we own and want deterministic keys from.

## Consequences

- Generic skills lose the workflow-only branch and become simpler to read. Output keys are stable because the result block is part of the skill's documented contract.
- One extra hop per step. Using `inline: true` keeps it to a `Skill` invocation, not another subagent.
- The marketplace gains three entries (`task-agent-workflow`, `pr-reviewer-workflow`, `review-fixer-workflow`).
- Breaking: a workflow that called `task-agent` / `pr-reviewer` directly no longer gets `$WORKFLOW_OUTPUT` keys, so `task-agent` is released as 3.0.0 and the bundled workflows and examples were migrated to the adapters.
