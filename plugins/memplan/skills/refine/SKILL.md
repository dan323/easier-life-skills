---
name: refine
description: >
  Decompose a coarse plan step into ≤5 atomic sub-steps (N.1…N.K), mark the parent
  refined=true, and recount the progress denominator. Idempotent. Trigger:
  "memplan refine", "refine step N".
tools: Bash, Read, Grep
---

# memplan/refine

Decomposes a coarse step into atomic sub-steps. The agent determines atomicity, drafts
sub-steps, writes via CLI, and updates the progress denominator to count only leaf steps.

**This skill is mutating.** All writes go through `memplan-cli.js`.

**Invocation modes:**
- `memplan/refine` — refines the current step (from `.memplan/progress`)
- `memplan/refine step=N` — refines step N
- `memplan/refine step=N depth=D` — refines sub-step N.X at depth D
- `memplan/refine force=true` — re-refine an already-refined step

---

## Phase 1: Read plan and identify target step

Read the plan and progress:

```bash
cat .memplan/plan.mem 2>/dev/null
cat .memplan/progress 2>/dev/null
```

Determine the target step:
1. If `step=N` was provided, use step N.
2. If not provided, read `.memplan/progress` and extract the current step number.
3. Verify the step exists in `plan.mem`.

Parse the step entry from `plan.mem`. A step entry has the format:
```
~TIMESTAMP +step:id=N,text=step-text,atomic=true|false,deps=X|Y,refined=true|false
```

**Idempotency check:**

If the step has `refined=true` and `force=true` was not specified: halt and output:
```
Step N already refined — use force=true to re-refine.
```

**Atomicity check:**

A step is **atomic** if all of these are true:
- Touches ≤2 files
- Contains 1 verb clause (single action)
- Has a single verifiable done-condition

If the step is already marked `atomic=true`, halt and output:
```
Step N is already atomic — no refinement needed.
```

If the step is atomic but not marked: mark it `atomic=true` and exit:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . plan.mem step-N-atomic "true"
```

---

## Phase 2: Draft sub-steps

Decompose the step into ≤5 atomic sub-steps. Each sub-step must:
- Touch ≤2 files
- Contain 1 verb clause
- Have 1 verifiable done-condition
- Be executable independently (no implicit ordering, unless `deps` is set)

Sub-step numbering: If refining step `N`, sub-steps are `N.1`, `N.2`, ..., `N.K`.
If refining sub-step `N.M`, sub-sub-steps are `N.M.1`, `N.M.2`, ..., `N.M.K`.

**Dependency inference:**

For each sub-step, determine if it depends on any prior sub-steps in the same decomposition.
If sub-step N.3 cannot start until N.1 and N.2 are complete, write `deps=N.1|N.2`.

**Atomic marking:**

Mark each sub-step `atomic=true` — by definition, the result of decomposition is atomic.

**Example decomposition:**

Original step 3: `text=implement-user-auth,atomic=false`

Sub-steps:
- `id=3.1,text=add-user-model-and-db-migration,atomic=true`
- `id=3.2,text=write-auth-middleware,deps=3.1,atomic=true`
- `id=3.3,text=add-login-endpoint,deps=3.1|3.2,atomic=true`
- `id=3.4,text=add-logout-endpoint,deps=3.2,atomic=true`
- `id=3.5,text=write-auth-integration-tests,deps=3.3|3.4,atomic=true`

Sub-steps 3.3 and 3.4 can run in parallel after 3.1 and 3.2 are complete.

---

## Phase 3: Write sub-steps

For each sub-step, append it to `plan.mem`:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" append . plan.mem step \
  "id=N.K,text=<text>,atomic=true,deps=<deps>"
```

Mark the parent step as `refined=true`:

```bash
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" set . plan.mem step-N-refined "true"
```

Halt on non-zero CLI exit.

---

## Phase 4: Update progress denominator

The progress denominator must count **only leaf steps** (steps that are not refined).

Read all steps from `plan.mem`:

```bash
cat .memplan/plan.mem
```

For each step, check:
1. Does it have `refined=true`? If yes, skip it (do not count).
2. Otherwise, count it as a leaf step.

Let `L` = the total number of leaf steps.

Update the progress denominator:

```bash
# Read current progress (e.g. "3/10 | step 3 text")
# Extract numerator M (completed steps)
# Write updated progress: M/L
node "$CLAUDE_PLUGIN_ROOT/bin/memplan-cli.js" progress . <M> <L> "<current-step-text>"
```

**Leaf counting rule:**

Only steps **without** `refined=true` are counted. If step 3 is refined into 3.1–3.5,
the denominator counts 3.1, 3.2, 3.3, 3.4, 3.5 (5 steps), not 6 (3 + 3.1–3.5).

Staleness propagation is automatic on every CLI write — no manual `stale-mark` calls.

---

## Phase 5: Confirm

Print:

```
Step N refined into N.1–N.K (<K> sub-steps). Progress denominator updated: <M>/<L>.
```

Do not print the full sub-step list unless the user asks.
