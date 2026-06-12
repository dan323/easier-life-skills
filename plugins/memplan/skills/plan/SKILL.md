---
name: plan
description: >
  Create or update plan.mem and slice.mem (≤20 numbered steps with inferred
  dependencies), initialise progress, write risk files when needed. Trigger:
  "memplan plan", "plan this task".
tools: Bash, Read, Grep, TaskCreate, TaskUpdate, EnterPlanMode, ExitPlanMode
---

# memplan/plan

Creates or updates `plan.mem` + `plan.plan.md` and `slice.mem` + `slice.plan.md` for the
current task. Checks accumulated context before writing. Infers step dependencies to surface
parallelisable frontiers.

**This skill is mutating.** All writes are via `memplan-cli.js`. Sub-agents must be
in plan mode (see Phase 2 note).

---

## Phase 1: Read accumulated context

Read each file before drafting the plan. Use the findings to avoid repeating past failures
and to anchor steps to known entities.

```bash
cat .memplan/memory/failures.mem 2>/dev/null
cat .memplan/risk.mem 2>/dev/null
cat .memplan/memory/entities.mem 2>/dev/null
cat .memplan/decisions/log.mem 2>/dev/null
```

Note any relevant failures, open risks, known entities, and prior decisions. These constrain
the plan — do not write steps that repeat a known failure without a changed approach.

> **Sub-agent rule**: any agent spawned to help analyse the task or draft steps must be
> launched in plan mode via `EnterPlanMode`. This prevents a planning sub-agent from
> writing files while the outer skill is still deciding.

---

## Phase 2: Draft the plan

Produce a numbered list of steps for the task. Rules:

- Maximum 20 steps. If more are needed, group related steps or defer to a follow-on plan.
- Each step has a short `text` (kebab-case description, no spaces) and an optional `deps`
  list of step IDs it cannot start until complete (pipe-separated, e.g. `deps=2|3`).
- Steps with no predecessor get no `deps` field.
- Two steps executable in parallel after a shared predecessor get no `deps` on each other.
- Identify `atomic=true` steps (touch ≤2 files, one verb clause, single verifiable done-condition).

The slice (ready frontier) is computed automatically by `plan-write` in Phase 3 —
do not draft it by hand.

**Risk check**: If the task touches ≥3 files or any irreversible operation (delete, drop,
force-push, migrate), set `needs-risk=true` and draft risk content for risk.mem/risk.plan.md:
- `what-could-break` — one line
- `irreversible` — one line (or "none")
- `verify-first` — one line

---

## Phase 3: Write plan files

One CLI call writes everything — plan.mem, progress, slice.mem (ready frontier),
optional risk.mem — and propagates staleness automatically:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" plan-write . << 'EOF'
{
  "title": "<task-title>",
  "steps": [
    { "id": "1", "text": "<text>", "atomic": true },
    { "id": "2", "text": "<text>", "deps": "1", "atomic": true }
  ],
  "risk": {
    "what-could-break": "<text>",
    "irreversible": "<text>",
    "verify-first": "<text>"
  }
}
EOF
```

Omit the `"risk"` key when `needs-risk=false`. The command prints
`plan-write: <N> steps, <K> ready` on success. Halt and report error on non-zero exit.

---

## Phase 4: Confirm

Print:

```
Plan written: <N> steps, <K> on ready frontier.
```

If risk was written, append: `Risk file written — review before executing irreversible steps.`

Do not print the full step list unless the user asks.
