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
    skill: string                  # required — name of an installed skill in the marketplace
    description: string            # optional — surfaced in the panel
    args:                          # optional — free-form args object passed to the step's skill
      <key>: <value>               # values may use ${{ … }} interpolation
    inputs:                        # optional — synonym for `args`, kept for readability
      <key>: <value>
```

Steps run **strictly sequentially in the order they appear**. There is
no parallelism, no conditional branching, and no retries in v1; see
**Deferred to v2** at the bottom.

### Step identifiers

`id` must match `^[a-z][a-z0-9-]*[a-z0-9]$` and must be unique within
the workflow. The id is used in three places:

- As the directory name under `$WORKFLOW_DIR` where the step's output
  lands (`$WORKFLOW_DIR/<id>/output.json`).
- As the key in `steps.<id>.output` for downstream interpolation.
- As the heading printed in the final summary report.

### Interpolation: `${{ … }}`

Any string value (in `args:`, `inputs:`, or `default:`) may contain one
or more `${{ expr }}` expressions. Recognised expressions:

| Expression                | Resolves to                                                            |
|---------------------------|------------------------------------------------------------------------|
| `inputs.<name>`           | The workflow-level input value (caller-supplied, or its `default:`)    |
| `steps.<id>.output`       | The captured output of a prior step — see **Step output** below        |
| `steps.<id>.output.<key>` | A field of the prior step's JSON output (only if it wrote structured JSON) |

Interpolation is **whole-string substitution when the entire value is
a single `${{ … }}`** — in that case the value's type is preserved (a
JSON object or array survives as-is). When `${{ … }}` is embedded in
a longer string, the substitution stringifies the value.

Forward references are not allowed: a step may only reference earlier
steps. The runner validates this before execution.

### Step output

Every step the runner spawns has access to a `$WORKFLOW_OUTPUT`
environment variable. Skills that want to participate "well" in
workflows should write a JSON blob to that path at the end of their
run. The runner then exposes it as `steps.<id>.output`.

Skills that don't write to `$WORKFLOW_OUTPUT` still compose: the
runner falls back to capturing the step's stdout as a string, and
`steps.<id>.output` is that string. The fallback is intentionally
permissive — older skills don't need to opt in to be reachable, they
just produce stringy output.

### Inputs

Workflow inputs are caller-supplied at invocation time. The runner
accepts inputs as `key=value` pairs in the invocation prompt, the
same grammar the `scaffold` skill uses. Missing required inputs (no
`default:` and not supplied) halt the run before the first step.

### Error handling

If any step exits non-zero, the runner:

1. Halts immediately — subsequent steps do not run.
2. Writes a `workflow-output.json` that records the failed step id
   and the captured stderr (truncated to 2 KB).
3. Exits with a non-zero status itself so any caller (e.g. another
   workflow, or a CI script) can detect the failure.

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

On failure the trailing `steps[]` entries are absent; the failed step
carries `"status": "failed"` and a `"stderr"` field.

## Deferred to v2

The following are intentionally out of scope for the first iteration:

| Feature                 | Why deferred                                                                                                |
|-------------------------|-------------------------------------------------------------------------------------------------------------|
| Conditional steps (`if:`) | Adds an expression evaluator surface — defer until linear execution proves useful.                          |
| Parallel fan-out          | Requires resolving cross-branch dependencies; sequential covers the high-value cases first.                 |
| Retries / backoff         | Encourages hiding flaky skills instead of fixing them; revisit once we have telemetry on real failure modes.|
| Secrets injection         | Needs a secrets-store contract; for v1, secrets are passed as inputs by the caller.                          |
| `outputs:` block          | Top-level workflow outputs (a curated subset of step outputs) are a v2 refinement once nested compositions exist. |
