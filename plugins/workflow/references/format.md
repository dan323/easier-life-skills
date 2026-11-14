# Workflow YAML Format

This is the authoritative specification for `.yaml` files inside any
`plugins/<plugin>/workflows/` directory. The `workflow` runner skill
reads these files and executes them step-by-step; the build pipeline
reads them to surface workflows as a marketplace entity.

## Minimum viable workflow

```yaml
name: Document and Deploy
description: Brainstorm features, document them, and open a PR.
steps:
  - id: ideas
    skill: brainstorm
  - id: docs
    skill: document-project
```

Top-level `name`, `description`, and at least one entry under `steps`
are required. Everything else is optional.

## Full schema

```yaml
name: string                       # required — human-readable workflow name
description: string                # required — one-line summary
category: string                   # optional — overrides the parent plugin's category
inputs:                            # optional — declared workflow inputs
  - name: string                   # required per input
    default: any                   # optional — used when caller omits the input
    description: string            # optional — surfaced in the marketplace panel

steps:                             # required — at least one step
  - id: string                     # required — unique kebab-case id within this workflow
    skill: string                  # required (except on a loop block) — name of an installed skill
    description: string            # optional — surfaced in the panel
    agent: string                  # optional — agent type the step runs as (default: claude)
    inline: boolean                # optional — true runs the skill in the runner's own context
    args:                          # optional — free-form args object passed to the step's skill
      <key>: <value>               # values may use ${{ … }} interpolation
    inputs:                        # optional — synonym for `args`, kept for readability
      <key>: <value>
    if: expression                 # optional — skip the step when false
    for_each: expression | list    # optional — run once per element; exposes `item` / `index`
    until: expression              # optional — repeat until true; requires max_iterations
    max_iterations: integer        # optional (required with `until`) — loop cap, 1–100
    retry: integer                 # optional — extra attempts after a failure, 0–5 (default 0)
    continue_on_error: boolean     # optional — keep going after this step fails (default false)
    steps: [ … ]                   # loop block: inner steps repeated together — replaces `skill`
```

Steps run **strictly sequentially in the order they appear**. There is
no parallelism; see **Deferred to v2** at the bottom. A workflow that
uses none of the optional control fields behaves exactly as it did
before they existed.

Write a block list under a key (such as `for_each`) indented **two
spaces deeper than the key**; the runner's minimal YAML parser does not
accept the flush-left style.

### Step identifiers

`id` must match `^[a-z][a-z0-9-]*[a-z0-9]$` and must be unique within
the workflow. The id is used in three places:

- As the directory name under `$WORKFLOW_DIR` where the step's output
  lands (`$WORKFLOW_DIR/<id>/output.json`).
- As the key in `steps.<id>.output` for downstream interpolation.
- As the heading printed in the final summary report.

### Where a step runs: `agent` and `inline`

By default the runner spawns a fresh `claude` subagent for each step
and tells it to invoke the step's skill. Two optional fields change
that:

- `agent: <type>` — spawn this agent type instead of `claude`. Use it
  when a dedicated agent definition (e.g. one with a narrower tool
  list) fits the step better than the catch-all. The type must be one
  the session knows (project `.claude/agents/`, user agents, or a
  plugin agent as `<plugin>:<agent>`) and must have the `Skill` tool.
- `inline: true` — run the skill in the runner's own conversation, no
  subagent. Cheap, since there is no fresh context to rebuild. Use it for small,
  mechanical steps (syncing a file, a single API call). Avoid it for
  long skills: their instructions and tool output then stay in the
  runner's context for every later step.

`agent` and `inline: true` are mutually exclusive; the runner rejects a
step that sets both. Neither field changes how outputs are captured.

### Interpolation: `${{ … }}`

Any string value (in `args:`, `inputs:`, or `default:`) may contain one
or more `${{ expr }}` expressions. Recognised expressions:

| Expression                | Resolves to                                                            |
|---------------------------|------------------------------------------------------------------------|
| `inputs.<name>`           | The workflow-level input value (caller-supplied, or its `default:`)    |
| `steps.<id>.output`       | The captured output of a prior step — see **Step output** below        |
| `steps.<id>.output.<key>` | A field of the prior step's JSON output (only if it wrote structured JSON) |
| `steps.<id>.outputs`      | A looped step's per-iteration outputs, as an array (`.outputs.0`, …)   |
| `steps.<id>.status`       | `success`, `failed` or `skipped`                                       |
| `steps.<id>.attempts` / `.iterations` | Tries the last run took / runs the step made           |
| `item`, `item.<key>`      | The current element inside a `for_each` step's `args`                  |
| `index`                   | 0-based position inside a `for_each` or `until` step                   |

