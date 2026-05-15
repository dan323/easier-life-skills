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


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0

    report = pathlib.Path("site-audit-report.md")
    if not report.exists():
        return 0

    entry = {
        "date": datetime.datetime.utcnow().isoformat() + "Z",
        "session_id": (data.get("session_id", "") if isinstance(data, dict) else ""),
        "url": parse_url_from_report(report),
        "report": str(report.resolve()),
    }

    log_path = os.path.expanduser("~/.claude/audit-history.jsonl")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
