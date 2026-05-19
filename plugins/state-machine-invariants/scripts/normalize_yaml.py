#!/usr/bin/env python3
"""normalize_yaml.py — load a .fsm.yaml spec, validate it, and emit the
normalised IR JSON described in SKILL.md §3c.

Usage:
    normalize_yaml.py <spec.fsm.yaml> [--out <path>] [--no-sidecar]
    normalize_yaml.py self-test

Behaviour:
    - Loads the YAML with `yaml.safe_load`.
    - Validates against `references/fsm-yaml.schema.json` if the
      `jsonschema` package is installed; always runs the hand-rolled
      semantic rules from `references/fsm-yaml.md` §"Validation rules"
      (these cover rules 2–4, which the JSON Schema can't express).
    - Normalises each transition's `guard` per the table in
      `references/fsm-yaml.md` §"Guard scalars".
    - Prints the IR JSON to stdout. Writes a sidecar JSON next to the
      input (or to `--out <path>`), unless `--no-sidecar` is passed.

Exit codes:
    0  success (IR on stdout, sidecar written)
    2  bad usage / missing PyYAML
    3  file not found / read error
    4  YAML parse error
    5  schema or semantic validation failed
    6  self-test failed
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("normalize_yaml: PyYAML is required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(2)


ALLOWED_TOP_KEYS = {"id", "initial", "states", "final", "events", "transitions"}
ALLOWED_TRANSITION_KEYS = {"from", "event", "to", "guard"}


def validate(spec: Any) -> list[str]:
    """Return a list of validation error messages. Empty list means valid.

    Implements the seven rules from `references/fsm-yaml.md`
    §"Validation rules" — including the three that the JSON Schema can't
    express (initial ∈ Q, declared-states closure, final ⊆ Q).
    """
    errors: list[str] = []

    if not isinstance(spec, dict):
        return ["root is not a mapping"]

    # Rule 7 — unknown top-level keys
    for k in sorted(set(spec.keys()) - ALLOWED_TOP_KEYS):
        errors.append(f"unknown top-level key '{k}' (allowed: {sorted(ALLOWED_TOP_KEYS)})")

    # Rule 1 — required keys
    for key in ("id", "initial", "transitions"):
        if key not in spec:
            errors.append(f"missing required top-level key '{key}'")

    # Per-key type checks
    if "id" in spec and not isinstance(spec["id"], str):
        errors.append(f"'id' must be a string, got {type(spec['id']).__name__}")
    if "initial" in spec and not isinstance(spec["initial"], str):
        errors.append(f"'initial' must be a string, got {type(spec['initial']).__name__}")
    for k in ("states", "final", "events"):
        if k in spec and not (isinstance(spec[k], list) and all(isinstance(s, str) for s in spec[k])):
            errors.append(f"'{k}' must be a list of strings")
    if "transitions" in spec and not isinstance(spec["transitions"], list):
        errors.append("'transitions' must be a list")

    # Bail before transition-level checks if the shape is already broken.
    if errors:
        return errors

    # Rule 1 (continued) — transitions non-empty
    if len(spec["transitions"]) == 0:
        errors.append("'transitions' is empty (no machine to analyse)")
        return errors

    # Rules 5, 6, 7 — per-transition checks
    for i, t in enumerate(spec["transitions"]):
        if not isinstance(t, dict):
            errors.append(f"transition #{i} is not a mapping")
            continue
        for k in sorted(set(t.keys()) - ALLOWED_TRANSITION_KEYS):
            errors.append(f"transition #{i}: unknown key '{k}' (allowed: {sorted(ALLOWED_TRANSITION_KEYS)})")
        for k in ("from", "event", "to"):
            if k not in t:
                errors.append(f"transition #{i}: missing required key '{k}'")
            elif not isinstance(t[k], str):
                errors.append(f"transition #{i}: '{k}' must be a string, got {type(t[k]).__name__}")
        if "guard" in t and not (t["guard"] is None or isinstance(t["guard"], (bool, str))):
            errors.append(f"transition #{i}: 'guard' must be null/bool/string, got {type(t['guard']).__name__}")
    if errors:
        return errors

    # Resolve Q (the state set)
    states_declared = "states" in spec
    if states_declared:
        state_set = set(spec["states"])
    else:
        state_set = {spec["initial"]}
        for t in spec["transitions"]:
            state_set.add(t["from"])
            state_set.add(t["to"])

    # Rule 2 — initial ∈ Q
    if spec["initial"] not in state_set:
        errors.append(
            f"'initial' state '{spec['initial']}' is not in Q (states: {sorted(state_set)})"
        )

    # Rule 3 — declared-states closure
    if states_declared:
        for i, t in enumerate(spec["transitions"]):
            if t["from"] not in state_set:
                errors.append(f"transition #{i}: 'from' state '{t['from']}' is not in declared states")
            if t["to"] not in state_set:
                errors.append(f"transition #{i}: 'to' state '{t['to']}' is not in declared states")

    # Rule 4 — final ⊆ Q
    for f in spec.get("final", []):
        if f not in state_set:
            errors.append(f"final state '{f}' is not in Q")

    return errors


def normalise_guard(value: Any) -> dict:
    """Normalise per `references/fsm-yaml.md` §"Guard scalars"."""
    if value is None or value is True:
        return {"type": "always"}
    if value is False:
        return {"type": "literalFalse"}
    if isinstance(value, str):
        return {"type": "expr", "expr": value}
    raise ValueError(f"non-scalar guard reached normalisation: {value!r}")


def build_ir(spec: dict) -> dict:
    """Build the IR JSON per SKILL.md §3c. Caller must have validated the
    spec first; this function assumes well-formed input."""
    if "states" in spec:
        states = list(spec["states"])
    else:
        ordered: list[str] = []
        for s in [spec["initial"]]:
            if s not in ordered:
                ordered.append(s)
        for t in spec["transitions"]:
            for s in (t["from"], t["to"]):
                if s not in ordered:
                    ordered.append(s)
        states = ordered

    if "events" in spec:
        events = list(spec["events"])
    else:
        ordered = []
        for t in spec["transitions"]:
            if t["event"] not in ordered:
                ordered.append(t["event"])
        events = ordered

    return {
        "id": spec["id"],
        "initial": spec["initial"],
        "final": list(spec.get("final", [])),
        "events": events,
        "states": states,
        "transitions": [
            {
                "from": t["from"],
                "event": t["event"],
                "to": t["to"],
                "guard": normalise_guard(t.get("guard")),
            }
            for t in spec["transitions"]
        ],
        "compound": {},
        "parallel": {},
        "caveats": [],
    }


def _schema_path() -> Path:
    return Path(__file__).resolve().parents[1] / "references" / "fsm-yaml.schema.json"


def _maybe_jsonschema_validate(spec: dict) -> None:
    try:
        import jsonschema
    except ImportError:
        return
    schema_file = _schema_path()
    if not schema_file.is_file():
        return
    schema = json.loads(schema_file.read_text())
    try:
        jsonschema.validate(spec, schema)
    except jsonschema.ValidationError as e:
        print(f"normalize_yaml: schema validation failed: {e.message}", file=sys.stderr)
        sys.exit(5)


def load_and_validate(path: str) -> dict:
    src = Path(path)
    if not src.is_file():
        print(f"normalize_yaml: file not found: {path}", file=sys.stderr)
        sys.exit(3)
    try:
        spec = yaml.safe_load(src.read_text())
    except yaml.YAMLError as e:
        print(f"normalize_yaml: YAML parse error in {path}: {e}", file=sys.stderr)
        sys.exit(4)

    _maybe_jsonschema_validate(spec if isinstance(spec, dict) else {})

    errors = validate(spec)
    if errors:
        print(f"normalize_yaml: validation failed in {path}:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(5)
    return spec


def derive_sidecar_path(input_path: str) -> str:
    p = Path(input_path)
    if p.name.endswith(".fsm.yaml"):
        return str(p.with_name(p.name[: -len(".fsm.yaml")] + ".fsm.ir.json"))
    return str(p.with_suffix(".fsm.ir.json"))


def self_test() -> None:
    def expect(cond: bool, msg: str) -> None:
        if not cond:
            print(f"self-test FAIL: {msg}", file=sys.stderr)
            sys.exit(6)

    # 1. Load and validate the canonical example.
    fixture = Path(__file__).resolve().parents[1] / "examples" / "order.fsm.yaml"
    expect(fixture.is_file(), f"fixture not found at {fixture}")
    spec = yaml.safe_load(fixture.read_text())
    errors = validate(spec)
    expect(not errors, f"validate(order.fsm.yaml) returned: {errors}")

    ir = build_ir(spec)
    expect(ir["id"] == "order", "id == order")
    expect(ir["initial"] == "pending", "initial == pending")
    expect(set(ir["states"]) == {"pending", "paid", "shipped", "delivered", "cancelled"},
           f"states: {ir['states']}")
    expect(set(ir["events"]) == {"pay", "ship", "deliver", "cancel"},
           f"events: {ir['events']}")
    expect(set(ir["final"]) == {"delivered", "cancelled"}, f"final: {ir['final']}")
    expect(len(ir["transitions"]) == 5, f"expected 5 transitions, got {len(ir['transitions'])}")
    for t in ir["transitions"]:
        expect(t["guard"]["type"] == "always", f"all guards 'always'; got {t['guard']}")
    expect(ir["compound"] == {} and ir["parallel"] == {}, "no compound/parallel for flat machines")
    expect(ir["caveats"] == [], "no caveats expected")

    # 2. Guard normalisation: all five shapes.
    sample = {
        "id": "g", "initial": "a",
        "transitions": [
            {"from": "a", "event": "X", "to": "b"},
            {"from": "a", "event": "X", "to": "b", "guard": None},
            {"from": "a", "event": "X", "to": "b", "guard": True},
            {"from": "a", "event": "X", "to": "b", "guard": False},
            {"from": "a", "event": "X", "to": "b", "guard": "ctx.ready"},
        ],
    }
    expect(not validate(sample), "sample spec validates")
    s_ir = build_ir(sample)
    expect(s_ir["transitions"][0]["guard"] == {"type": "always"}, "omitted → always")
    expect(s_ir["transitions"][1]["guard"] == {"type": "always"}, "null → always")
    expect(s_ir["transitions"][2]["guard"] == {"type": "always"}, "true → always")
    expect(s_ir["transitions"][3]["guard"] == {"type": "literalFalse"}, "false → literalFalse")
    expect(s_ir["transitions"][4]["guard"] == {"type": "expr", "expr": "ctx.ready"}, "string → expr")

    # 3. Validation failures: each of the seven rules.
    expect(any("missing required" in e for e in validate({"transitions": [{"from": "a", "event": "X", "to": "b"}]})),
           "missing id detected")
    expect(any("'transitions' is empty" in e for e in validate({"id": "x", "initial": "a", "transitions": []})),
           "empty transitions detected")
    expect(any("not in Q" in e for e in validate(
        {"id": "x", "initial": "z", "states": ["a", "b"],
         "transitions": [{"from": "a", "event": "X", "to": "b"}]})),
           "initial not in Q detected (declared states case)")
    expect(any("not in declared states" in e for e in validate(
        {"id": "x", "initial": "a", "states": ["a", "b"],
         "transitions": [{"from": "a", "event": "X", "to": "c"}]})),
           "transition to undeclared state detected")
    expect(any("final state 'q' is not in Q" in e for e in validate(
        {"id": "x", "initial": "a", "final": ["q"],
         "transitions": [{"from": "a", "event": "X", "to": "b"}]})),
           "final not in Q detected")
    expect(any("missing required key 'to'" in e for e in validate(
        {"id": "x", "initial": "a",
         "transitions": [{"from": "a", "event": "X"}]})),
           "transition missing 'to' detected")
    expect(any("'guard' must be null/bool/string" in e for e in validate(
        {"id": "x", "initial": "a",
         "transitions": [{"from": "a", "event": "X", "to": "b", "guard": ["a", "b"]}]})),
           "non-scalar guard detected")
    expect(any("unknown top-level key 'extra'" in e for e in validate(
        {"id": "x", "initial": "a", "extra": 1,
         "transitions": [{"from": "a", "event": "X", "to": "b"}]})),
           "unknown top-level key detected")

    print("normalize_yaml.py self-test: PASS")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normalise a .fsm.yaml to IR JSON (state-machine-invariants).",
    )
    parser.add_argument("input", nargs="?", help="path to .fsm.yaml, or 'self-test'")
    parser.add_argument("--out", help="explicit sidecar path (default: derived from input)")
    parser.add_argument("--no-sidecar", action="store_true", help="skip the sidecar write")
    args = parser.parse_args()

    if not args.input:
        parser.print_usage(sys.stderr)
        sys.exit(2)
    if args.input == "self-test":
        self_test()
        return

    spec = load_and_validate(args.input)
    ir = build_ir(spec)
    out_json = json.dumps(ir, indent=2)
    print(out_json)
    if not args.no_sidecar:
        sidecar = args.out or derive_sidecar_path(args.input)
        Path(sidecar).write_text(out_json + "\n")


if __name__ == "__main__":
    main()
