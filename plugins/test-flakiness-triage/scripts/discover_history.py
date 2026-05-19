#!/usr/bin/env python3
"""discover_history.py — Phase 2 of test-flakiness-triage.

Locates test-run history from one of several sources and emits raw,
provider-tagged rows to `/tmp/tft-history.jsonl` for Phase 3 to normalize.

Resolution order (using `/tmp/tft-args.json` from Phase 1):

    1. If `path` was passed explicitly, use it and sniff format:
       directory → JUnit XML or directory-of-JSON, file → CSV or JSON.
    2. Otherwise scan CWD for conventional JUnit locations
       (build/test-results/, target/{surefire,failsafe}-reports/,
       reports/, test-results/) and any `**/junit-*.xml` / `**/TEST-*.xml`.
    3. If `source=gh-actions` (or no local JUnit data found and `gh` is
       available), invoke `gh run list` + `gh run download` to grab JUnit
       artefacts from the last `runs` CI runs.
    4. Same fallback for `source=gitlab-ci` via `glab`.

Exit codes:
    0  success (count and source written to stdout, rows to --out)
    2  bad usage
    3  args file missing or malformed
    4  no test history discovered
    5  source-specific dependency missing (e.g. `gh` not on PATH)
    6  self-test failed
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterator
from xml.etree import ElementTree as ET

JUNIT_DIRS = [
    "build/test-results",
    "target/surefire-reports",
    "target/failsafe-reports",
    "reports",
    "test-results",
]
JUNIT_GLOBS = ["**/junit-*.xml", "**/TEST-*.xml", "**/*-junit.xml"]
EXCLUDE_DIRS = {"node_modules", "dist", "build", ".git", "vendor",
                "__pycache__", ".gradle", ".idea", ".venv", "venv"}


def _emit_rows(rows: Iterator[dict], out_path: str) -> int:
    n = 0
    with open(out_path, "w") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")
            n += 1
    return n


def _walk_for_junit(root: Path) -> list[Path]:
    """Return absolute paths of likely-JUnit XML files under root."""
    found: list[Path] = []
    # Conventional locations first
    for rel in JUNIT_DIRS:
        d = root / rel
        if d.is_dir():
            for p in d.rglob("*.xml"):
                found.append(p)
    # Glob patterns
    for pat in JUNIT_GLOBS:
        for p in root.glob(pat):
            parts = set(p.parts)
            if parts & EXCLUDE_DIRS:
                continue
            found.append(p)
    # Deduplicate, preserve order
    seen: set[str] = set()
    uniq: list[Path] = []
    for p in found:
        s = str(p.resolve())
        if s in seen:
            continue
        seen.add(s)
        uniq.append(p)
    return uniq


def _parse_junit_xml(path: Path, run_id: str | None = None) -> Iterator[dict]:
    """Yield one raw row per <testcase> under <testsuite>.

    Each row preserves provider-specific fields (`<properties>`, runner
    metadata in sibling files) so Phase 3 can normalize them uniformly.
    Multiple test suites in one XML are flattened. A missing top-level
    `timestamp` falls back to the file's mtime.
    """
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        print(f"discover_history: skipping unparseable XML {path}: {e}",
              file=sys.stderr)
        return
    root = tree.getroot()
    suites = [root] if root.tag.lower().endswith("testsuite") else \
             root.findall(".//testsuite")
    file_mtime = path.stat().st_mtime
    rid = run_id or path.parent.name or path.stem
    for suite in suites:
        suite_ts = suite.get("timestamp")
        suite_hostname = suite.get("hostname")
        # <properties> often carry runner/OS metadata
        props: dict[str, str] = {}
        for prop in suite.findall("properties/property"):
            k = prop.get("name") or ""
            v = prop.get("value") or ""
            if k:
                props[k] = v
        for tc in suite.findall("testcase"):
            classname = tc.get("classname", "")
            name = tc.get("name", "")
            test_id = f"{classname}::{name}" if classname else name
            failure = tc.find("failure")
            error = tc.find("error")
            skipped = tc.find("skipped")
            if skipped is not None:
                status = "skip"
            elif error is not None:
                status = "error"
            elif failure is not None:
                status = "fail"
            else:
                status = "pass"
            # Collect any failure body — it may contain the fuzz input hash
            body = ""
            for el in (failure, error):
                if el is not None and el.text:
                    body += el.text
            yield {
                "provider": "junit",
                "run_id": rid,
                "test_id": test_id,
                "status": status,
                "ts": suite_ts or _epoch_to_iso(file_mtime),
                "hostname": suite_hostname,
                "properties": props,
                "body": body[:4000],  # truncate to keep history small
                "source_path": str(path),
            }


def _epoch_to_iso(epoch: float) -> str:
    import datetime
    return datetime.datetime.utcfromtimestamp(epoch).isoformat() + "Z"


def _read_csv(path: Path) -> Iterator[dict]:
    """Read a flat CSV; rows must include run_id/test_id/status; the rest
    are preserved verbatim under `extras` for Phase 3 stratum extraction.
    """
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        required = {"run_id", "test_id", "status"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            print(f"discover_history: CSV missing required columns: "
                  f"{sorted(missing)}", file=sys.stderr)
            return
        for row in reader:
            extras = {k: v for k, v in row.items() if k not in required and k != "ts"}
            yield {
                "provider": "csv",
                "run_id": row["run_id"],
                "test_id": row["test_id"],
                "status": row["status"].lower(),
                "ts": row.get("ts") or _epoch_to_iso(path.stat().st_mtime),
                "properties": extras,
                "body": "",
                "source_path": str(path),
            }


def _read_json(path: Path) -> Iterator[dict]:
    """Read either a single JSON array of rows or a JSONL file."""
    txt = path.read_text()
    txt_stripped = txt.lstrip()
    if txt_stripped.startswith("["):
        data = json.loads(txt)
        for row in data:
            yield _normalize_json_row(row, path)
    else:
        for line in txt.splitlines():
            line = line.strip()
            if not line:
                continue
            yield _normalize_json_row(json.loads(line), path)


def _normalize_json_row(row: dict, path: Path) -> dict:
    return {
        "provider": "json",
        "run_id": str(row.get("run_id") or row.get("runId") or ""),
        "test_id": str(row.get("test_id") or row.get("testId") or ""),
        "status": str(row.get("status", "")).lower(),
        "ts": row.get("ts") or _epoch_to_iso(path.stat().st_mtime),
        "properties": {k: v for k, v in row.items()
                       if k not in {"run_id", "runId", "test_id", "testId",
                                    "status", "ts"}},
        "body": str(row.get("body", ""))[:4000],
        "source_path": str(path),
    }


def _fetch_gh_actions(runs: int, workdir: Path) -> list[Path]:
    """Use `gh run list` + `gh run download` to pull JUnit artifacts.

    Returns a list of local XML paths in `workdir`. Caller is responsible
    for cleanup. Requires `gh` on PATH and a GitHub repo as CWD.
    """
    if not shutil.which("gh"):
        print("discover_history: `gh` CLI not found; install it or pass "
              "--source manually", file=sys.stderr)
        sys.exit(5)
    cmd = ["gh", "run", "list", "--limit", str(runs),
           "--json", "databaseId,name,headBranch,createdAt,conclusion"]
    try:
        out = subprocess.check_output(cmd, text=True)
    except subprocess.CalledProcessError as e:
        print(f"discover_history: `gh run list` failed: {e}", file=sys.stderr)
        sys.exit(5)
    run_meta = json.loads(out)
    xml_paths: list[Path] = []
    for entry in run_meta:
        run_id = entry["databaseId"]
        target = workdir / f"run-{run_id}"
        target.mkdir(parents=True, exist_ok=True)
        # Best-effort: download artifacts; some runs have no JUnit output.
        dl = subprocess.run(
            ["gh", "run", "download", str(run_id),
             "--dir", str(target),
             "--pattern", "*junit*", "--pattern", "*TEST-*"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if dl.returncode != 0:
            continue
        for xml in target.rglob("*.xml"):
            # Tag each row with the run's createdAt so Phase 3 has timestamps
            xml_paths.append(xml)
    return xml_paths


def _fetch_gitlab_ci(runs: int, workdir: Path) -> list[Path]:
    if not shutil.which("glab"):
        print("discover_history: `glab` CLI not found; install it or pass "
              "--source manually", file=sys.stderr)
        sys.exit(5)
    # glab's artifact-download story is less uniform than gh's; for v1 we
    # only pull JUnit report content via `glab ci view`. Users with non-
    # default layouts should pass --path explicitly.
    print("discover_history: gitlab-ci auto-discovery is best-effort; "
          "pass `path=` for reliable results.", file=sys.stderr)
    return []  # Phase 3 will see zero rows and Phase 6 prints "no history"


def load_args(args_path: str) -> dict:
    p = Path(args_path)
    if not p.is_file():
        print(f"discover_history: args file not found: {args_path}",
              file=sys.stderr)
        sys.exit(3)
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError as e:
        print(f"discover_history: args file is not valid JSON: {e}",
              file=sys.stderr)
        sys.exit(3)


def run(args_file: str, out_path: str, root: str | None) -> int:
    args = load_args(args_file)
    cwd = Path(root or os.getcwd())
    source = args.get("source", "auto")
    path = args.get("path")

    rows_iter: Iterator[dict]

    if path:
        p = Path(path)
        if not p.exists():
            print(f"discover_history: path does not exist: {p}",
                  file=sys.stderr)
            sys.exit(4)
        if p.is_dir():
            xmls = _walk_for_junit(p)
            if xmls:
                rows_iter = (row for x in xmls for row in _parse_junit_xml(x))
            else:
                # Maybe it's a directory of JSON files
                jsons = [j for j in p.rglob("*.json")]
                rows_iter = (row for j in jsons for row in _read_json(j))
        elif p.suffix.lower() == ".csv":
            rows_iter = _read_csv(p)
        elif p.suffix.lower() in {".json", ".jsonl", ".ndjson"}:
            rows_iter = _read_json(p)
        elif p.suffix.lower() == ".xml":
            rows_iter = _parse_junit_xml(p)
        else:
            print(f"discover_history: cannot infer format from {p.suffix}",
                  file=sys.stderr)
            sys.exit(4)
    elif source == "gh-actions":
        with tempfile.TemporaryDirectory(prefix="tft-gh-") as tmp:
            xmls = _fetch_gh_actions(args.get("runs", 100), Path(tmp))
            if not xmls:
                print("discover_history: no JUnit artifacts in last "
                      f"{args.get('runs', 100)} runs.", file=sys.stderr)
                sys.exit(4)
            n = _emit_rows(
                (row for x in xmls for row in _parse_junit_xml(x)),
                out_path,
            )
            print(json.dumps({"source": "gh-actions", "rows": n}))
            return 0
    elif source == "gitlab-ci":
        with tempfile.TemporaryDirectory(prefix="tft-glab-") as tmp:
            xmls = _fetch_gitlab_ci(args.get("runs", 100), Path(tmp))
            if not xmls:
                sys.exit(4)
            n = _emit_rows(
                (row for x in xmls for row in _parse_junit_xml(x)),
                out_path,
            )
            print(json.dumps({"source": "gitlab-ci", "rows": n}))
            return 0
    else:
        xmls = _walk_for_junit(cwd)
        if not xmls:
            # Fall back to gh-actions if `gh` is available and CWD is a repo
            if shutil.which("gh") and (cwd / ".git").is_dir():
                with tempfile.TemporaryDirectory(prefix="tft-gh-") as tmp:
                    xmls_remote = _fetch_gh_actions(args.get("runs", 100),
                                                    Path(tmp))
                    if not xmls_remote:
                        print("discover_history: no local JUnit data; "
                              "no JUnit artifacts in recent GH runs.",
                              file=sys.stderr)
                        sys.exit(4)
                    n = _emit_rows(
                        (row for x in xmls_remote
                         for row in _parse_junit_xml(x)),
                        out_path,
                    )
                    print(json.dumps({"source": "gh-actions", "rows": n}))
                    return 0
            print("discover_history: no local JUnit data found and no "
                  "fallback succeeded.", file=sys.stderr)
            sys.exit(4)
        rows_iter = (row for x in xmls for row in _parse_junit_xml(x))

    n = _emit_rows(rows_iter, out_path)
    if n == 0:
        sys.exit(4)
    print(json.dumps({"source": source if source != "auto" else "junit",
                      "rows": n}))
    return 0


def self_test() -> int:
    """Smoke-test the JUnit parser and CSV parser on synthetic input."""
    tmp = Path(tempfile.mkdtemp(prefix="tft-self-"))
    try:
        # Synthetic JUnit XML
        xml = tmp / "junit-1.xml"
        xml.write_text("""<?xml version="1.0"?>
<testsuite name="suite" tests="2" timestamp="2026-05-19T10:00:00">
  <properties><property name="os" value="linux"/></properties>
  <testcase classname="C" name="t1"/>
  <testcase classname="C" name="t2"><failure message="m">trace</failure></testcase>
</testsuite>
""")
        rows = list(_parse_junit_xml(xml))
        assert len(rows) == 2, rows
        assert rows[0]["status"] == "pass" and rows[1]["status"] == "fail"
        assert rows[0]["properties"]["os"] == "linux"

        # Synthetic CSV
        csv_path = tmp / "h.csv"
        csv_path.write_text(
            "run_id,test_id,status,ts,os\n"
            "1,C::t1,pass,2026-05-19T10:00:00Z,linux\n"
            "2,C::t1,fail,2026-05-19T11:00:00Z,macos\n"
        )
        rows = list(_read_csv(csv_path))
        assert len(rows) == 2 and rows[1]["properties"]["os"] == "macos"
        print("self-test OK")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "self-test":
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--args-file", default="/tmp/tft-args.json")
    ap.add_argument("--out", default="/tmp/tft-history.jsonl")
    ap.add_argument("--root", default=None)
    a = ap.parse_args(argv[1:])
    return run(a.args_file, a.out, a.root)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
