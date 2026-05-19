#!/usr/bin/env python3
"""flatten.py — Phase 4 of state-machine-invariants.

Flattens compound states in an IR sidecar so the rest of the pipeline
only ever has to reason about a flat finite state machine. Parallel
states are deferred to v1.1 — specs with `parallel` populated are
marked as skipped (and the report aggregator treats them as such).

Usage:
    flatten.py <ir.fsm.ir.json> [--max-flat-states N]
    flatten.py self-test

Default `--max-flat-states` is 1000. A spec whose flattened atomic-state
count exceeds the limit is left untouched and the script exits 7; the
report aggregator surfaces the skip reason in the report.

Exit codes:
    0  success (`flattened: true` written back to the sidecar)
    2  bad usage
    3  sidecar file missing or malformed
    6  self-test failed
    7  flattened atomic-state count exceeds --max-flat-states
    8  sidecar contains parallel states (v1 unsupported)

Semantics (flat product, compound-only):

    * `initial` is resolved by chasing the compound.initial chain until
      an atomic descendant is reached.
    * For each compound state `S`, every transition with `from == S` is
      lifted onto every atomic descendant of `S`. Per-atomic-state, the
      emitted transitions are ordered most-specific first (atomic, then
      parent, then grandparent, …) so the overlapping-guards check (5d),
      which treats the lexically first arrow as the winner, replicates
      XState's "most-specific wins" rule.
    * Targets that point at a compound state resolve to that compound's
      initial atomic descendant.
    * `final` is rewritten as the set of atomic descendants of the
      originally-declared final states.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


# ---------- helpers ---------------------------------------------------------


def is_compound(ir: dict, state: str) -> bool:
    return state in ir.get("compound", {})


def parent_map(ir: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for cname, info in ir["compound"].items():
        for child in info["children"]:
            out[child] = cname
    return out


def ancestors_chain(state: str, parents: dict[str, str]) -> list[str]:
    chain = [state]
    while state in parents:
        state = parents[state]
        chain.append(state)
    return chain


def resolve_initial(ir: dict, state: str) -> str:
    """Chase compound.initial → atomic. Cycle-safe (raises on cycle)."""
    seen: set[str] = set()
    while is_compound(ir, state):
        if state in seen:
            raise ValueError(f"cycle in compound.initial chain at '{state}'")
        seen.add(state)
        state = ir["compound"][state]["initial"]
    return state


def atomic_descendants(ir: dict, state: str) -> set[str]:
    if not is_compound(ir, state):
        return {state}
    out: set[str] = set()
    for c in ir["compound"][state]["children"]:
        out |= atomic_descendants(ir, c)
    return out


# ---------- core ------------------------------------------------------------


def flatten_ir(ir: dict, max_flat_states: int) -> tuple[str, str]:
    """Mutate `ir` in place. Return (status, message)."""
    if not ir.get("compound") and not ir.get("parallel"):
        ir["flattened"] = True
        return ("already_flat", "no compound or parallel states")

    if ir.get("parallel"):
        ir.setdefault("caveats", []).append("parallel states unsupported in v1; spec skipped")
        return ("skipped_parallel", "parallel states unsupported in v1")

    compound_set = set(ir["compound"].keys())
    atomic_ordered = [s for s in ir["states"] if s not in compound_set]

    if len(atomic_ordered) > max_flat_states:
        return (
            "blowup",
            f"{len(atomic_ordered)} atomic states exceeds max_flat_states={max_flat_states}",
        )

    parents = parent_map(ir)

    new_initial = resolve_initial(ir, ir["initial"])

    new_transitions: list[dict] = []
    state_set = set(ir["states"])
    for atomic in atomic_ordered:
        for src in ancestors_chain(atomic, parents):
            for t in ir["transitions"]:
                if t["from"] != src:
                    continue
                target_raw = t["to"]
                target = resolve_initial(ir, target_raw) if target_raw in state_set else target_raw
                new_transitions.append({
                    "from": atomic,
                    "event": t["event"],
                    "to": target,
                    "guard": t["guard"],
                })

    new_final: list[str] = []
    atomic_set = set(atomic_ordered)
    for f in ir.get("final", []):
        for atom in atomic_descendants(ir, f):
            if atom in atomic_set and atom not in new_final:
                new_final.append(atom)

    ir["states"] = atomic_ordered
    ir["initial"] = new_initial
    ir["final"] = new_final
    ir["transitions"] = new_transitions
    ir["compound"] = {}
    ir["flattened"] = True
    return (
        "flattened",
        f"flattened to {len(atomic_ordered)} atomic states; {len(new_transitions)} transitions",
    )


# ---------- self-test -------------------------------------------------------


def _expect(cond: bool, msg: str) -> None:
    if not cond:
        print(f"self-test FAIL: {msg}", file=sys.stderr)
        sys.exit(6)


def self_test() -> None:
    # (a) Flat machine — no-op.
    flat = {
        "id": "f", "initial": "a", "final": [], "events": ["X"],
        "states": ["a", "b"],
        "transitions": [{"from": "a", "event": "X", "to": "b", "guard": {"type": "always"}}],
        "compound": {}, "parallel": {}, "caveats": [],
    }
    status, _ = flatten_ir(flat, max_flat_states=1000)
    _expect(status == "already_flat", f"(a) flat machine status: {status}")
    _expect(flat["flattened"] is True, "(a) flat machine has flattened: true")
    _expect(flat["transitions"] == [{"from": "a", "event": "X", "to": "b", "guard": {"type": "always"}}], "(a) transitions unchanged")

    # (b) Simple compound — one compound with two children, one transition out.
    compound = {
        "id": "c", "initial": "A", "final": [],
        "events": ["X"],
        "states": ["A", "A.c1", "A.c2"],
        "transitions": [{"from": "A", "event": "X", "to": "A.c2", "guard": {"type": "always"}}],
        "compound": {"A": {"initial": "A.c1", "children": ["A.c1", "A.c2"]}},
        "parallel": {},
        "caveats": [],
    }
    status, _ = flatten_ir(compound, max_flat_states=1000)
    _expect(status == "flattened", f"(b) compound status: {status}")
    _expect(compound["states"] == ["A.c1", "A.c2"], f"(b) states: {compound['states']}")
    _expect(compound["initial"] == "A.c1", f"(b) initial: {compound['initial']}")
    _expect(len(compound["transitions"]) == 2, f"(b) two lifted transitions: {compound['transitions']}")
    froms = sorted(t["from"] for t in compound["transitions"])
    _expect(froms == ["A.c1", "A.c2"], f"(b) lifted onto both children: {froms}")
    _expect(compound["compound"] == {}, "(b) compound emptied")

    # (c) Nested compound — A contains B which contains atomic leaves.
    nested = {
        "id": "n", "initial": "A", "final": [],
        "events": ["X"],
        "states": ["A", "A.B", "A.B.x", "A.B.y"],
        "transitions": [{"from": "A", "event": "X", "to": "A.B.y", "guard": {"type": "always"}}],
        "compound": {
            "A":   {"initial": "A.B",   "children": ["A.B"]},
            "A.B": {"initial": "A.B.x", "children": ["A.B.x", "A.B.y"]},
        },
        "parallel": {},
        "caveats": [],
    }
    status, _ = flatten_ir(nested, max_flat_states=1000)
    _expect(status == "flattened", f"(c) nested status: {status}")
    _expect(nested["states"] == ["A.B.x", "A.B.y"], f"(c) states: {nested['states']}")
    _expect(nested["initial"] == "A.B.x", f"(c) initial resolved through chain: {nested['initial']}")
    _expect(len(nested["transitions"]) == 2, f"(c) lifted onto both leaves: {nested['transitions']}")

    # (d) Shadowing — child's own X-transition must precede the lifted one.
    shadow = {
        "id": "s", "initial": "A", "final": [],
        "events": ["X"],
        "states": ["A", "A.c1", "A.c2"],
        "transitions": [
            {"from": "A",    "event": "X", "to": "A.c2", "guard": {"type": "always"}},
            {"from": "A.c1", "event": "X", "to": "A.c1", "guard": {"type": "always"}},
        ],
        "compound": {"A": {"initial": "A.c1", "children": ["A.c1", "A.c2"]}},
        "parallel": {},
        "caveats": [],
    }
    status, _ = flatten_ir(shadow, max_flat_states=1000)
    _expect(status == "flattened", f"(d) shadow status: {status}")
    c1_transitions = [t for t in shadow["transitions"] if t["from"] == "A.c1"]
    _expect(len(c1_transitions) == 2, f"(d) A.c1 has 2 transitions: {c1_transitions}")
    _expect(c1_transitions[0]["to"] == "A.c1", f"(d) A.c1's own transition first: {c1_transitions}")
    _expect(c1_transitions[1]["to"] == "A.c2", f"(d) lifted-from-A second: {c1_transitions}")

    # (e) Resolving a transition target that points at a compound.
    target_resolve = {
        "id": "tr", "initial": "S", "final": [],
        "events": ["GO"],
        "states": ["S", "T", "T.x", "T.y"],
        "transitions": [{"from": "S", "event": "GO", "to": "T", "guard": {"type": "always"}}],
        "compound": {"T": {"initial": "T.x", "children": ["T.x", "T.y"]}},
        "parallel": {},
        "caveats": [],
    }
    status, _ = flatten_ir(target_resolve, max_flat_states=1000)
    _expect(status == "flattened", f"(e) target-resolve status: {status}")
    _expect(target_resolve["transitions"][0]["to"] == "T.x", f"(e) target resolved to T.x: {target_resolve['transitions'][0]}")

    # (f) Blowup — max_flat_states=2 with 3 atomic descendants.
    blow = {
        "id": "b", "initial": "A", "final": [],
        "events": ["X"],
        "states": ["A", "A.c1", "A.c2", "A.c3"],
        "transitions": [{"from": "A", "event": "X", "to": "A.c1", "guard": {"type": "always"}}],
        "compound": {"A": {"initial": "A.c1", "children": ["A.c1", "A.c2", "A.c3"]}},
        "parallel": {},
        "caveats": [],
    }
    status, message = flatten_ir(blow, max_flat_states=2)
    _expect(status == "blowup", f"(f) blowup status: {status} ({message})")
    _expect("compound" in blow and "A" in blow["compound"], "(f) IR untouched on blowup")

    # (g) Parallel — skipped.
    par = {
        "id": "p", "initial": "P", "final": [],
        "events": [],
        "states": ["P", "P.R1", "P.R2"],
        "transitions": [],
        "compound": {},
        "parallel": {"P": ["P.R1", "P.R2"]},
        "caveats": [],
    }
    status, _ = flatten_ir(par, max_flat_states=1000)
    _expect(status == "skipped_parallel", f"(g) parallel status: {status}")
    _expect(any("parallel states unsupported" in c for c in par["caveats"]), "(g) parallel caveat added")

    # (h) Final-state resolution through a compound.
    fin = {
        "id": "fn", "initial": "A", "final": ["F"],
        "events": ["X"],
        "states": ["A", "F", "F.done"],
        "transitions": [{"from": "A", "event": "X", "to": "F", "guard": {"type": "always"}}],
        "compound": {"F": {"initial": "F.done", "children": ["F.done"]}},
        "parallel": {},
        "caveats": [],
    }
    status, _ = flatten_ir(fin, max_flat_states=1000)
    _expect(status == "flattened", f"(h) final status: {status}")
    _expect(fin["final"] == ["F.done"], f"(h) final atomic-resolved: {fin['final']}")

    print("flatten.py self-test: PASS")


# ---------- entry point -----------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Flatten a state-machine IR sidecar.")
    parser.add_argument("input", nargs="?", help="path to <spec>.fsm.ir.json, or 'self-test'")
    parser.add_argument("--max-flat-states", type=int, default=1000)
    args = parser.parse_args()

    if not args.input:
        parser.print_usage(sys.stderr)
        sys.exit(2)
    if args.input == "self-test":
        self_test()
        return

    path = Path(args.input)
    if not path.is_file():
        print(f"flatten: sidecar not found: {args.input}", file=sys.stderr)
        sys.exit(3)
    try:
        ir = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        print(f"flatten: sidecar is not valid JSON: {e}", file=sys.stderr)
        sys.exit(3)

    status, message = flatten_ir(ir, max_flat_states=args.max_flat_states)
    if status == "blowup":
        print(f"flatten: skipped — {message}", file=sys.stderr)
        sys.exit(7)
    if status == "skipped_parallel":
        # Persist the caveat the IR picked up so the report aggregator sees it.
        path.write_text(json.dumps(ir, indent=2) + "\n")
        print(f"flatten: skipped — {message}")
        sys.exit(8)

    path.write_text(json.dumps(ir, indent=2) + "\n")
    print(f"flatten: {message}")


if __name__ == "__main__":
    main()
