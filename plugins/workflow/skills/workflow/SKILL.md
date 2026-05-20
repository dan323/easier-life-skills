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
  strictly in order, halts on the first non-zero exit, and writes a
  summary JSON to the workflow directory.
tools: Bash, PowerShell, Read, Write, Glob, Grep, Agent, TaskCreate, TaskUpdate
---

# Workflow Runner

Execute a workflow YAML file step-by-step. Each step spawns a
subagent for one skill, captures its output, and threads it forward
through `${{ steps.<id>.output }}` interpolation. The full format is
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
- Execute steps sequentially
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
            if not step.get("skill"):
                errors.append(f"Step '{sid or idx}' missing `skill`.")

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

If validation fails, surface every error to the user and stop. Do not
attempt to execute a half-valid workflow.

---

## Phase 3: Resolve the step plan

For each step, build the concrete arguments object by substituting
every `${{ … }}` placeholder. Steps may only reference earlier steps;
forward references are a validation error.

```bash
python3 - <<'EOF'
import json, re, sys

data = json.load(open("/tmp/workflow-parsed.json"))
wf, inputs = data["workflow"], data["inputs"]
steps = wf["steps"]

EXPR = re.compile(r"\$\{\{\s*(.+?)\s*\}\}")

resolved_steps = []
output_store = {}  # step_id -> (placeholder — actual output filled later)

errors = []

def resolve_value(value, step_idx):
    if isinstance(value, dict):
        return {k: resolve_value(v, step_idx) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_value(v, step_idx) for v in value]
    if not isinstance(value, str):
        return value
    matches = list(EXPR.finditer(value))
    if not matches:
        return value
    # Whole-string substitution preserves type when value is exactly one expression.
    if len(matches) == 1 and matches[0].group(0) == value.strip():
        return resolve_expr(matches[0].group(1), step_idx, raw=True)
    # Embedded — stringify.
    out = []
    last = 0
    for m in matches:
        out.append(value[last:m.start()])
        out.append(str(resolve_expr(m.group(1), step_idx, raw=False)))
        last = m.end()
    out.append(value[last:])
    return "".join(out)

def resolve_expr(expr, step_idx, raw):
    parts = expr.split(".")
    head = parts[0]
    if head == "inputs":
        if len(parts) != 2:
            errors.append(f"Step {step_idx}: invalid inputs expression `{expr}`.")
            return ""
        return inputs.get(parts[1], "")
    if head == "steps":
        if len(parts) < 3 or parts[2] != "output":
            errors.append(f"Step {step_idx}: invalid steps expression `{expr}`.")
            return ""
        ref_id = parts[1]
        seen_before = any(s["id"] == ref_id for s in steps[:step_idx])
        if not seen_before:
            errors.append(f"Step {step_idx}: `${{{{ steps.{ref_id}.output }}}}` references step that has not run yet.")
            return ""
        # Marker — the executor replaces this at runtime with the captured output.
        if len(parts) == 3:
            return f"<<OUTPUT:{ref_id}>>"
        return f"<<OUTPUT:{ref_id}:{'.'.join(parts[3:])}>>"
    errors.append(f"Step {step_idx}: unknown expression head `{head}`.")
    return ""

for idx, step in enumerate(steps):
    args = step.get("args") or step.get("inputs") or {}
    resolved = resolve_value(args, idx)
    resolved_steps.append({
        "id": step["id"],
        "skill": step["skill"],
        "description": step.get("description", ""),
        "args": resolved,
    })

with open("/tmp/workflow-plan.json", "w") as f:
    json.dump({"plan": resolved_steps, "errors": errors}, f, indent=2)

print(json.dumps({"plan": resolved_steps, "errors": errors}, indent=2))
if errors:
    sys.exit(1)
EOF
```

If any errors come back, halt and report.

---

## Phase 4: Execute steps sequentially

Create the workflow directory once, then loop through the plan.

