#!/usr/bin/env python3
"""normalize.py — Phase 3 of test-flakiness-triage.

Reads `/tmp/tft-history.jsonl` (raw, provider-tagged rows from Phase 2)
and writes `/tmp/tft-runs.jsonl` with the canonical schema documented
in `SKILL.md` § Phase 3.

Drops rows with `status ∈ {skip, error}` — neither carries a pass/fail
signal, and including them would corrupt cylinder restrictions. The
count of dropped rows is preserved in `/tmp/tft-normalize-stats.json`
for Phase 6.

Exit codes:
    0  success
    2  bad usage
    3  input file missing or malformed
    6  self-test failed
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

OS_PATTERNS = [
    (re.compile(r"^ubuntu", re.I),  "linux"),
    (re.compile(r"linux", re.I),    "linux"),
    (re.compile(r"^macos", re.I),   "macos"),
    (re.compile(r"^darwin", re.I),  "macos"),
    (re.compile(r"osx", re.I),      "macos"),
    (re.compile(r"^win", re.I),     "windows"),
    (re.compile(r"microsoft", re.I), "windows"),
]
ARCH_PATTERNS = [
    (re.compile(r"^(x86_64|amd64)$", re.I), "x86_64"),
    (re.compile(r"^(arm64|aarch64)$", re.I), "arm64"),
    (re.compile(r"^i?[3-6]86$", re.I),       "i386"),
]
SEED_RX = re.compile(
    r"(?:^|[\s,;])(?:--?randomly[-_]seed|@?seed|hypothesis[-_]seed)"
    r"[\s=:]+([0-9a-fA-F]+)",
    re.I,
)
PYTEST_RANDOMLY_RX = re.compile(r"^Using --randomly-seed=(\d+)$", re.M)
FUZZ_INPUT_RX = re.compile(
    r"(?:^|[\s,;])fuzz[-_]?input[\s=:]+([0-9a-fA-F]+|\"[^\"]+\")",
    re.I,
)
DOW_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _classify_os(s: str | None) -> str | None:
    if not s:
        return None
    for rx, label in OS_PATTERNS:
        if rx.search(s):
            return label
    return None


def _classify_arch(s: str | None) -> str | None:
    if not s:
        return None
    for rx, label in ARCH_PATTERNS:
        if rx.search(s):
            return label
    return None


def _parse_ts(s: str | None) -> datetime.datetime | None:
    if not s:
        return None
    # Accept both 'Z'-suffixed and naive ISO, and the JUnit short form
    # 'YYYY-MM-DDTHH:MM:SS' without a TZ designator.
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                # Assume UTC for naive timestamps — they almost always come
                # from CI runners in UTC.
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            return dt.astimezone(datetime.timezone.utc)
        except ValueError:
            pass
    # Try fromisoformat as a last resort (handles +00:00, microseconds, …)
    try:
        dt = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc)
    except ValueError:
        return None


def _extract_strata(row: dict) -> dict:
    """Pull strata from the provider-tagged row.

    Priorities:
      1. Explicit `properties` keys (case-insensitive match on os/runner/
         arch/seed/fuzz/fuzz_input).
      2. `hostname` (rare).
      3. Body parsing for pytest-randomly / Hypothesis seed lines and
         fuzz-input hashes near assertion failures.
    """
    props = row.get("properties") or {}
    raw_props_ci = {str(k).lower(): str(v) for k, v in props.items()}

    runner = raw_props_ci.get("runner") or raw_props_ci.get("matrix.runner") \
        or raw_props_ci.get("runs-on") or row.get("hostname")

    os_label = _classify_os(raw_props_ci.get("os") or runner)
    arch_label = _classify_arch(raw_props_ci.get("arch")
                                or raw_props_ci.get("architecture"))

    seed = raw_props_ci.get("seed")
    if not seed:
        body = row.get("body") or ""
        m = PYTEST_RANDOMLY_RX.search(body) or SEED_RX.search(body)
        if m:
            seed = m.group(1)

    fuzz_input = raw_props_ci.get("fuzz_input") or raw_props_ci.get("fuzz-input")
    if not fuzz_input:
        body = row.get("body") or ""
        m = FUZZ_INPUT_RX.search(body)
        if m:
            fuzz_input = m.group(1).strip("\"")
    # Hash long fuzz inputs to keep histogram cells tractable
    if fuzz_input and len(fuzz_input) > 16:
        fuzz_input = hashlib.sha1(fuzz_input.encode()).hexdigest()[:16]

    ts = _parse_ts(row.get("ts"))
    hour = ts.hour if ts else None
    dow = DOW_NAMES[ts.weekday()] if ts else None

    return {
        "os": os_label,
        "runner": runner,
        "arch": arch_label,
        "seed": seed,
        "fuzz_input": fuzz_input,
        "hour": hour,
        "dow": dow,
    }


def normalize_row(row: dict) -> dict | None:
    status = (row.get("status") or "").lower()
    if status not in {"pass", "fail", "skip", "error"}:
        return None
    test_id = row.get("test_id")
    run_id = row.get("run_id")
    if not test_id or not run_id:
        return None
    ts = _parse_ts(row.get("ts"))
    return {
        "run_id":  str(run_id),
        "test_id": str(test_id),
        "status":  status,
        "ts":      ts.isoformat() if ts else None,
        "strata":  _extract_strata(row),
    }


def run(in_path: str, out_path: str, stats_path: str) -> int:
    if not Path(in_path).is_file():
        print(f"normalize: input not found: {in_path}", file=sys.stderr)
        sys.exit(3)
    n_in = n_out = 0
    dropped = {"skip": 0, "error": 0, "malformed": 0}
    with open(in_path) as fh_in, open(out_path, "w") as fh_out:
        for line in fh_in:
            line = line.strip()
            if not line:
                continue
            n_in += 1
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                dropped["malformed"] += 1
                continue
            normed = normalize_row(raw)
            if normed is None:
                dropped["malformed"] += 1
                continue
            if normed["status"] in {"skip", "error"}:
                dropped[normed["status"]] += 1
                continue
            fh_out.write(json.dumps(normed) + "\n")
            n_out += 1
    with open(stats_path, "w") as fh:
        json.dump({"in": n_in, "out": n_out, "dropped": dropped}, fh, indent=2)
    print(json.dumps({"in": n_in, "out": n_out, "dropped": dropped}))
    return 0


def self_test() -> int:
    raw = {
        "provider": "junit",
        "run_id": "r1",
        "test_id": "C::t1",
        "status": "fail",
        "ts": "2026-05-19T10:00:00",
        "hostname": "ubuntu-22.04",
        "properties": {"runner": "ubuntu-22.04", "arch": "x86_64"},
        "body": "Using --randomly-seed=42",
    }
    n = normalize_row(raw)
    assert n["strata"]["os"] == "linux", n
    assert n["strata"]["seed"] == "42", n
    assert n["strata"]["arch"] == "x86_64", n
    assert n["strata"]["dow"] == "Tue", n  # 2026-05-19 is a Tuesday
    assert n["strata"]["hour"] == 10, n

    raw2 = dict(raw, status="skip")
    assert normalize_row(raw2)["status"] == "skip"

    raw3 = dict(raw, test_id=None)
    assert normalize_row(raw3) is None

    raw4 = dict(raw, ts="2026-05-19T22:00:00+00:00",
                properties={"os": "Darwin", "arch": "arm64"},
                body="@seed=deadbeef ... fuzz_input=0123456789abcdef")
    n4 = normalize_row(raw4)
    assert n4["strata"]["os"] == "macos", n4
    assert n4["strata"]["arch"] == "arm64", n4
    assert n4["strata"]["seed"] == "deadbeef", n4
    assert n4["strata"]["fuzz_input"] == "0123456789abcdef", n4

    print("self-test OK")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "self-test":
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", default="/tmp/tft-history.jsonl")
    ap.add_argument("--out", default="/tmp/tft-runs.jsonl")
    ap.add_argument("--stats", default="/tmp/tft-normalize-stats.json")
    a = ap.parse_args(argv[1:])
    return run(a.in_path, a.out, a.stats)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
