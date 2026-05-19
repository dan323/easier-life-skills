---
name: state-machine-invariants
description: >
  Static analyser for state machines. Reports unreachable states, sink/deadlock
  states, dead transitions (literal-false guards), overlapping guards on the
  same `(state, event)`, and unused events declared but never consumed. Inputs:
  XState v5 `createMachine(...)` configs in TypeScript / JavaScript, and a
  small YAML schema (`*.fsm.yaml`) for non-XState users. Use when asked to
  audit / verify / model-check a state machine, find FSM bugs, check XState
  configs, or look for unreachable states, dead transitions, deadlocks, or
  guard overlap. Read-only: writes per-spec IR sidecars (`*.fsm.ir.json`) and
  a top-level `state-machine-invariants-report.json` — never modifies the
  user's source files.
tools: Bash, Read, Grep, Glob, TaskCreate, TaskUpdate
---

# State Machine Invariants

## Argument grammar

| Key                | Required | Format                                                                                  | Example                                          |
|--------------------|----------|-----------------------------------------------------------------------------------------|--------------------------------------------------|
| `paths`            | no       | comma-separated paths; defaults to auto-discovery from CWD                              | `paths=src/auth/machine.ts,specs/order.fsm.yaml` |
| `with_math`        | no       | bare flag or `with_math=true`                                                           | `with_math`                                      |
| `max_flat_states`  | no       | int, default `1000`                                                                     | `max_flat_states=5000`                           |
| `fail_on_findings` | no       | bare flag or `fail_on_findings=true`; exit code 1 if any finding of severity ≥ warning  | `fail_on_findings`                               |

Unknown keys abort with a parser error.

## Task Tracking

Call `TaskCreate` for each phase below. Call `TaskUpdate` (`in_progress`) at
the start of each phase and `TaskUpdate` (`completed`) at the end.

- Parse arguments
- Discover specs
- Parse to IR
- Flatten hierarchical / parallel states
- Run invariant checks
- Print report

## Phase 1: Parse arguments

    python3 - <<'EOF'
    import json, shlex
    RAW = """<<USER_ARGS>>"""
    allowed = {"paths", "with_math", "max_flat_states", "fail_on_findings"}
    result = {"paths": [], "with_math": False, "max_flat_states": 1000,
              "fail_on_findings": False, "errors": []}
    try:
        tokens = shlex.split(RAW)
    except ValueError as e:
        result["errors"].append(f"Argument parse error: {e}.")
        tokens = []
    for tok in tokens:
        if tok in {"with_math", "fail_on_findings"}:
            result[tok] = True; continue
        if "=" not in tok:
            result["errors"].append(f"Token '{tok}' is not key=value."); continue
        k, _, v = tok.partition("=")
        if k not in allowed:
            result["errors"].append(f"Unknown key '{k}'. Allowed: {sorted(allowed)}."); continue
        if k == "paths":
            result["paths"] = [p.strip() for p in v.split(",") if p.strip()]
        elif k in {"with_math", "fail_on_findings"}:
            result[k] = v.lower() in {"1", "true", "yes"}
        elif k == "max_flat_states":
            try: result["max_flat_states"] = int(v)
            except ValueError: result["errors"].append(f"max_flat_states must be an integer, got '{v}'.")
    json.dump(result, open("/tmp/smi-args.json", "w"), indent=2)
    print(json.dumps(result, indent=2))
    EOF

If `errors` is non-empty, stop and surface them verbatim.

## Phase 2: Discover specs

Invoke:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/discover_specs.py"

Reads `/tmp/smi-args.json` (Phase 1 output). If `paths` is non-empty,
those entries are copied to `/tmp/smi-specs.json` verbatim. Otherwise
the script scans the CWD for `*.fsm.yaml` and `*.ts/.tsx/.js/.jsx`
files containing `createMachine(`, excluding `node_modules`, `dist`,
`build`, `.git`, `vendor`, `target`, `__pycache__`. Override the
args / output / root with `--args-file`, `--out`, `--root`.

If `discover_specs.py` reports zero specs, skip to Phase 6 and emit
"no specs discovered" (exit 0).

## Phase 3: Parse to IR

For each spec, produce the IR below and write it to `<spec>.fsm.ir.json`
(replacing the extension: `order.fsm.yaml` → `order.fsm.ir.json`;
`src/auth/machine.ts` → `src/auth/machine.fsm.ir.json`).

**3a. YAML specs** — invoke:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/normalize_yaml.py" <spec-path>

Prints the IR JSON to stdout and writes `<spec>.fsm.ir.json` next to the
input. Spec and validation rules live in
`${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/references/fsm-yaml.md`
(machine-readable: `references/fsm-yaml.schema.json`). Pass `--no-sidecar`
to suppress the sidecar write, or `--out <path>` to override its location.
The script exits 5 with a multi-line stderr report on validation failure.

