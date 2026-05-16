#!/usr/bin/env python3

import datetime
import json
import os
import pathlib
import sys


def parse_url_from_report(report_path: pathlib.Path) -> str:
    try:
        first_line = report_path.read_text(encoding="utf-8").splitlines()[0]
    except Exception:
        return ""
    return first_line.replace("# Site Audit: ", "").strip()


def already_logged(report_path: pathlib.Path, log_path: pathlib.Path) -> bool:
    """Return True if the report has not changed since the last log entry for it."""
    if not log_path.exists():
        return False
    report_mtime = report_path.stat().st_mtime
    report_key = str(report_path.resolve())
    try:
        for line in reversed(log_path.read_text(encoding="utf-8").splitlines()):
            try:
                entry = json.loads(line)
            except Exception:
                continue
            if entry.get("report") == report_key:
                logged_at = datetime.datetime.fromisoformat(entry["date"].replace("Z", "+00:00"))
                logged_ts = logged_at.timestamp()
                # Skip if the report file has not been modified since it was logged.
                return report_mtime <= logged_ts
    except Exception:
        pass
    return False


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0

    report = pathlib.Path("site-audit-report.md")
    if not report.exists():
        return 0

    log_path = pathlib.Path(os.path.expanduser("~/.claude/audit-history.jsonl"))
    if already_logged(report, log_path):
        return 0

    entry = {
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "session_id": (data.get("session_id", "") if isinstance(data, dict) else ""),
        "url": parse_url_from_report(report),
        "report": str(report.resolve()),
    }

    os.makedirs(log_path.parent, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
