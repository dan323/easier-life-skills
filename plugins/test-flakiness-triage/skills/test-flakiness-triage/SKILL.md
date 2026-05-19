---
name: test-flakiness-triage
description: >
  Triages a test corpus and writes `test-flakiness-report.md` + `.json`
  to the CWD. Classifies each test as stable-pass, stable-fail, flaky,
  stratum-sensitive (specific OS / runner / arch / seed / fuzz_input),
  drifting (changed behaviour at a detectable run boundary), or
  insufficient-data. Reads JUnit XML, GitHub Actions / GitLab CI run
  history (via `gh` / `glab`), or a normalized CSV/JSON. Use when asked
  to find flaky tests, audit test reliability, diagnose CI instability,
  or explain why a test fails sometimes. Read-only — writes only the
  two report files in the CWD.
tools: Bash, Read
---

# Test Flakiness Triage

Forward the user's `key=value` arguments verbatim to the entry-point
script:

    python3 "${CLAUDE_PLUGIN_ROOT}/plugins/test-flakiness-triage/scripts/triage.py" <<USER_ARGS>>

Accepted keys: `source`, `path`, `runs`, `min_runs`, `stable_threshold`,
`stratum_threshold`, `with_math`, `fail_on_findings`. The script's
`--help` and its docstring document each one; surface its stderr
verbatim on any non-zero exit.

If the script reports "no test history discovered" (exit 4), ask the
user where the test history lives and re-invoke with an explicit
`path=…`.