Interpolation is **whole-string substitution when the entire value is
a single `${{ … }}`** — in that case the value's type is preserved (a
JSON object or array survives as-is). When `${{ … }}` is embedded in
a longer string, the substitution stringifies the value.

Forward references are not allowed: a step may only reference earlier
steps. The runner validates this before execution.

### Conditions: `if`

```yaml
- id: fix
  skill: review-fixer
  if: ${{ steps.review.output.comments }}        # skip when there are none
- id: report
  skill: notify
  if: ${{ steps.fix.status == "skipped" || !inputs.quiet }}
```

`if` takes one expression (wrapped in `${{ … }}` or bare) and is
evaluated just before the step. A false result records the step as
`skipped` — not failed — and `steps.<id>.output` is empty. There is no
`else`: write the negated condition (`if: ${{ !… }}`) on another step.
`item` and `index` are not available in `if`.

#### Expression language

Deliberately minimal and deterministic — no arithmetic, no string
operations, no function calls, no code execution (rationale: ADR 0001 in the skill's `adr/`
folder).

| Syntax                  | Meaning                                                             |
|-------------------------|---------------------------------------------------------------------|
| references              | `inputs.x`, `steps.a.output.k`, `steps.a.status`, `item.k`, `index` |
| literals                | `"text"`, `'text'`, `42`, `true`, `false`, `null`                   |
| `==`, `!=`              | Equality. `"3" == 3` is true (inputs arrive as strings); `null` equals only `null` |
| `<`, `<=`, `>`, `>=`    | Numeric ordering (numeric strings count). A missing or non-numeric side is false — `"a" < "b"` is false |
| `!`, `&&`, `\|\|`, `( )` | Negation, and, or (`!` binds tightest, then `&&`, then `\|\|`)       |

A value is **falsy** when it is `null`, `false`, `0`, `""`, `[]` or
`{}`; everything else is truthy (so the string `"false"` is truthy —
compare explicitly). `&&` and `||` return one of their operands, like
JavaScript. A reference to a missing key, or to a skipped step's
output, is `null`.

### Loops: `for_each`, `until`

```yaml
- id: implement
  skill: task-agent
  for_each: ${{ steps.pull.output.cards }}       # or a literal YAML list
  max_iterations: 5                              # optional cap for for_each
  args:
    task: ${{ item.title }}
    position: ${{ index }}

- id: checks
  skill: run-checks
  until: ${{ steps.checks.status == "success" }}
  max_iterations: 3
  continue_on_error: true
```

- **`for_each`** runs the step once per element, in order. The value
  must evaluate to a list (a JSON-array string is accepted). Each run
  sees `item` and `index`. An empty list runs nothing and succeeds.
- **`until`** runs the step at least once, then re-runs it until the
  condition is true. The condition may read the step's own latest run
  (`steps.<its own id>.status`, `.output`) and `index`.
- **Caps are mandatory.** `until` requires `max_iterations`; the
  validator rejects it otherwise. `max_iterations` is 1–100. For
  `for_each` it is optional, but a list longer than the cap (or than
  100) is an error — never silently truncated. If an `until` loop uses
  its last iteration with the condition still false, the step **fails**
  with `reason: "max_iterations reached"`.
- **One loop per step.** `for_each` and `until` cannot be combined on a
  step. To repeat *several* steps together, use a **loop block** (next
  section). Loops never nest (v1).
- **Outputs.** Iteration *k* writes to `<id>/<k>/output.json`.
  `steps.<id>.output` is the **latest** iteration's output;
  `steps.<id>.outputs` is the array of all of them. The array is
  written when the loop ends, so only *later* steps can read it.

### Loop blocks: repeat several steps together

A step with a `steps:` list and `for_each` or `until` is a **loop
block**. Every pass runs its inner steps in order; after each pass the
loop condition is checked. The canonical case is *review, fix, repeat
until the review is clean*:

