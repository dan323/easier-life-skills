#!/usr/bin/env python3
"""generate-fixture.py — produce a synthetic test-history corpus for the
`test-flakiness-triage` skill's evals and smoke tests.

Writes 20 JUnit XML files (one per "run") into <out-dir>/junit/ with a
5-test suite that exercises every classification the skill produces:

    pkg.SuiteA::test_always_passes        →  stable-pass
    pkg.SuiteA::test_always_fails         →  stable-fail
    pkg.SuiteA::test_flaky                →  flaky      (70% pass-rate)
    pkg.SuiteB::test_platform_specific    →  stratum-sensitive (macos fails)
    pkg.SuiteB::test_drifting             →  drifting  (pass until run #12)

Run order is encoded in filenames (`junit-0001.xml` … `junit-0020.xml`) and
in the `timestamp` attribute. Half the runs label the runner as
`ubuntu-22.04` (linux), half as `macos-14` (macos), interleaved so each
test gets observations on both OSes.

Usage:
    python3 generate-fixture.py [--out PATH]
    python3 generate-fixture.py self-test
"""
from __future__ import annotations

import argparse
import datetime
import os
import random
import sys
from pathlib import Path

RUNS = 20
DRIFT_AT = 12
FLAKY_SEED_BASE = 0xC0FFEE
START = datetime.datetime(2026, 5, 1, 9, 0, 0, tzinfo=datetime.timezone.utc)

RUNNERS = [
    ("ubuntu-22.04", "linux",  "x86_64"),
    ("macos-14",     "macos",  "arm64"),
]


def _xml_for_run(run_idx: int, runner: tuple[str, str, str]) -> str:
    runner_label, os_label, arch = runner
    ts = (START + datetime.timedelta(hours=run_idx * 3)).strftime(
        "%Y-%m-%dT%H:%M:%S")
    # Deterministic flaky pattern: seed by run index so re-runs are stable
    rng = random.Random(FLAKY_SEED_BASE + run_idx)
    flaky_pass = rng.random() < 0.70

    cases = []

    # SuiteA::test_always_passes
    cases.append(("pkg.SuiteA", "test_always_passes", "pass", ""))
    # SuiteA::test_always_fails
    cases.append(("pkg.SuiteA", "test_always_fails", "fail",
                  "AssertionError: 0 != 1"))
    # SuiteA::test_flaky
    cases.append(("pkg.SuiteA", "test_flaky",
                  "pass" if flaky_pass else "fail",
                  "" if flaky_pass else "Timeout waiting for resource"))
    # SuiteB::test_platform_specific — passes on linux, fails on macos
    plat_ok = os_label == "linux"
    cases.append(("pkg.SuiteB", "test_platform_specific",
                  "pass" if plat_ok else "fail",
                  "" if plat_ok else "FileNotFoundError: /dev/random/foo"))
    # SuiteB::test_drifting — passes until run #DRIFT_AT, fails after
    drift_ok = run_idx < DRIFT_AT
    cases.append(("pkg.SuiteB", "test_drifting",
                  "pass" if drift_ok else "fail",
                  "" if drift_ok else "AssertionError: expected new field"))

    parts = [f'<?xml version="1.0" encoding="UTF-8"?>',
             f'<testsuite name="pkg" tests="{len(cases)}" '
             f'timestamp="{ts}" hostname="{runner_label}">',
             '  <properties>',
             f'    <property name="runner" value="{runner_label}"/>',
             f'    <property name="os" value="{os_label}"/>',
             f'    <property name="arch" value="{arch}"/>',
             '  </properties>']
    for classname, name, status, body in cases:
        if status == "pass":
            parts.append(f'  <testcase classname="{classname}" '
                         f'name="{name}" time="0.01"/>')
        else:
            parts.append(f'  <testcase classname="{classname}" '
                         f'name="{name}" time="0.01">')
            parts.append(f'    <failure message="{body.splitlines()[0]}">'
                         f'{body}</failure>')
            parts.append('  </testcase>')
    parts.append('</testsuite>')
    return "\n".join(parts) + "\n"


def generate(out_dir: Path) -> int:
    junit_dir = out_dir / "junit"
    junit_dir.mkdir(parents=True, exist_ok=True)
    for i in range(RUNS):
        runner = RUNNERS[i % len(RUNNERS)]
        (junit_dir / f"junit-{i:04d}.xml").write_text(_xml_for_run(i, runner))
    return RUNS


def self_test() -> int:
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="tft-fixture-"))
    try:
        n = generate(tmp)
        assert n == RUNS
        files = sorted((tmp / "junit").glob("junit-*.xml"))
        assert len(files) == RUNS
        # Spot-check: run #0 should have pkg.SuiteB::test_drifting passing
        # and pkg.SuiteA::test_always_fails failing.
        head = files[0].read_text()
        assert 'name="test_drifting"' in head and "<failure" in head, head
        # Run #15 (past DRIFT_AT) should fail test_drifting
        late = files[15].read_text()
        # test_drifting is the last case; both runs include `<failure>` for
        # `test_always_fails`, so check for the drift body string instead.
        assert "expected new field" in late, late
        print("self-test OK")
        return 0
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "self-test":
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".")
    a = ap.parse_args(argv[1:])
    n = generate(Path(a.out))
    print(f"generated {n} JUnit XML files in {Path(a.out) / 'junit'}/")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
