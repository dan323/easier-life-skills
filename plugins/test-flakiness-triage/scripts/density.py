#!/usr/bin/env python3
"""density.py — Phase 4 of test-flakiness-triage.

Reads `/tmp/tft-runs.jsonl` and `/tmp/tft-args.json`, writes
`/tmp/tft-densities.json` with per-test global density, cylinder-restricted
densities along each stratum coordinate, a rolling-window density series,
and a single change-point (Pettitt → CUSUM → quartile-split fallback chain).

Math framing: `references/math-primer.md`.
Threshold calibration: sibling `adr/0002-method-aware-drift-effect-thresholds.md`.

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
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Iterable

STRATA_KEYS = ["os", "runner", "arch", "seed", "fuzz_input", "hour", "dow"]

# ---------- change-point detection ----------------------------------------

def _pettitt(seq: list[int]) -> tuple[int | None, float, str]:
    """Pettitt's non-parametric change-point test for a single shift.

    Returns (change_index, p_value, method). change_index is None if the
    null hypothesis is not rejected at α=0.05, or if `scipy.stats` is not
    available (in which case we return the CUSUM fallback).

    The Pettitt statistic for a series of length n is

        U_t,n  = Σ_{i=1..t} Σ_{j=t+1..n} sgn(x_i − x_j)
        K_n    = max_t |U_t,n|

    Approximate p-value:  p ≈ 2 · exp(−6 K² / (n³ + n²)).
    """
    try:
        import numpy as np  # noqa: F401
    except ImportError:
        return _quartile_split(seq)
    try:
        import numpy as np
        x = np.asarray(seq, dtype=np.int8)
        n = len(x)
        if n < 4:
            return None, 1.0, "pettitt"
        # Compute U_t for all t in O(n log n) via rank-based formulation.
        # For binary x ∈ {0,1}, sgn(x_i − x_j) is +1, 0, −1. Cumulative
        # form: let s_t = Σ_{i≤t} x_i. Then
        #   U_t = 2·(t · s_n − n · s_t) − (n−2t)·(s_n − 2·s_t)
        # but the cleanest portable form uses ranks:
        # use scipy.stats.rankdata if available; otherwise compute manually.
        try:
            from scipy.stats import rankdata
            r = rankdata(x)
        except ImportError:
            # Fall through to CUSUM rather than approximating Pettitt poorly.
            return _cusum(seq)
        cum = np.cumsum(r)
        t_idx = np.arange(1, n + 1)
        U = 2 * cum - t_idx * (n + 1)
        K = int(np.max(np.abs(U)))
        # Approximate p-value (Pettitt 1979 eq. (7))
        p = 2.0 * math.exp(-6.0 * K * K / (n ** 3 + n ** 2))
        if p > 0.05:
            return None, p, "pettitt"
        return int(np.argmax(np.abs(U))) + 1, p, "pettitt"
    except Exception:
        return _cusum(seq)


def _cusum(seq: list[int]) -> tuple[int | None, float, str]:
    """CUSUM fallback (numpy-only) — splits where cumulative deviation
    from the global mean is maximal, accepting only if the effect size
    exceeds 3 standard errors.
    """
    try:
        import numpy as np
    except ImportError:
        return _quartile_split(seq)
    x = np.asarray(seq, dtype=np.float64)
    n = len(x)
    if n < 4:
        return None, 1.0, "cusum"
    mu = x.mean()
    devs = np.cumsum(x - mu)
    t = int(np.argmax(np.abs(devs)))
    if t <= 0 or t >= n - 1:
        return None, 1.0, "cusum"
    p1 = x[:t + 1].mean()
    p2 = x[t + 1:].mean()
    se = math.sqrt(max(1e-9, p1 * (1 - p1) / (t + 1) + p2 * (1 - p2) / (n - t - 1)))
    if abs(p1 - p2) < 3 * se:
        return None, 1.0, "cusum"
    return t + 1, 0.05, "cusum"


def _quartile_split(seq: list[int]) -> tuple[int | None, float, str]:
    """Coarsest fallback: split at each quartile, return the split with
    the largest |ΔP| if it exceeds 0.3; otherwise no change point.
    """
    n = len(seq)
    if n < 8:
        return None, 1.0, "quartile-split"
    best: tuple[int, float] | None = None
    for q in (n // 4, n // 2, 3 * n // 4):
        p1 = sum(seq[:q]) / q
        p2 = sum(seq[q:]) / (n - q)
        d = abs(p1 - p2)
        if best is None or d > best[1]:
            best = (q, d)
    if best is None or best[1] < 0.3:
        return None, 1.0, "quartile-split"
    return best[0], 0.1, "quartile-split"


# ---------- densities -----------------------------------------------------

def _binary_seq(rows: list[dict]) -> list[int]:
    return [1 if r["status"] == "pass" else 0 for r in rows]


def _rolling_density(seq: list[int], w: int) -> list[float]:
    if not seq:
        return []
    w = max(1, min(w, len(seq)))
    out: list[float] = []
    cum = 0
    for i, x in enumerate(seq):
        cum += x
        if i >= w:
            cum -= seq[i - w]
        out.append(cum / min(i + 1, w))
    return out


def _stratum_breakdown(rows: list[dict]) -> dict:
    """For each stratum coordinate, density per value."""
    breakdown: dict[str, dict[str, dict]] = {}
    for key in STRATA_KEYS:
        cells: dict[str, list[int]] = defaultdict(list)
        for r in rows:
            v = r["strata"].get(key)
            if v is None:
                continue
            cells[str(v)].append(1 if r["status"] == "pass" else 0)
        if not cells:
            continue
        breakdown[key] = {
            v: {"n": len(passes), "density": sum(passes) / len(passes)}
            for v, passes in cells.items()
        }
    return breakdown


def _ordered_runs(rows: list[dict]) -> list[dict]:
    """Sort by timestamp when available, otherwise by run_id."""
    def key(r: dict) -> tuple:
        ts = r.get("ts") or ""
        return (ts, r["run_id"])
    return sorted(rows, key=key)


def compute_per_test(rows_by_test: dict[str, list[dict]]) -> dict:
    out: dict[str, dict] = {}
    for test_id, rows in rows_by_test.items():
        rows = _ordered_runs(rows)
        n = len(rows)
        seq = _binary_seq(rows)
        passes = sum(seq)
        density = passes / n if n else 0.0
        w = max(20, n // 10) if n >= 20 else max(2, n // 2)
        series = _rolling_density(seq, w)
        cp, pval, method = _pettitt(seq)
        before = sum(seq[:cp]) / cp if cp else None
        after = sum(seq[cp:]) / (n - cp) if cp and cp < n else None
        out[test_id] = {
            "n": n,
            "passes": passes,
            "density": density,
            "by_stratum": _stratum_breakdown(rows),
            "windowed": {
                "window_size": w,
                "series": series,
                "change_point": cp,
                "change_p_value": pval,
                "before_density": before,
                "after_density": after,
                "method": method,
            },
        }
    return out


def run(runs_path: str, args_path: str, out_path: str) -> int:
    if not Path(runs_path).is_file():
        print(f"density: input not found: {runs_path}", file=sys.stderr)
        sys.exit(3)
    rows_by_test: dict[str, list[dict]] = defaultdict(list)
    with open(runs_path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            rows_by_test[r["test_id"]].append(r)
    out = compute_per_test(rows_by_test)
    with open(out_path, "w") as fh:
        json.dump(out, fh, indent=2)
    print(json.dumps({"tests": len(out), "out": out_path}))
    return 0


def self_test() -> int:
    import datetime as _dt
    base = _dt.datetime(2026, 1, 1, 10, tzinfo=_dt.timezone.utc)
    def _ts(i: int) -> str:
        return (base + _dt.timedelta(hours=i)).isoformat()

    # Stable-pass: 100 passes
    pass_only = [{"test_id": "t1", "run_id": str(i), "status": "pass",
                  "ts": _ts(i),
                  "strata": {"os": "linux", "runner": None, "arch": None,
                             "seed": None, "fuzz_input": None,
                             "hour": 10, "dow": "Mon"}}
                 for i in range(100)]

    # Drifting: 50 passes then 50 fails
    drift = []
    for i in range(100):
        s = "pass" if i < 50 else "fail"
        drift.append({"test_id": "t2", "run_id": str(i), "status": s,
                      "ts": _ts(i),
                      "strata": {"os": "linux", "runner": None, "arch": None,
                                 "seed": None, "fuzz_input": None,
                                 "hour": 10, "dow": "Mon"}})

    # Stratum-sensitive: passes on linux, fails on macos
    strat = []
    for i in range(100):
        os_v = "linux" if i % 2 == 0 else "macos"
        s = "pass" if os_v == "linux" else "fail"
        strat.append({"test_id": "t3", "run_id": str(i), "status": s,
                      "ts": _ts(i),
                      "strata": {"os": os_v, "runner": None, "arch": None,
                                 "seed": None, "fuzz_input": None,
                                 "hour": 10, "dow": "Mon"}})

    out = compute_per_test({"t1": pass_only, "t2": drift, "t3": strat})
    assert out["t1"]["density"] == 1.0
    assert out["t1"]["windowed"]["change_point"] is None
    # Drift detection: depends on whether scipy is installed; CUSUM should
    # find the break around index 50.
    cp = out["t2"]["windowed"]["change_point"]
    assert cp is not None and 40 <= cp <= 60, f"expected change point ~50, got {cp}"
    # Stratum analysis: 'os' should show wide gap
    os_break = out["t3"]["by_stratum"].get("os") or {}
    assert os_break.get("linux", {}).get("density") == 1.0
    assert os_break.get("macos", {}).get("density") == 0.0
    print("self-test OK")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "self-test":
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", default="/tmp/tft-runs.jsonl")
    ap.add_argument("--args-file", default="/tmp/tft-args.json")
    ap.add_argument("--out", default="/tmp/tft-densities.json")
    a = ap.parse_args(argv[1:])
    return run(a.in_path, a.args_file, a.out)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