```yaml
- id: review-loop
  until: ${{ steps.review.output.findings == 0 }}
  max_iterations: 5
  steps:
    - id: review
      skill: pr-reviewer
      agent: general-purpose           # each inner step has its own agent / inline
      retry: 1
    - id: fix
      skill: review-fixer
      agent: claude
      if: ${{ steps.review.output.findings > 0 }}
```

- **The block** carries `id`, `for_each` **or** `until` (+ mandatory
  `max_iterations`), and optionally `if`, `description` and
  `continue_on_error`. It has no `skill`, `args`, `agent`, `inline` or
  `retry` of its own — those belong on the inner steps.
- **Inner steps** are ordinary steps (`skill`, `args`, `agent`, `inline`,
  `if`, `retry`, `continue_on_error`). They cannot have `for_each`,
  `until`, `max_iterations` or `steps`, so blocks do not nest. Inner `if`
  is evaluated on **every pass**, and may use `index` (and `item` in a
  `for_each` block).
- **Ids** are global: an inner step's id must be unique across the whole
  workflow, and downstream steps reference it as `steps.<inner>.…`.
- **Reading results.** `steps.<inner>.output` / `.status` always read the
  **latest pass**. A step skipped on the latest pass has `status`
  `skipped` and an empty `output` — never a stale one from an earlier
  pass. `steps.<inner>.outputs` is the array of that step's output on
  every pass (`null` where it was skipped), readable by steps after the
  block. Inside the block, a step may read only inner steps listed
  **before** it (the previous pass is not exposed to earlier steps).
- **The block itself** exposes `steps.<block>.status` (`success` /
  `failed` / `skipped`) and `steps.<block>.iterations`; it has no
  `output`. The `until` condition runs after each pass and may read any
  inner step, `index`, and the block's own `status` / `iterations`.
- **Stopping.** `until` true → the block succeeds. `for_each` ends when
  the list is exhausted. `max_iterations` passes with `until` still false
  → the block **fails** with `reason: "max_iterations reached"`; the
  block's own `continue_on_error: true` turns that into `partial` instead
  of halting. An inner step that fails without its own
  `continue_on_error` halts the run, exactly as a failing top-level step.
- **On disk.** Pass *k* of inner step *s* lives in
  `<block>/<k>/<s>/` (output, stdout, stderr); the latest pass is also
  mirrored to `<s>/`, and `<s>/outputs.json` is written when the block
  ends.

For `pr-reviewer` to drive the loop it must report a count: it writes
`{"findings": N, …}` to `$WORKFLOW_OUTPUT` (open findings: newly posted
plus still-unresolved earlier ones), so `findings == 0` means clean. Any
skill that writes a comparable field can drive a loop the same way.

### Failure handling: `retry`, `continue_on_error`

- **`retry: N`** re-runs a failed run up to N more times (max 5), with
  freshly rendered arguments, before treating it as failed. Retries are
  explicit and capped so a flaky step is visible in the summary
  (`attempts`) rather than hidden.
- **`continue_on_error: true`** records the failure and carries on
  instead of halting: in a loop, with the next iteration; otherwise
  with the next step. The step's status is `failed`, and the workflow's
  status becomes `partial` (see **Output**).

With neither field, the default is unchanged: halt on the first failure.

### Step output

**A skill used in a workflow step should give structured output.**
Every step the runner spawns has access to a `$WORKFLOW_OUTPUT`
environment variable. At the end of its run the skill writes a JSON
object to that path. The runner exposes the object as
`steps.<id>.output`, and **each key of the object is addressable as
`steps.<id>.output.<key>`** — in `args`, `if`, `for_each` and `until`:

```bash
# in the skill (only when running as a workflow step)
if [ -n "$WORKFLOW_OUTPUT" ]; then
  printf '{"pr_url":"%s","branch":"%s"}' "$PR_URL" "$BRANCH" > "$WORKFLOW_OUTPUT"
fi
```

```yaml
- id: run-task
  skill: task-agent                      # writes {"pr_url": …, "branch": …}
- id: review
  skill: pr-reviewer
  args:
    pr_url: ${{ steps.run-task.output.pr_url }}      # steps.<step-id>.output.<output-key>
    branch: ${{ steps.run-task.output.branch }}
```