**3b. XState configs** — invoke:

    node "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/extract-xstate.cjs" <spec-path>

Prints the IR JSON to stdout and writes `<spec>.fsm.ir.json` next to the
input. Writes a reason string to stderr and exits non-zero on failure.
Accepts the same `--out <path>` / `--no-sidecar` flags as
`normalize_yaml.py`.

If `node` is unavailable, fall back to:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/extract-xstate-fallback.py" <spec-path>

Same flag surface, same sidecar behaviour. The fallback emits an IR
tagged with `"caveat": "grep-extracted; opaque guards"` so downstream
phases can downgrade confidence.

**3c. IR schema** —

    {
      "id": "string",
      "initial": "string",
      "final": ["string"],
      "events": ["string"],
      "states": ["string"],
      "transitions": [
        {
          "from": "string",
          "event": "string",
          "to": "string",
          "guard": { "type": "always|literalFalse|expr|function", "expr": "string?" }
        }
      ],
      "compound": { "<state>": { "initial": "string", "children": ["string"] } },
      "parallel": { "<state>": ["string"] },
      "caveats": ["string"]
    }

`compound` and `parallel` are empty for flat machines. **No IR sidecar
is written** for specs that fail to parse. On non-zero exit from any of
the three extractors, record the skip:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/record_skipped.py" <spec-path> "<reason from stderr>"

Phase 6 reads `/tmp/smi-skipped.json` to render these entries under the
report's "skipped" section.

## Phase 4: Flatten

For each parsed IR sidecar, invoke:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/flatten.py" <sidecar> --max-flat-states <N>

Pass `<N>` = Phase 1's `max_flat_states` (default 1000). The script
rewrites the sidecar in place with `flattened: true`, compound states
lifted to atomic descendants, and `final` resolved to atomic states.
Most-specific transitions precede ancestor-lifted ones per-atomic-state,
so the overlap check (5d) replicates XState's "most-specific wins" rule.

Exit `7`: flattened state count exceeded `--max-flat-states`; sidecar
left untouched.
Exit `8`: sidecar has parallel states (v1 unsupported); sidecar gets a
`parallel states unsupported in v1` caveat.

On either non-zero exit, record the skip the same way as in Phase 3:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/record_skipped.py" <spec-path> "<reason>"

## Phase 5: Run invariant checks

For each sidecar that flatten.py exited 0 on (skip those that exited 7
or 8), invoke:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/check_invariants.py" <sidecar> --spec-path <original-spec> [--with-math]

Pass `--with-math` iff Phase 1's `with_math` is true. The script prints a
JSON array of findings to stdout, one entry per check that fires
(reachability / deadlock / dead-transition / overlapping-guards /
unused-event); each finding's algorithm and math one-liner are
documented in the script's docstring. `--spec-path` controls the
`location.spec` field on each finding — pass the **original** spec path
(not the IR sidecar) so Phase 6 can group findings back to the analysed
list.

Save each spec's findings JSON for Phase 6, e.g.:

    mkdir -p /tmp/smi-findings
    base=$(basename "<sidecar>" .fsm.ir.json)
    python3 ${SCRIPT}/check_invariants.py <sidecar> --spec-path <original-spec> [--with-math] \
        > /tmp/smi-findings/$base.json

## Phase 6: Print report

Assemble a single run summary JSON of shape:

    {
      "analyzed": ["<spec-path>", ...],
      "skipped":  [{"path": "<spec-path>", "reason": "..."}, ...],
      "findings": [<finding>, ...]
    }

from the conventional `/tmp/smi-*` artefacts, then invoke `report.py`:

    python3 - <<'PYEOF' > /tmp/smi-run.json
    import json, glob, os
    specs   = json.load(open("/tmp/smi-specs.json"))
    skipped = json.load(open("/tmp/smi-skipped.json")) if os.path.exists("/tmp/smi-skipped.json") else []
    blocked = {e["path"] for e in skipped}
    findings = []
    for f in sorted(glob.glob("/tmp/smi-findings/*.json")):
        findings.extend(json.load(open(f)))
    print(json.dumps({
        "analyzed": [s for s in specs if s not in blocked],
        "skipped":  skipped,
        "findings": findings,
    }))
    PYEOF

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/state-machine-invariants/scripts/report.py" \
        --input /tmp/smi-run.json [--with-math] [--fail-on-findings]

The script writes the markdown report to stdout, writes the JSON sidecar
to `./state-machine-invariants-report.json`, and exits `0` by default or
`1` when `--fail-on-findings` is set and any finding is severity ≥
`warning`. Render `--with-math` iff Phase 1's `with_math` is true; pass
`--fail-on-findings` iff Phase 1's `fail_on_findings` is true.
