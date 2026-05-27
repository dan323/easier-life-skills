---
name: act
description: >
  Execute a single plan step: pre-flight checks (missing steps, unmet deps, stale reads),
  run the step, update progress, record entities/code-map, record failures, propagate
  staleness to dependents. All I/O via memplan-cli.js. Hard-halts on pre-flight failures.
  Trigger phrases: "memplan act", "execute next step", "run step N", "do the next step",
  "act on step".
tools: Bash, Read, Grep, Edit, Write, TaskCreate, TaskUpdate
---

# memplan/act

Executes a single plan step with pre-flight safety checks and post-write staleness
propagation. The agent provides reasoning; the CLI handles all file mechanics.

**This skill is mutating.** It writes progress, code-map, entities, failures, and
staleness entries. All file operations go through `memplan-cli.js`.

---

## Phase 1: Pre-flight checks (hard halts)

Run these checks in order. Any failure halts the skill immediately — do not execute
the step until all three pass.

**Check 1 — steps.mem exists:**

```bash
test -f .memplan/steps.mem || echo "MISSING"
```

If `MISSING`: halt and output:
`⚠ Cannot act — .memplan/steps.mem is absent. Run memplan/plan first.`

**Check 2 — deps satisfied:**

Read the target step from `.memplan/steps.mem`. If the step has a `deps=` field, verify
each listed dep ID is complete by reading `.memplan/progress`:

```bash
cat .memplan/steps.mem
cat .memplan/progress
```

For each dep that is not yet complete: halt and output:
`⚠ Step <N> cannot start — deps [<X>, <Y>] not complete.`

**Check 3 — no stale reads:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-list .
```

If any unresolved stale entry affects a file this step will read: halt and output:
`⚠ <file> is stale — resolve via memplan/inbox or memplan/review before proceeding.`

To resolve inline: read the stale file and all its sources from `deps.mem`, update the
file if needed, then:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-resolve . "<file>"
```

Resume once resolved.

---

## Phase 2: Execute the step

Read the current step text from `.memplan/steps.mem` and `.memplan/progress`. Confirm
the step number matches what the user intends.

Execute the step. Use the standard project tools (Edit, Write, Bash, etc.) as required
by the step content. Do not modify any `.memplan/` files manually during execution —
use the CLI in Phase 3 for all `.memplan/` writes.

If the step fails (command exits non-zero, tool returns error, or the expected outcome
is not reached): record the failure in Phase 3 and stop execution.

---

## Phase 3: Update memplan state

**Update progress:**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" progress . <M> <N> "<step-text>"
```

Where `<M>` is the completed step count and `<N>` is the total.

**Record files touched in code-map:**

For each file created or modified during the step:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/code-map.mem "file" "path=<path>,purpose=<one-word-purpose>,touched=~<DATE>"
```

**Record new entities discovered:**

For each new concept, symbol, or module encountered that is not already in `entities.mem`:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/entities.mem "entity" "name=<name>,type=<type>,desc=<description>"
```

Types: `file`, `function`, `class`, `module`, `config`, `concept`.

**Record failure (if step failed):**

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/failures.mem "failure" "cmd=<command>,reason=<reason>"
```

If the cause is unknown, also record an open question:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . memory/questions.mem "question" "id=$(date -u +%Y-%m-%dT%H:%MZ),text=<question>,status=open"
```

Halt on non-zero CLI exit.

---

## Phase 4: Post-write staleness propagation

For every `.memplan/` file written or affected this step, look up dependents in
`deps-closure.mem` and mark them stale:

```bash
cat .memplan/deps-closure.mem
```

For each dependent file whose source was modified:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" stale-mark . "<dependent-file>" "<source-file>"
```

Skip staleness propagation if the step made no changes to files tracked in `deps.mem`.

---

## Phase 5: Confirm

If the step succeeded, print:
`Step <N> complete. Progress: <M>/<total>.`

If the step failed, print:
`Step <N> failed — failure recorded. Resolve before retrying.`