The keys are a contract between the skill that writes them and the
steps that read them: the runner does **not** infer them, and
expressions are evaluated by code against the file exactly as written.
Document a skill's output keys in its `SKILL.md` (`task-agent`:
`pr_url`, `repo`, `branch`; `pr-reviewer`: `findings`, `posted`,
`already_raised`, `review_url`, `commit`). A key the skill did not write,
or a misspelt one, is `null` — silently falsy in an `if` or `until` — so
use the exact names. Nested objects and arrays work too
(`steps.<id>.output.items.0.name`). Keep the JSON small: counts, ids,
URLs and paths, not whole reports.

Skills that don't write to `$WORKFLOW_OUTPUT` still compose: the
runner falls back to capturing the step's stdout as a string, and
`steps.<id>.output` is that string (no keys). The fallback is
intentionally permissive — older skills don't need to opt in to be
reachable — but it is only useful for passing text along or testing
whether it is empty; anything a later step needs to branch on or
loop on should be structured output.

### Inputs

Workflow inputs are caller-supplied at invocation time. The runner
accepts inputs as `key=value` pairs in the invocation prompt, the
same grammar the `scaffold` skill uses. Missing required inputs (no
`default:` and not supplied) halt the run before the first step.

### Error handling

If a step fails (exits non-zero, or exhausts its `retry` attempts)
and does not set `continue_on_error: true`, the runner:

1. Halts immediately — subsequent steps do not run.
2. Writes a `workflow-output.json` that records the failed step id
   and the captured stderr (truncated to 2 KB).
3. Exits with a non-zero status itself so any caller (e.g. another
   workflow, or a CI script) can detect the failure.

A step skipped by `if` is not a failure.

### Discovery and naming

The build pipeline discovers a workflow when:

- Its file lives under `plugins/<plugin>/workflows/` and ends in
  `.yaml` or `.yml`, **and**
- Its YAML has both a top-level `name:` and `description:`.

The workflow's `name` (slugified by the build) becomes the marketplace
identifier. The category inherits from the parent plugin's `plugin.json`
unless the workflow itself sets `category:`.

A workflow may also reference skills hosted in **any** marketplace,
not only the parent plugin's. The runner resolves `steps[].skill` by
name against the loaded `skills_index.json`.

## Output

When the runner finishes (success or failure), it writes a summary
to `$WORKFLOW_DIR/workflow-output.json` with the shape:

```json
{
  "workflow": "document-and-deploy",
  "status": "success",
  "started_at": "2026-05-13T11:00:00.000Z",
  "finished_at": "2026-05-13T11:08:31.421Z",
  "inputs": { "feature_count": 3 },
  "steps": [
    { "id": "ideas",  "skill": "brainstorm",       "status": "success", "output_path": "ideas/output.json" },
    { "id": "docs",   "skill": "document-project", "status": "success", "output_path": "docs/output.json"  },
    { "id": "pr",     "skill": "task-agent",       "status": "success", "output_path": "pr/output.json"    }
  ]
}
```

Top-level `status` is `success`, `partial` (a step failed but had
`continue_on_error`, so the run carried on) or `failed` (the run
halted). Every step entry has a `status` of `success`, `failed` or
`skipped`, and may carry `attempts`, `iterations`, `reason`
(e.g. `"condition false"`, `"max_iterations reached"`),
`outputs_path` (looped steps) and, when failed, `stderr`. A loop block's
entry has `"skill": null` and its inner steps nested under `steps`.

When the run halts, the steps after the failed one are recorded as
`"status": "skipped"` with `"reason": "earlier step failed"`; the
failed step carries `"status": "failed"` and a `"stderr"` field.

## Deferred to v2

The following are intentionally out of scope for now:

| Feature                 | Why deferred                                                                                                |
|-------------------------|-------------------------------------------------------------------------------------------------------------|
| Parallel fan-out          | Requires resolving cross-branch dependencies; sequential covers the high-value cases first.                 |
| Nested loop blocks / `else` blocks | A block repeats flat inner steps; nesting blocks (and `else`, expressed today as a negated `if`) would complicate the file layout and the summary. |
| Backoff between retries   | Retries are immediate and capped at 5; add delays only if a real flaky-service case needs them.             |
| Richer expressions        | `contains`, string operations, arithmetic and functions: add only when a real workflow cannot be written without them. |
| Secrets injection         | Needs a secrets-store contract; for v1, secrets are passed as inputs by the caller.                          |
| `outputs:` block          | Top-level workflow outputs (a curated subset of step outputs) are a v2 refinement once nested compositions exist. |
