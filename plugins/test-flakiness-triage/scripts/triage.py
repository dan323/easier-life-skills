#!/usr/bin/env python3
"""triage.py — single entry point for the test-flakiness-triage skill.

Parses `key=value` args from argv, runs the five phases by calling each
sibling phase module's `run()` function, and writes the Markdown +
JSON report to the CWD. The phase modules (`discover_history`,
`normalize`, `density`, `classify`, `report`) remain independently
testable via their `self-test` subcommands.

Usage:
    triage.py [key=value ...]
    triage.py self-test

Allowed keys: source, path, runs, min_runs, stable_threshold,
stratum_threshold, with_math, fail_on_findings.
See `plugins/test-flakiness-triage/skills/test-flakiness-triage/SKILL.md`
for the user-facing argument grammar.

Exit codes:
    0   success (or success + at-least-one finding but fail_on_findings not set)
    1   fail_on_findings set AND at least one non-stable classification
    2   argument parse error
    3   args / input file missing or malformed (re-raised from phase modules)
    4   no test history discovered
    other  whatever the failing phase module returned
"""
from __future__ import annotations

import json
import shlex
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import classify  # noqa: E402
import density  # noqa: E402
import discover_history  # noqa: E402
import normalize  # noqa: E402
import report  # noqa: E402

ALLOWED = {"source", "path", "runs", "min_runs", "stable_threshold",
           "stratum_threshold", "with_math", "fail_on_findings"}
ENUM_SOURCE = {"junit", "gh-actions", "gitlab-ci", "csv", "json", "auto"}

ARGS_PATH = "/tmp/tft-args.json"
HISTORY_PATH = "/tmp/tft-history.jsonl"
RUNS_PATH = "/tmp/tft-runs.jsonl"
STATS_PATH = "/tmp/tft-normalize-stats.json"
DENSITIES_PATH = "/tmp/tft-densities.json"
CLASS_PATH = "/tmp/tft-classifications.json"
OUT_MD = "./test-flakiness-report.md"
OUT_JSON = "./test-flakiness-report.json"


def parse_args(tokens: list[str]) -> tuple[dict, list[str]]:
    result = {
        "source": "auto", "path": None, "runs": 100, "min_runs": 10,
        "stable_threshold": 0.99, "stratum_threshold": 0.5,
        "with_math": False, "fail_on_findings": False,
    }
    errors: list[str] = []
    for tok in tokens:
        if tok in {"with_math", "fail_on_findings"}:
            result[tok] = True
            continue
        if "=" not in tok:
            errors.append(f"Token '{tok}' is not key=value.")
            continue
        k, _, v = tok.partition("=")
        if k not in ALLOWED:
            errors.append(f"Unknown key '{k}'. Allowed: {sorted(ALLOWED)}.")
            continue
        if k == "source":
            if v not in ENUM_SOURCE:
                errors.append(
                    f"source must be one of {sorted(ENUM_SOURCE)}, got '{v}'."
                )
            else:
                result[k] = v
        elif k == "path":
            result[k] = v
        elif k == "runs":
            try:
                result[k] = int(v)
            except ValueError:
                errors.append(f"runs must be int, got '{v}'.")
        elif k == "min_runs":
            try:
                result[k] = max(1, int(v))
            except ValueError:
                errors.append(f"min_runs must be int, got '{v}'.")
        elif k == "stable_threshold":
            try:
                f = float(v)
                assert 0.5 <= f <= 1.0
                result[k] = f
            except (ValueError, AssertionError):
                errors.append(
                    f"stable_threshold must be in [0.5, 1.0], got '{v}'."
                )
        elif k == "stratum_threshold":
            try:
                f = float(v)
                assert 0.1 <= f <= 1.0
                result[k] = f
            except (ValueError, AssertionError):
                errors.append(
                    f"stratum_threshold must be in [0.1, 1.0], got '{v}'."
                )
        elif k in {"with_math", "fail_on_findings"}:
            result[k] = v.lower() in {"1", "true", "yes"}
    return result, errors


def run(tokens: list[str]) -> int:
    args, errors = parse_args(tokens)
    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        return 2

    Path(ARGS_PATH).write_text(json.dumps(args, indent=2))

    rc = discover_history.run(ARGS_PATH, HISTORY_PATH, None)
    if rc != 0:
        return rc
    normalize.run(HISTORY_PATH, RUNS_PATH, STATS_PATH)
    density.run(RUNS_PATH, ARGS_PATH, DENSITIES_PATH)
    classify.run(DENSITIES_PATH, ARGS_PATH, CLASS_PATH)
    return report.run(
        CLASS_PATH, DENSITIES_PATH, ARGS_PATH, OUT_MD, OUT_JSON,
        bool(args.get("fail_on_findings")),
    )


def self_test() -> int:
    a, e = parse_args(["source=junit", "path=foo", "with_math"])
    assert not e, e
    assert a["source"] == "junit" and a["path"] == "foo" and a["with_math"]
    a, e = parse_args(["unknown=x"])
    assert e and "Unknown key" in e[0]
    a, e = parse_args(["source=bogus"])
    assert e and "source must be one of" in e[0]
    a, e = parse_args(["stable_threshold=2.0"])
    assert e and "stable_threshold" in e[0]
    a, e = parse_args(["fail_on_findings", "min_runs=5"])
    assert not e and a["fail_on_findings"] and a["min_runs"] == 5
    print("self-test OK")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "self-test":
        return self_test()
    return run(argv[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
