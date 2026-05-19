#!/usr/bin/env python3
"""report.py — Phase 6 of test-flakiness-triage.

Renders a ranked Markdown report and a machine-readable JSON sidecar from
`/tmp/tft-classifications.json` and `/tmp/tft-densities.json`. Preserves
user annotations marked with `<!-- keep: id=<test-id> -->` fences in the
existing Markdown report, if any.

Exit codes:
    0  success
    1  --fail-on-findings was set AND at least one test classified worse
       than `stable-pass`
    2  bad usage
    3  required input file missing
    6  self-test failed
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

SEVERITY_ORDER = [
    "stable-fail",         # critical — definitely broken
    "drifting",            # high — regression
    "stratum-sensitive",   # high — environment-specific bug
    "flaky",               # medium — non-deterministic
    "insufficient-data",   # info
    "stable-pass",         # info — usually not shown
]
SEVERITY_LABEL = {
    "stable-fail":       "Critical — broken",
    "drifting":          "High — regression at a detectable point",
    "stratum-sensitive": "High — environment-specific failure",
    "flaky":             "Medium — non-deterministic",
    "insufficient-data": "Info — not enough data",
    "stable-pass":       "Info — stable",
}

# Match `<!-- keep: id=<test-id> -->` … `<!-- /keep -->` blocks. The id is
# the canonical `classname::name`; embedded comments inside the body are
# fine because we anchor on the literal `/keep` sentinel.
KEEP_RX = re.compile(
    r"<!--\s*keep:\s*id=(?P<id>[^>\s][^>]*?)\s*-->"
    r"(?P<body>.*?)"
    r"<!--\s*/keep\s*-->",
    re.S,
)


def _load_keep_annotations(md_path: Path) -> dict[str, str]:
    if not md_path.is_file():
        return {}
    return {m.group("id").strip(): m.group("body")
            for m in KEEP_RX.finditer(md_path.read_text())}


def _load_previous_classifications(json_path: Path) -> dict[str, str]:
    if not json_path.is_file():
        return {}
    try:
        prev = json.loads(json_path.read_text())
    except (json.JSONDecodeError, OSError):
        return {}
    return {c["test_id"]: c["classification"]
            for c in prev.get("classifications", [])}


def _format_test_block(c: dict, prev_cls: str | None, keep: str | None,
                       with_math: bool, densities: dict) -> str:
    label = c["classification"]
    line = f"### `{c['test_id']}`\n\n"
    diag = c["diagnosis"]
    if prev_cls and prev_cls != label:
        diag += f" *(changed: was {prev_cls}, now {label})*"
    line += f"- **Diagnosis**: {diag}\n"
    line += f"- **Suggested action**: {c['suggested_action']}\n"
    line += (f"- **Lost-trust score**: {c['lost_trust']:.2f}  "
             f"(n={c['n']}, pass-rate={c['density']:.0%})\n")
    if with_math:
        td = densities.get(c["test_id"], {})
        win = td.get("windowed", {}) if td else {}
        details = c.get("details") or {}
        if label == "stratum-sensitive":
            line += (f"- **Cylinder gap**: "
                     f"d(T | {details['stratum']}={details['high_value']}) − "
                     f"d(T | {details['stratum']}={details['low_value']}) "
                     f"= {details['gap']:.3f}\n")
        if label == "drifting":
            pv = details.get("p_value")
            line += (f"- **Change-point detector**: {details['method']}"
                     + (f" (p ≈ {pv:.3g})" if pv is not None else "")
                     + "\n")
        if td:
            line += (f"- **Global density** d(T) = {td.get('density', 0):.3f}, "
                     f"window size = {win.get('window_size', '—')}\n")
    if keep:
        line += "\n<!-- keep: id=" + c["test_id"] + " -->" + keep + \
                "<!-- /keep -->\n"
    return line + "\n"


def _math_appendix() -> str:
    return (
        "## Appendix — mathematical framing\n\n"
        "For each test `T`, the analyser treats the run history as a sequence "
        "`pass_T : I → {0,1}` indexed by run order. The global density "
        "`d(T) = (1/n) · Σ pass_T(i)` is the corpus pass rate; the cylinder "
        "density `d(T | s = v) = (1/n_v) · Σ_{i: strat(i).s = v} pass_T(i)` "
        "is the pass rate conditional on a single stratum coordinate. A "
        "stratum *explains* the test when "
        "`max_v d(T | s=v) − min_v d(T | s=v) ≥ stratum_threshold` with both "
        "extreme cells having at least `min_runs/2` observations.\n\n"
        "Drift is detected against the windowed series "
        "`d_n(T) = (1/w) · Σ_{i=n−w+1..n} pass_T(i)`, with `w = max(20, n//10)`. "
        "A test is `drifting` iff `liminf d_n ≠ limsup d_n` along the run-order "
        "subsequence, approximated by Pettitt's non-parametric change-point test "
        "(Applied Statistics 28(2), 1979). When `scipy` is unavailable, the "
        "analyser falls back to a CUSUM on the running mean, and then to a "
        "quartile-split; both are tagged in the per-test details so you can "
        "downgrade confidence.\n\n"
        "Concretely, the cylinder + drift decomposition is what lets the "
        "analyser distinguish four otherwise-conflated failure modes:\n\n"
        "1. **Truly random** — `d_n` converges to some `p ∈ (0,1)`, no "
        "   cylinder explains.\n"
        "2. **Stratum-explained** — globally `d(T) ∈ (0,1)`, but "
        "   `d(T | s = v) ∈ {0,1}` for some `(s, v)`.\n"
        "3. **Drift** — `d_n` does not converge; a change point is detected.\n"
        "4. **Sparse** — `n` is too small to distinguish (1)/(2)/(3).\n\n"
        "Branch / commit are deliberately *not* used as stratum coordinates: "
        "drift along the chronological subsequence already catches "
        "\"broken since commit X\", and treating `commit` as a cylinder would "
        "trivially flag every code change as stratum-sensitive.\n"
    )


def render_markdown(classifications: list[dict], densities: dict,
                    args: dict, prev_cls: dict[str, str],
                    keep: dict[str, str], with_math: bool) -> str:
    args_summary = (
        f"_Analyzed {sum(c['n'] for c in classifications)} test executions "
        f"across {len(classifications)} tests. "
        f"min_runs={args.get('min_runs', 10)}, "
        f"stable_threshold={args.get('stable_threshold', 0.99)}, "
        f"stratum_threshold={args.get('stratum_threshold', 0.5)}._\n\n"
    )
    by_sev: dict[str, list[dict]] = {s: [] for s in SEVERITY_ORDER}
    for c in classifications:
        by_sev.setdefault(c["classification"], []).append(c)

    md = "# Test Flakiness Report\n\n" + args_summary
    for sev in SEVERITY_ORDER:
        bucket = by_sev.get(sev) or []
        if sev == "stable-pass" and bucket:
            # Stable-pass tests are not enumerated, just summarised.
            md += f"## {SEVERITY_LABEL[sev]} ({len(bucket)})\n\n"
            md += f"_{len(bucket)} tests passed across all observed runs._\n\n"
            continue
        if not bucket:
            continue
        md += f"## {SEVERITY_LABEL[sev]} ({len(bucket)})\n\n"
        # Sort within bucket by lost_trust desc, then by test_id
        bucket.sort(key=lambda c: (-c["lost_trust"], c["test_id"]))
        for c in bucket:
            md += _format_test_block(
                c, prev_cls.get(c["test_id"]),
                keep.get(c["test_id"]), with_math, densities,
            )
    if with_math:
        md += _math_appendix()
    return md


def run(class_path: str, dens_path: str, args_path: str,
        out_md: str, out_json: str, fail_on_findings: bool) -> int:
    if not Path(class_path).is_file():
        print(f"report: input not found: {class_path}", file=sys.stderr)
        sys.exit(3)
    cdata = json.loads(Path(class_path).read_text())
    classifications = cdata.get("classifications", [])
    args = cdata.get("args") or {}
    if Path(args_path).is_file():
        args = json.loads(Path(args_path).read_text())
    densities = json.loads(Path(dens_path).read_text()) \
        if Path(dens_path).is_file() else {}

    with_math = bool(args.get("with_math"))
    md_path = Path(out_md)
    json_path = Path(out_json)
    keep = _load_keep_annotations(md_path)
    prev_cls = _load_previous_classifications(json_path)

    md = render_markdown(classifications, densities, args,
                         prev_cls, keep, with_math)
    md_path.write_text(md)
    json_path.write_text(json.dumps(
        {"args": args, "classifications": classifications}, indent=2,
    ))

    print(json.dumps({
        "tests": len(classifications),
        "md": str(md_path),
        "json": str(json_path),
    }))

    if fail_on_findings:
        non_stable = [c for c in classifications
                      if c["classification"] != "stable-pass"
                      and c["classification"] != "insufficient-data"]
        if non_stable:
            return 1
    return 0


def self_test() -> int:
    classifications = [
        {"test_id": "C::t1", "classification": "stable-pass",
         "diagnosis": "ok", "suggested_action": "—",
         "lost_trust": 0.0, "n": 100, "density": 1.0, "details": {}},
        {"test_id": "C::t2", "classification": "stratum-sensitive",
         "diagnosis": "fails on macos", "suggested_action": "guard",
         "lost_trust": 0.5, "n": 100, "density": 0.5,
         "details": {"stratum": "os", "high_value": "linux",
                     "low_value": "macos", "gap": 1.0}},
    ]
    md = render_markdown(classifications, {}, {"with_math": False,
                                                "min_runs": 10},
                         prev_cls={}, keep={}, with_math=False)
    assert "C::t2" in md
    assert "Critical" not in md  # no stable-fail
    assert "ultrafilter" not in md.lower() and "cylinder" not in md.lower()

    # with_math=True surfaces the math appendix
    md2 = render_markdown(classifications, {}, {"with_math": True,
                                                "min_runs": 10},
                          prev_cls={}, keep={}, with_math=True)
    assert "Pettitt" in md2 or "pettitt" in md2.lower()
    assert "d(T" in md2

    # keep-block preservation
    keep_md = _load_keep_annotations  # function exists
    md_with_keep = render_markdown(
        classifications, {}, {"with_math": False, "min_runs": 10},
        prev_cls={}, keep={"C::t2": " (quarantined, see PR-1234) "},
        with_math=False,
    )
    assert "PR-1234" in md_with_keep

    # changed-from annotation
    md_changed = render_markdown(
        classifications, {}, {"with_math": False, "min_runs": 10},
        prev_cls={"C::t2": "flaky"}, keep={}, with_math=False,
    )
    assert "was flaky, now stratum-sensitive" in md_changed

    print("self-test OK")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "self-test":
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--classifications", default="/tmp/tft-classifications.json")
    ap.add_argument("--densities", default="/tmp/tft-densities.json")
    ap.add_argument("--args", default="/tmp/tft-args.json")
    ap.add_argument("--out-md", default="./test-flakiness-report.md")
    ap.add_argument("--out-json", default="./test-flakiness-report.json")
    ap.add_argument("--fail-on-findings", action="store_true")
    a = ap.parse_args(argv[1:])
    return run(a.classifications, a.densities, a.args,
               a.out_md, a.out_json, a.fail_on_findings)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
