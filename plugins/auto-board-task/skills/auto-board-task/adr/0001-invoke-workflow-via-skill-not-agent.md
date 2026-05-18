# ADR 0001 — Invoke `workflow` via the `Skill` tool, not the `Agent` tool

- **Status**: Accepted
- **Date**: 2026-05-18
- **Supersedes**: v1.28.0's `Agent`-based wrapper (`auto-board-task` 1.0.0)
- **Skill**: [`auto-board-task`](../SKILL.md)

> This ADR is **not** referenced from `SKILL.md` and is **not** loaded
> by the skill at runtime — `SKILL.md` is fed to the agent on every
> invocation, so design rationale belongs here instead. The build
> pipeline reads `SKILL.md` only; sibling folders like `adr/` are
> invisible to the marketplace index.

## Context

`auto-board-task` is a thin wrapper around the `workflow` skill: it
forwards `key=value` arguments to a fixed YAML at
`${CLAUDE_PLUGIN_ROOT}/workflows/auto-board-task.yaml` and lets
`workflow` orchestrate the three-step chain (`gh-project-sync` →
`task-agent` → `gh-project-sync`).

The non-obvious decision is **how** to invoke `workflow` from inside
this skill. Two options:

- **`Skill(skill="workflow", …)`** runs `workflow` *inline* in the
  current agent context. The tool list declared in
  `plugins/workflow/skills/workflow/SKILL.md` (`Bash`, `Read`,
  `Write`, `Glob`, `Grep`, `Agent`, `TaskCreate`, `TaskUpdate`) is
  the one in effect.
- **`Agent(...)`** spawns a fresh sub-agent. The sub-agent comes up
  with a different (more restricted) tool set than its parent — it
  does **not** inherit the wrapped skill's `tools:` frontmatter.

The first iteration (v1.28.0) used `Agent`. The `workflow` runner
failed inside the sub-agent: Phase 1 YAML parse, Phase 2 input
validation, Phase 3 plan resolution, and Phase 4 step loop all need
`Bash`, which the spawned sub-agent didn't have. The parent agent
ended up redoing the workflow itself, wasting a full sub-agent's
worth of context on a wrapper that never produced useful output.

## Decision

Invoke the `workflow` skill via the **`Skill` tool**, in the current
agent context.

Each of the workflow's three steps still spawns its own sub-agent
via the runner's own `Agent` invocation — but each of those
sub-agents triggers a *single skill* (`gh-project-sync` or
`task-agent`), whose narrower declared tool list comes up correctly.
The failure mode v1.28.0 hit was specific to running the multi-tool
*workflow runner itself* inside a generic sub-agent; running a single
skill inside a sub-agent works fine.

## Consequences

- `SKILL.md` declares only `tools: Bash` (just enough to expand
  `${CLAUDE_PLUGIN_ROOT}` to an absolute path). `Agent`, `Read`,
  `Write`, etc. are not declared — they're inherited via the `Skill`
  call.
- The eval suite explicitly asserts that the `Skill` tool is called
  with `skill=workflow` and that no `Agent` tool call happens, so
  the regression is caught at test time.
- Future skills that wrap another multi-tool skill should follow the
  same pattern — `Skill(skill=…)` inside the current context, **not**
  `Agent(...)` to spawn a sub-agent. The "sub-agent inherits parent's
  tools" intuition is wrong; the sub-agent has its own restricted
  tool list.
- If the `workflow` skill ever changes its declared tools, this skill
  keeps working without modification — the inheritance is automatic.

## Notes

It feels natural to reach for `Agent` when wrapping another skill
("isolate the sub-task in its own context"). It isn't right here.
The `workflow` skill's tool list is the contract; the only way to
honour it is to invoke `workflow` via `Skill` inside this same
agent. See `CHANGELOG.md` `[1.28.1]` for the full transition story.