```bash
WF_NAME=$(python3 -c "import json; print(json.load(open('/tmp/workflow-parsed.json'))['workflow']['name'])")
TS=$(date -u +%Y%m%dT%H%M%SZ)
WORKFLOW_DIR=".workflow-runs/${WF_NAME}-${TS}"
mkdir -p "$WORKFLOW_DIR"
echo "$WORKFLOW_DIR" > /tmp/workflow-dir
echo "Workflow output directory: $WORKFLOW_DIR"
```

For each step in the plan, in order:

1. Read the resolved `args` from `/tmp/workflow-plan.json`. Replace
   every `<<OUTPUT:<id>[.<key>]>>` marker by reading
   `$WORKFLOW_DIR/<id>/output.json` (parse as JSON if possible,
   otherwise treat as raw text):

   ```bash
   STEP_ID="<step-id-from-plan>"
   mkdir -p "$WORKFLOW_DIR/$STEP_ID"
   STEP_OUTPUT="$WORKFLOW_DIR/$STEP_ID/output.json"
   STEP_STDOUT="$WORKFLOW_DIR/$STEP_ID/stdout.log"
   STEP_STDERR="$WORKFLOW_DIR/$STEP_ID/stderr.log"
   ```

2. Spawn the subagent via the `Agent` tool. Use the step's `skill`
   name as `subagent_type` when an agent with that name is
   registered; otherwise spawn the generic `claude` agent and pass
   the resolved arguments in the prompt so the matching skill picks
   them up. The agent gets `$WORKFLOW_OUTPUT=$STEP_OUTPUT` and
   `$WORKFLOW_DIR=$WORKFLOW_DIR` exported via the prompt context.

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

3. After the agent returns, capture its output:

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

4. If the agent exited non-zero, stop the loop immediately. Record
   the failure for the summary in Phase 5.

Steps must run **strictly sequentially** — do not request parallel
execution. v1 of the format reserves parallelism for a future
revision.

---

## Phase 5: Write summary and report

Write `$WORKFLOW_DIR/workflow-output.json` and print a concise
markdown summary.

```bash
python3 - <<'EOF'
import json, datetime, pathlib, os, sys

wf = json.load(open("/tmp/workflow-parsed.json"))["workflow"]
plan = json.load(open("/tmp/workflow-plan.json"))["plan"]
inputs = json.load(open("/tmp/workflow-parsed.json"))["inputs"]
workflow_dir = open("/tmp/workflow-dir").read().strip()

steps_summary = []
status = "success"
for step in plan:
    out = pathlib.Path(workflow_dir) / step["id"] / "output.json"
    err = pathlib.Path(workflow_dir) / step["id"] / "stderr.log"
    if not out.exists():
        status = "failed"
        steps_summary.append({
            "id": step["id"], "skill": step["skill"], "status": "skipped"
        })
        continue
    summary = {
        "id": step["id"], "skill": step["skill"],
        "status": "success", "output_path": f"{step['id']}/output.json",
    }
    if err.exists() and err.stat().st_size > 0:
        summary["status"] = "failed"
        summary["stderr"] = err.read_text()[:2048]
        status = "failed"
    steps_summary.append(summary)

report = {
    "workflow": wf.get("name"),
    "status": status,
    "started_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "finished_at": datetime.datetime.utcnow().isoformat() + "Z",
    "inputs": inputs,
    "steps": steps_summary,
}
pathlib.Path(workflow_dir, "workflow-output.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
EOF
```

### Report format (printed back to the user)

```
## Workflow — <name>

Status: <success | failed>
Run directory: <WORKFLOW_DIR>
Inputs:
  - <name>: <value>

Steps:
  ✓ <id>  (<skill>) — output at <id>/output.json
  ✗ <id>  (<skill>) — failed, see <id>/stderr.log
  - <id>  (<skill>) — skipped (earlier step failed)
```

### Do not:

- Suggest re-running the workflow with a different definition. The
  workflow file is the user's contract; the runner only executes.
- Modify the workflow YAML itself. Even if it has cosmetic issues,
  surface them as warnings; the user fixes them in their own PR.
- Run subsequent steps after a failure. Halt immediately so the user
  sees the failure before any compensating work has run.
