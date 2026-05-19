#!/usr/bin/env python3
"""report.py — Phase 6 of state-machine-invariants.

Aggregates the per-spec results of Phases 2–5 into one markdown report
on stdout and one JSON sidecar at `./state-machine-invariants-report.json`.

Input: a single JSON object on stdin (or via `--input <path>`) with the
shape produced by the agent at the end of Phase 5:

    {
      "analyzed": ["path/to/spec1", "path/to/spec2"],
      "skipped":  [{"path": "path/to/spec3", "reason": "..."}],
      "findings": [<finding>, <finding>, ...]
    }

Each finding carries its source spec inside `location.spec`, so the
report groups findings by spec via that field — `analyzed` and `skipped`
are used only to render specs with zero findings (✓) and the "skipped"
section, respectively.

Usage:
    report.py [--with-math] [--fail-on-findings] [--input PATH]
    report.py self-test

Output:
    stdout: markdown report (format per SKILL.md §Phase 6).
    ./state-machine-invariants-report.json: a copy of the input plus a
                                            `generated_at` ISO timestamp.

Exit codes:
    0  default — even if findings exist.
    1  `--fail-on-findings` was set AND at least one finding has severity
       `warning` or higher.
    2  bad usage.
    3  input is missing or malformed.
    6  self-test failed.
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
from collections import defaultdict
from io import StringIO
from pathlib import Path


SEVERITY_RANK = {"info": 1, "warning": 2, "error": 3, "critical": 4}


def render_markdown(run, *, with_math: bool) -> str:
    analyzed = list(run.get("analyzed") or [])
    skipped = list(run.get("skipped") or [])
    findings = list(run.get("findings") or [])

    by_spec: dict[str, list] = defaultdict(list)
    for f in findings:
        by_spec[f["location"]["spec"]].append(f)

    specs_with_findings = sum(1 for s in analyzed if by_spec.get(s))
    total_findings = sum(len(by_spec.get(s, [])) for s in analyzed)

    out = StringIO()
    out.write("## state-machine-invariants — Report\n\n")
    out.write(
        f"Analysed {len(analyzed)} spec(s). "
        f"Findings: {total_findings} across {specs_with_findings} spec(s). "
        f"Skipped: {len(skipped)} spec(s).\n"
    )

    for spec in analyzed:
        spec_findings = by_spec.get(spec, [])
        if not spec_findings:
            out.write(f"\n### {spec} ✓ no findings\n")
            continue
        out.write(f"\n### {spec} — {len(spec_findings)} finding(s)\n\n")
        for f in spec_findings:
            out.write(f"⚠ {f['summary']}\n")
            out.write(f"  {f['detail']}\n")
            if with_math and f.get("math"):
                out.write(f"  [Math: {f['math']}]\n")
            cex = f.get("counterexample")
            if cex and cex.get("trace"):
                out.write(f"  Counterexample: {' ; '.join(cex['trace'])}\n")
            out.write("\n")

    for entry in skipped:
        out.write(f"\n### {entry['path']} ⚠ skipped\n")
        out.write(f"  Reason: {entry.get('reason', '(no reason given)')}\n")

    return out.getvalue()


def write_sidecar(run: dict, path: Path) -> None:
    payload = dict(run)
    payload["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    path.write_text(json.dumps(payload, indent=2) + "\n")


def any_warning(findings) -> bool:
    return any(SEVERITY_RANK.get(f.get("severity", "warning"), 2) >= 2 for f in findings)


# ---------- self-test -------------------------------------------------------


def _expect(cond, msg):
    if not cond:
        print(f"self-test FAIL: {msg}", file=sys.stderr)
        sys.exit(6)


def self_test():
    run = {
        "analyzed": ["specs/order.fsm.yaml", "src/auth/machine.ts"],
        "skipped": [{"path": "src/checkout/machine.ts", "reason": "computed property names"}],
        "findings": [
            {
                "invariant": "reachability",
                "severity": "warning",
                "location": {"spec": "src/auth/machine.ts", "state": "passwordReset"},
                "summary": "Unreachable state: passwordReset",
                "detail": "No event sequence from `loggedOut` reaches it.",
                "math": "passwordReset ∉ orbit(loggedOut) under the transition relation.",
                "counterexample": None,
            },
            {
                "invariant": "unused-event",
                "severity": "warning",
                "location": {"spec": "src/auth/machine.ts", "event": "PASSWORD_EXPIRED"},
                "summary": "Unused event: PASSWORD_EXPIRED declared but never consumed.",
                "detail": "Event `PASSWORD_EXPIRED` is in `events` but no transition consumes it.",
                "math": "PASSWORD_EXPIRED ∉ image(π_event).",
                "counterexample": None,
            },
        ],
    }

    md_with_math = render_markdown(run, with_math=True)
    _expect("✓ no findings" in md_with_math, "clean spec gets ✓ no findings line")
    _expect("2 finding(s)" in md_with_math, "spec with findings gets count header")
    _expect("⚠ skipped" in md_with_math, "skipped section rendered")
    _expect("[Math:" in md_with_math, "with_math surfaces [Math:] lines")
    _expect("computed property names" in md_with_math, "skip reason rendered")

    md_no_math = render_markdown(run, with_math=False)
    _expect("[Math:" not in md_no_math, "with_math=False omits [Math:] lines")
    _expect("Analysed 2 spec(s)" in md_no_math, "summary line correct")
    _expect("Findings: 2 across 1 spec(s)" in md_no_math, "findings tally correct")

    # No-findings case
    empty_run = {"analyzed": ["a.yaml"], "skipped": [], "findings": []}
    md_empty = render_markdown(empty_run, with_math=False)
    _expect("Findings: 0 across 0 spec(s)" in md_empty, "zero findings tallied correctly")
    _expect("✓ no findings" in md_empty, "clean spec line present")
    _expect("⚠ skipped" not in md_empty, "no skipped section when none")

    _expect(any_warning(run["findings"]) is True, "any_warning detects warnings")
    _expect(any_warning([]) is False, "any_warning empty → False")

    print("report.py self-test: PASS")


# ---------- entry point -----------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Aggregate state-machine-invariants findings into a report.")
    parser.add_argument("input", nargs="?", help="'self-test', or omit to read from stdin (or --input)")
    parser.add_argument("--with-math", action="store_true")
    parser.add_argument("--fail-on-findings", action="store_true")
    parser.add_argument("--input", dest="input_path", help="path to the run JSON (else stdin)")
    parser.add_argument(
        "--sidecar",
        default="state-machine-invariants-report.json",
        help="path to the JSON sidecar (default: CWD)",
    )
    args = parser.parse_args()

    if args.input == "self-test":
        self_test()
        return

    if args.input_path:
        try:
            text = Path(args.input_path).read_text()
        except FileNotFoundError:
            print(f"report: input file not found: {args.input_path}", file=sys.stderr)
            sys.exit(3)
    else:
        text = sys.stdin.read()
    if not text.strip():
        print("report: empty input", file=sys.stderr)
        sys.exit(3)
    try:
        run = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"report: input is not valid JSON: {e}", file=sys.stderr)
        sys.exit(3)

    md = render_markdown(run, with_math=args.with_math)
    sys.stdout.write(md)

    write_sidecar(run, Path(args.sidecar))

    if args.fail_on_findings and any_warning(run.get("findings") or []):
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
