#!/usr/bin/env python3
"""classify.py — Phase 5 of test-flakiness-triage.

Reads `/tmp/tft-densities.json` and `/tmp/tft-args.json`, writes
`/tmp/tft-classifications.json`. Classification priority order is
documented in SKILL.md § Phase 5 and recapped inline below.

Exit codes:
    0  success
    2  bad usage
    3  input file missing or malformed
    6  self-test failed
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

TEMPORAL_STRATA = {"hour", "dow"}

# Thresholds calibrated per ADR-0002 (sibling adr/ directory).
METHOD_EFFECT_THRESHOLDS = {
    "pettitt":        0.30,
    "cusum":          0.40,
    "quartile-split": 0.60,
    "unavailable":    1.1,
}


def _stratum_gap(by_stratum: dict, min_cell: int,
                 allow: set[str] | None = None
                 ) -> tuple[str | None, str | None, str | None, float]:
    """Return (stratum_name, hi_value, lo_value, gap) for the stratum with
    the largest gap whose extreme cells both have ≥ min_cell observations.
    Returns (None, None, None, 0.0) if no stratum qualifies.

    Restricts consideration to `allow` when provided. Prefers the stratum
    with the **smallest cardinality** (fewest distinct values) when ties —
    that's the most parsimonious explanation.
    """
    best: tuple[str, str, str, float, int] | None = None  # +cardinality
    for name, cells in by_stratum.items():
        if allow is not None and name not in allow:
            continue
        eligible = {v: c for v, c in cells.items() if c.get("n", 0) >= min_cell}
        if len(eligible) < 2:
            continue
        hi_v = max(eligible, key=lambda k: eligible[k]["density"])
        lo_v = min(eligible, key=lambda k: eligible[k]["density"])
        gap = eligible[hi_v]["density"] - eligible[lo_v]["density"]
        card = len(cells)
        candidate = (name, hi_v, lo_v, gap, card)
        if best is None:
            best = candidate
        else:
            # Prefer larger gap; on tie, prefer smaller cardinality.
            if gap > best[3] + 1e-9:
                best = candidate
            elif abs(gap - best[3]) < 1e-9 and card < best[4]:
                best = candidate
    if best is None:
        return None, None, None, 0.0
    name, hi_v, lo_v, gap, _ = best
    return name, hi_v, lo_v, gap


def _confidence(n: int, min_runs: int) -> float:
    """Logarithmic confidence in [0, 1] reaching 1 at n ≥ 4·min_runs."""
    if n <= 1:
        return 0.0
    cap = max(2, 4 * min_runs)
    return min(1.0, math.log10(n) / math.log10(cap))


def _lost_trust(density: float, n: int, min_runs: int) -> float:
    return (1 - min(density, 1 - density)) * _confidence(n, min_runs)


def classify_one(test_id: str, td: dict, args: dict) -> dict:
    n = td["n"]
    min_runs = args["min_runs"]
    stable_threshold = args["stable_threshold"]
    stratum_threshold = args["stratum_threshold"]

    if n < min_runs:
        return {
            "test_id": test_id,
            "classification": "insufficient-data",
            "diagnosis": f"Only {n} runs observed; need ≥ {min_runs}.",
            "suggested_action": "Run more iterations before drawing conclusions.",
            "lost_trust": 0.0,
            "n": n,
            "density": td["density"],
            "details": {"min_runs": min_runs},
        }

    density = td["density"]
    min_cell = max(1, min_runs // 2)
    all_strata = set(td["by_stratum"].keys())
    non_temp_allowed = all_strata - TEMPORAL_STRATA
    nt_name, nt_hi, nt_lo, nt_gap = _stratum_gap(
        td["by_stratum"], min_cell, allow=non_temp_allowed)
    t_name, t_hi, t_lo, t_gap = _stratum_gap(
        td["by_stratum"], min_cell, allow=TEMPORAL_STRATA)
    win = td.get("windowed") or {}
    cp = win.get("change_point")
    before = win.get("before_density")
    after = win.get("after_density")
    method = win.get("method", "unavailable")
    effect = abs((before or 0) - (after or 0)) if cp is not None else 0.0

    nt_qualifies = nt_gap >= stratum_threshold
    drift_effect_min = METHOD_EFFECT_THRESHOLDS.get(method, 0.5)
    drift_qualifies = cp is not None and effect >= drift_effect_min
    temp_qualifies = t_gap >= stratum_threshold

    # Priority order per ADR-0001.
    if density >= stable_threshold and not nt_qualifies and not drift_qualifies:
        cls = "stable-pass"
    elif density <= 1 - stable_threshold and not nt_qualifies and not drift_qualifies:
        cls = "stable-fail"
    elif nt_qualifies:
        cls = "stratum-sensitive"
        name, hi_v, lo_v, gap = nt_name, nt_hi, nt_lo, nt_gap
    elif drift_qualifies:
        cls = "drifting"
    else:
        cls = "flaky"

    diagnosis = ""
    action = ""
    details: dict = {}

    if cls == "stable-pass":
        diagnosis = f"Passed {td['passes']}/{n} runs across the corpus."
        action = "—"
    elif cls == "stable-fail":
        diagnosis = f"Failed {n - td['passes']}/{n} runs across the corpus."
        action = "Fix the test or the code under test."
    elif cls == "stratum-sensitive":
        hi_cell = td["by_stratum"][name][hi_v]
        lo_cell = td["by_stratum"][name][lo_v]
        diagnosis = (f"Passes {hi_cell['density']:.0%} on {name}={hi_v}, "
                     f"fails {1 - lo_cell['density']:.0%} on {name}={lo_v}.")
        action = f"Isolate the {name}-specific behaviour or guard the test."
        details = {"stratum": name, "high_value": hi_v, "low_value": lo_v,
                   "gap": gap, "hi_cell": hi_cell, "lo_cell": lo_cell}
    elif cls == "drifting":
        diagnosis = (f"Was passing {before:.0%}, now passing {after:.0%} since "
                     f"run #{cp}.")
        if method != "pettitt":
            diagnosis += f" (detector: {method}; treat as suggestive.)"
        action = f"Bisect runs #{max(0, cp - 1)}..#{cp} for the regression."
        details = {"change_point": cp, "before_density": before,
                   "after_density": after, "method": method,
                   "p_value": win.get("change_p_value")}
    else:  # flaky
        diagnosis = f"Passes {density:.0%} with no stratum-based explanation."
        if temp_qualifies and t_name and t_hi and t_lo:
            t_hi_cell = td["by_stratum"][t_name][t_hi]
            t_lo_cell = td["by_stratum"][t_name][t_lo]
            diagnosis += (
                f" Possible periodic pattern: passes "
                f"{t_hi_cell['density']:.0%} on {t_name}={t_hi}, "
                f"{t_lo_cell['density']:.0%} on {t_name}={t_lo} "
                f"(too few runs to confirm)."
            )
            details["temporal_hint"] = {
                "stratum": t_name, "high_value": t_hi, "low_value": t_lo,
                "gap": t_gap,
            }
        action = "Treat as truly non-deterministic; consider quarantining."

    return {
        "test_id": test_id,
        "classification": cls,
        "diagnosis": diagnosis,
        "suggested_action": action,
        "lost_trust": _lost_trust(density, n, min_runs),
        "n": n,
        "density": density,
        "details": details,
    }


def run(densities_path: str, args_path: str, out_path: str) -> int:
    if not Path(densities_path).is_file():
        print(f"classify: input not found: {densities_path}", file=sys.stderr)
        sys.exit(3)
    if not Path(args_path).is_file():
        print(f"classify: args file not found: {args_path}", file=sys.stderr)
        sys.exit(3)
    densities = json.loads(Path(densities_path).read_text())
    args = json.loads(Path(args_path).read_text())
    classified = [classify_one(tid, td, args)
                  for tid, td in sorted(densities.items())]
    classified.sort(key=lambda c: c["lost_trust"], reverse=True)
    with open(out_path, "w") as fh:
        json.dump({"args": args, "classifications": classified}, fh, indent=2)
    counts: dict[str, int] = {}
    for c in classified:
        counts[c["classification"]] = counts.get(c["classification"], 0) + 1
    print(json.dumps({"tests": len(classified), "counts": counts}))
    return 0


def self_test() -> int:
    args = {"min_runs": 10, "stable_threshold": 0.99, "stratum_threshold": 0.5}

    # Stable-pass
    td_pass = {"n": 100, "passes": 100, "density": 1.0,
               "by_stratum": {}, "windowed": {"change_point": None}}
    c = classify_one("t1", td_pass, args)
    assert c["classification"] == "stable-pass", c

    # Stable-fail
    td_fail = {"n": 100, "passes": 0, "density": 0.0,
               "by_stratum": {}, "windowed": {"change_point": None}}
    c = classify_one("t2", td_fail, args)
    assert c["classification"] == "stable-fail", c

    # Stratum-sensitive
    td_strat = {"n": 100, "passes": 50, "density": 0.5,
                "by_stratum": {"os": {
                    "linux": {"n": 50, "density": 1.0},
                    "macos": {"n": 50, "density": 0.0},
                }},
                "windowed": {"change_point": None}}
    c = classify_one("t3", td_strat, args)
    assert c["classification"] == "stratum-sensitive", c
    assert c["details"]["stratum"] == "os", c

    # Drifting
    td_drift = {"n": 100, "passes": 50, "density": 0.5,
                "by_stratum": {},
                "windowed": {"change_point": 50, "before_density": 1.0,
                             "after_density": 0.0, "method": "pettitt",
                             "change_p_value": 0.001}}
    c = classify_one("t4", td_drift, args)
    assert c["classification"] == "drifting", c

    # Flaky
    td_flaky = {"n": 100, "passes": 50, "density": 0.5,
                "by_stratum": {},
                "windowed": {"change_point": None}}
    c = classify_one("t5", td_flaky, args)
    assert c["classification"] == "flaky", c

    # Insufficient data
    td_sparse = {"n": 5, "passes": 3, "density": 0.6,
                 "by_stratum": {},
                 "windowed": {"change_point": None}}
    c = classify_one("t6", td_sparse, args)
    assert c["classification"] == "insufficient-data", c

    # Stratum-sensitive takes priority over flaky
    td_pri = {"n": 100, "passes": 50, "density": 0.5,
              "by_stratum": {"os": {
                  "linux": {"n": 50, "density": 0.9},
                  "macos": {"n": 50, "density": 0.1},
              }},
              "windowed": {"change_point": None}}
    c = classify_one("t7", td_pri, args)
    assert c["classification"] == "stratum-sensitive", c

    print("self-test OK")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "self-test":
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--densities", default="/tmp/tft-densities.json")
    ap.add_argument("--args-file", default="/tmp/tft-args.json")
    ap.add_argument("--out", default="/tmp/tft-classifications.json")
    a = ap.parse_args(argv[1:])
    return run(a.densities, a.args_file, a.out)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
