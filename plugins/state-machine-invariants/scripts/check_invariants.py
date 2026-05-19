#!/usr/bin/env python3
"""check_invariants.py — Phase 5 of state-machine-invariants.

Reads a flattened IR sidecar; emits a JSON array of findings to stdout
(zero or more across the five v1 checks). Each check is a pure function
over the flat IR; they all share the finding shape defined in
SKILL.md §Phase 5.

Usage:
    check_invariants.py <ir.fsm.ir.json> [--spec-path PATH] [--with-math]
    check_invariants.py self-test

`--spec-path` is the human-readable spec path that each finding's
`location.spec` field should carry — typically the original `.fsm.yaml`
or `.ts` source, not the IR sidecar. Defaults to the input path.

Exit codes:
    0  success (findings JSON array on stdout — possibly empty)
    2  bad usage
    3  sidecar file missing, malformed, or not flattened
    6  self-test failed
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path


# ---------- finding helpers -------------------------------------------------


def _location(spec, *, state=None, event=None, idx=None):
    out = {"spec": spec}
    if state is not None:
        out["state"] = state
    if event is not None:
        out["event"] = event
    if idx is not None:
        out["transition_index"] = idx
    return out


def _finding(invariant, location, summary, detail, *, math=None, counterexample=None):
    f = {
        "invariant": invariant,
        "severity": "warning",
        "location": location,
        "summary": summary,
        "detail": detail,
        "counterexample": counterexample,
    }
    if math is not None:
        f["math"] = math
    return f


def _live(t):
    return t["guard"]["type"] != "literalFalse"


# ---------- check 5a: reachability -----------------------------------------


def check_reachability(ir, spec, with_math):
    findings = []
    initial = ir.get("initial")
    if not initial:
        return findings

    out_edges = defaultdict(list)
    for t in ir["transitions"]:
        if _live(t):
            out_edges[t["from"]].append(t["to"])

    visited = set()
    queue = deque([initial])
    while queue:
        s = queue.popleft()
        if s in visited:
            continue
        visited.add(s)
        for nxt in out_edges[s]:
            if nxt not in visited:
                queue.append(nxt)

    for s in ir["states"]:
        if s not in visited:
            findings.append(_finding(
                "reachability",
                _location(spec, state=s),
                summary=f"Unreachable state: {s}",
                detail=f"No event sequence from `{initial}` reaches state `{s}`.",
                math=(f"{s} ∉ orbit({initial}) under the transition relation." if with_math else None),
            ))
    return findings


# ---------- check 5b: deadlock ---------------------------------------------


def check_deadlock(ir, spec, with_math):
    findings = []
    final = set(ir.get("final", []))
    initial = ir.get("initial")

    live_count = defaultdict(int)
    for t in ir["transitions"]:
        if _live(t):
            live_count[t["from"]] += 1

    bfs_parent = {initial: None} if initial else {}
    if initial:
        queue = deque([initial])
        while queue:
            s = queue.popleft()
            for t in ir["transitions"]:
                if t["from"] == s and _live(t) and t["to"] not in bfs_parent:
                    bfs_parent[t["to"]] = (s, t["event"])
                    queue.append(t["to"])

    for s in ir["states"]:
        if s in final or live_count[s] > 0:
            continue
        trace = []
        if s in bfs_parent and bfs_parent[s] is not None:
            cur = s
            while bfs_parent.get(cur) is not None:
                parent, event = bfs_parent[cur]
                trace.append(f"{parent} -{event}-> {cur}")
                cur = parent
            trace.reverse()
        findings.append(_finding(
            "deadlock",
            _location(spec, state=s),
            summary=f"Deadlock state: {s} (non-final, no live outgoing transitions).",
            detail=f"State `{s}` is not in `final` and has no transitions with a non-`literalFalse` guard.",
            math=(f"{s} is a sink in the transition graph but is not declared final." if with_math else None),
            counterexample=({"trace": trace} if trace else None),
        ))
    return findings


# ---------- check 5c: dead transitions -------------------------------------


def check_dead_transitions(ir, spec, with_math):
    findings = []
    for i, t in enumerate(ir["transitions"]):
        if t["guard"]["type"] != "literalFalse":
            continue
        findings.append(_finding(
            "dead-transition",
            _location(spec, state=t["from"], event=t["event"], idx=i),
            summary=f"Dead transition: (state={t['from']}, event={t['event']}) → {t['to']} has guard \"false\".",
            detail="The transition is in the relation but its guard is literally false.",
            math=("The transition is in the relation but the guard's denotation is the empty set." if with_math else None),
        ))
    return findings


# ---------- check 5d: overlapping guards -----------------------------------


def _shadows(earlier, later):
    """Does `earlier` shadow `later` under XState's first-match rule?

    - either side `literalFalse`: handled by the dead-transition check; not a shadow.
    - either side `function`: opaque; caller skips the whole group.
    - `earlier` is `always`: shadows anything live.
    - both are `expr` with identical `expr` text: `later` never fires.
    """
    if earlier["type"] == "literalFalse" or later["type"] == "literalFalse":
        return False
    if earlier["type"] == "function" or later["type"] == "function":
        return False
    if earlier["type"] == "always":
        return True
    if earlier["type"] == "expr" and later["type"] == "expr":
        return earlier.get("expr") == later.get("expr")
    return False


def check_overlapping_guards(ir, spec, with_math):
    findings = []
    groups = defaultdict(list)
    for i, t in enumerate(ir["transitions"]):
        groups[(t["from"], t["event"])].append((i, t))

    for (frm, ev), group in groups.items():
        if len(group) < 2:
            continue
        if any(t["guard"]["type"] == "function" for _, t in group):
            continue
        shadowed_by = {}
        for i in range(len(group)):
            idx_i, t_i = group[i]
            for j in range(i + 1, len(group)):
                idx_j, t_j = group[j]
                if idx_j in shadowed_by:
                    continue
                if _shadows(t_i["guard"], t_j["guard"]):
                    shadowed_by[idx_j] = (idx_i, t_i, t_j)
        for later_idx, (earlier_idx, t_earlier, t_later) in shadowed_by.items():
            findings.append(_finding(
                "overlapping-guards",
                _location(spec, state=frm, event=ev, idx=later_idx),
                summary=f"Overlapping guards on (state={frm}, event={ev}): transition #{earlier_idx} shadows transition #{later_idx}.",
                detail=(
                    f"Transition #{earlier_idx} (→ {t_earlier['to']}, guard {t_earlier['guard']}) shadows "
                    f"transition #{later_idx} (→ {t_later['to']}, guard {t_later['guard']}). "
                    f"XState picks #{earlier_idx}; #{later_idx} is dead."
                ),
                math=(f"The transition relation is non-functional on input ({frm}, {ev}); only the lexically first arrow is taken." if with_math else None),
                counterexample={"trace": [f"shadowed: transition #{later_idx} ({frm} -{ev}-> {t_later['to']})"]},
            ))
    return findings


# ---------- check 5e: unused events ----------------------------------------


def check_unused_events(ir, spec, with_math):
    findings = []
    declared = list(ir.get("events", []))
    used = {t["event"] for t in ir["transitions"]}
    for ev in declared:
        if ev in used:
            continue
        findings.append(_finding(
            "unused-event",
            _location(spec, event=ev),
            summary=f"Unused event: {ev} declared but never consumed.",
            detail=f"Event `{ev}` is in the `events` list but no transition consumes it.",
            math=(f"{ev} ∉ image(π_event) — the transition relation is not total on the input alphabet." if with_math else None),
        ))
    return findings


# ---------- driver ----------------------------------------------------------


def run_all_checks(ir, spec, with_math):
    out = []
    out += check_reachability(ir, spec, with_math)
    out += check_deadlock(ir, spec, with_math)
    out += check_dead_transitions(ir, spec, with_math)
    out += check_overlapping_guards(ir, spec, with_math)
    out += check_unused_events(ir, spec, with_math)
    return out


# ---------- self-test -------------------------------------------------------


def _expect(cond, msg):
    if not cond:
        print(f"self-test FAIL: {msg}", file=sys.stderr)
        sys.exit(6)


def _flat(states, transitions, *, initial=None, final=(), events=()):
    return {
        "id": "t", "initial": initial or states[0], "final": list(final),
        "events": list(events), "states": list(states),
        "transitions": list(transitions),
        "compound": {}, "parallel": {}, "caveats": [], "flattened": True,
    }


def self_test():
    # 5a — Reachability: `c` is declared but never reached.
    ir = _flat(
        ["a", "b", "c"],
        [{"from": "a", "event": "X", "to": "b", "guard": {"type": "always"}}],
        initial="a", final=["b"], events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    reach = [f for f in findings if f["invariant"] == "reachability"]
    _expect(len(reach) == 1 and reach[0]["location"]["state"] == "c", f"5a reach: {reach}")

    # 5b — Deadlock: `b` is non-final and has no live outgoing transition.
    ir = _flat(
        ["a", "b"],
        [{"from": "a", "event": "X", "to": "b", "guard": {"type": "always"}}],
        initial="a", events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    dl = [f for f in findings if f["invariant"] == "deadlock"]
    _expect(len(dl) == 1 and dl[0]["location"]["state"] == "b", f"5b deadlock: {dl}")
    _expect(dl[0]["counterexample"]["trace"] == ["a -X-> b"], f"5b trace: {dl[0]['counterexample']}")

    # 5c — Dead transition: explicit literalFalse guard.
    ir = _flat(
        ["a", "b"],
        [
            {"from": "a", "event": "X", "to": "b", "guard": {"type": "always"}},
            {"from": "a", "event": "X", "to": "b", "guard": {"type": "literalFalse"}},
        ],
        initial="a", final=["b"], events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    dead = [f for f in findings if f["invariant"] == "dead-transition"]
    _expect(len(dead) == 1, f"5c dead: {dead}")
    _expect(dead[0]["location"]["transition_index"] == 1, f"5c idx: {dead[0]['location']}")

    # 5d — Overlapping guards: two identical `expr` guards on (a, X).
    ir = _flat(
        ["a", "b", "c"],
        [
            {"from": "a", "event": "X", "to": "b", "guard": {"type": "expr", "expr": "ctx.flag"}},
            {"from": "a", "event": "X", "to": "c", "guard": {"type": "expr", "expr": "ctx.flag"}},
        ],
        initial="a", final=["b", "c"], events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    ov = [f for f in findings if f["invariant"] == "overlapping-guards"]
    _expect(len(ov) == 1, f"5d overlap: {ov}")

    # 5d — `always` shadows a later `expr`.
    ir = _flat(
        ["a", "b", "c"],
        [
            {"from": "a", "event": "X", "to": "b", "guard": {"type": "always"}},
            {"from": "a", "event": "X", "to": "c", "guard": {"type": "expr", "expr": "ctx.flag"}},
        ],
        initial="a", final=["b", "c"], events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    ov = [f for f in findings if f["invariant"] == "overlapping-guards"]
    _expect(len(ov) == 1, f"5d always-shadows: {ov}")

    # 5d — different `expr` strings are NOT overlapping.
    ir = _flat(
        ["a", "b", "c"],
        [
            {"from": "a", "event": "X", "to": "b", "guard": {"type": "expr", "expr": "ctx.flag"}},
            {"from": "a", "event": "X", "to": "c", "guard": {"type": "expr", "expr": "ctx.other"}},
        ],
        initial="a", final=["b", "c"], events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    ov = [f for f in findings if f["invariant"] == "overlapping-guards"]
    _expect(len(ov) == 0, f"5d distinct exprs not flagged: {ov}")

    # 5d — `expr` first, `always` second is NOT a shadow (intentional pattern).
    ir = _flat(
        ["a", "b", "c"],
        [
            {"from": "a", "event": "X", "to": "b", "guard": {"type": "expr", "expr": "ctx.flag"}},
            {"from": "a", "event": "X", "to": "c", "guard": {"type": "always"}},
        ],
        initial="a", final=["b", "c"], events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    ov = [f for f in findings if f["invariant"] == "overlapping-guards"]
    _expect(len(ov) == 0, f"5d expr-then-always not flagged: {ov}")

    # 5d — `function` in the group: whole group skipped.
    ir = _flat(
        ["a", "b", "c"],
        [
            {"from": "a", "event": "X", "to": "b", "guard": {"type": "function"}},
            {"from": "a", "event": "X", "to": "c", "guard": {"type": "always"}},
        ],
        initial="a", final=["b", "c"], events=["X"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    ov = [f for f in findings if f["invariant"] == "overlapping-guards"]
    _expect(len(ov) == 0, f"5d function-guard skips group: {ov}")

    # 5e — Unused event: `Y` is declared but never consumed.
    ir = _flat(
        ["a", "b"],
        [{"from": "a", "event": "X", "to": "b", "guard": {"type": "always"}}],
        initial="a", final=["b"], events=["X", "Y"],
    )
    findings = run_all_checks(ir, "t", with_math=False)
    unused = [f for f in findings if f["invariant"] == "unused-event"]
    _expect(len(unused) == 1 and unused[0]["location"]["event"] == "Y", f"5e unused: {unused}")

    # with_math toggle
    findings_math = run_all_checks(_flat(
        ["a", "b"],
        [{"from": "a", "event": "X", "to": "b", "guard": {"type": "literalFalse"}}],
        initial="a", final=["b"], events=["X"],
    ), "t", with_math=True)
    _expect(all("math" in f for f in findings_math), f"with_math populates math: {findings_math}")
    findings_no_math = run_all_checks(_flat(
        ["a", "b"],
        [{"from": "a", "event": "X", "to": "b", "guard": {"type": "literalFalse"}}],
        initial="a", final=["b"], events=["X"],
    ), "t", with_math=False)
    _expect(all("math" not in f for f in findings_no_math), f"!with_math omits math: {findings_no_math}")

    print("check_invariants.py self-test: PASS")


# ---------- entry point -----------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Run the five state-machine invariant checks.")
    parser.add_argument("input", nargs="?", help="path to <spec>.fsm.ir.json, or 'self-test'")
    parser.add_argument("--with-math", action="store_true")
    parser.add_argument("--spec-path", help="human-readable spec path (defaults to <input>)")
    args = parser.parse_args()

    if not args.input:
        parser.print_usage(sys.stderr)
        sys.exit(2)
    if args.input == "self-test":
        self_test()
        return

    path = Path(args.input)
    if not path.is_file():
        print(f"check_invariants: sidecar not found: {args.input}", file=sys.stderr)
        sys.exit(3)
    try:
        ir = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        print(f"check_invariants: sidecar is not valid JSON: {e}", file=sys.stderr)
        sys.exit(3)
    if not ir.get("flattened"):
        print("check_invariants: sidecar is not flattened (run flatten.py first)", file=sys.stderr)
        sys.exit(3)

    spec_label = args.spec_path or args.input
    findings = run_all_checks(ir, spec_label, args.with_math)
    print(json.dumps(findings, indent=2))


if __name__ == "__main__":
    main()
