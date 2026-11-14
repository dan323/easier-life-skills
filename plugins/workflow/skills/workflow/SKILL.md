---
name: workflow
description: >
  Run a multi-step skill workflow declared in a workflow YAML file.
  Use when the user asks to "run the workflow at <path>", "execute
  workflow <name>", "run the <name> workflow", "chain these skills",
  "compose <skill-a> and <skill-b>", or supplies a path to a `.yaml`
  workflow definition. Arguments follow a `key=value` grammar: the
  first positional value is the workflow file path, remaining
  `key=value` pairs are workflow inputs. The runner executes steps
  in order, supports `if` conditions, `for_each` / `until` loops
  (including loop blocks that repeat several steps together, e.g. review
  then fix until the review is clean), `retry` and `continue_on_error`,
  halts on the first unhandled failure, and writes a summary JSON to
  the workflow directory.
tools: Bash, PowerShell, Read, Write, Glob, Grep, Agent, TaskCreate, TaskUpdate
---

# Workflow Runner

Execute a workflow YAML file step-by-step. Each step runs one skill,
by default in a fresh subagent (`claude` type, or the step's `agent:`),
or in this conversation when the step sets `inline: true`. The runner
captures each step's output and threads it forward
through `${{ steps.<id>.output }}` interpolation. A step can be
skipped (`if`), repeated (`for_each`, `until`), retried (`retry`) or
allowed to fail (`continue_on_error`); a **loop block** (a step with its
own `steps:`) repeats a group of steps together. The full format is
specified in [`references/format.md`](../../references/format.md) —
read that file first if the user's workflow uses features that aren't
in the example below.

**This skill writes files.** It writes a `workflow-output.json` and
per-step output captures inside `$WORKFLOW_DIR` (default
`./.workflow-runs/<name>-<timestamp>/`). It does not modify the
workflow definition itself.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call
`TaskUpdate` (status `in_progress`) when you begin a phase and
`TaskUpdate` (status `completed`) when you finish it.

- Parse arguments
- Load and validate workflow YAML
- Resolve inputs and step plan
- Execute steps in order (conditions, loops, retries)
- Write summary and report

---

## Phase 1: Parse arguments

The invocation is one positional path (the workflow file) followed by
zero or more `key=value` pairs. Quote values that contain spaces with
double quotes.

```text
workflow path/to/document-and-deploy.yaml feature_count=5
```

Use the parser below — it is intentionally similar to the
`scaffold` skill's parser so contributors recognise the grammar.

```bash
python3 - <<'EOF'
import json, re, shlex, sys

# Substitute the user's invocation text below.
RAW = """<<USER_ARGS>>"""

result = {"workflow_path": None, "inputs": {}, "errors": []}
try:
    tokens = shlex.split(RAW)
except ValueError as e:
    result["errors"].append(f"Could not parse arguments — {e}. Quote values with spaces.")
    tokens = []

positional = []
for tok in tokens:
    if "=" in tok:
        key, _, value = tok.partition("=")
        if not re.match(r"^[a-z_][a-z0-9_]*$", key):
            result["errors"].append(f"Input name '{key}' must be lowercase letters/digits/underscores.")
            continue
        result["inputs"][key] = value
    else:
        positional.append(tok)

if not positional:
    result["errors"].append("Missing workflow file path. Usage: workflow <path.yaml> [key=value …]")
elif len(positional) > 1:
    result["errors"].append(f"Expected one positional workflow path; got {positional}.")
else:
    result["workflow_path"] = positional[0]

with open("/tmp/workflow-args.json", "w") as f:
    json.dump(result, f, indent=2)
print(json.dumps(result, indent=2))
EOF
```

If the parser reports any `errors`, stop and surface them. Do not
guess a path.

---

## Phase 2: Load and validate workflow YAML

Read the workflow file via the `Read` tool first so the user sees its
contents in the transcript, then parse and validate it with the
Python helper. The helper uses only the standard library — no
`pyyaml` dependency, the parser only needs to handle the workflow
subset of YAML described in `references/format.md`.

```bash
python3 - <<'EOF'
import json, re, sys

args = json.load(open("/tmp/workflow-args.json"))
path = args["workflow_path"]
try:
    src = open(path).read()
except OSError as e:
    print(json.dumps({"errors": [f"Cannot read workflow file: {e}"]}))
    sys.exit(1)

# ───── Minimal YAML parser tailored to the workflow schema ─────
#
# Supports: top-level scalars, single-level `inputs:` list of maps,
# `steps:` list of maps with nested `args:` / `inputs:` maps. Quoted
# strings ("…", '…') survive verbatim; unquoted scalars are stripped.
# Comments (`# …`) and blank lines are ignored.

INDENT = re.compile(r"^( *)(.*)$")

def lines(text):
    out = []
    for raw in text.splitlines():
        m = INDENT.match(raw)
        if not m:
            continue
        indent, rest = m.group(1), m.group(2).rstrip()
        # Strip end-of-line comments unless inside a quoted string.
        in_quote = False; q = None; trimmed = []
        for ch in rest:
            if in_quote:
                trimmed.append(ch)
                if ch == q:
                    in_quote = False
            else:
                if ch in ('"', "'"):
                    in_quote = True; q = ch; trimmed.append(ch)
                elif ch == "#":
                    break
                else:
                    trimmed.append(ch)
        rest = "".join(trimmed).rstrip()
        if not rest:
            continue
        out.append((len(indent), rest))
    return out

def unquote(s):
    s = s.strip()
    if (len(s) >= 2) and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        return s[1:-1]
    if s.lower() == "true":  return True
    if s.lower() == "false": return False
    if re.fullmatch(r"-?\d+", s):       return int(s)
    if re.fullmatch(r"-?\d+\.\d+", s):  return float(s)
    return s

def parse_block(tokens, start, base_indent):
    """Parse a YAML block starting at tokens[start] with given indent.
       Returns (value, next_index). Auto-detects map vs list."""
    if start >= len(tokens):
        return None, start
    indent, rest = tokens[start]
    if rest.startswith("- "):
        items = []
        i = start
        while i < len(tokens):
            ind, r = tokens[i]
            if ind != base_indent or not r.startswith("- "):
                break
            first_kv = r[2:].strip()
            # `- key: value` starts a map at indent base_indent+2
            if ":" in first_kv:
                key, _, val = first_kv.partition(":")
                pseudo = [(base_indent + 2, f"{key}:{val}")]
                # Pull in continuation lines that are children of this list item
                j = i + 1
                while j < len(tokens) and tokens[j][0] > base_indent:
                    pseudo.append(tokens[j])
                    j += 1
                item, _ = parse_block(pseudo, 0, base_indent + 2)
                items.append(item)
                i = j
            else:
                items.append(unquote(first_kv))
                i += 1
        return items, i
    # Map
    mapping = {}
    i = start
    while i < len(tokens):
        ind, r = tokens[i]
        if ind != base_indent or r.startswith("- "):
            break
        if ":" not in r:
            return None, i
        key, _, val = r.partition(":")
        key = key.strip()
        val = val.strip()
        if val == "":
            child, ni = parse_block(tokens, i + 1, ind + 2 if i + 1 < len(tokens) else ind)
            # if no child, treat as null
            mapping[key] = child if child is not None else None
            i = ni
        else:
            mapping[key] = unquote(val)
            i += 1
    return mapping, i

toks = lines(src)
parsed, _ = parse_block(toks, 0, 0)

# ───── Validation ─────
errors = []
if not isinstance(parsed, dict):
    errors.append("Top level of workflow YAML must be a map.")
else:
    for required in ("name", "description", "steps"):
        if required not in parsed:
            errors.append(f"Missing required top-level field: {required}.")
    steps = parsed.get("steps") or []
    if not isinstance(steps, list) or len(steps) == 0:
        errors.append("`steps` must be a non-empty list.")
    else:
        seen_ids = set()
        slug_re = re.compile(r"^[a-z][a-z0-9-]*[a-z0-9]$")
        for idx, step in enumerate(steps):
            if not isinstance(step, dict):
                errors.append(f"Step {idx} is not a map."); continue
            sid = step.get("id")
            if not sid or not slug_re.match(str(sid)):
                errors.append(f"Step {idx} has invalid id '{sid}'. Must be kebab-case.")
            elif sid in seen_ids:
                errors.append(f"Duplicate step id '{sid}'.")
            else:
                seen_ids.add(sid)
            if not step.get("skill") and "steps" not in step:   # a loop block groups inner steps instead
                errors.append(f"Step '{sid or idx}' missing `skill`.")
            if "agent" in step and (not isinstance(step["agent"], str) or not step["agent"].strip()):
                errors.append(f"Step '{sid or idx}': `agent` must be a non-empty agent type name.")
            if "inline" in step and not isinstance(step["inline"], bool):
                errors.append(f"Step '{sid or idx}': `inline` must be true or false.")
            if step.get("inline") is True and "agent" in step:
                errors.append(f"Step '{sid or idx}': `inline: true` and `agent` are mutually exclusive.")

# ───── Resolve inputs ─────
defaults = {}
required_inputs = []
for inp in (parsed.get("inputs") or []):
    if not isinstance(inp, dict): continue
    nm = inp.get("name")
    if "default" in inp:
        defaults[nm] = inp["default"]
    else:
        required_inputs.append(nm)

supplied = args["inputs"]
resolved = {**defaults, **supplied}
for nm in required_inputs:
    if nm not in resolved:
        errors.append(f"Missing required input '{nm}'. Supply as `{nm}=...`.")

with open("/tmp/workflow-parsed.json", "w") as f:
    json.dump({"workflow": parsed, "inputs": resolved, "errors": errors}, f, indent=2)

print(json.dumps({"workflow": parsed, "inputs": resolved, "errors": errors}, indent=2))
if errors:
    sys.exit(1)
EOF
```

Then validate the step fields and every expression (`if`, `for_each`,
`until`, `max_iterations`, `retry`, `continue_on_error`, and each
`${{ … }}` in `args`), loop blocks and their inner steps. The helper uses
a small hand-written parser — it never runs workflow text as code.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/wf_eval.py" validate /tmp/workflow-parsed.json
```

If validation fails, surface every error to the user and stop. Do not
attempt to execute a half-valid workflow. Unbounded loops (`until`
without `max_iterations`), forward references and expression syntax
errors are all caught here, before any step runs.

---

## Phase 3: Build the step plan

Copy each step into a plan, keeping every `${{ … }}` **unresolved**.
Expressions are evaluated at run time (Phase 4), because `if`,
`for_each`, `until` and later steps' `args` depend on what earlier
steps actually produced.

```bash
python3 - <<'EOF'
import json

data = json.load(open("/tmp/workflow-parsed.json"))
def build(step):
    entry = {
        "id": step["id"],
        "skill": step.get("skill"),          # None for a loop block
        "description": step.get("description", ""),
        "agent": step.get("agent") or "claude",
        "inline": step.get("inline") is True,
        "args": step.get("args") or step.get("inputs") or {},
        "if": step.get("if"),
        "for_each": step.get("for_each"),
        "until": step.get("until"),
        "max_iterations": step.get("max_iterations"),
        "retry": step.get("retry") or 0,
        "continue_on_error": step.get("continue_on_error") is True,
    }
    if "steps" in step:                      # loop block: its inner steps are leaf steps
        entry["steps"] = [build(child) for child in step["steps"]]
    return entry


plan = [build(step) for step in data["workflow"]["steps"]]

with open("/tmp/workflow-plan.json", "w") as f:
    json.dump({"plan": plan}, f, indent=2)
print(json.dumps({"plan": plan}, indent=2))
EOF
```

---

## Phase 4: Execute steps

Create the workflow directory once, then loop through the plan.

```bash
WF_NAME=$(python3 -c "import json; print(json.load(open('/tmp/workflow-parsed.json'))['workflow']['name'])")
TS=$(date -u +%Y%m%dT%H%M%SZ)
WORKFLOW_DIR=".workflow-runs/${WF_NAME}-${TS}"
mkdir -p "$WORKFLOW_DIR"
echo "$WORKFLOW_DIR" > /tmp/workflow-dir
echo "Workflow output directory: $WORKFLOW_DIR"
```

Work through the plan in order. For each step, follow the
**lifecycle** below; "Running one attempt" (further down) describes the
mechanics of a single run of the skill.

All expression handling goes through one helper, so you never evaluate
`${{ … }}` or a condition yourself:

```bash
EVAL="${CLAUDE_PLUGIN_ROOT}/scripts/wf_eval.py"
# --what if | until -> prints true/false; for_each -> JSON list; args -> JSON object
python3 "$EVAL" step /tmp/workflow-parsed.json "$WORKFLOW_DIR" \
  --plan /tmp/workflow-plan.json --id "<step-id>" --what <if|until|for_each|args> \
  [--item @<path-to-item.json>] [--index <k>]
```

Exit code `2` means the expression could not be evaluated (the error is
on stderr): treat it as a failed step with that message as its stderr.

Shell state does not persist between tool calls, so begin every command
that uses the helper with
`WORKFLOW_DIR=$(cat /tmp/workflow-dir); EVAL="${CLAUDE_PLUGIN_ROOT}/scripts/wf_eval.py"; …`.

**Lifecycle of a step**

1. **Condition.** If the step has `if`, run the helper with
   `--what if`. `false` → write
   `{"status":"skipped","reason":"condition false"}` to
   `$WORKFLOW_DIR/<id>/status.json` and move to the next step. A
   skipped step has no output (`steps.<id>.output` is empty/falsy) and
   counts as neither success nor failure.
2. **Plan the runs.**
   - *Plain step* (no `for_each` / `until`): one run.
   - `for_each`: run the helper with `--what for_each` to get the JSON
     list. Run once per element, in order, `index` = 0, 1, … Write each
     element to `$WORKFLOW_DIR/<id>/<index>/item.json` and pass
     `--item @…/item.json --index <index>` when rendering `args`. An
     empty list runs nothing and the step is `success` with `outputs: []`.
   - `until`: run at least once, then after every run evaluate
     `--what until --index <index>`; stop when it prints `true`. The
     step never runs more than `max_iterations` times.
3. **Each run** (an iteration; the only run of a plain step) is
   *Running one attempt*, retried up to `retry` extra times if it
   fails. For looped steps the files of iteration `<index>` live in
   `$WORKFLOW_DIR/<id>/<index>/`; plain steps use `$WORKFLOW_DIR/<id>/`
   as before. After the run, **mirror** the iteration's `output.json`
   and `stderr.log` to `$WORKFLOW_DIR/<id>/` (so `steps.<id>.output`
   is always the latest iteration) and write
   `$WORKFLOW_DIR/<id>/status.json`:

   ```json
   {"status": "success", "attempts": 1, "iterations": 1}
   ```

   `status` is that run's outcome (`success` or `failed`), `attempts`
   the number of tries it took, `iterations` how many runs the step has
   made so far. Writing it after every run is what lets an `until`
   condition read `steps.<id>.status` of the latest iteration.
4. **A run failed** (after its retries) →
   - without `continue_on_error`: **halt** the whole workflow now —
     run nothing else; record the failure for Phase 5.
   - with `continue_on_error: true`: keep going — the next iteration
     (loops) or the next step (plain). The step's final status is
     `failed` and the workflow status will be `partial`.
5. **Loop end conditions.** `until` true → stop, step `success`. The
   `max_iterations`-th run finished with `until` still false → the
   step **fails** with `"reason": "max_iterations reached"` (handled
   like step 4). `for_each` finishes when the list is exhausted; the
   step is `failed` if any iteration failed (only possible with
   `continue_on_error`).
6. **Finish the step.** For a looped step, collect the per-iteration
   outputs into `$WORKFLOW_DIR/<id>/outputs.json`, then write the final
   `status.json` (`status`, `attempts` of the last run, `iterations`,
   and `reason` if any):

   ```bash
   python3 "$EVAL" collect "$WORKFLOW_DIR" --id "<id>"
   ```

**Loop blocks.** A plan entry with `steps` is a *loop block*: it repeats
its inner steps together. It has no skill or args of its own, so only
the lifecycle steps 1, 2, 5 and 6 apply to the block itself (its `if`,
its `for_each` list or `until` condition, its `max_iterations`); the
inner steps are run like this:

- **A pass** (iteration `<k>`) runs every inner step, in order, through
  lifecycle steps 1, 3 and 4 — its own `if` (evaluated on every pass,
  with `--index <k>` and, in a `for_each` block, `--item`), its own
  `retry`, `continue_on_error`, `agent` / `inline`. Inner steps never
  loop themselves.
- **Files.** Inner step `<inner>` on pass `<k>` works in
  `$WORKFLOW_DIR/<block>/<k>/<inner>/` (in a `for_each` block write the
  element to `$WORKFLOW_DIR/<block>/<k>/item.json`). After each inner
  run, **mirror** its `output.json` and `stderr.log` to
  `$WORKFLOW_DIR/<inner>/` and write `$WORKFLOW_DIR/<inner>/status.json`
  — so `steps.<inner>.*` always reads the latest pass. An inner step
  that was **skipped** on this pass gets
  `{"status":"skipped","reason":"condition false"}` and its mirrored
  `output.json` and `stderr.log` are **deleted**, so it never exposes a
  previous pass's output.
- **After each pass** write `$WORKFLOW_DIR/<block>/status.json`
  (`{"status":"success","iterations":<k+1>}`), then check the stop
  condition: `until` → `--what until --index <k>`; `for_each` → no more
  elements. Cap reached with `until` still false → the block fails with
  `"reason": "max_iterations reached"`; the **block's**
  `continue_on_error` decides whether that halts the run.
- **An inner step fails** (after its retries): without its own
  `continue_on_error` the whole run halts — write the block's
  `status.json` as `failed` first, and record the failure.
- **Finish.** For each inner step run
  `python3 "$EVAL" collect "$WORKFLOW_DIR" --id "<inner>" --block "<block>"`
  (its per-pass outputs, `null` for passes where it was skipped), then
  write the block's final `status.json`.

Example — review, then fix, until the review is clean (each inner step
may run as a different agent):

```yaml
- id: review-loop
  until: ${{ steps.review.output.findings == 0 }}
  max_iterations: 5
  steps:
    - id: review
      skill: pr-reviewer
      agent: general-purpose
    - id: fix
      skill: review-fixer
      agent: claude
      if: ${{ steps.review.output.findings }}
```

A workflow with none of the new fields takes exactly one run per step,
with no condition and no retry — identical to the original behaviour,
plus a `status.json` per step.

### Running one attempt

1. Render the arguments and set up the paths. `${{ … }}` is resolved
   now, against the outputs already on disk:

   ```bash
   STEP_ID="<step-id-from-plan>"
   RUN_DIR="$WORKFLOW_DIR/$STEP_ID"          # looped step: "$WORKFLOW_DIR/$STEP_ID/<index>"
   mkdir -p "$RUN_DIR"
   python3 "$EVAL" step /tmp/workflow-parsed.json "$WORKFLOW_DIR" \
     --plan /tmp/workflow-plan.json --id "$STEP_ID" --what args \
     > "$RUN_DIR/args.json"                  # looped: add --item @"$RUN_DIR/item.json" --index <k>
   STEP_OUTPUT="$RUN_DIR/output.json"
   STEP_STDOUT="$RUN_DIR/stdout.log"
   STEP_STDERR="$RUN_DIR/stderr.log"
   ```

   Use `$RUN_DIR/args.json` as the step's resolved `args`. On a retry,
   delete the previous `output.json`, `stdout.log` and `stderr.log`
   first and render the arguments again.

2. Run the step. How depends on the plan entry's `inline` and `agent`:

   **Default (`inline: false`) — spawn a subagent** via the `Agent`
   tool with `subagent_type` set to the plan entry's `agent` (`claude`
   unless the step named another agent type). Never use the skill
   name as the agent type — skills are not agent types. A step sets
   `agent:` when a dedicated agent definition fits it better than the
   catch-all, e.g. one with a narrower tool list. Whatever the type,
   it must have the `Skill` tool, because the prompt below tells it
   to invoke the skill. Pass the resolved arguments in the prompt so
   the matching skill picks them up via the `Skill` tool. The agent
   gets `$WORKFLOW_OUTPUT=$STEP_OUTPUT` and `$WORKFLOW_DIR=$WORKFLOW_DIR`
   exported via the prompt context (for a looped step `$WORKFLOW_OUTPUT` is the
   iteration's own `$STEP_OUTPUT`).

   The prompt template looks like:

   ```
   You are running step `<id>` of workflow `<wf_name>`.

   Invoke the `<skill>` skill using the Skill tool with these
   arguments (convert the JSON object to space-separated key=value
   pairs):
   <pretty-printed JSON of step.args>

   IMPORTANT: invoke the skill via the Skill tool — do NOT
   reimplement the skill's logic yourself. The skill has its own
   SKILL.md with specific instructions, scripts, and output formats
   that must be followed exactly. Reimplementing it inline produces
   incorrect results (wrong file formats, missing idempotence
   checks, skipped validation).

   Output convention:
   - Write a JSON summary to $WORKFLOW_OUTPUT=$STEP_OUTPUT.
   - If you cannot, your captured stdout will be used as the
     output value for downstream steps.

   Halt with a non-zero exit if you cannot complete the step.
   ```

   **`inline: true` — run the skill in this conversation.** Invoke
   the `Skill` tool yourself with the step's skill and its arguments
   as space-separated `key=value` pairs. No subagent is spawned, so
   the step costs no fresh context; use it for small, mechanical
   skills (a sync, a file rewrite). Shell state does not persist
   between tool calls, so start **every** shell command you run for
   the skill with the concrete paths, e.g.
   `export WORKFLOW_OUTPUT="<STEP_OUTPUT path>" WORKFLOW_DIR="<WORKFLOW_DIR path>"; …`
   (PowerShell: `$env:WORKFLOW_OUTPUT = "<path>"; …`). The skill's own
   `$WORKFLOW_OUTPUT` checks then work unchanged.

   When the skill finishes, write its final report (the text you would
   otherwise have printed as the step's result) to `$STEP_STDOUT`, so
   the stdout fallback in step 3 has something to capture when the
   skill wrote no `output.json`. Then return to this loop: the next
   action is step 3 below, not anything the skill's own report
   suggests. If the skill fails, write the error to `$STEP_STDERR` and
   treat it exactly like a subagent that exited non-zero.

3. After the step returns, capture its output:

   ```bash
   if [ -s "$STEP_OUTPUT" ]; then
     echo "Step $STEP_ID produced structured output."
   else
     # Fallback: copy stdout into output.json as a stringified field.
     python3 - "$STEP_STDOUT" "$STEP_OUTPUT" <<'EOF'
   import json, sys, pathlib
   src, dst = sys.argv[1], sys.argv[2]
   text = pathlib.Path(src).read_text() if pathlib.Path(src).exists() else ""
   pathlib.Path(dst).write_text(json.dumps({"stdout": text}))
   EOF
   fi
   ```

4. If the attempt failed (agent exited non-zero, or the inline skill
   failed), go back to the lifecycle: retry if attempts remain,
   otherwise apply step 4 of the lifecycle (halt, or carry on with
   `continue_on_error`).

Steps and iterations must run **strictly sequentially** — do not
request parallel execution. The format reserves parallelism for a
future revision.

---

## Phase 5: Write summary and report

Write `$WORKFLOW_DIR/workflow-output.json` and print a concise
markdown summary.

```bash
python3 - <<'EOF'
import json, datetime, pathlib

wf = json.load(open("/tmp/workflow-parsed.json"))["workflow"]
plan = json.load(open("/tmp/workflow-plan.json"))["plan"]
inputs = json.load(open("/tmp/workflow-parsed.json"))["inputs"]
workflow_dir = pathlib.Path(open("/tmp/workflow-dir").read().strip())

state = {"halted": False, "failed": False}


def summarize(step, skipped_reason=None):
    """One summary entry for a plan step; a loop block carries its inner entries under `steps`."""
    base = workflow_dir / step["id"]
    sf = base / "status.json"
    entry = {"id": step["id"], "skill": step["skill"]}
    if step.get("steps"):
        entry["skill"] = None
    if not sf.exists():
        # Never reached: an earlier step halted the run (or the block around it was skipped).
        entry.update(status="skipped", reason=skipped_reason or "earlier step failed")
        if step.get("steps"):
            entry["steps"] = [summarize(c, entry["reason"]) for c in step["steps"]]
        return entry
    st = json.loads(sf.read_text())
    entry["status"] = st.get("status", "failed")
    for k in ("attempts", "iterations", "reason"):
        if k in st:
            entry[k] = st[k]
    if (base / "output.json").exists():
        entry["output_path"] = f"{step['id']}/output.json"
    if (base / "outputs.json").exists():
        entry["outputs_path"] = f"{step['id']}/outputs.json"
    if entry["status"] == "failed":
        state["failed"] = True
        err = base / "stderr.log"
        if err.exists():
            entry["stderr"] = err.read_text()[:2048]
        # A block fails either because an inner step halted the run (that step is flagged itself)
        # or because it hit max_iterations; only the latter is governed by the block's own flag.
        if not step.get("continue_on_error") and (not step.get("steps") or st.get("reason") == "max_iterations reached"):
            state["halted"] = True
    if step.get("steps"):
        reason = st.get("reason") if entry["status"] == "skipped" else None
        entry["steps"] = [summarize(c, reason) for c in step["steps"]]
    return entry


steps_summary = [summarize(step) for step in plan]
halted, any_failed = state["halted"], state["failed"]

status = "failed" if halted else ("partial" if any_failed else "success")
report = {
    "workflow": wf.get("name"),
    "status": status,
    "started_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "finished_at": datetime.datetime.utcnow().isoformat() + "Z",
    "inputs": inputs,
    "steps": steps_summary,
}
(workflow_dir / "workflow-output.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
EOF
```

`status` is `success` (nothing failed), `partial` (a step failed but
had `continue_on_error`, so the run continued) or `failed` (the run
halted). Skipped steps — by `if`, or because the run halted — never
make a workflow fail.

### Report format (printed back to the user)

```
## Workflow — <name>

Status: <success | partial | failed>
Run directory: <WORKFLOW_DIR>
Inputs:
  - <name>: <value>

Steps:
  ✓ <id>  (<skill>) — output at <id>/output.json
  ✓ <id>  (<skill>) — 3 iterations, outputs at <id>/outputs.json
  ✓ <block>  (loop) — 3 passes
      ✓ <inner>  (<skill>) …           (inner steps indented under their block)
  ✗ <id>  (<skill>) — failed (2 attempts), see <id>/stderr.log
  - <id>  (<skill>) — skipped (condition false)
  - <id>  (<skill>) — skipped (earlier step failed)
```

### Do not:

- Suggest re-running the workflow with a different definition. The
  workflow file is the user's contract; the runner only executes.
- Modify the workflow YAML itself. Even if it has cosmetic issues,
  surface them as warnings; the user fixes them in their own PR.
- Run subsequent steps after a failure the workflow did not opt into
  tolerating (`continue_on_error: true`). Halt immediately so the user
  sees the failure before any compensating work has run.
- Evaluate a condition, loop list or `${{ … }}` yourself. Always use
  `wf_eval.py`, so the result is deterministic and matches validation.
